<p align="center"><img src="docs/logo-400.png" alt="CrossBus" width="120" height="120"></p>

# CrossBus

Messaging and request/response for browser windows, iframes, workers, tabs and native WebViews. No runtime npm dependencies. ESM, CommonJS and generated TypeScript declarations are included.

[API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Benchmarks](docs/BENCHMARKS.md) · [Native bridges](native/README.md) · [Security](SECURITY.md) · [Releasing](docs/RELEASING.md)

```sh
npm install crossbus
```

The iframe example below waits until both endpoints are ready. The app is served at `https://app.example.com` and the widget at `https://widget.example.com`. Use a bundler or an import map to resolve the `crossbus` package in browser modules.

In the app page, load this module:

```js
import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const widgetOrigin = 'https://widget.example.com';
const hub = CrossBus.createSecure({
  peerId: 'hub', isHub: true, allowedOrigins: [widgetOrigin]
});
hub.handle('getData', ({ id }) => ({ id, status: 'ready' }));

const iframe = document.createElement('iframe');
// Install the load callback before starting navigation. The widget installs its
// transport and ready handler before its load event can reach the parent.
iframe.addEventListener('load', async () => {
  hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
    targetOrigin: widgetOrigin, allowedOrigins: [widgetOrigin]
  }), { peerId: 'widget' });
  await hub.signal('hub:ready');
}, { once: true });
iframe.src = `${widgetOrigin}/widget.html`;
document.body.append(iframe);

// On teardown, close every attached transport:
// hub.destroy();
```

The widget's HTML contains `<output id="result"></output>` and loads this module. Its ready listener is installed before the parent receives the iframe load event:

```js
import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const appOrigin = 'https://app.example.com';
const widget = CrossBus.createSecure({ peerId: 'widget', allowedOrigins: [appOrigin] });
widget.addTransport(new PostMessageTransport(window.parent, {
  targetOrigin: appOrigin, allowedOrigins: [appOrigin]
}), { peerId: 'hub' });

// Wait for the parent endpoint before sending the first request. Keep module
// evaluation non-blocking so the iframe's load event can reach the parent.
widget.once('hub:ready', async () => {
  const data = await widget.request('hub', 'getData', { id: 123 });
  document.querySelector('#result').textContent = JSON.stringify(data);
}, { mode: 'sync' });
```

These modules are also shipped in [examples/quickstart/](examples/quickstart/) and exercised across two origins by `bun run test:docs`.

`signal(name, payload)` sends a one-way message. `request(peer, handler, payload)` waits for a response or timeout. Register handlers with `handle()` and local event listeners with `on()`. A remote signal arrives as `event.data.payload`, with the peer ID in `event.data.source`. The function returned by `addTransport()` removes that transport; `bus.destroy()` closes all attached transports.

| Transport | Scope |
|---|---|
| PostMessageTransport | Windows, iframes and workers |
| MessageChannelTransport | A pair of MessagePorts |
| BroadcastChannelTransport | Same-origin contexts |
| SharedWorkerTransport | A shared worker supplied by the application |
| ServiceWorkerTransport | A service worker supplied by the application |
| WebSocketTransport | A compatible application server |
| NativeBridgeTransport | iOS WKWebView / Android WebView, using the [native adapters](native/README.md) |

Workers and service workers need application-side message routing. Their existence does not provide durable storage, an offline queue or background delivery guarantees. Native adapters are source integrations, not published CocoaPods or Maven packages.

Optional [plugins](docs/API.md) include retry, circuit breaker, encryption, compression, rate limiting, batching and a **subset** of JSON Schema validation. Load them dynamically:

```js
const { withSchemaValidation } = await import('crossbus/plugins/schema-validation');
hub.handle('save', withSchemaValidation({
  type: 'object', required: ['id'], properties: { id: { type: 'string' } }
}, payload => ({ saved: payload.id })));
```

For local synchronous events, `crossbus/nano` exposes `createNanoEmitter()`. The main export includes `EventEmitter.emitSync()` and `createFastEmitter()`. These pass payload references within one JavaScript context; their throughput is separate from cross-context RPC.

`createSecure()` requires explicit origins and rejects wildcard patterns. Handler options include `allowedPeers`, `rateLimit` and `validatePayload`. The payload budget estimates in-memory data size; it is not an exact serialized wire limit. Hook failures reject processing. Peer IDs rely on the transport's trusted endpoint binding; manually calling `handleMessage()` requires supplying an identity established by the caller. See [security boundaries](SECURITY.md).

To verify this checkout:

```sh
bun install
bun run lint
bun run typecheck
bun run build
bun run test                     # unit + packaged export tests; build first
bun run test:e2e                  # local HTTP servers + installed Chrome
bun run test:integration
bun run test:docs                 # exact README modules, two origins in Chrome
bun run bench                    # Node, repeated samples + real MessageChannel RPC
bun run bench:bun
bun run bench:browser             # same workloads in headless Chrome
bun run bench:memory              # Node heap observations and timeout cleanup
node tests/benchmarks/sizes.js
```

Benchmark artifacts include runtime, CPU, dependency versions, code hashes, raw samples and callback correctness checks. See [current measurements and limits](docs/BENCHMARKS.md). No claim of being the fastest or most complete messaging library has been established. Published documentation does not imply independent security certification, production deployment or physical mobile-device qualification.

For bundle planning, `crossbus/core` is a core-only entry and plugin subpaths are separate modules. The root ESM contains all its exported transports; importing that same root dynamically does not fetch a smaller transport-only file. Consumer bundlers may tree-shake unused exports.

Licensed under [Apache-2.0](LICENSE).
