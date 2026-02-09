import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

function toIsoNow(): string {
	return new Date().toISOString();
}

function getNextLink(linkHeader?: string): string | null {
	if (!linkHeader) return null;
	for (const part of linkHeader.split(',')) {
		const m = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
		if (m?.[1]) return m[1];
	}
	return null;
}

interface StaticData {
	lastEventTime?: string;
}

export class TwosenseTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Twosense Trigger',
		name: 'twosenseTrigger',
		icon: 'file:../../assets/twosense-icon.svg',
		group: ['trigger'],
		version: 1,
		subtitle: 'Real-time events polling',
		description: 'Triggers workflow when new Twosense events are detected',
		defaults: { name: 'Twosense Trigger' },
		polling: true,
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'twosenseApi', required: true }],
		properties: [],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		// Get workflow static data (persisted by n8n for polling triggers)
		const staticData = this.getWorkflowStaticData('node') as StaticData;

		this.logger.info(`[TwosenseTrigger] loaded lastEventTime=${staticData.lastEventTime ?? 'null'}`);

		// Get credentials
		const creds = await this.getCredentials('twosenseApi');
		if (!creds?.baseUrl) throw new NodeOperationError(this.getNode(), 'Missing credential: baseUrl');
		if (!creds?.clientId) throw new NodeOperationError(this.getNode(), 'Missing credential: clientId');
		if (!creds?.clientSecret) throw new NodeOperationError(this.getNode(), 'Missing credential: clientSecret');

		const baseUrl = String(creds.baseUrl).replace(/\/+$/, '');
		const clientId = String(creds.clientId);
		const clientSecret = String(creds.clientSecret);
		const audience = baseUrl;
		const tokenPath = '/oauth/token';

		// Get API token
		this.logger.info('[TwosenseTrigger] refreshing API token');
		const tokenUrl = `${baseUrl}${tokenPath}`;

		const tokenResp = await this.helpers.httpRequest({
			method: 'POST',
			url: tokenUrl,
			headers: { 'content-type': 'application/json' },
			body: {
				client_id: clientId,
				client_secret: clientSecret,
				audience,
				grant_type: 'client_credentials',
			},
			json: true,
		});

		const apiToken = tokenResp?.access_token;
		if (!apiToken) {
			throw new NodeOperationError(
				this.getNode(),
				`No access_token returned from token endpoint (${tokenUrl})`,
			);
		}

		// On first run, initialize cursor to current time and return null (no events)
		if (!staticData.lastEventTime) {
			const now = toIsoNow();
			staticData.lastEventTime = now;
			this.logger.info(`[TwosenseTrigger] First run: cursor set to now=${now} (no emit)`);
			return null;
		}

		const since = staticData.lastEventTime;
		const eventsUrl = `${baseUrl}/events`;
		const allEvents: IDataObject[] = [];
		let nextUrl: string | null = null;

		const doRequest = async (url: string, qs?: Record<string, string>) => {
			this.logger.info(`[TwosenseTrigger] GET ${url} qs=${JSON.stringify(qs ?? {})}`);

			const resp = await this.helpers.httpRequest({
				method: 'GET',
				url,
				qs,
				headers: {
					Authorization: `Bearer ${apiToken}`,
					Accept: 'application/json',
				},
				returnFullResponse: true,
				json: true,
			});

			const body = resp.body ?? {};
			const events = Array.isArray(body.events) ? body.events : [];
			allEvents.push(...events);

			const link = (resp.headers?.link || resp.headers?.Link) as string | undefined;
			nextUrl = getNextLink(link);

			this.logger.info(
				`[TwosenseTrigger] Got ${events.length} events, Link header: ${link ?? 'none'}, nextUrl: ${nextUrl ?? 'none'}`,
			);

			return events.length;
		};

		await doRequest(eventsUrl, { since });
		let pageCount = 1;
		while (nextUrl) {
			pageCount++;
			this.logger.info(`[TwosenseTrigger] Fetching page ${pageCount} from ${nextUrl}`);
			await doRequest(nextUrl);
		}

		this.logger.info(`[TwosenseTrigger] Fetched ${pageCount} pages, ${allEvents.length} total events`);

		if (allEvents.length === 0) {
			this.logger.info('[TwosenseTrigger] no new events returned');
			return null;
		}

		// Find the max published timestamp to update cursor
		let maxPublished: string | undefined;
		for (const e of allEvents) {
			const p = e?.published;
			if (typeof p !== 'string') continue;
			if (!maxPublished || p > maxPublished) maxPublished = p;
		}

		if (maxPublished) {
			staticData.lastEventTime = maxPublished;
			this.logger.info(`[TwosenseTrigger] updated cursor lastEventTime=${maxPublished}`);
		}

		const out: INodeExecutionData[] = allEvents.map((e) => ({ json: e }));
		return [out];
	}
}
