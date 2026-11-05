const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, createSession, waitFor, delay } = require('./helpers.cjs');
const { safeConnectionError } = require('../dist/nodes/SocketTrigger/transport/session');

for (const [name, credentials, accept] of [
	[
		'bearer',
		{ method: 'bearer', secret: 'jwt' },
		(req) => req.headers.authorization === 'Bearer jwt',
	],
	[
		'basic',
		{ method: 'basic', username: 'user', password: 'p:a ss' },
		(req) => req.headers.authorization === `Basic ${Buffer.from('user:p:a ss').toString('base64')}`,
	],
	[
		'header',
		{ method: 'header', headerName: 'X-API-Key', secret: 'key' },
		(req) => req.headers['x-api-key'] === 'key',
	],
	[
		'query',
		{ method: 'query', parameterName: 'token', secret: 'a+b &=' },
		(req) => new URL(req.url, 'http://localhost').searchParams.get('token') === 'a+b &=',
	],
	[
		'subprotocol',
		{ method: 'subprotocol', subprotocolPrefix: 'bearer', secret: 'jwt' },
		(req) => req.headers['sec-websocket-protocol'] === 'bearer,jwt',
	],
]) {
	test(
		`real WebSocket server accepts ${name} handshake authentication`,
		{ timeout: 5000 },
		async (t) => {
			const server = await createServer(t, {
				accept: (req) => (accept(req) ? 101 : 401),
				onConnection: (ws) => ws.send('{"event":"ready"}'),
			});
			const { session, messages } = createSession(t, server.url, { credentials });
			await session.start();
			await waitFor(() => messages.length === 1);
			assert.equal(messages[0].data, '{"event":"ready"}');
		},
	);
}

test(
	'401 fails activation without emitting credential values or retrying',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, { accept: () => 401 });
		const { session } = createSession(t, `${server.url}?token=never-print-this`);
		await assert.rejects(
			session.start(),
			(error) =>
				/HTTP 401/.test(error.message) &&
				error.permanent &&
				!error.message.includes('never-print-this'),
		);
		await delay(80);
		assert.equal(server.requests.length, 1);
	},
);

test('reconnection replays subscriptions and resumes delivery', { timeout: 5000 }, async (t) => {
	let connections = 0;
	const subscriptions = [];
	const server = await createServer(t, {
		onConnection: (ws) => {
			connections += 1;
			ws.on('message', (message) => {
				subscriptions.push(message.toString());
				ws.send(`{"connection":${connections}}`);
			});
			if (connections === 1) setTimeout(() => ws.terminate(), 30);
		},
	});
	const { session, messages, errors } = createSession(t, server.url, {
		initialMessages: ['subscribe'],
	});
	await session.start();
	await waitFor(() => messages.length >= 2);
	assert.deepEqual(subscriptions, ['subscribe', 'subscribe']);
	assert.equal(errors.length, 0);
});

test(
	'permanent authentication failures during reconnection stop local retries',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			accept: (_req, count) => (count === 1 ? 101 : 403),
			onConnection: (ws) => setTimeout(() => ws.terminate(), 20),
		});
		const { session, errors } = createSession(t, server.url);
		await session.start();
		await waitFor(() => errors.length === 1);
		assert.match(errors[0].message, /HTTP 403/);
		await delay(100);
		assert.equal(server.requests.length, 2);
	},
);

test(
	'short-lived successful connections do not bypass the retry limit',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			onConnection: (ws) => setTimeout(() => ws.terminate(), 10),
		});
		const { session, errors } = createSession(t, server.url, { maxReconnectAttempts: 2 });
		await session.start();
		await waitFor(() => errors.length === 1);
		assert.match(errors[0].message, /attempt limit/);
		assert.equal(server.requests.length, 3);
	},
);

test('stopping the listener cancels reconnection timers', { timeout: 5000 }, async (t) => {
	const server = await createServer(t, {
		onConnection: (ws) => setTimeout(() => ws.terminate(), 15),
	});
	const { session } = createSession(t, server.url, {
		reconnectDelayMs: 200,
		maxReconnectDelayMs: 200,
	});
	await session.start();
	await delay(60);
	await session.stop();
	await delay(250);
	assert.equal(server.requests.length, 1);
});

test('heartbeat reconnects an unresponsive peer', { timeout: 5000 }, async (t) => {
	const server = await createServer(t, { autoPong: false });
	const { session } = createSession(t, server.url, { pingIntervalMs: 20, pongTimeoutMs: 20 });
	await session.start();
	await waitFor(() => server.requests.length >= 2);
	await session.stop();
});

test('server policy violations are not retried locally', { timeout: 5000 }, async (t) => {
	const server = await createServer(t, {
		onConnection: (ws) => setTimeout(() => ws.close(1008, 'private reason'), 20),
	});
	const { session, errors } = createSession(t, server.url);
	await session.start();
	await waitFor(() => errors.length === 1);
	assert.match(errors[0].message, /1008/);
	assert(!errors[0].message.includes('private reason'));
	assert.equal(server.requests.length, 1);
});

test('unknown library errors are sanitized before reaching n8n', () => {
	assert(
		!safeConnectionError(new Error('private-token-in-full-url')).message.includes('private-token'),
	);
});

test(
	'oversized messages stop the listener instead of reconnecting forever',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			onConnection: (ws) => setTimeout(() => ws.send(Buffer.alloc(2 * 1024 * 1024)), 20),
		});
		const { session, errors } = createSession(t, server.url);
		await session.start();
		await waitFor(() => errors.length === 1);
		assert.match(errors[0].message, /protocol validation/);
		await delay(100);
		assert.equal(server.requests.length, 1);
	},
);

test(
	'transient 503 during reconnection is retried and event delivery resumes',
	{ timeout: 5000 },
	async (t) => {
		let peers = 0;
		const server = await createServer(t, {
			accept: (_req, count) => (count === 2 ? 503 : 101),
			onConnection: (ws) => {
				peers += 1;
				if (peers === 1) setTimeout(() => ws.terminate(), 20);
				else ws.send('resumed');
			},
		});
		const { session, messages, errors } = createSession(t, server.url);
		await session.start();
		await waitFor(() => messages.length === 1);
		assert.equal(messages[0].data, 'resumed');
		assert.equal(server.requests.length, 3);
		assert.equal(errors.length, 0);
	},
);
