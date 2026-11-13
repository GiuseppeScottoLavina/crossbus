# CrossBus API

This reference describes the implemented JavaScript API. Generated declarations in `dist/` accompany every package export. Build with `bun run build`; verify consumer imports with `bun run test:types`.

## CrossBus

```js
import { CrossBus } from 'crossbus';
const bus = CrossBus.createSecure({ peerId: 'app', allowedOrigins: ['https://trusted.example'] });
```

| Constructor option | Default | Meaning |
|---|---|---|
| `peerId` | Generated UUID | Local peer identity label |
| `isHub` | `false` | Orchestrator role for introspection |
| `allowedOrigins` | `[]` | Empty means same-origin; `'*'` is rejected in strict mode |
| `meta` | `{}` | Local metadata |
| `capabilities` | `[]` | Capability tokens for explicit negotiation |
| `requestTimeout` | `30000` | Default RPC timeout, milliseconds |
| `handshakeTimeout` | `10000` | Standalone handshake utility timeout |
| `contentType` | `'application/json'` | Serializer capability label; configure transports separately |
| `maxPendingRequests` | `100` | Maximum simultaneous pending requests; zero disables the limit |
| `maxPayloadSize` | `1048576` | Conservative in-memory payload estimate; zero disables the limit |
| `strictMode` | `false` | Rejects wildcard origin patterns |
| `debug` | `false` | Development logging |
| `debugPrefix` | `'[CrossBus]'` | Log prefix |

`createSecure(options)` requires a nonempty allowlist, rejects wildcard patterns and enables strict mode. It accepts the same resource limits. Payload accounting uses two bytes per UTF-16 code unit, the complete backing storage of binary views, binary byte lengths and per-value/reference overhead; it is not an exact serialized wire size. Limits must be nonnegative safe integers.

### Connections and lifecycle

| API | Behavior |
|---|---|
| `addPeer(peerId, sendFn, options?)` | Registers a known channel's send function; options include `origin` and `meta` |
| `removePeer(peerId)` | Removes routing and cancels pending requests for that peer; returns boolean |
| `addTransport(transport, {peerId, origin}?)` | Wires `send`/`onMessage`; returns an idempotent cleanup function that destroys the transport |
| `addCleanup(fn)` | Registers synchronous resource cleanup on bus destruction; returns an unregister function |
| `handleMessage(message, origin, peerId, replyFn?)` | Receives a message from an application-authenticated channel; returns a Promise |
| `destroy()` | Cancels requests, executes registered cleanup, destroys attached transports, and clears handlers/listeners/hooks |
| `peerId`, `isHub`, `peerCount`, `peers`, `isDestroyed` | Introspection properties; `peers` is an array of peer IDs |
| `getPeer(peerId)` | Routing metadata or `undefined` |
| `healthCheck()`, `diagnose()` | Local status and configuration diagnostics |

`addPeer()` does not perform a handshake. `isHub` does not automatically forward requests between arbitrary peers. An application must bind source identities to channels and implement authorized forwarding. Window transport events supply their actual origin; MessageChannel/BroadcastChannel/SharedWorker/ServiceWorker supply the fixed origin labels listed below. The `origin` binding option is a fallback only when a transport supplies no origin. `removePeer()` alone does not close a manually owned transport; use the cleanup returned by `addTransport()`.

### Messaging

```js
const result = await bus.request('worker', 'compute', { a: 2, b: 3 }, { timeout: 5000 });
const route = await bus.signal('task:progress', { completed: 2 });
const replies = await bus.broadcastRequest('status', {}, { timeout: 1000, exclude: ['slow'] });
```

`request(peerId, handlerName, payload?, {timeout}?)` returns the remote handler result. Failures include missing peers, failed sends, timeouts and remote handler/security errors. Responses must match the request ID and the requested peer.

