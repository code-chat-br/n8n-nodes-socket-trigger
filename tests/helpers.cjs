const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { WebSocketServer } = require('ws');
const { buildHandshake } = require('../dist/nodes/SocketTrigger/transport/handshake');
const { WebSocketSession } = require('../dist/nodes/SocketTrigger/transport/session');

async function waitFor(check, timeout = 2500) {
	const end = Date.now() + timeout;
	while (!check()) {
		if (Date.now() >= end) throw new Error('Timed out waiting for test condition');
		await delay(10);
	}
}

async function createServer(t, { accept = () => 101, onConnection = () => {}, ...options } = {}) {
	const requests = [];
	const sockets = new Set();
	const httpServer = http.createServer();
	const wsServer = new WebSocketServer({ noServer: true, ...options });
	httpServer.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	httpServer.on('upgrade', (req, socket, head) => {
		requests.push(req);
		const status = accept(req, requests.length);
		if (status !== 101) {
			socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
			return;
		}
		wsServer.handleUpgrade(req, socket, head, (ws) => wsServer.emit('connection', ws, req));
	});
	wsServer.on('connection', onConnection);
	await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
	t.after(async () => {
		for (const ws of wsServer.clients) ws.terminate();
		for (const socket of sockets) socket.destroy();
		await Promise.all([
			new Promise((resolve) => wsServer.close(resolve)),
			new Promise((resolve) => httpServer.close(resolve)),
		]);
	});
	return { url: `ws://127.0.0.1:${httpServer.address().port}/events`, requests, wsServer };
}

function createSession(t, url, { credentials, ...options } = {}) {
	const messages = [];
	const errors = [];
	const session = new WebSocketSession({
		getHandshake: async () =>
			buildHandshake({
				endpoint: url,
				headers: [],
				query: [],
				protocols: [],
				credentials,
				timeoutMs: 500,
				maxPayloadBytes: 1024 * 1024,
			}),
		initialMessages: [],
		reconnect: true,
		reconnectDelayMs: 20,
		maxReconnectDelayMs: 50,
		maxReconnectAttempts: 3,
		pingIntervalMs: 0,
		pongTimeoutMs: 30,
		onMessage: (data, binary) => messages.push({ data: data.toString(), binary }),
		onFatalError: (error) => errors.push(error),
		...options,
	});
	t.after(() => session.stop());
	return { session, messages, errors };
}

module.exports = { waitFor, createServer, createSession, delay };
