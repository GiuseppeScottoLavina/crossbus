# CrossBus contributor and integration guide

CrossBus provides signals and request/response messaging between browser contexts. Use only APIs present in `src/index.js` and the package export map. Examples of agent orchestration are application patterns, not bundled AI framework integrations.

Always import only core at startup and dynamically load optional features:

```js
import { CrossBus } from 'crossbus';
const hub = CrossBus.createSecure({
  peerId: 'hub', isHub: true, allowedOrigins: ['https://widget.example.com']
});
const { PostMessageTransport } = await import('crossbus');
const { withSchemaValidation } = await import('crossbus/plugins/schema-validation');
```

Use `hub.handle(name, handler)` for RPC, `hub.request(peerId, name, data)` for a call and `hub.signal(name, data)` for one-way broadcasts. Local listeners receive an event envelope; remote signal data is at `event.data.payload`, and its peer ID at `event.data.source`. Use hierarchical signal names such as `task:progress` and `task:complete`.

`addTransport()` binds a transport to one known peer and returns a cleanup function. Window transports must use exact `targetOrigin` and `allowedOrigins`; the actual event origin is checked by the bus. Originless transports require an explicit application trust label in `addTransport(..., { peerId, origin })` and that label in the bus allowlist. `destroy()` closes attached transports and cancels requests. A manually supplied `handleMessage(message, origin, peerId)` must use an authenticated channel identity, never a peer ID taken from an untrusted payload.

The native JavaScript transport requires a native host. See `native/README.md` for Swift WKWebView and Java AndroidX adapters. A native build check is separate from runtime verification on iOS/Android.

Use `VectorClock` and `CausalOrderer` as explicit utilities; CrossBus does not automatically provide causal delivery. Presence and streaming likewise require their managers to be wired into the application's message handling. SharedWorker and ServiceWorker transports do not by themselves persist data or implement offline delivery.

For local events, choose `crossbus/nano` for a small API, `createFastEmitter()` for raw callbacks, or `EventEmitter` for event envelopes, wildcard matching, priorities and AbortSignal support. `emitSync()` has exact-name matching and raw payloads. `onFast()` listeners are for `emitSync()`; they are excluded from asynchronous `emit()`. Keep callback-array mutation semantics in mind: already selected listeners may still run during the current emission.

Run `bun run build` before package tests. Run `bun run test` for unit and packaged export checks, `bun run test:e2e` and `bun run test:integration` for Chrome integration. Do not replace assertions with unconditional success or accept error responses as proof that RPC succeeded. Tests that verify hook rejection must assert that protected handlers did not run.

Use `bun run bench`, `bun run bench:bun` and `bun run bench:browser` for repeated, correctness-checked benchmarks. Bundle sizes come from `node tests/benchmarks/sizes.js`. See `docs/BENCHMARKS.md` for methodology and evidence. Do not add throughput, size, coverage or superiority claims without a traceable measurement and scope. Local emitter throughput does not measure message serialization, transport latency or native performance. A dependency comparison must identify versions and equivalent semantics.

`createSecure()` rejects wildcard origins and enables strict mode. Limits apply to pending requests and estimated in-memory payload size. Validation hooks fail closed. The schema plugin implements a documented subset of JSON Schema, not a full standards-compliant validator. Peer IDs are authorization labels, not cryptographic identities. Handshake utilities negotiate connections but do not replace trusted channel binding, TLS or application authentication.
