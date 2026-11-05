import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { properties } from './properties';
import { buildHandshake, type NameValue } from './transport/handshake';
import { testConnection } from './transport/credentialTest';
import { decodeMessage, parseInitialMessages, type MessageFormat } from './transport/messages';
import { WebSocketSession, safeConnectionError } from './transport/session';

export class SocketTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Socket Trigger',
		name: 'socketTrigger',
		subtitle: '={{$parameter["messageFormat"] + " messages"}}',
		icon: { light: 'file:socket-trigger.light.svg', dark: 'file:socket-trigger.dark.svg' },
		group: ['trigger'],
		version: 1,
		description:
			'Start a workflow for each WebSocket message with configurable handshake authentication',
		defaults: { name: 'Socket Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'socketTriggerWebSocketApi',
				required: true,
				testedBy: 'socketTriggerConnectionTest',
				displayOptions: { show: { authentication: ['credential'] } },
			},
		],
		properties,
	};
	methods = { credentialTest: { socketTriggerConnectionTest: testConnection } };

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const endpoint = this.getNodeParameter('url') as string;
		const authentication = this.getNodeParameter('authentication') as string;
		const format = this.getNodeParameter('messageFormat') as MessageFormat;
		const headers = this.getNodeParameter('headers') as { parameters?: NameValue[] };
		const query = this.getNodeParameter('queryParameters') as { parameters?: NameValue[] };
		const options = this.getNodeParameter('options') as IDataObject;
		const nodeError = (message: string) => new NodeOperationError(this.getNode(), message);
		const numberOption = (key: string, fallback: number, min: number, max: number) => {
			const value = options[key] ?? fallback;
			if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
				throw nodeError(`Option "${key}" must be an integer from ${min} to ${max}.`);
			}
			return value;
		};
		if (
			!['auto', 'json', 'text'].includes(format) ||
			!['none', 'credential'].includes(authentication)
		) {
			throw nodeError('Select a supported authentication method and message format.');
		}
		const reconnectDelay = numberOption('reconnectDelay', 1000, 100, 300000);
		const maxReconnectDelay = numberOption('maxReconnectDelay', 30000, 100, 300000);
		if (maxReconnectDelay < reconnectDelay)
			throw nodeError('Maximum reconnect delay must be at least the initial reconnect delay.');
		const maxPending = numberOption('maxPendingMessages', 1000, 1, 10000);
		const timeoutMs = numberOption('handshakeTimeout', 15000, 1000, 120000);
		const maxPayloadBytes = numberOption('maxMessageSize', 16, 1, 64) * 1024 * 1024;
		const binaryProperty = String(options.binaryProperty ?? 'data');
		if (!binaryProperty || ['__proto__', 'constructor', 'prototype'].includes(binaryProperty)) {
			throw nodeError('Enter a valid binary property name.');
		}
		let initialMessages: string[];
		try {
			initialMessages = parseInitialMessages(String(options.initialMessages ?? '[]'));
		} catch {
			throw nodeError('Initial messages must be a valid JSON array.');
		}
		const protocols = String(options.subprotocols ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		let closed = false;
		let pending = 0;
		let queue = Promise.resolve();
		const failListener = (message: string) => {
			if (closed) return;
			closed = true;
			void session.stop();
			this.emitError(nodeError(message));
		};
		const session = new WebSocketSession({
			getHandshake: async () => {
				let credentials: Record<string, unknown> | undefined;
				if (authentication === 'credential') {
					try {
						credentials = await this.getCredentials<Record<string, unknown>>(
							'socketTriggerWebSocketApi',
						);
					} catch {
						throw nodeError('Unable to read the selected Socket Trigger WebSocket credential.');
					}
				}
				return buildHandshake({
					endpoint,
					headers: headers.parameters ?? [],
					query: query.parameters ?? [],
					protocols,
					credentials,
					timeoutMs,
					maxPayloadBytes,
					origin: String(options.origin ?? ''),
				});
			},
			initialMessages,
			reconnect: options.reconnect !== false,
			reconnectDelayMs: reconnectDelay,
			maxReconnectDelayMs: maxReconnectDelay,
			maxReconnectAttempts: numberOption('maxReconnectAttempts', 0, 0, 10000),
			pingIntervalMs: numberOption('pingInterval', 30000, 0, 300000),
			pongTimeoutMs: numberOption('pongTimeout', 10000, 100, 120000),
			onFatalError: (error) => failListener(error.message),
			onMessage: (data, isBinary) => {
				if (closed) return;
				if (pending >= maxPending) {
					failListener(
						'WebSocket pending message limit reached. Reduce event volume or increase the configured limit.',
					);
					return;
				}
				pending += 1;
				queue = queue
					.then(async () => {
						if (closed) return;
						let decoded;
						try {
							decoded = decodeMessage(data, isBinary, format);
						} catch {
							if (options.invalidJson !== 'skip') {
								const message = 'Received a text message that is not valid JSON.';
								if (typeof this.saveFailedExecution === 'function')
									this.saveFailedExecution(nodeError(message));
								else failListener(message);
							}
							return;
						}
						const item: INodeExecutionData = { json: decoded.json as IDataObject };
						if (decoded.binary) {
							item.binary = {
								[binaryProperty]: await this.helpers.prepareBinaryData(
									decoded.binary,
									'message.bin',
									'application/octet-stream',
								),
							};
						}
						if (!closed) this.emit([[item]]);
					})
					.catch(() => {
						failListener('Failed to prepare or emit a WebSocket message.');
					})
					.finally(() => {
						pending -= 1;
					});
			},
		});
		try {
			await session.start();
		} catch (error) {
			closed = true;
			throw nodeError(safeConnectionError(error).message);
		}
		return {
			closeFunction: async () => {
				closed = true;
				await session.stop();
				await queue;
			},
		};
	}
}
