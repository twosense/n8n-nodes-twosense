import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
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

export class Twosense implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Twosense',
		name: 'twosense',
		icon: 'file:../../assets/twosense-icon.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Continuous authentication and behavioral biometrics by Twosense',
		defaults: { name: 'Twosense' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'twosenseApi', required: true }],
		properties: [
			// ========== RESOURCE SELECTOR ==========
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Event',
						value: 'events',
					},
					{
						name: 'Session',
						value: 'session',
					},
					{
						name: 'Trust Score',
						value: 'trustScore',
					},
				],
				default: 'events',
			},

			// ========== EVENTS OPERATIONS ==========
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['events'],
					},
				},
				options: [
					{
						name: 'Get Twosense Events',
						value: 'getHistorical',
						description: 'Fetch Twosense events within a specific time range for batch processing or historical analysis',
						action: 'Get Twosense events',
					},
				],
				default: 'getHistorical',
			},

			// ========== SESSION OPERATIONS ==========
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['session'],
					},
				},
				options: [
					{
						name: 'Get Twosense Session Information',
						value: 'get',
						description: 'Retrieve detailed information about a specific Twosense session by its ID',
						action: 'Get Twosense session information',
					},
				],
				default: 'get',
			},

			// ========== TRUST SCORE OPERATIONS ==========
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['trustScore'],
					},
				},
				options: [
					{
						name: 'Get Twosense Trust Score',
						value: 'get',
						description: 'Get the current Twosense trust score and trust level for a specific user',
						action: 'Get Twosense trust score',
					},
				],
				default: 'get',
			},

			// ========== EVENTS: GET HISTORICAL PARAMETERS ==========
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'dateTime',
				displayOptions: {
					show: {
						resource: ['events'],
						operation: ['getHistorical'],
					},
				},
				default: '',
				required: true,
				description: 'Start of the time range (ISO 8601 format)',
			},
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'dateTime',
				displayOptions: {
					show: {
						resource: ['events'],
						operation: ['getHistorical'],
					},
				},
				default: '',
				description: 'End of the time range (ISO 8601 format). Leave empty for current time.',
			},

			// ========== SESSION: GET PARAMETERS ==========
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['session'],
						operation: ['get'],
					},
				},
				default: '',
				required: true,
				description: 'The unique identifier for the session (UUID format)',
				placeholder: '82299c01-aec1-4b41-015f-a876cb22255d',
			},

			// ========== TRUST SCORE: GET PARAMETERS ==========
			{
				displayName: 'Username',
				name: 'username',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['trustScore'],
						operation: ['get'],
					},
				},
				default: '',
				required: true,
				description: 'Username in down-level logon name format (e.g. DOMAIN\\username) or UPN format if Entra ID integration is enabled',
				placeholder: 'DOMAIN\\username',
			},
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Get credentials
		const creds = await this.getCredentials('twosenseApi');
		if (!creds?.baseUrl) throw new NodeOperationError(this.getNode(), 'Missing credential: baseUrl');
		if (!creds?.clientId) throw new NodeOperationError(this.getNode(), 'Missing credential: clientId');
		if (!creds?.clientSecret) throw new NodeOperationError(this.getNode(), 'Missing credential: clientSecret');

		const baseUrl = String(creds.baseUrl).replace(/\/+$/, '');
		const clientId = String(creds.clientId);
		const clientSecret = String(creds.clientSecret);
		// Audience is always the same as the base URL
		const audience = baseUrl;
		// Token path is always /oauth/token
		const tokenPath = '/oauth/token';

		// ========== GET API TOKEN ==========
		this.logger.info('[Twosense] refreshing API token');
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

		// ========== ROUTE TO OPERATION ==========
		if (resource === 'events' && operation === 'getHistorical') {
			// ========== EVENTS: GET HISTORICAL ==========
			const startTime = this.getNodeParameter('startTime', 0) as string;
			let endTime = this.getNodeParameter('endTime', 0) as string;

			if (!endTime) {
				endTime = toIsoNow();
			}

			this.logger.info(`[Twosense] Fetching historical events from ${startTime} to ${endTime}`);

			const eventsUrl = `${baseUrl}/events`;
			const allEvents: IDataObject[] = [];

			// Build query parameters
			const qs: Record<string, string> = {
				since: startTime,
				until: endTime,
			};

			let nextUrl: string | null = null;
			const doRequest = async (url: string, queryParams?: Record<string, string>) => {
				this.logger.info(`[Twosense] GET ${url} qs=${JSON.stringify(queryParams ?? {})}`);

				const resp = await this.helpers.httpRequest({
					method: 'GET',
					url,
					qs: queryParams,
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
					`[Twosense] Got ${events.length} events, nextUrl: ${nextUrl ?? 'none'}`,
				);

				return events.length;
			};

			await doRequest(eventsUrl, qs);
			let pageCount = 1;
			while (nextUrl) {
				pageCount++;
				this.logger.info(`[Twosense] Fetching page ${pageCount} from ${nextUrl}`);
				await doRequest(nextUrl);
			}

			this.logger.info(`[Twosense] Fetched ${pageCount} pages, ${allEvents.length} total events`);

			const out: INodeExecutionData[] = allEvents.map((e) => ({ json: e }));
			return [out];
		} else if (resource === 'session' && operation === 'get') {
			// ========== SESSION: GET ==========
			const sessionId = this.getNodeParameter('sessionId', 0) as string;

			this.logger.info(`[Twosense] Getting session information for session ${sessionId}`);

			const sessionUrl = `${baseUrl}/sessions/${sessionId}`;

			const resp = await this.helpers.httpRequest({
				method: 'GET',
				url: sessionUrl,
				headers: {
					Authorization: `Bearer ${apiToken}`,
					Accept: 'application/json',
				},
				json: true,
				ignoreHttpStatusErrors: true,
				returnFullResponse: true,
			});

			this.logger.info(`[Twosense] Session response status: ${resp.statusCode}`);

			// Handle 404: Session not found
			if (resp.statusCode === 404) {
				this.logger.info(`[Twosense] Session not found: ${sessionId}`);
				return [[{
					json: {
						found: false,
						reason: 'session_not_found',
						sessionId,
						statusCode: 404,
					},
				}]];
			}

			// Handle other non-200 responses
			if (resp.statusCode !== 200) {
				this.logger.warn(`[Twosense] Unexpected status ${resp.statusCode} for session ${sessionId}`);
				return [[{
					json: {
						found: false,
						reason: 'api_error',
						sessionId,
						statusCode: resp.statusCode,
						error: resp.body,
					},
				}]];
			}

			this.logger.info(`[Twosense] Session found: ${JSON.stringify(resp.body)}`);

			// Add found indicator to response
			return [[{
				json: {
					found: true,
					...resp.body,
				},
			}]];
		} else if (resource === 'trustScore' && operation === 'get') {
			// ========== TRUST SCORE: GET ==========
			const username = this.getNodeParameter('username', 0) as string;

			this.logger.info(`[Twosense] Getting trust score for user ${username}`);

			const trustScoreUrl = `${baseUrl}/trust-score`;

			const resp = await this.helpers.httpRequest({
				method: 'GET',
				url: trustScoreUrl,
				qs: {
					username,
				},
				headers: {
					Authorization: `Bearer ${apiToken}`,
					Accept: 'application/json',
				},
				json: true,
				ignoreHttpStatusErrors: true,
				returnFullResponse: true,
			});

			this.logger.info(`[Twosense] Trust score response status: ${resp.statusCode}`);

			// Handle 204: No recent trust score (within 60 minutes)
			if (resp.statusCode === 204) {
				this.logger.info(`[Twosense] No recent trust score for user ${username}`);
				return [[{
					json: {
						found: false,
						reason: 'no_recent_score',
						username,
						statusCode: 204,
						message: 'No trust score within the last 60 minutes',
					},
				}]];
			}

			// Handle 404: User not found
			if (resp.statusCode === 404) {
				this.logger.info(`[Twosense] User not found: ${username}`);
				return [[{
					json: {
						found: false,
						reason: 'user_not_found',
						username,
						statusCode: 404,
						message: 'User not found in Twosense system',
					},
				}]];
			}

			// Handle other non-200 responses
			if (resp.statusCode !== 200) {
				this.logger.warn(`[Twosense] Unexpected status ${resp.statusCode} for user ${username}`);
				return [[{
					json: {
						found: false,
						reason: 'api_error',
						username,
						statusCode: resp.statusCode,
						error: resp.body,
					},
				}]];
			}

			this.logger.info(`[Twosense] Trust score found: ${JSON.stringify(resp.body)}`);

			// Add found indicator to response
			return [[{
				json: {
					found: true,
					...resp.body,
				},
			}]];
		}

		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" for resource "${resource}" is not supported`,
		);
	}
}