`signal(name, payload?, {exclude}?)` broadcasts to registered peers, returning `{success, delivered, failed}`. This counts transport sends, not receiver acknowledgments. `broadcastRequest(handlerName, payload?, {timeout, exclude, ignoreErrors}?)` returns a Map of peer IDs to `{success:true,data}` or `{success:false,error}`. `ignoreErrors` defaults to true.

`emit()` is local event dispatch. Use `signal()` for remote one-way messages and `request()` for RPC. Manage connections with `addTransport()` and its returned cleanup function.

### RPC handlers

```js
const unhandle = bus.handle('save', async (payload, context) => ({ saved: payload.id }), {
  allowedPeers: ['editor'], rateLimit: 10,
  validatePayload: payload => payload && typeof payload.id === 'string'
});
```

`context` includes `peerId`, `requestId` and `handlerName`. A handler returns a value or Promise. `allowedPeers` limits callers by their channel-bound peer IDs. `rateLimit` is a local fixed window of calls per second per peer. `validatePayload` is a synchronous predicate. `unhandle(name)` removes a handler and its security state; `hasHandler(name)` checks registration. `handle()` returns an unregister function.

### Hooks

`addInboundHook(fn, priority=10)` and `addOutboundHook(fn, priority=10)` return unregister functions. Lower priority numbers run first. Hooks receive `(payload, context)` and return the transformed payload or a Promise. Context contains `type` (`signal`, `request`, `response`), `peerId`, `handlerName` and `direction`. Removal by function is available through `removeInboundHook()` and `removeOutboundHook()`.

Throwing/rejecting stops processing. Failed inbound RPC validation produces an error response without invoking the protected handler. A hook must return the payload unchanged when it only observes it. Hook work and payload accounting are part of the full messaging path.

## Local events

`EventEmitter` is exported directly and inherited by CrossBus.

| API | Behavior |
|---|---|
| `on(name, callback, options?)` | Subscription with `unsubscribe()` and `active`; supports `once`, `signal`, `priority`, `mode` |
| `once(name, callback, options?)` | Removes the listener before its first callback |
| `off(name, callback?)` | Removes specified/all callbacks and returns removal counts |
| `emit(name, data, source?)` | Local event envelope dispatch; returns Promise of listener count |
| `emitSync(name, data)` | Synchronous raw payload, exact name only; returns callback count |
| `onFast(name, callback)` | Raw callback registration for `emitSync()` only; returns unbind function |
| `offFast(name, callback)` | Removes matching callback registrations |
| `clear()` | Removes all listeners and AbortSignal registrations |
| `listenerCount(name)`, `hasListeners(name)`, `getSignalNames()` | Listener introspection |
| `setMaxListeners(n)`, `getMaxListeners()` | Warning threshold; zero disables warnings |

`emit()` supplies `{name, data, messageId, timestamp, source}`. Modes are `'sync'` (awaited) and `'async'` (scheduled; default). Priority is descending. Patterns include exact names, `'*'` and `'namespace:*'`. `emitSync()` omits envelopes, wildcard matching and scheduling; callback exceptions propagate. Already selected listeners may still run if another listener removes them during dispatch.

A remote signal becomes `event.data = {payload: remoteData, source: peerId}`, with the received origin in `event.source.origin`. For local `emit()`, `event.data` is exactly its argument.

`createFastEmitter()` from `crossbus` and `createNanoEmitter()` from `crossbus/nano` provide `on(name, fn)`, `emit(name, rawPayload)` and `off(name?)`; `on()` returns an unbind function. They have no event envelopes, RPC, priority, once or wildcard semantics.

## Transports

Transport classes are exported by `crossbus`. A dynamic import of that same root reuses the root module; it is not a separately bundled transport entry. `crossbus/core` supplies a core-only entry, and optional plugin subpaths are independent modules. Common operations are `send(message)`, `onMessage(callback)`, `offMessage()` and `destroy()`. A protocol envelope needs `_cb:1`, a string `id` and a message type (`type` or `t`). Availability and setup differ by transport.

