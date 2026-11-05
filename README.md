# Socket Trigger for n8n

A persistent WebSocket client that starts an n8n workflow for each received message. Supports credentials sent during the HTTP upgrade handshake, automatic reconnection, subscriptions, JSON, text and binary data.

![Socket Trigger WebSocket icons for light and dark themes](docs/icons-preview.png)

## Installation

This is an **unverified community node for self-hosted n8n**. npm publication does not make it available on n8n Cloud or imply n8n verification.

After the package is published, open **Settings → Community nodes → Install**, enter `n8n-nodes-socket-trigger`, and acknowledge the community-package notice. Restart n8n if the node is not immediately visible. Search for **Socket Trigger**.

To install the local package before publication, run `npm pack` in this project. In the n8n user's community-nodes directory (usually `~/.n8n/nodes`), run:

```sh
npm install /absolute/path/to/n8n-nodes-socket-trigger-0.1.0.tgz
```

Restart n8n. Docker installations must install the package inside the container or in the persistent community-nodes volume. Queue-mode deployments need the package available on every relevant n8n process.

Development requires **Node.js 22.16+** and npm. The compiled node is tested against `n8n-workflow` 2.16.0; a full n8n UI/deployment acceptance test must be performed in your target installation. This package does not claim compatibility with every version accepted by the standard `n8n-workflow: "*"` peer declaration.

## Quick start

1. Add **Socket Trigger** to a workflow.
2. Set **WebSocket URL** to a `ws://` or `wss://` endpoint.
3. Set **Authentication** to **Socket Trigger WebSocket API** and create a credential, or select **None**.
4. Select **Message Format** (`Auto` is the default).
5. Click **Execute step** to listen for a real event. Publish/activate the workflow to keep listening in production.

The listener opens an outbound connection from the n8n server. It does not create a WebSocket server or expose an inbound webhook URL. `localhost` refers to the n8n process or container.

## Authentication

Secrets belong in **Socket Trigger WebSocket API** credentials. n8n encrypts saved credential data. Regular node parameters, including URLs, headers, query parameters and initial messages, can be exported with workflows and must not contain secrets.

| Credential method                 | Handshake behavior                                                            |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Bearer Token                      | `Authorization: Bearer <secret>`                                              |
| Basic Auth                        | `Authorization: Basic <base64(username:password)>`                            |
| Custom Header                     | A configurable header name and secret value                                   |
| Query Parameter                   | A configurable parameter name and URL-encoded secret value                    |
| Subprotocol                       | A prefix and a secret sent as separate subprotocols; default prefix: `bearer` |
| Custom Headers / Query Parameters | Only the additional secret header/query objects                               |

Every method supports **Additional Secret Headers (JSON)** and **Additional Secret Query Parameters (JSON)**. Both accept JSON objects with string values:

```json
{ "X-Tenant-Key": "your-secret", "Cookie": "session=your-session-cookie" }
```

Non-secret headers and query parameters can also be set on the node. Repeated non-secret query names are allowed. Conflicting headers (case insensitive), conflicting secret query names and duplicate subprotocols fail validation. Reserved WebSocket handshake headers cannot be overridden; use **Origin** and **Subprotocols** instead.

`wss://user:password@host/events` is supported by extracting the userinfo into Basic Auth and removing it from the connection URL. Prefer the credential form so passwords are not stored in workflow parameters. Percent-encode reserved characters in URL userinfo. Basic Auth is sent preemptively; usernames cannot contain a colon.

Query authentication remains visible to the receiving server and may appear in its access logs. Use `wss://` in production. TLS certificate verification is always enabled and redirects are not followed.

### Credential connection test

Set **Test WebSocket URL** in the credential to enable its connection test. This field is independent of the trigger URL. The test performs the actual authenticated HTTP upgrade, then closes the socket. It does not verify event delivery, subscription permissions or messages exchanged after connection.

The test uses the credential's own additional secret fields. Node-level query parameters, Origin and subprotocol settings are not included; use **Execute step** when those are required.

### CodeChat / this project's WhatsApp API

```text
WebSocket URL: wss://your-api/v1/connections/YOUR_INSTANCE/events/ws
Authentication: Socket Trigger WebSocket API
Credential method: Bearer Token
Token / Secret: JWT belonging to YOUR_INSTANCE
Message Format: Auto or JSON
```

Alternatively, use **Subprotocol** with prefix `bearer` and the connection JWT as the secret. The API must echo `bearer` as its selected subprotocol. This API route does **not** accept token query parameters or Basic Auth; the node's other modes are for servers that support them.

The CodeChat event envelope is preserved:

```json
{
	"event": "messages.upsert",
	"instance": { "name": "YOUR_INSTANCE" },
	"payload": { "content": "..." }
}
```

