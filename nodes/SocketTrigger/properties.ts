import type { INodeProperties } from 'n8n-workflow';

export const properties: INodeProperties[] = [
	{
		displayName: 'WebSocket URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'wss://api.example.com/events',
		description: 'WebSocket endpoint. Store secrets in a credential instead of this URL.',
	},
	{
		displayName: 'Authentication',
		name: 'authentication',
		type: 'options',
		default: 'none',
		options: [
			{ name: 'None', value: 'none' },
			{ name: 'Socket Trigger WebSocket API', value: 'credential' },
		],
	},
	{
		displayName: 'Message Format',
		name: 'messageFormat',
		type: 'options',
		default: 'auto',
		options: [
			{
				name: 'Auto',
				value: 'auto',
				description: 'Parse JSON when possible; otherwise return text',
			},
			{ name: 'JSON', value: 'json', description: 'Require JSON for text messages' },
			{ name: 'Text', value: 'text', description: 'Return text without parsing JSON' },
		],
		description: 'Binary frames are always returned as n8n binary data',
	},
	{
		displayName: 'Query Parameters',
		name: 'queryParameters',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Query Parameter',
		typeOptions: { multipleValues: true },
		description: 'Non-secret query parameters. Use credential fields for secrets.',
		options: [
			{
				name: 'parameters',
				displayName: 'Parameter',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
	{
		displayName: 'Headers',
		name: 'headers',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Header',
		typeOptions: { multipleValues: true },
		description: 'Non-secret headers. Use credential fields for secrets.',
		options: [
			{
				name: 'parameters',
				displayName: 'Header',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '', required: true },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		default: {},
		placeholder: 'Add Option',
		options: [
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				description: 'Name of the output binary field',
			},
			{
				displayName: 'Handshake Timeout (Ms)',
				name: 'handshakeTimeout',
				type: 'number',
				default: 15000,
				typeOptions: { minValue: 1000, maxValue: 120000, numberPrecision: 0 },
				description: 'Maximum time to wait for the HTTP upgrade',
			},
			{
				displayName: 'Initial Messages (JSON)',
				name: 'initialMessages',
				type: 'json',
				default: '[]',
				description:
					'JSON array of subscription messages sent in order after every connection. Strings are sent as text; other values are JSON encoded. Do not put secrets here.',
			},
			{
				displayName: 'Invalid JSON',
				name: 'invalidJson',
				type: 'options',
				default: 'error',
				options: [
					{ name: 'Report Failed Execution', value: 'error' },
					{ name: 'Skip Message', value: 'skip' },
				],
				description: 'How to handle invalid text messages in JSON mode',
			},
			{
				displayName: 'Maximum Message Size (MiB)',
				name: 'maxMessageSize',
				type: 'number',
				default: 16,
				typeOptions: { minValue: 1, maxValue: 64, numberPrecision: 0 },
				description: 'Maximum size of one incoming message',
			},
			{
				displayName: 'Maximum Pending Messages',
				name: 'maxPendingMessages',
				type: 'number',
				default: 1000,
				typeOptions: { minValue: 1, maxValue: 10000, numberPrecision: 0 },
				description:
					'Maximum messages awaiting conversion to n8n output. An overflow stops the listener and reports an error.',
			},
			{
				displayName: 'Maximum Reconnect Attempts',
				name: 'maxReconnectAttempts',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 10000, numberPrecision: 0 },
				description:
					'Retry budget until a connection stays open for 30 seconds. Zero retries indefinitely. n8n may also retry activation after a fatal error.',
			},
			{
				displayName: 'Maximum Reconnect Delay (Ms)',
				name: 'maxReconnectDelay',
				type: 'number',
				default: 30000,
				typeOptions: { minValue: 100, maxValue: 300000, numberPrecision: 0 },
			},
			{
				displayName: 'Origin',
				name: 'origin',
				type: 'string',
				default: '',
				placeholder: 'https://app.example.com',
				description: 'Optional Origin header required by some servers',
			},
			{
				displayName: 'Ping Interval (Ms)',
				name: 'pingInterval',
				type: 'number',
				default: 30000,
				typeOptions: { minValue: 0, maxValue: 300000, numberPrecision: 0 },
				description:
					'Interval between WebSocket control-frame pings. Zero disables client pings. Server pings are still answered.',
			},
			{
				displayName: 'Pong Timeout (Ms)',
				name: 'pongTimeout',
				type: 'number',
				default: 10000,
				typeOptions: { minValue: 100, maxValue: 120000, numberPrecision: 0 },
				description: 'Reconnect if the server does not respond to a ping in time',
			},
			{
				displayName: 'Reconnect',
				name: 'reconnect',
				type: 'boolean',
				default: true,
				description: 'Whether to reconnect after transient disconnections',
			},
			{
				displayName: 'Reconnect Delay (Ms)',
				name: 'reconnectDelay',
				type: 'number',
				default: 1000,
				typeOptions: { minValue: 100, maxValue: 300000, numberPrecision: 0 },
				description:
					'Initial reconnection delay. Later attempts use exponential backoff with jitter.',
			},
			{
				displayName: 'Subprotocols',
				name: 'subprotocols',
				type: 'string',
				default: '',
				placeholder: 'graphql-transport-ws',
				description:
					'Comma-separated, non-secret subprotocol names. Configure secret subprotocols in the credential.',
			},
		],
	},
];
