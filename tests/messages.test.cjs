const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	decodeMessage,
	parseInitialMessages,
	rawBuffer,
} = require('../dist/nodes/SocketTrigger/transport/messages');

test('CodeChat JSON envelope is preserved without additional fields', () => {
	const event = {
		event: 'messages.upsert',
		instance: { name: 'shop' },
		payload: { content: 'hello' },
	};
	assert.deepEqual(decodeMessage(Buffer.from(JSON.stringify(event)), false, 'auto'), {
		json: event,
	});
});

test('arrays, null and scalar JSON values use a data field', () => {
	for (const value of [null, [1, 2], 'hello', 42, true])
		assert.deepEqual(decodeMessage(Buffer.from(JSON.stringify(value)), false, 'auto').json, {
			data: value,
		});
});

test('auto mode falls back to text; text mode does not parse JSON', () => {
	assert.deepEqual(decodeMessage(Buffer.from('hello'), false, 'auto').json, { data: 'hello' });
	assert.deepEqual(decodeMessage(Buffer.from('{"a":1}'), false, 'text').json, { data: '{"a":1}' });
	assert.throws(
		() => decodeMessage(Buffer.from('sensitive invalid payload'), false, 'json'),
		(error) => !error.message.includes('sensitive'),
	);
});

test('binary frames retain exact bytes, including non-UTF8 data', () => {
	const data = Buffer.from([0, 255, 128, 1]);
	assert.deepEqual(decodeMessage(data, true, 'json'), {
		json: { messageType: 'binary', byteLength: 4 },
		binary: data,
	});
	assert.deepEqual(rawBuffer([data.subarray(0, 2), data.subarray(2)]), data);
	assert.deepEqual(rawBuffer(Uint8Array.from([1, 2]).buffer), Buffer.from([1, 2]));
});

test('subscription messages distinguish raw text from JSON objects', () => {
	assert.deepEqual(parseInitialMessages('["SUBSCRIBE", {"action":"subscribe"}, null]'), [
		'SUBSCRIBE',
		'{"action":"subscribe"}',
		'null',
	]);
	for (const invalid of ['{}', 'broken', 'null'])
		assert.throws(() => parseInitialMessages(invalid));
});
