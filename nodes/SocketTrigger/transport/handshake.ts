import { validateHeaderName, validateHeaderValue } from 'node:http';
import type { ClientOptions } from 'ws';

export interface NameValue {
	name: string;
	value: string;
}

export interface HandshakeInput {
	endpoint: string;
	headers: NameValue[];
	query: NameValue[];
	protocols: string[];
	credentials?: Record<string, unknown>;
	timeoutMs: number;
	maxPayloadBytes: number;
	origin?: string;
}

export interface Handshake {
	url: URL;
	protocols: string[];
	options: ClientOptions;
}

export class ConfigurationError extends Error {}

function stringField(data: Record<string, unknown>, field: string): string {
	const value = data[field];
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') throw new ConfigurationError('Credential fields must be strings.');
	return value;
}

function required(data: Record<string, unknown>, field: string): string {
	const value = stringField(data, field);
	if (!value) throw new ConfigurationError(`The credential field "${field}" is required.`);
	return value;
}

function secretMap(value: string): NameValue[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value || '{}');
	} catch {
		throw new ConfigurationError('Secret headers and query parameters must be valid JSON objects.');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new ConfigurationError('Secret headers and query parameters must be JSON objects.');
	}
	return Object.entries(parsed).map(([name, entry]) => {
		if (typeof entry !== 'string')
			throw new ConfigurationError('Secret headers and query parameter values must be strings.');
		return { name, value: entry };
	});
}

function basic(username: string, password: string): string {
	if (!username || username.includes(':'))
		throw new ConfigurationError('Basic Auth requires a username without a colon.');
	return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export function buildHandshake(input: HandshakeInput): Handshake {
	let url: URL;
	try {
		url = new URL(input.endpoint);
	} catch {
		throw new ConfigurationError('Enter a valid ws:// or wss:// URL.');
	}
	if (!['ws:', 'wss:'].includes(url.protocol) || url.hash) {
		throw new ConfigurationError('Use a ws:// or wss:// URL without a fragment.');
	}
	const headers: Record<string, string> = Object.create(null) as Record<string, string>;
	const protocols = [...input.protocols];
	const names = new Set<string>();
	const addHeader = ({ name, value }: NameValue) => {
		const key = name.toLowerCase();
		if (
			['host', 'connection', 'upgrade', 'content-length', 'origin'].includes(key) ||
			key.startsWith('sec-websocket-')
		) {
			throw new ConfigurationError(
				'Reserved handshake headers cannot be overridden. Use Origin and Subprotocols instead.',
			);
		}
		try {
			validateHeaderName(name);
			validateHeaderValue(name, value);
		} catch {
			throw new ConfigurationError('A header name or value contains invalid characters.');
		}
		if (names.has(key))
			throw new ConfigurationError('Duplicate or conflicting headers are not allowed.');
		names.add(key);
		headers[name] = value;
	};
	const addSecretQuery = ({ name, value }: NameValue) => {
		if (!name || url.searchParams.has(name)) {
			throw new ConfigurationError(
				'Secret query parameter names must be nonempty and must not conflict with existing parameters.',
			);
		}
		url.searchParams.set(name, value);
	};
	for (const pair of input.query) {
		if (!pair.name) throw new ConfigurationError('Query parameter names cannot be empty.');
		url.searchParams.append(pair.name, pair.value);
	}
	for (const pair of input.headers) addHeader(pair);
	if (url.username || url.password) {
		let username: string;
		let password: string;
		try {
			username = decodeURIComponent(url.username);
			password = decodeURIComponent(url.password);
		} catch {
			throw new ConfigurationError('The URL contains invalid encoded credentials.');
		}
		addHeader({ name: 'Authorization', value: basic(username, password) });
		url.username = '';
		url.password = '';
	}
	const c = input.credentials;
	if (c) {
		switch (c.method) {
			case 'bearer':
				addHeader({ name: 'Authorization', value: `Bearer ${required(c, 'secret')}` });
				break;
			case 'basic':
				addHeader({
					name: 'Authorization',
					value: basic(required(c, 'username'), stringField(c, 'password')),
				});
				break;
			case 'header':
				addHeader({ name: required(c, 'headerName'), value: required(c, 'secret') });
				break;
			case 'query':
				addSecretQuery({ name: required(c, 'parameterName'), value: required(c, 'secret') });
				break;
			case 'subprotocol': {
				const prefix = stringField(c, 'subprotocolPrefix');
				if (prefix) protocols.push(prefix);
				protocols.push(required(c, 'secret'));
				break;
			}
			case 'custom':
				break;
			default:
				throw new ConfigurationError('Select a supported credential authentication method.');
		}
		for (const pair of secretMap(stringField(c, 'secretHeaders'))) addHeader(pair);
		for (const pair of secretMap(stringField(c, 'secretQuery'))) addSecretQuery(pair);
	}
	const protocolNames = new Set<string>();
	for (const protocol of protocols) {
		if (!/^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/.test(protocol) || protocolNames.has(protocol)) {
			throw new ConfigurationError('Subprotocols must be unique, nonempty HTTP tokens.');
		}
		protocolNames.add(protocol);
	}
	if (input.origin) {
		try {
			validateHeaderValue('Origin', input.origin);
		} catch {
			throw new ConfigurationError('Origin contains invalid characters.');
		}
	}
	return {
		url,
		protocols,
		options: {
			headers,
			handshakeTimeout: input.timeoutMs,
			maxPayload: input.maxPayloadBytes,
			followRedirects: false,
			perMessageDeflate: false,
			rejectUnauthorized: true,
			...(input.origin ? { origin: input.origin } : {}),
		},
	};
}
