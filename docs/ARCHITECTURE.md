# Architecture

- `credentials/SocketTriggerWebSocketApi.credentials.ts` defines encrypted authentication fields and the optional credential-test endpoint.
- `nodes/SocketTrigger/SocketTrigger.node.ts` adapts the transport to the n8n trigger lifecycle, binary-data helpers and error reporting.
- `properties.ts` defines the node UI; the SVG pair is selected using n8n's themed icon property.
- `transport/handshake.ts` validates configuration and builds URL, headers and protocols. It prevents header injection, auth collisions and reserved-header overrides.
- `transport/session.ts` owns one connection, handshake outcomes, subscriptions, heartbeat, retry budgets and cancellation. It never returns raw library errors or server close reasons to the UI.
- `transport/messages.ts` converts protocol messages while preserving JSON objects and binary bytes.
- `transport/credentialTest.ts` tests an actual authenticated upgrade and always closes its socket.
- `scripts/bundle.mjs` incorporates the `ws` implementation into the CommonJS transport; the host-provided `n8n-workflow` import stays external.
- `scripts/verify-package.mjs` verifies runtime exports, metadata, assets, licenses and documentation after build.

Transport helpers intentionally use framework-independent errors. The trigger converts activation/fatal errors into `NodeOperationError`. The ESLint exception for that error rule is scoped to transport helpers; the official rules remain enabled at the n8n boundary. The project uses the official non-Cloud ESLint configuration.

The incoming-message conversion queue is bounded by message count, not total bytes. The upper bound on an individual message is configurable. Choose both limits for available memory; they do not bound workflow execution concurrency. A queue overflow reports a fatal error, closes the socket and suppresses further emits.

The node does not maintain durable state or a cursor. Credential reads occur for every connection attempt, but this does not implement token refresh or guarantee that a running n8n instance observes a credential edit without reactivation.

## Test coverage

Install development dependencies and build with Node 24 (see `.nvmrc`). The toolchain pulls in `isolated-vm` 7, which rejects Node 22 during an engine-strict install. CI switches to Node 22 or 24 only after the build to validate the compiled trigger runtime without executing the development toolchain on Node 22.

Tests use Node's test runner with loopback HTTP upgrade/WebSocket servers. They cover all five primary authentication transports, URL encoding/userinfo, conflicting headers, diagnostic redaction, JSON/text/binary mapping, subscription replay, permanent and transient errors, heartbeat timeout, retry exhaustion, timer cleanup, the actual n8n trigger adapter and credential connection tests. No production credentials or services are used.

The development toolchain can contain transitive audit findings from n8n's CLI/workflow packages. Runtime packaging excludes development dependencies. Because `ws` is bundled, inspect its entry in the **full** npm audit as well as running `npm audit --omit=dev`; a production-only audit cannot inspect code already embedded in a bundle. Keep the lockfile and bundled dependency current.
