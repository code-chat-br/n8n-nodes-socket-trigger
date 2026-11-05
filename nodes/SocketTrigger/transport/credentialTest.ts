import type { ICredentialTestFunction } from 'n8n-workflow';
import { buildHandshake } from './handshake';
import { safeConnectionError, WebSocketSession } from './session';

export const testConnection: ICredentialTestFunction = async function (credential) {
	const credentials = credential.data;
	if (!credentials || typeof credentials.testUrl !== 'string' || !credentials.testUrl) {
		return {
			status: 'Error',
			message: 'Set Test WebSocket URL to test this credential, or save it and test the trigger.',
		};
	}
	const endpoint = credentials.testUrl;
	const session = new WebSocketSession({
		getHandshake: async () =>
			buildHandshake({
				endpoint,
				credentials,
				headers: [],
				query: [],
				protocols: [],
				timeoutMs: 10000,
				maxPayloadBytes: 1024 * 1024,
			}),
		initialMessages: [],
		reconnect: false,
		reconnectDelayMs: 1000,
		maxReconnectDelayMs: 1000,
		maxReconnectAttempts: 0,
		pingIntervalMs: 0,
		pongTimeoutMs: 1000,
		onMessage: () => {},
		onFatalError: () => {},
	});
	try {
		await session.start();
		return {
			status: 'OK',
			message:
				'WebSocket handshake succeeded. This test does not verify subscriptions or event delivery.',
		};
	} catch (error) {
		return { status: 'Error', message: safeConnectionError(error).message };
	} finally {
		await session.stop();
	}
};