Use `{{$json.event}}`, `{{$json.instance}}` and `{{$json.payload}}` downstream. Import `examples/codechat-bearer.workflow.json`, replace its URL and select your own credential.

## Message output

One WebSocket message produces one item in one workflow execution. A JSON array is kept in one item; it is not split into multiple executions.

| Incoming message             | Output                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| JSON object                  | The object itself in `item.json`                                       |
| JSON array, scalar or `null` | `{ "data": <parsed value> }`                                           |
| Text in Auto/Text mode       | `{ "data": "received text" }`                                          |
| Binary frame                 | `{ "messageType": "binary", "byteLength": N }` plus `item.binary.data` |

Binary content is stored using n8n's binary-data helper. **Binary Property** can change the field name. Conversion preserves receive order within a listener; workflow executions can run concurrently and finish in another order.

In JSON mode, malformed text creates a failed execution while keeping the listener healthy when n8n exposes `saveFailedExecution`. Older n8n versions without that API receive a fatal listener error instead. Select **Invalid JSON → Skip Message** to explicitly discard malformed text. Message content is excluded from diagnostic errors.

## Connection options

| Option                     | Default   | Purpose                                                  |
| -------------------------- | --------- | -------------------------------------------------------- |
| Handshake Timeout          | 15,000 ms | Bound the initial upgrade and reconnect handshakes       |
| Initial Messages           | `[]`      | Ordered subscription messages sent on every connection   |
| Reconnect                  | On        | Retry transient disconnections                           |
| Reconnect Delay            | 1,000 ms  | Initial exponential-backoff delay, with jitter           |
| Maximum Reconnect Delay    | 30,000 ms | Upper bound for local retry delays                       |
| Maximum Reconnect Attempts | `0`       | Unlimited local attempts; positive values bound retries  |
| Ping Interval              | 30,000 ms | Control-frame heartbeat; `0` disables client pings       |
| Pong Timeout               | 10,000 ms | Terminate an unresponsive connection                     |
| Maximum Message Size       | 16 MiB    | Maximum incoming message size; configurable up to 64 MiB |
| Maximum Pending Messages   | 1,000     | Bound messages waiting for conversion into output        |
| Subprotocols               | Empty     | Comma-separated non-secret protocol names                |
| Origin                     | Empty     | Optional Origin header                                   |

Example initial messages:

```json
[{ "action": "subscribe", "channel": "orders" }, "READY"]
```

Strings are sent as raw text; other JSON values are serialized. These fields are for subscriptions, not secrets. The node does not implement an HTTP login/token-refresh flow, post-open authentication acknowledgements, Socket.IO, GraphQL protocol state machines or application-specific JSON heartbeats. A negotiated subprotocol name alone does not implement that protocol.

Initial handshake failures fail activation. After a connection succeeds, transient failures reconnect locally. Retry counters reset only after a connection stays open for 30 seconds. Authentication/permission HTTP errors and protocol/policy failures stop local retries and report an error to n8n. n8n may independently retry workflow activation, so the local retry limit does not disable n8n's own recovery system.

Deactivation, cancellation and test-listener cleanup close the socket and cancel retry/heartbeat timers. Each trigger instance owns its connection; testing an active workflow can open another connection and receive duplicate events.

## Delivery limits

WebSockets do not provide durable delivery or replay by themselves. Reconnection cannot recover messages missed during an outage. This node provides no durable queue, exactly-once guarantee or deduplication. Use upstream event IDs, replay/cursors or a durable broker when required. A full conversion queue stops the listener and reports overflow; downstream n8n concurrency is controlled separately by n8n.

The transport uses direct Node.js sockets rather than n8n's HTTP helpers. Apply your deployment's network/egress policy at the host/container/firewall level. HTTP proxy environment variables are not automatically supported.

## Development and publishing

```sh
npm ci --ignore-scripts
npm run check
npm run format:check
npm pack --dry-run
npm pack
```

`npm run build` uses the official `n8n-node` compiler and bundles `ws` into the transport with esbuild. No runtime dependency is declared; n8n supplies the `n8n-workflow` peer. `dist` includes both SVG icons, codex metadata, source maps and the bundled library's MIT license. Node built-ins and optional `ws` native accelerators remain external; native accelerators are not required.

`npm run dev` uses the official n8n development CLI. See its output for local n8n/container requirements. The test suite uses real local WebSocket servers and a mocked n8n execution context; it does not connect to your production API.

See [Publishing](docs/PUBLISHING.md) for npm authentication, first publication and GitHub Actions provenance. See [Architecture](docs/ARCHITECTURE.md) for maintenance notes and [Changelog](CHANGELOG.md) for release history.

## License

MIT. The bundled `ws` library is also MIT licensed; its license is included in `dist/nodes/SocketTrigger/transport/ws-LICENSE`.
