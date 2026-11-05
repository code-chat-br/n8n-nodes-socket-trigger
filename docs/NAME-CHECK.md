# Package name check

Checked directly against the public npm registry on 2026-11-05.

| Candidate                  | Registry result                    | Decision    |
| -------------------------- | ---------------------------------- | ----------- |
| `n8n-nodes-websocket`      | Registered, latest version `1.0.1` | Do not use  |
| `n8n-nodes-wss`            | HTTP 404, no package returned      | Alternative |
| `n8n-nodes-socket-trigger` | HTTP 404, no package returned      | Selected    |

The check also searched the npm community-node catalog for WebSocket-related packages and inspected the published n8n node/credential manifests of `n8n-nodes-websocket`, `n8n-nodes-websocket-standalone`, `n8n-nodes-websocket-ws`, `n8n-nodes-websockets-trigger`, `n8n-nodes-websocket-ws-prueba`, `n8n-nodes-websocket-ws-jojo`, `n8n-nodes-websocket-ws-reconnect`, and `n8n-nodes-websocket-cookie-trigger`. The official `n8n-nodes-base` package, version `2.15.1`, had no WebSocket/WSS/SocketTrigger node or credential manifest entry.

This package uses:

- npm package: `n8n-nodes-socket-trigger`
- n8n node type: `n8n-nodes-socket-trigger.socketTrigger`
- node display name: **Socket Trigger**
- credential type: `socketTriggerWebSocketApi`
- credential display name: **Socket Trigger WebSocket API**

The fully qualified node type distinguishes this package from similarly named community nodes. The credential identifier is specific to this package rather than a generic `websocketApi`; no matching credential manifest was found among the packages examined. Existing WebSocket packages can provide overlapping functionality without having the same package or node identifier.

A 404 is an availability observation, not a reservation or a guarantee that npm will accept a publication. Registry state and publishing policy can change. `npm publish --dry-run` validates the local package; it does not reserve the name or confirm final registry acceptance. Recheck immediately before publishing.

Sources:

- [Registered WebSocket package metadata](https://registry.npmjs.org/n8n-nodes-websocket/latest)
- [WSS name lookup](https://registry.npmjs.org/n8n-nodes-wss)
- [Selected name lookup](https://registry.npmjs.org/n8n-nodes-socket-trigger)
- [Official n8n nodes manifest](https://registry.npmjs.org/n8n-nodes-base/latest)
