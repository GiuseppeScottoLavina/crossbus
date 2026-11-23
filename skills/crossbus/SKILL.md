---
name: crossbus
description: Use when integrating or debugging CrossBus RPC, signals, or streams between browser windows, iframes, workers, tabs, servers, or native WebViews. Covers transport selection, wiring both endpoints, peer authorization, and verifying delivery.
license: Apache-2.0
---

# CrossBus

Identify the caller, the receiver, and what the caller needs back. For a remote operation, wire both endpoints and register the receiving handler or listener before sending. These recipes target CrossBus 0.1.8. In an existing project, use the installed version's exports and types.

## Choose the operation

| Need | Sender | Receiver |
| --- | --- | --- |
| Get a result from one peer | `await bus.request(peerId, name, data)` | `bus.handle(name, (payload, ctx) => result)`. The caller receives the returned value. |
| Notify all connected peers | `await bus.signal('task:progress', data)` | `bus.on('task:progress', listener)`. Read `event.data.payload` and the bound peer ID at `event.data.source`. |
| Collect a result from each peer | `await bus.broadcastRequest(name, data)` | Each peer registers a handler. By default the caller gets a `Map` keyed by peer ID. Check each entry's `success` before using `data` or `error`. |
| Notify listeners in this context | `await bus.emit(name, data)` | `bus.on(name, listener)`. Read `event.data`. |

`signal()` reports how many transport sends succeeded. If the caller needs confirmation that a peer saved a record, use a request and return from the handler after the save completes.

## Run a two-peer example

In a fresh project, install `crossbus@0.1.8`. Save this as `sum.mjs` and run `node sum.mjs` with Node 18+. It prints `5` after checking the reply, the signal received by the client, and the handler's call count after invalid input.

```js
import assert from 'node:assert/strict';
import { CrossBus, MessageChannelTransport, withTimeout } from 'crossbus';

const client = CrossBus.createSecure({ peerId: 'client', allowedOrigins: ['channel'] });
const service = CrossBus.createSecure({ peerId: 'service', allowedOrigins: ['channel'] });

try {
  const channel = new MessageChannelTransport();
  client.addTransport(channel, { peerId: 'service' });
  service.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'client' });

  let calls = 0;
  service.handle('math:sum', ({ a, b }) => {
    calls += 1;
    return a + b;
  }, {
    allowedPeers: ['client'],
    validatePayload: p => Number.isFinite(p?.a) && Number.isFinite(p?.b)
  });

  const sum = await client.request('service', 'math:sum', { a: 2, b: 3 }, { timeout: 2000 });
  assert.equal(sum, 5);

  const progress = new Promise(resolve => client.once('task:progress', resolve, { mode: 'sync' }));
  await service.signal('task:progress', { percent: 50 });
  const event = await withTimeout(progress, 2000);
  assert.equal(event.data.source, 'service');
  assert.deepEqual(event.data.payload, { percent: 50 });

  await assert.rejects(
    client.request('service', 'math:sum', { a: '2', b: 3 }, { timeout: 2000 }),
    { code: 'ERR_INVALID_PAYLOAD' }
  );
  assert.equal(calls, 1);
  console.log(sum);
} finally {
  client.destroy();
  service.destroy();
}
```

In `createSecure()`, `peerId` names this endpoint. In `addTransport(transport, { peerId })`, it names the known peer at the other end. The handler authorizes that bound ID with `allowedPeers` and can read it from `ctx.peerId`. If your application calls `handleMessage(message, origin, peerId)` itself, get the identity from the authenticated channel. A payload field such as `userId` is input supplied by the sender.

## Connect the actual contexts

| Contexts | Transport | What to wire |
| --- | --- | --- |
| Parent and iframe or popup | `PostMessageTransport` | On each side, pass the remote window and its exact origin as `targetOrigin` and in both the transport and bus `allowedOrigins`. For an iframe, attach its `contentWindow` and the ready listener before setting `iframe.src`. [Both endpoints](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/README.md#parent-page-and-cross-origin-iframe) |
| Page and dedicated Worker | `MessageChannelTransport` | Allow `channel` on both buses. Attach the local port and register the ready listener, then transfer `channel.remotePort` in both the message and transfer list. Call `channel.markRemoteTransferred()`. The Worker binds `MessageChannelTransport.fromPort(data.port)`, installs handlers, and signals ready. Wait for ready before the first RPC. Without a bundler, use a resolvable module URL inside the Worker. [Page and Worker code](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/README.md#web-worker) |
| Same-origin tabs | `BroadcastChannelTransport` | Use the same channel name and allow `broadcast`. All senders share one bound peer ID. Use this for group notifications. Give peers individual authenticated channels when an action requires per-tab authorization. |
| Page and SharedWorker or ServiceWorker | `SharedWorkerTransport` or `ServiceWorkerTransport` | Allow `sharedworker` or `serviceworker`, respectively. Provide the worker script and its routing. Await `transport.ready` for ServiceWorker. Implement persistence in the application when offline delivery is required. |
| Browser and server | `WebSocketTransport` | Provide a compatible JSON backend. Authenticate the connection, set an explicit fallback origin label on the binding, allow it on the bus, and await `transport.connect()` before sending. |
| WebView and native host | `NativeBridgeTransport` | Integrate the Swift WKWebView or Java AndroidX adapter, configure the fallback origin label on the binding and bus, and await `transport.ready`. [Native host setup](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/native/README.md) |

`createSecure()` requires an explicit allowlist and rejects wildcards. Window messages carry their actual origin. Fixed labels such as `channel` describe the transport. Use the `origin` option on `addTransport` as a fallback only when the transport provides no origin.

Call the cleanup function returned by `addTransport()` to disconnect one binding. Call `bus.destroy()` when its owner closes to cancel pending requests and close attached transports.

## Diagnose by the observed result

| Observation | First check |
| --- | --- |
| `ERR_PEER_NOT_FOUND` | Check the caller's `bus.peers` and the remote ID passed to `addTransport()`. |
| `ERR_NO_HANDLER` | Check `bus.hasHandler(name)` on the receiver and the registration order. |
| `ERR_UNAUTHORIZED` or `ERR_INVALID_PAYLOAD` | Compare the bound caller ID with `allowedPeers` and input with the synchronous `validatePayload` predicate. In a rejection test, assert both the error code and the protected handler's unchanged call count. |
| `ERR_RESPONSE_TIMEOUT` | Check readiness, the return channel, and the origin allowlist on both endpoints. The deadline ends the caller's wait. Remote work may still complete. |
| `ERR_MAX_PENDING` or `ERR_PAYLOAD_TOO_LARGE` | Bound concurrency or split the data into a stream. Defaults are 100 pending requests and a 1 MiB estimated in-memory payload budget. |
| A signal reports delivery but the UI stays stale | Register the receiver before sending. Inspect `event.data.source` and `event.data.payload` there. |

For streams, hub forwarding, presence, causal order, optional plugins, local emitters, or MessageChannel tuning, read the relevant section of the [advanced recipes](references/advanced.md). Use the installed package's `docs/API.md` for exact options. The [versioned API reference](https://github.com/GiuseppeScottoLavina/crossbus/blob/v0.1.8/docs/API.md) is also available when this skill is copied into another project.
