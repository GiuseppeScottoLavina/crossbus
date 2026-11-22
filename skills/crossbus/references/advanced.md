# Advanced CrossBus recipes

Use the section that matches the feature you need. The linked library guides are pinned to CrossBus 0.1.8. For offline use, the same paths are available in the installed package.

## Forward a request through a hub

Suppose an editor and a worker each have a dedicated connection to the hub. The editor can reach the hub. The hub can reach the worker. Register a specific handler on the hub and fix the destination in that handler.

```js
hub.handle('report:preview', payload => hub.request('worker', 'report:preview', payload), {
  allowedPeers: ['editor'],
  validatePayload: payload => typeof payload?.text === 'string'
});
const preview = await editor.request('hub', 'report:preview', { text: 'Draft' });
```

The worker authorizes its immediate caller, `hub`. The hub authorizes `editor` before forwarding. `isHub` describes the role. The application owns forwarding policy and any calls to models or tools.

For progress updates, the hub sees `worker` in `event.data.source`. If the hub forwards a signal, the editor sees `hub` as its source. For a job private to one editor, record the editor's bound `ctx.peerId` when accepting the job. Accept updates from the assigned worker and route them only to that editor. For example, register a `report:progress` handler on the editor restricted to `hub`, then call `hub.request(editorId, 'report:progress', update)`. [Integration patterns](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/ADVANCED.md)

## Send a bounded stream

1. Create `new StreamManager(sendFrame)` on each endpoint. Route `sendFrame(peerId, frame)` over the connection for that peer. Pass incoming frames to `manager.handleMessage(frame, boundPeerId)`. Authorize access at the point where frames enter the manager.
2. Give a raw stream its own port pair. `addTransport()` owns the receive callback on its port. To share an existing bus connection, carry frames through a named RPC handler with `allowedPeers` and pass its `ctx.peerId` to the manager. The linked guide includes both wiring patterns.
3. Register `manager.onStream(name, handler)` on the receiver before opening the writer. Consume chunks as they arrive with `for await (const chunk of stream)`. Use `collect()` only if the assembled result fits in memory.
4. Open the writer with `manager.createStream(name, peerId, options)`. For a slow consumer, set `flowControl: true` and finite `ackTimeout` and `timeout` values. Await `writer.write(data)` and `writer.end()`. In flow mode, completion acknowledges that the receiver pulled the chunks. Return a separate application receipt if durable storage matters.
5. Use `binaryEncoding: 'native'` on compatible structured-clone transports and `'base64'` on JSON bridges. Destroy each manager on teardown. When the bus owns its lifetime, use `bus.addCleanup(() => manager.destroy())` and call `manager.closePeer(peerId)` when that peer disconnects.

The runnable example checks every byte received and that the sender still owns its original buffer. [MessageChannel stream example](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/examples/quickstart/stream.mjs) · [Flow control, budgets and shared-bus wiring](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/STREAMING.md)

## Add a plugin

Load the named export from its package subpath, for example `const { withRetry } = await import('crossbus/plugins/retry')`. Substitute the module from the table after `crossbus/plugins/`.

| Requirement | Module | Integration |
| --- | --- | --- |
| Validate a handler payload | `schema-validation` | Register `bus.handle(name, withSchemaValidation(schema, handler), { allowedPeers })`. The plugin enforces a documented JSON Schema subset. Implement any additional required constraints explicitly. |
| Retry a transient failure | `retry` | Use `withRetry(() => bus.request(peerId, name, data), { maxAttempts: 3 })` for operations safe to repeat. For writes that must take effect once, reuse a stable operation ID. Have the receiver atomically store the mutation and its result so a duplicate can return that result. |
| Stop calling a repeatedly failing peer | `circuit-breaker` | Create `const guarded = createPeerCircuitBreaker(bus, peerId)`, then call `guarded.request(name, data)`. |
| Limit call frequency | `rate-limiter` | `withRateLimiter(bus, options)` limits outbound traffic. For incoming RPC, set the handler's numeric `rateLimit` option in calls per second per peer. |
| Batch frequent signals | `batch` | Enable `withBatching(bus)` on the sender and receiver. Signals with explicit routing options go out immediately. RPC uses its usual request path. |
| Compress payloads | `compression` | Configure `withCompression(bus, options)` on both endpoints. Set the receiver's `maxDecompressedBytes` for the expected size. |
| Encrypt payloads | `encryption` | Provision the same key to the two trusted endpoints. Install `withEncryption(bus, key)` on both before traffic starts. The application owns authentication and key distribution. [Encryption setup](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/SECURITY.md#encryption-plugin) |

An observing hook returns the payload. A validating hook throws to stop processing. For isolated tests, import `createConnectedMocks` from `crossbus/testing`. For tracing, metrics or backpressure, import the required utilities from `crossbus/enterprise` and connect them to the operations being measured or limited. [Plugin and utility API](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/API.md#optional-plugins-and-utilities)

## Track presence and causal order

- **Presence.** Call `createPresence(bus)` on each participating bus to wire heartbeats, incoming signals and cleanup. On a one-to-one link with 0.1.8 at both ends, setting `goodbye: true` on both transport bindings also lets a deliberate disconnect cancel pending calls promptly. Leave that option off on shared channels. [Connection lifecycle](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/API.md#connections-and-lifecycle)
- **Causal order.** Create `const orderer = new CausalOrderer(bus.peerId, { onDeliver })` on each endpoint. Include `clock: orderer.tick().toJSON()` in the outgoing payload. On receipt, call `orderer.receive(event.data.source, event.data.payload)`. Apply the change in `onDeliver` so the orderer can buffer it until its dependencies arrive. Use `VectorClock` directly when the application handles ordering itself.

## Select an emitter or wire format

| Workload | Choice |
| --- | --- |
| Local events with raw callbacks | Use `createNanoEmitter()` from `crossbus/nano` for the small standalone API or `createFastEmitter()` from `crossbus`. |
| Local envelopes, wildcard subscriptions, priorities or cancellation | Use `EventEmitter` and `emit()`. For exact-name synchronous raw callbacks on that emitter, pair `onFast()` with `emitSync()`. |
| Custom transport with a core-only import | Import `CrossBus` from `crossbus/core`. The root `crossbus` entry also exports the built-in transports. |
| MessageChannel RPC | Start with the default `standard` encoding. Select `wireFormat: 'compact'` only with 0.1.3+ receivers and `'compact-v2'` with 0.1.6+ receivers. Configure each sending endpoint explicitly. There is no wire-format negotiation. |

Measure the real payload, concurrency, runtime and transport before changing encoding. Local emitter benchmarks measure callback dispatch. To evaluate worker performance, include the round trip across the worker boundary. [Wire-format measurements](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/RPC_WIRE_V2.md)