| Transport | Configuration / lifecycle |
|---|---|
| `PostMessageTransport(target, options)` | Configure `targetOrigin`, `allowedOrigins`, optional `autoTransfer`/`contentType`; `send(message, transfer?)` supports transfer lists |
| `MessageChannelTransport(options?)` | Creates a channel; pass `remotePort` to the other endpoint; wrap with `MessageChannelTransport.fromPort(port)` |
| `BroadcastChannelTransport(name)` | Same-origin channel; suitable for one-way group signals; the transport binding labels the channel, not individual tab identities |
| `SharedWorkerTransport({workerUrl,name}?)` | Requires an application SharedWorker script |
| `ServiceWorkerTransport(options?)` | Requires an application service worker; await `ready` |
| `WebSocketTransport(options)` | Requires a compatible backend; call `connect()` to establish the connection and drain queued sends; configure reconnection/heartbeat in this transport |
| `NativeBridgeTransport(options?)` | Await `ready`; requires a native host adapter; [native API and failure behavior](../native/README.md) |

Worker transports do not implement durable persistence, an offline queue or guaranteed background delivery. Transfer-list ownership is an application decision; an ArrayBuffer is detached after transfer. Native transports use JSON and do not support browser transferables.

### Buffer ownership and serializer fallback (since 0.1.4)

`autoTransfer` defaults to `false`. When enabled on MessageChannel or PostMessage, discovery now follows typed arrays and DataViews to their actual same-realm ArrayBuffer. It moves the **whole backing allocation**, including bytes outside a subview, and detaches every sender alias. Use an explicit copy if the receiver must see only a slice or the sender must retain ownership. Node Buffers are excluded from automatic view-buffer discovery because their storage may belong to a slab; SharedArrayBuffer is shared, not transferred. Explicit transfer lists remain the caller's responsibility. Discovery handles cycles and avoids recursive JavaScript calls; the browser's own clone-depth limits still apply.

The default `contentType: 'application/json'` uses native structured clone for these transports, despite the label. A non-default label selects the existing serializer fallback, which currently falls back to JSON. This mode requires 0.1.4 receivers to decode incoming strings and supports only JSON-compatible data: it does not preserve cycles, Maps or typed-array storage. Nonempty explicit transfer lists throw `TypeError` before detachment; automatic transfer discovery is disabled for this mode. Malformed strings are ignored. Window origin/source checks apply before decoding, and decoded protocol messages still pass bus limits, hooks and authorization. There is no automatic encoding negotiation.

## Optional plugins and utilities

Use dynamic imports from the package subpaths:

| Entry | Exports / scope |
|---|---|
| `crossbus/plugins/retry` | `withRetry(fn, options)`, `createRetryWrapper(bus, options)`; `maxAttempts`, not `maxRetries` |
| `crossbus/plugins/circuit-breaker` | `CircuitBreaker`, `createPeerCircuitBreaker` |
| `crossbus/plugins/schema-validation` | `createValidator`, `withSchemaValidation(schema, handler)`, `createValidationHook` |
| `crossbus/plugins/encryption` | `Encryption`, `withEncryption(bus, key)`; application-owned key distribution |
| `crossbus/plugins/rate-limiter` | `RateLimiter`, `withRateLimiter` |
| `crossbus/plugins/compression` | `Compression`, `withCompression` |
| `crossbus/plugins/batch` | `MessageBatcher`, `createBatcher`, `withBatching`; enable receiving-side unbatching too |
| `crossbus/enterprise` | Tracing, metrics, backpressure and message versioning; explicitly wire to application operations |
| `crossbus/testing` | `MockTransport`, `createConnectedMocks` |

The schema validator supports `type`, `properties`, `required`, `items`, `enum`, numeric minimum/maximum, string length/pattern and array length. It is not a complete JSON Schema implementation; unsupported keywords are not enforcement controls.

