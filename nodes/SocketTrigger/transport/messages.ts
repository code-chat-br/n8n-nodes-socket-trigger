import type { RawData } from 'ws';
import { ConfigurationError } from './handshake';

export type MessageFormat = 'auto' | 'json' | 'text';
export interface DecodedMessage {
	json: Record<string, unknown>;
	binary?: Buffer;
}

export function rawBuffer(data: RawData): Buffer {
	if (Buffer.isBuffer(data)) return data;
	if (Array.isArray(data)) return Buffer.concat(data);
	return Buffer.from(data);
}

export function decodeMessage(
	data: RawData,
	isBinary: boolean,
	format: MessageFormat,
): DecodedMessage {
	const buffer = rawBuffer(data);
	if (isBinary)
		return { json: { messageType: 'binary', byteLength: buffer.length }, binary: buffer };
	const text = buffer.toString('utf8');
	if (format === 'text') return { json: { data: text } };
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		if (format === 'json')
			throw new ConfigurationError('Received a text message that is not valid JSON.');
		return { json: { data: text } };
	}
	if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
		return { json: parsed as Record<string, unknown> };
	}
	return { json: { data: parsed } };
}

export function parseInitialMessages(value: string): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new ConfigurationError('Initial messages must be a valid JSON array.');
	}
	if (!Array.isArray(parsed))
		throw new ConfigurationError('Initial messages must be a JSON array.');
	return parsed.map((message: unknown) =>
		typeof message === 'string' ? message : JSON.stringify(message),
	);
}
