const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SocketTrigger } = require('../dist/nodes/SocketTrigger/SocketTrigger.node');
const { testConnection } = require('../dist/nodes/SocketTrigger/transport/credentialTest');
const { createServer, waitFor, delay } = require('./helpers.cjs');

function context(url, overrides = {}) {
	const emitted = [];
	const errors = [];
	const failed = [];
	const parameters = {
		url,
		authentication: 'none',
		messageFormat: 'auto',
		headers: {},
		queryParameters: {},
		options: { pingInterval: 0 },
		...overrides,
	};
	const ctx = {
		getNodeParameter: (name) => parameters[name],
		getNode: () => ({
			id: 'test',
			name: 'Socket Trigger',
			type: 'n8n-nodes-socket-trigger.socketTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters,
		}),
		getCredentials: async () => ({ method: 'bearer', secret: 'private-jwt' }),
		emit: (items) => emitted.push(...items[0]),
		emitError: (error) => errors.push(error),
		saveFailedExecution: (error) => failed.push(error),
		helpers: {
			prepareBinaryData: async (buffer, filename, mimeType) => {
				await delay(10);
				return { data: buffer.toString('base64'), mimeType, fileName: filename };
			},
		},
	};
	return { ctx, emitted, errors, failed };
}

test(
	'n8n trigger applies credential headers and emits JSON, binary and text in arrival order',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			accept: (req) => (req.headers.authorization === 'Bearer private-jwt' ? 101 : 401),
			onConnection: (ws) => {
				ws.send('{"event":"first"}');
				ws.send(Buffer.from([0, 255, 128]));
				ws.send('plain text');
				ws.send('[1,2]');
			},
		});
		const { ctx, emitted, errors } = context(server.url, { authentication: 'credential' });
		const response = await new SocketTrigger().trigger.call(ctx);
		t.after(() => response.closeFunction());
		await waitFor(() => emitted.length === 4);
		assert.deepEqual(emitted[0].json, { event: 'first' });
		assert.equal(emitted[1].binary.data.data, Buffer.from([0, 255, 128]).toString('base64'));
		assert.deepEqual(emitted[2].json, { data: 'plain text' });
		assert.deepEqual(emitted[3].json, { data: [1, 2] });
		assert.equal(errors.length, 0);
	},
);

test(
	'JSON failures are recorded without stopping healthy listeners',
	{ timeout: 5000 },
	async (t) => {
		let peer;
		const server = await createServer(t, {
			onConnection: (ws) => {
				peer = ws;
				ws.send('private malformed payload');
				ws.send('{"ok":true}');
			},
		});
		const { ctx, emitted, failed, errors } = context(server.url, { messageFormat: 'json' });
		const response = await new SocketTrigger().trigger.call(ctx);
		t.after(() => response.closeFunction());
		await waitFor(() => emitted.length === 1 && failed.length === 1);
		assert(!failed[0].message.includes('private malformed payload'));
		assert.equal(errors.length, 0);
		peer.send('{"ok":2}');
		await waitFor(() => emitted.length === 2);
	},
);

test(
	'JSON skip mode discards malformed text but keeps valid messages',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			onConnection: (ws) => {
				ws.send('bad');
				ws.send('{"ok":true}');
			},
		});
		const { ctx, emitted, failed } = context(server.url, {
			messageFormat: 'json',
			options: { invalidJson: 'skip', pingInterval: 0 },
		});
		const response = await new SocketTrigger().trigger.call(ctx);
		t.after(() => response.closeFunction());
		await waitFor(() => emitted.length === 1);
		assert.equal(failed.length, 0);
	},
);

test('stopping the n8n trigger suppresses subsequent messages', { timeout: 5000 }, async (t) => {
	const server = await createServer(t, { onConnection: (ws) => ws.send('{"ready":true}') });
	const { ctx, emitted } = context(server.url);
	const response = await new SocketTrigger().trigger.call(ctx);
	await waitFor(() => emitted.length === 1);
	await response.closeFunction();
	await waitFor(() => server.wsServer.clients.size === 0);
	assert.equal(emitted.length, 1);
});

test(
	'bounded pending queue reports overflow and closes the socket',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			onConnection: (ws) => {
				for (let i = 0; i < 20; i++) ws.send(Buffer.from([i]));
			},
		});
		const { ctx, errors } = context(server.url, {
			options: { maxPendingMessages: 1, pingInterval: 0 },
		});
		const response = await new SocketTrigger().trigger.call(ctx);
		t.after(() => response.closeFunction());
		await waitFor(() => errors.length === 1 && server.wsServer.clients.size === 0);
		assert.match(errors[0].message, /pending message limit/);
	},
);

test(
	'credential test verifies a real handshake and closes its connection',
	{ timeout: 5000 },
	async (t) => {
		const server = await createServer(t, {
			accept: (req) => (req.headers.authorization === 'Bearer jwt' ? 101 : 401),
		});
		const result = await testConnection.call(
			{},
			{ data: { testUrl: server.url, method: 'bearer', secret: 'jwt' } },
		);
		assert.equal(result.status, 'OK');
		await waitFor(() => server.wsServer.clients.size === 0);
		const rejected = await testConnection.call(
			{},
			{ data: { testUrl: server.url, method: 'bearer', secret: 'wrong' } },
		);
		assert.equal(rejected.status, 'Error');
		assert.match(rejected.message, /401/);
	},
);

test('missing credential test URL produces an actionable result without network traffic', async () => {
	const result = await testConnection.call({}, { data: { method: 'bearer', secret: 'jwt' } });
	assert.equal(result.status, 'Error');
	assert.match(result.message, /Test WebSocket URL/);
});
