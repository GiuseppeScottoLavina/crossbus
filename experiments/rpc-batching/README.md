# Opt-in RPC batching research

This directory contains working prototypes, **not npm exports or changes to the default CrossBus API**. Both endpoints must install the same adapter. There is no automatic capability negotiation; an older endpoint cannot decode group packets.

From a checkout of this branch, with Node 18+:

```sh
node experiments/rpc-batching/demo.js
```

Expected output: `[5,9]`. The demo connects two real MessagePorts in one process; no server, bundler or remote service is required.

The proposed call is `requestGroup(bus, transport, peerId, operations)`, where each operation is `{name, payload, options?}`. It accepts 1–64 operations and returns a Promise for their ordered results. Each underlying request keeps its own timeout, pending-request limit, handler permissions, rate limit, validation hooks and transport-bound peer match. The helper rejects as Promise.all does; other operations can still run. **This is not a transaction or a rollback mechanism.**

## Two different experiments

- **BatchTransport** transparently groups a burst after one immediate leading send. Every queued message is structured-cloned immediately, preserving independent snapshots and graph isolation. Explicit transfer lists flush older queued work and send immediately. This extra clone work can outweigh the saved native sends.
- **GroupTransport** groups an explicit synchronous request operation without those individual pre-clones. Replies ready in the first microtask checkpoint may also share a packet; slow replies use ordinary sends. No slow member blocks a ready reply.

## Explicit group semantics

Inputs in an explicit group form **one structured-clone graph**, captured when its packet is sent synchronously. References shared between operation payloads remain shared remotely. This differs from separate calls, which clone their graphs independently.

Coalesced replies also share a graph. Replies produced later may be sent separately, so applications must not rely on inter-result object identity. Use this value-oriented operation for suitable independent payloads; it is not a transparent replacement for code depending on per-call graph isolation.

Asynchronous outbound hooks retain normal CrossBus timing, and may send after the synchronous group window has closed. In that case the sends are ordinary RPCs and batching gains need not occur. Inputs are not promised to be copied before such hooks complete. Future integration would need an explicitly designed asynchronous batch pipeline.

A failed native group clone closes the bound transport and cancels pending requests to that peer. It does not roll back handlers that already ran. Nested/reentrant sends, mixed errors and late replies have regression tests.

The underlying transport is the standard JSON MessageChannel transport. Automatic ownership transfer is tested with ArrayBuffer payloads; typed views themselves are not transferable list entries. The strict transparent adapter is evaluated with automatic transfer discovery disabled. No physical-device, native-WebView or network-transport qualification is claimed.

## Reproduce the study

Use the committed development dependencies, Node 24/Bun and Chrome. Run tests first; run only one timing command at a time.

```sh
npm ci --legacy-peer-deps
bun run test:experiments
bun run bench:batch
bun run bench:batch:bun
bun run bench:batch:browser
bun run bench:batch:workers
node experiments/rpc-batching/isolated.js --runtime node --profile guard
node experiments/rpc-batching/isolated.js --runtime chrome --worker --profile guard
node experiments/rpc-batching/isolated.js --runtime node --profile hooks
node experiments/rpc-batching/paired.js --runtime node
node experiments/rpc-batching/paired.js --runtime chrome --worker
node experiments/rpc-batching/lifecycle.js
bun run bench:batch:report
```

The report requires every runtime/guard/hook/paired configuration retained in the study; the checked-in report script lists the complete matrix. Native-send counting runs only after timed phases, to avoid rewarding reduced instrumentation overhead. Every echoed value/text and remote invocation count is checked. Competitor endpoints must receive exactly one logical argument.

Comparisons with birpc/Penpal are against individual RPC calls, not equivalent competitor bulk implementations. Applications can expose bulk methods with other libraries too. Neither these prototypes nor one workload establish a universal fastest library.
