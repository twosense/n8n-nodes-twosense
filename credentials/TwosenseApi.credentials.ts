import type {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TwosenseApi implements ICredentialType {
	name = 'twosenseApi';
	displayName = 'Twosense API (Client Credentials) API';
	documentationUrl = 'https://twosense.readme.io';
	icon = 'file:../assets/twosense.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://webapi.twosense.ai',
			required: true,
			description: 'Base URL for the Twosense Web API (no trailing slash)',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/oauth/token',
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: {
				client_id: '={{$credentials.clientId}}',
				client_secret: '={{$credentials.clientSecret}}',
				audience: '={{$credentials.baseUrl}}',
				grant_type: 'client_credentials',
			},
		},
	};
}
