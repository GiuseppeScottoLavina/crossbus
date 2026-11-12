# Architecture

`CrossBus` extends the local `EventEmitter` and coordinates a `MessageRouter`, `PendingRequests`, origin validation, RPC handlers and inbound/outbound hooks. A peer is an application-assigned identifier bound to a transport send function. `addTransport()` binds inbound messages to that peer and manages cleanup.

The router sends standard `_cb: 1` protocol messages directly for both unicast and broadcast, avoiding a nested per-peer envelope. Requests use `type: 'req'` with `{name, data, source, dest}` in `payload`. Responses use `type: 'res'` with `{requestId, success, data, error}` in `payload`. Compact `t` / `p` envelopes are accepted for compatibility. The caller of `handleMessage()` establishes the source identity; payload source fields are not authentication.

Requests allocate a timeout after outbound hooks succeed. Resolution, rejection and cancellation clean up timers. Responses must match both request ID and the peer to which the request was sent. Inbound hook failures prevent handler execution and return an error for RPC. Outbound hook failures stop sending. Configurable budgets bound pending requests and estimated payload size.

Window messages pass through both transport origin/source validation and the bus allowlist. Originless channels use an explicit trust label. The handshake module is a separate utility, and `addPeer()` does not enforce a handshake or cryptographic authentication. Signals are one-way; routing success means a transport accepted a message, not an end-to-end delivery acknowledgment.

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
