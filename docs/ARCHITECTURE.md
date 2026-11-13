# Architecture

`CrossBus` extends the local `EventEmitter` and coordinates a `MessageRouter`, `PendingRequests`, origin validation, RPC handlers and inbound/outbound hooks. A peer is an application-assigned identifier bound to a transport send function. `addTransport()` binds inbound messages to that peer and manages cleanup.

The router sends standard `_cb: 1` protocol messages directly for both unicast and broadcast, avoiding a nested per-peer envelope. Requests use `type: 'req'` with `{name, data, source, dest}` in `payload`. Responses use `type: 'res'` with `{requestId, success, data, error}` in `payload`. Compact `t` / `p` envelopes are accepted for compatibility. The caller of `handleMessage()` establishes the source identity; payload source fields are not authentication.

Requests allocate a timeout after outbound hooks succeed. Resolution, rejection and cancellation clean up timers. Responses must match both request ID and the peer to which the request was sent. Inbound hook failures prevent handler execution and return an error for RPC. Outbound hook failures stop sending. Configurable budgets bound pending requests and estimated payload size.

Window messages pass through both transport origin/source validation and the bus allowlist. MessageChannel/BroadcastChannel/SharedWorker/ServiceWorker supply fixed synthetic labels; other originless adapters need an explicit fallback binding label. See the transport origin table in the API guide. The handshake module is a separate utility, and `addPeer()` does not enforce a handshake or cryptographic authentication. Signals are one-way; routing success means a transport accepted a message, not an end-to-end delivery acknowledgment.

| Package entry | Implementation |
|---|---|
| `crossbus` | `src/index.js`; ESM, CommonJS and minified ESM artifacts |
| `crossbus/core` | `src/core/cross-bus.js` |
| `crossbus/nano` | `src/nano.js` |
| `crossbus/plugins/*` | Individually bundled optional plugins |
| `crossbus/enterprise` | Tracing, metrics, backpressure and versioning utilities |
| `crossbus/testing` | Mock transport utilities |

Optional plugins are loaded dynamically by consumers. TypeScript emits declarations from JavaScript/JSDoc. Rollup generates runtime artifacts; property names used by the public API or wire protocol must not be mangled. The package has no runtime npm dependencies. Its development dependencies are separate.

`EventEmitter.emit()` supplies event metadata, priority ordering and wildcard matching. `emitSync()` uses exact-name raw callbacks and a cache; `onFast()` registrations are only dispatched through this synchronous path. Nano and fast emitters provide synchronous raw callbacks. Their callback lists use snapshot semantics for removals during an emission; consumers should avoid mutating internal arrays.

Vector clocks and causal ordering are explicit utilities. Streaming, presence, retry, batching and backpressure need application wiring; merely importing them does not enable those behaviors. Shared and service workers require application worker scripts and do not imply durable persistence. Native adapters are described in [native/README.md](../native/README.md).

Performance and memory behavior must be measured for a specific workload/runtime. See [benchmarks](BENCHMARKS.md); no architecture choice alone establishes fastest throughput or absence of all leaks.

The 0.1.3 candidate handles completed inbound responses without building an additional asynchronous dispatch chain; public `handleMessage()` still returns a Promise. Handler/hook errors remain rejected Promises, and destruction during an asynchronous inbound hook stops subsequent dispatch.

MessageChannel compact mode is opt-in and requires a supporting receiver. It encodes only exact protocol-v1 signal/request/response shapes with empty metadata. Other shapes retain the object representation. Decoding precedes all bus validation and peer authorization. The standard wire format remains the default.

The unmerged experimental 13 November RPC follow-up sends already-built RPC envelopes through the current peer binding without constructing a general routing result. It checks the binding and connection status on each send, including after outbound hooks. Inbound processing snapshots the payload property once for normalization and settlement. The default MessageChannel send path preserves the original graph and explicit transfer list; optional codecs and automatic transfer discovery keep their general path. Canonical compact-field order has a linear check, with a complete set-check fallback. These changes preserve the public API and wire format; their throughput impact is recorded in the [follow-up study](RPC_FOLLOWUP.md).