`withBatching()` preserves Promise results for signals and applies inbound hooks per logical message. Signals with per-call routing options are sent immediately. Queued operations are cancelled when the bus is destroyed. `createPresence(bus, options)` wires presence signals and registers lifecycle cleanup; `PresenceManager` is also available for manual wiring.

The exported low-level `PendingRequests` tracker accepts `resolve(requestId, response, targetPeer?)`. When the optional third argument is supplied, a mismatched target returns `false` without settling or removing the request. Omitting it preserves the original tracker behavior. CrossBus always supplies the transport-bound peer; applications using the tracker directly must establish that identity themselves.

`StreamManager` takes a `(peerId,message) => Promise` send function; route incoming stream envelopes explicitly to `handleMessage(message, peerId)` with the transport-bound source identity. Open streams are bound to that peer and duplicate IDs are ignored. Call `manager.destroy()` during teardown to release handlers and reject waiting readers. `chunkSize` must be a positive safe integer: it limits raw bytes per binary chunk or UTF-16 code units per string chunk. Each binary chunk is encoded independently, including empty binary values. Objects are serialized as a single JSON string. These utilities do not add stream deadlines, backpressure or out-of-order reassembly. `VectorClock` and `CausalOrderer` are explicit utilities for clock-stamped messages. They do not change default CrossBus routing automatically.

Refer to [architecture](ARCHITECTURE.md), [integration patterns](ADVANCED.md), [security](../SECURITY.md), [native adapters](../native/README.md) and [benchmarks](BENCHMARKS.md) for boundaries and verification.

## Compact MessageChannel encoding

`new MessageChannelTransport({ wireFormat: 'compact' })` and `MessageChannelTransport.fromPort(port, { wireFormat: 'compact' })` select a versioned array encoding for ordinary signals and RPC. `transport.wireFormat` reports the outgoing format. Both receivers must support compact packets (CrossBus 0.1.3+); there is no automatic capability negotiation. The default is `'standard'`, including communication with 0.1.2.

The receiver reconstructs the same protocol-v1 envelope before applying payload limits, validation hooks, handler permissions and response-peer matching. Transfer lists retain their ownership behavior. Messages with extension fields, custom metadata or other protocol shapes use the standard object encoding. Compact mode requires the default content type. The application data graph is structured-cloned, including cycles. Compact mode reconstructs wrapper objects; raw transport code that depends on reference identity between application data and envelope/payload-wrapper objects should use standard mode. This option reduces serialization work; it does not remove security checks or guarantee a speedup for every payload/runtime. See [the competitor study](COMPETITOR_ANALYSIS.md).

## Transport origin labels

| Transport | Origin passed to the bus |
|---|---|
| MessageChannel | `channel` |
| BroadcastChannel | `broadcast` |
| SharedWorker | `sharedworker` |
| ServiceWorker | `serviceworker` |
| PostMessage window | Actual event origin, with source checks in the transport |
| NativeBridge / WebSocket | Explicit fallback from `addTransport(..., {peerId, origin})` |

Put the matching label in the bus allowlist. Synthetic labels describe an application-bound channel, not network-origin authentication. PostMessage worker events may have an empty origin; supply an explicit fallback label for that binding.

### WebSocket connection and queue lifecycle (since 0.1.3)

`protocols` accepts a subprotocol string or array and is passed to the WebSocket constructor. Concurrent `connect()` calls share one attempt. An error, a close before opening, explicit disconnect or destruction settles that attempt; `destroy()` prevents reconnection and later sends.

`send()` JSON-serializes a snapshot immediately. Before connection it returns `false` and queues the snapshot; `connect()` drains that queue. `maxQueueSize` defaults to 1,000 messages, must be a nonnegative safe integer and can be set to zero to disable the count cap. A full queue throws rather than dropping another message. `offMessage()` removes the inbound observer. This transport requires a JSON-compatible application backend; an accepted send is not a delivery acknowledgment.
