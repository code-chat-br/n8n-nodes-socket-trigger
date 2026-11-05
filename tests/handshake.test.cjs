const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildHandshake } = require('../dist/nodes/SocketTrigger/transport/handshake');

const make = (options = {}) =>
	buildHandshake({
		endpoint: 'wss://example.com/events',
		headers: [],
		query: [],
		protocols: [],
		timeoutMs: 15000,
		maxPayloadBytes: 1024,
		...options,
	});

test('Bearer authentication is sent on the HTTP upgrade request', () => {
	const result = make({ credentials: { method: 'bearer', secret: 'private-jwt' } });
	assert.equal(result.options.headers.Authorization, 'Bearer private-jwt');
	assert.equal(result.url.search, '');
	assert.equal(result.options.rejectUnauthorized, true);
	assert.equal(result.options.followRedirects, false);
});

test('query authentication preserves parameters and encodes reserved characters', () => {
	const secret = 'a+b & c=/ç?';
	const result = make({
		endpoint: 'wss://example.com/events?channel=inbox',
		query: [{ name: 'filter', value: 'new & unread' }],
		credentials: { method: 'query', parameterName: 'access_token', secret },
	});
	assert.equal(result.url.searchParams.get('access_token'), secret);
	assert.equal(result.url.searchParams.get('channel'), 'inbox');
	assert.equal(result.url.searchParams.get('filter'), 'new & unread');
	assert(!result.url.href.includes(secret));
});

test('Basic Auth preserves UTF-8 credentials and colons in passwords', () => {
	const result = make({ credentials: { method: 'basic', username: 'josé', password: 'p:a ss' } });
	assert.equal(
		result.options.headers.Authorization,
		`Basic ${Buffer.from('josé:p:a ss').toString('base64')}`,
	);
});

test('URL userinfo is decoded, moved to Basic Auth and removed from the connection URL', () => {
	const result = make({ endpoint: 'wss://user%40tenant:p%3Aa%2Bss@example.com/events' });
	assert.equal(result.url.username, '');
	assert.equal(result.url.password, '');
	assert.equal(
		result.options.headers.Authorization,
		`Basic ${Buffer.from('user@tenant:p:a+ss').toString('base64')}`,
	);
});

test('custom headers coexist with secret query fields', () => {
	const result = make({
		headers: [{ name: 'X-Client', value: 'n8n' }],
		credentials: {
			method: 'header',
			headerName: 'X-API-Key',
			secret: 'key',
			secretHeaders: '{"Cookie":"session=private"}',
			secretQuery: '{"tenant_key":"private"}',
		},
	});
	assert.equal(result.options.headers['X-API-Key'], 'key');
	assert.equal(result.options.headers.Cookie, 'session=private');
	assert.equal(result.url.searchParams.get('tenant_key'), 'private');
});

test('CodeChat subprotocol authentication sends bearer and token separately', () => {
	assert.deepEqual(
		make({
			credentials: {
				method: 'subprotocol',
				subprotocolPrefix: 'bearer',
				secret: 'jwt.value.signature',
			},
		}).protocols,
		['bearer', 'jwt.value.signature'],
	);
	assert.deepEqual(make({ credentials: { method: 'subprotocol', secret: 'private' } }).protocols, [
		'private',
	]);
});

test('repeated non-secret query parameters are preserved', () => {
	const result = make({
		query: [
			{ name: 'channel', value: 'a' },
			{ name: 'channel', value: 'b' },
		],
	});
	assert.deepEqual(result.url.searchParams.getAll('channel'), ['a', 'b']);
});

test('reserved headers, CRLF, duplicate authorization and duplicate secret query fields are rejected', () => {
	for (const name of ['Host', 'Upgrade', 'Connection', 'Sec-WebSocket-Protocol', 'Origin']) {
		assert.throws(() => make({ headers: [{ name, value: 'x' }] }), /Reserved/);
	}
	assert.throws(
		() => make({ headers: [{ name: 'X-Key', value: 'secret\r\nInjected: yes' }] }),
		/invalid characters/,
	);
	assert.throws(
		() =>
			make({
				headers: [{ name: 'authorization', value: 'other' }],
				credentials: { method: 'bearer', secret: 'private' },
			}),
		/conflicting/,
	);
	assert.throws(
		() =>
			make({
				endpoint: 'wss://example.com?token=old',
				credentials: { method: 'query', parameterName: 'token', secret: 'new' },
			}),
		/conflict/,
	);
});

test('configuration errors do not disclose invalid URL, header or subprotocol secrets', () => {
	const secret = 'never-print-this';
	for (const options of [
		{ endpoint: `not a url ${secret}` },
		{ protocols: [`${secret},invalid`] },
		{ headers: [{ name: 'X-Key', value: `${secret}\r\n` }] },
		{ credentials: { method: 'custom', secretHeaders: `broken ${secret}` } },
	]) {
		assert.throws(
			() => make(options),
			(error) => !error.message.includes(secret),
		);
	}
});

test('unsupported schemes, fragments, duplicate subprotocols and malformed credentials fail early', () => {
	for (const endpoint of ['https://example.com', 'file:///private', 'wss://example.com/#fragment'])
		assert.throws(() => make({ endpoint }));
	assert.throws(() => make({ protocols: ['same', 'same'] }));
	assert.throws(() =>
		make({ credentials: { method: 'basic', username: 'bad:user', password: 'private' } }),
	);
	assert.throws(() => make({ credentials: { method: 'custom', secretHeaders: '{"X-Key":123}' } }));
	assert.throws(() => make({ credentials: { method: 'unknown' } }));
});
