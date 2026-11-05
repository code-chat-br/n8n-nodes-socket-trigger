import WebSocket, { type RawData } from 'ws';
import { ConfigurationError, type Handshake } from './handshake';

export class ConnectionError extends Error {
	constructor(
		message: string,
		readonly permanent = false,
	) {
		super(message);
	}
}

export interface SessionOptions {
	getHandshake: () => Promise<Handshake>;
	initialMessages: string[];
	reconnect: boolean;
	reconnectDelayMs: number;
	maxReconnectDelayMs: number;
	maxReconnectAttempts: number;
	pingIntervalMs: number;
	pongTimeoutMs: number;
	onMessage: (data: RawData, isBinary: boolean) => void;
	onFatalError: (error: Error) => void;
}

/** Owns one socket and its timers; instances must never be shared by workflows. */
export class WebSocketSession {
	private socket?: WebSocket;
	private stopped = false;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private heartbeatTimer?: ReturnType<typeof setInterval>;
	private pongTimer?: ReturnType<typeof setTimeout>;
	private attempts = 0;

	constructor(private readonly config: SessionOptions) {}

	async start(): Promise<void> {
		try {
			await this.connectOnce();
		} catch (error) {
			await this.stop();
			throw safeConnectionError(error);
		}
	}

	async stop(): Promise<void> {
		this.stopped = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.clearHeartbeat();
		const socket = this.socket;
		if (!socket || socket.readyState === WebSocket.CLOSED) return;
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				socket.terminate();
				resolve();
			}, 1_000);
			socket.once('close', () => {
				clearTimeout(timeout);
				resolve();
			});
			if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Workflow listener stopped');
			else socket.terminate();
		});
	}

	private clearHeartbeat(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		if (this.pongTimer) clearTimeout(this.pongTimer);
		this.heartbeatTimer = undefined;
		this.pongTimer = undefined;
	}

	private startHeartbeat(socket: WebSocket): void {
		this.clearHeartbeat();
		if (this.config.pingIntervalMs === 0) return;
		socket.on('pong', () => {
			if (this.socket !== socket) return;
			if (this.pongTimer) clearTimeout(this.pongTimer);
			this.pongTimer = undefined;
		});
		this.heartbeatTimer = setInterval(() => {
			if (this.stopped || socket.readyState !== WebSocket.OPEN || this.pongTimer) return;
			this.pongTimer = setTimeout(() => {
				socket.terminate();
			}, this.config.pongTimeoutMs);
			socket.ping(undefined, undefined, (error) => {
				if (error) socket.terminate();
			});
		}, this.config.pingIntervalMs);
	}

	private async connectOnce(): Promise<void> {
		const handshake = await this.config.getHandshake();
		if (this.stopped) throw new ConnectionError('WebSocket listener was stopped.', true);
		const socket = new WebSocket(handshake.url, handshake.protocols, handshake.options);
		this.socket = socket;
		await new Promise<void>((resolve, reject) => {
			let ready = false;
			let settled = false;
			let openedAt = 0;
			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				socket.terminate();
				reject(error);
			};
			socket.on('unexpected-response', (request, response) => {
				const status = response.statusCode ?? 0;
				response.resume();
				const permanent = status >= 300 && status < 500 && ![408, 429].includes(status);
				fail(
					new ConnectionError(
						`WebSocket handshake rejected (HTTP ${status}). Check authentication, URL and server permissions.`,
						permanent,
					),
				);
				request.destroy();
			});
			socket.on('error', (error: Error & { code?: string }) => {
				if (ready && error.code?.startsWith('WS_ERR_')) {
					this.fatal(
						new ConnectionError(
							'WebSocket protocol validation failed. Check the message format and maximum message size.',
							true,
						),
					);
					socket.terminate();
					return;
				}
				const permanent = [
					'CERT_HAS_EXPIRED',
					'DEPTH_ZERO_SELF_SIGNED_CERT',
					'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
					'ERR_TLS_CERT_ALTNAME_INVALID',
					'SELF_SIGNED_CERT_IN_CHAIN',
				].includes(error.code ?? '');
				if (!ready)
					fail(
						new ConnectionError(
							permanent
								? 'WebSocket TLS certificate validation failed.'
								: 'WebSocket connection failed. Check connectivity and handshake settings.',
							permanent,
						),
					);
				else socket.terminate();
			});
			socket.on('message', (data, isBinary) => {
				if (!this.stopped && this.socket === socket) this.config.onMessage(data, isBinary);
			});
			socket.once('open', () => {
				void (async () => {
					try {
						for (const message of this.config.initialMessages) {
							await new Promise<void>((sent, failed) => {
								socket.send(message, (error) => {
									if (error) failed(error);
									else sent();
								});
							});
						}
						if (settled || this.stopped || socket.readyState !== WebSocket.OPEN) return;
						ready = true;
						settled = true;
						openedAt = Date.now();
						this.startHeartbeat(socket);
						resolve();
					} catch {
						fail(new ConnectionError('Failed to send WebSocket subscription messages.'));
					}
				})();
			});
			socket.once('close', (code) => {
				if (this.socket === socket) {
					this.socket = undefined;
					this.clearHeartbeat();
				}
				if (!ready) {
					fail(new ConnectionError('WebSocket closed before the connection was ready.'));
					return;
				}
				if (this.stopped) return;
				// Do not reset the retry budget for connections that keep opening and immediately closing.
				if (Date.now() - openedAt >= 30_000) this.attempts = 0;
				if ([1002, 1003, 1007, 1008, 1009, 1010].includes(code)) {
					this.fatal(
						new ConnectionError(
							`WebSocket closed with a non-retryable protocol or policy error (${code}).`,
							true,
						),
					);
					return;
				}
				this.scheduleReconnect();
			});
		});
	}

	private fatal(error: Error): void {
		this.stopped = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.clearHeartbeat();
		this.config.onFatalError(error);
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		if (!this.config.reconnect) {
			this.fatal(
				new ConnectionError('WebSocket disconnected. Automatic reconnection is disabled.'),
			);
			return;
		}
		if (this.config.maxReconnectAttempts > 0 && this.attempts >= this.config.maxReconnectAttempts) {
			this.fatal(new ConnectionError('WebSocket reconnect attempt limit reached.'));
			return;
		}
		const base = Math.min(
			this.config.maxReconnectDelayMs,
			this.config.reconnectDelayMs * 2 ** Math.min(this.attempts, 30),
		);
		const delay = Math.min(this.config.maxReconnectDelayMs, base * (0.8 + Math.random() * 0.4));
		this.attempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			void this.connectOnce().catch((error: unknown) => {
				if (this.stopped) return;
				const safe = safeConnectionError(error);
				if (safe.permanent) this.fatal(safe);
				else this.scheduleReconnect();
			});
		}, delay);
	}
}

export function safeConnectionError(error: unknown): ConnectionError {
	if (error instanceof ConnectionError) return error;
	if (error instanceof ConfigurationError) return new ConnectionError(error.message, true);
	// Library errors can include the full URL or subprotocol (and therefore secrets).
	return new ConnectionError(
		'WebSocket connection failed. Check the URL, credentials and network settings.',
	);
}
