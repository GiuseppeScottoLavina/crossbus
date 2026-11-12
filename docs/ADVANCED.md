# Integration patterns

A CrossBus peer is a known transport binding. `isHub: true` does not turn a connected widget into a router for every other widget. Implement forwarding as an explicitly authorized RPC handler:

```js
// The hub has separately bound 'editor' and 'worker' transports.
hub.handle('compute', payload => hub.request('worker', 'compute', payload), {
  allowedPeers: ['editor'],
  validatePayload: payload => Array.isArray(payload?.numbers)
});
// The editor calls its connected hub, not an unknown worker peer.
const result = await editor.request('hub', 'compute', { numbers: [1, 2, 3] });
```

For a one-way same-origin tab channel, use a common channel binding and include application sender IDs in the payload when needed. That ID is a label, not authenticated per-tab identity:

```js
import { CrossBus } from 'crossbus';
const { BroadcastChannelTransport } = await import('crossbus');
const bus = new CrossBus({ peerId: crypto.randomUUID(), allowedOrigins: ['broadcast'] });
bus.addTransport(new BroadcastChannelTransport('app-state'), { peerId: 'tabs', origin: 'broadcast' });
bus.on('state:update', event => applyState(event.data.payload), { mode: 'sync' });
await bus.signal('state:update', { theme: 'dark' });
```

RPC over a group channel needs application-level peer discovery and response targeting. Do not bind every tab as a distinct authenticated RPC endpoint solely from a payload peer ID.

For retries, wrap an operation rather than passing a bus object to `withRetry()`:

```js
const { withRetry } = await import('crossbus/plugins/retry');
const result = await withRetry(() => bus.request('worker', 'read', {}), { maxAttempts: 3 });
```

Retry only operations whose application semantics allow repetition. Circuit breaker, compression and encryption plugins are separate subpaths; configure keys and codec behavior at both endpoints. Hook errors stop processing.

Presence can be enabled explicitly with `createPresence(bus)`; it stops when the bus is destroyed. `StreamManager` sends raw stream protocol envelopes through an application-supplied send function. Connect incoming transport stream envelopes to its `handleMessage()` directly; the CrossBus facade does not expose `send()` and does not automatically decode streaming envelopes.

Vector clocks and `CausalOrderer` require explicitly attached clocks. They do not automatically make every signal causally ordered, provide a distributed lock or implement a CRDT. Shared/service worker scripts need their own routing and storage; transport support is distinct from offline persistence.

For WebViews, use the [native adapters](../native/README.md). See [API](API.md) and [architecture](ARCHITECTURE.md) for lifecycle and trust boundaries.
