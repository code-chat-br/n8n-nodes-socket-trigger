import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{ ignores: ['dist/**', 'node_modules/**', 'tests/**', 'scripts/**'] },
	{
		// Transport helpers are independent of n8n. The trigger converts their errors to NodeOperationError.
		files: ['nodes/SocketTrigger/transport/**/*.ts'],
		rules: { '@n8n/community-nodes/require-node-api-error': 'off' },
	},
];
