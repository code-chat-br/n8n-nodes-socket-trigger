import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class SocketTriggerWebSocketApi implements ICredentialType {
	name = 'socketTriggerWebSocketApi';
	displayName = 'Socket Trigger WebSocket API';
	documentationUrl = 'https://www.npmjs.com/package/n8n-nodes-socket-trigger';
	icon: Icon = {
		light: 'file:../nodes/SocketTrigger/socket-trigger.light.svg',
		dark: 'file:../nodes/SocketTrigger/socket-trigger.dark.svg',
	};
	properties: INodeProperties[] = [
		{
			displayName: 'Test WebSocket URL',
			name: 'testUrl',
			type: 'string',
			default: '',
			placeholder: 'wss://api.example.com/events',
			description:
				'Optional endpoint used only by the credential connection test. The trigger uses its own WebSocket URL.',
		},
		{
			displayName: 'Authentication Method',
			name: 'method',
			type: 'options',
			default: 'bearer',
			options: [
				{ name: 'Basic Auth', value: 'basic' },
				{ name: 'Bearer Token', value: 'bearer' },
				{ name: 'Custom Header', value: 'header' },
				{ name: 'Custom Headers / Query Parameters', value: 'custom' },
				{ name: 'Query Parameter', value: 'query' },
				{ name: 'Subprotocol', value: 'subprotocol' },
			],
		},
		{
			displayName: 'Token / Secret',
			name: 'secret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { method: ['bearer', 'header', 'query', 'subprotocol'] } },
		},
		{
			displayName: 'Header Name',
			name: 'headerName',
			type: 'string',
			default: 'X-API-Key',
			required: true,
			displayOptions: { show: { method: ['header'] } },
		},
		{
			displayName: 'Query Parameter Name',
			name: 'parameterName',
			type: 'string',
			default: 'token',
			required: true,
			displayOptions: { show: { method: ['query'] } },
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { method: ['basic'] } },
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			displayOptions: { show: { method: ['basic'] } },
		},
		{
			displayName: 'Subprotocol Prefix',
			name: 'subprotocolPrefix',
			type: 'string',
			default: 'bearer',
			description:
				'Sent before the secret as a separate subprotocol. Leave empty to send only the secret.',
			displayOptions: { show: { method: ['subprotocol'] } },
		},
		{
			displayName: 'Additional Secret Headers (JSON)',
			name: 'secretHeaders',
			type: 'string',
			typeOptions: { password: true },
			default: '{}',
			description:
				'JSON object of string values, for example {"X-Tenant-Key":"secret"}. Stored in this encrypted credential.',
		},
		{
			displayName: 'Additional Secret Query Parameters (JSON)',
			name: 'secretQuery',
			type: 'string',
			typeOptions: { password: true },
			default: '{}',
			description:
				'JSON object of string values. Query secrets can be recorded by upstream access logs.',
		},
	];
}
