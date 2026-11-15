<p align="center"><img src="https://raw.githubusercontent.com/GiuseppeScottoLavina/crossbus/master/docs/logo-400.png" alt="CrossBus" width="120" height="120"></p>

# CrossBus

[![npm](https://img.shields.io/npm/v/crossbus)](https://www.npmjs.com/package/crossbus)
[![CI](https://github.com/GiuseppeScottoLavina/crossbus/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/GiuseppeScottoLavina/crossbus/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/npm/l/crossbus)](LICENSE)
![Types included](https://img.shields.io/badge/types-included-blue)
![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)

**Signals, RPC and bounded streams between browser windows, iframes, workers, tabs and native WebViews.**

You get one messaging API across postMessage, MessageChannel, BroadcastChannel, SharedWorker, ServiceWorker, WebSocket and WKWebView/AndroidX bridges. CrossBus requires explicit origin allowlists, binds each peer identity to its channel and enforces payload and request budgets. The npm package has no runtime dependencies and ships ESM, CommonJS and TypeScript declarations.

[Documentation](https://giuseppescottolavina.github.io/crossbus/) · [API](docs/API.md) · [Getting started](docs/GETTING_STARTED.md) · [Security](SECURITY.md) · [Benchmarks](docs/BENCHMARKS.md) · [Changelog](CHANGELOG.md)

## Highlights

- **One API, seven transports.** `request()`, `signal()` and `on()` work the same way over windows, iframes, workers, tabs, servers and native WebViews.
- **Explicit trust boundaries.**
  - `createSecure()` requires exact origins and rejects wildcards.
  - Responses must come from the peer that was asked.
  - Handlers can restrict callers (`allowedPeers`), rate-limit them and validate payloads.
  - A hook that throws stops processing.
- **Bounded by default.** Payloads are capped at 1 MiB by an in-memory estimate and pending requests at 100. Requests time out after 30 s, and `destroy()` cancels them and closes every attached transport.
- **Streams for large data.** Streams have bounded queues, optional consumption acknowledgements, deadlines, cancellation and native binary chunks.
- **Opt-in modules.** Retry, circuit breaker, AES-GCM encryption, compression, rate limiting, batching, schema validation (a documented subset), tracing/metrics and test mocks are separate imports.
- **Evidence over claims.** The README's code examples run in CI. Benchmarks retain raw samples, competitor controls and regressions. See [Performance](#performance).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Browser examples](#browser-examples)
- [Core concepts](#core-concepts)
- [API at a glance](#api-at-a-glance)
- [Transports](#transports)
- [Entry points and optional modules](#entry-points-and-optional-modules)
- [Security model](#security-model)
- [Performance](#performance)
- [Compatibility](#compatibility)
- [Choosing CrossBus](#choosing-crossbus)
- [Versions and status](#versions-and-status)
- [Documentation](#documentation)
- [Development](#development)

## Install

```sh
npm install crossbus
# or: pnpm add crossbus · yarn add crossbus · bun add crossbus
```

CrossBus needs Node.js 18+ or a modern browser. To use it in the browser without a bundler, map the package to the standalone ES module build and pin an exact version:

```html
<script type="importmap">
  { "imports": { "crossbus": "https://cdn.jsdelivr.net/npm/crossbus@0.1.7/dist/crossbus.min.js" } }
</script>
<script type="module">
  import { CrossBus } from 'crossbus';
</script>
```

For production, serve the file from your own origin or use your bundler.

## Quick start

Save this as `rpc.mjs`. It connects two endpoints through a real MessageChannel in one Node process. It does not open a browser or contact a remote service.

```js
import { CrossBus } from 'crossbus';
const { MessageChannelTransport } = await import('crossbus');

// Two endpoints connected by a real MessageChannel in this process.
// "channel" is this transport's origin label, not a website address.
const client = CrossBus.createSecure({ peerId: 'client', allowedOrigins: ['channel'] });
const service = CrossBus.createSecure({ peerId: 'service', allowedOrigins: ['channel'] });
const channel = new MessageChannelTransport();
client.addTransport(channel, { peerId: 'service', origin: 'channel' });
service.addTransport(MessageChannelTransport.fromPort(channel.remotePort), {
  peerId: 'client', origin: 'channel'
});
service.handle('sum', ({ a, b }) => a + b);

try {
  console.log(await client.request('service', 'sum', { a: 2, b: 3 })); // 5
} finally {
  client.destroy();
  service.destroy();
}
```

```sh
node rpc.mjs   # prints 5
```

The same file is kept in [examples/quickstart/rpc.mjs](examples/quickstart/rpc.mjs). The documentation tests check that this block and that file are identical, and they run it.

## Browser examples

### Parent page and cross-origin iframe

The parent attaches its transport *before* navigating the iframe. The widget signals that it is ready, and the parent answers. Neither side depends on load-event timing.

```js
// app.js — served from APP_ORIGIN
import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const WIDGET_ORIGIN = 'https://widget.example.com';
const hub = CrossBus.createSecure({ peerId: 'hub', allowedOrigins: [WIDGET_ORIGIN] });
hub.handle('getData', ({ id }) => ({ id, status: 'ready' }));

const iframe = document.body.appendChild(document.createElement('iframe'));
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
  targetOrigin: WIDGET_ORIGIN, allowedOrigins: [WIDGET_ORIGIN]
}), { peerId: 'widget' });
hub.once('widget:ready', () => hub.signal('hub:ready'), { mode: 'sync' });
iframe.src = `${WIDGET_ORIGIN}/widget.html`;
```

```js
// widget.js — served from WIDGET_ORIGIN
import { CrossBus } from 'crossbus';
const { PostMessageTransport } = await import('crossbus');

const APP_ORIGIN = 'https://app.example.com';
const widget = CrossBus.createSecure({ peerId: 'widget', allowedOrigins: [APP_ORIGIN] });
widget.addTransport(new PostMessageTransport(window.parent, {
  targetOrigin: APP_ORIGIN, allowedOrigins: [APP_ORIGIN]
}), { peerId: 'hub' });
widget.once('hub:ready', async () => {
  console.log(await widget.request('hub', 'getData', { id: 123 })); // { id: 123, status: 'ready' }
}, { mode: 'sync' });
await widget.signal('widget:ready');
```

To see it run on two real local origins, you need Node.js 18+ and Git. No install or build step is required:

```sh
git clone https://github.com/GiuseppeScottoLavina/crossbus.git
cd crossbus
node examples/quickstart/server.js   # then open http://127.0.0.1:8780/
```

The iframe on port 8781 displays `{"id":123,"status":"ready"}`. The [demo modules](examples/quickstart/) are loaded unchanged by `bun run test:docs`. That suite also runs the two snippets above, and the Worker example below, in Chrome.

### Web Worker

Transfer one end of a MessageChannel to a module Worker, then wait for its ready signal:

```js
// main.js
import { CrossBus } from 'crossbus';
const { MessageChannelTransport } = await import('crossbus');

const bus = CrossBus.createSecure({ peerId: 'main', allowedOrigins: ['channel'] });
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const channel = new MessageChannelTransport();
bus.addTransport(channel, { peerId: 'worker', origin: 'channel' });

const ready = new Promise(resolve => bus.once('worker:ready', resolve, { mode: 'sync' }));
worker.postMessage({ port: channel.remotePort }, [channel.remotePort]);
channel.markRemoteTransferred();
await ready;

console.log(await bus.request('worker', 'fib', { n: 30 })); // 832040
```

```js
// worker.js — a static import ensures onmessage is installed before the port arrives
import { CrossBus, MessageChannelTransport } from 'crossbus';

const bus = CrossBus.createSecure({ peerId: 'worker', allowedOrigins: ['channel'] });
bus.handle('fib', ({ n }) => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; });

self.onmessage = ({ data }) => {
  bus.addTransport(MessageChannelTransport.fromPort(data.port), { peerId: 'main', origin: 'channel' });
  bus.signal('worker:ready');
};
```

The [worker offload pattern](examples/patterns/worker-offload.js) extends this example with progress signals and large payloads. Native WebViews are covered by the [Swift and Android adapters](native/README.md).

## Core concepts

**Peers and transports.** Each bus has a `peerId`. `addTransport(transport, { peerId, origin })` binds one channel to one known remote peer, and every message arriving on that channel is attributed to that peer. Peer IDs are authorization labels bound to channels. They are not cryptographic identities, and CrossBus never takes them from message payloads.

**Three kinds of messages.**

| You want to… | Use | Listener / handler receives |
|---|---|---|
| Call a remote function and await its result | `await bus.request(peerId, name, payload)` | The handler gets `(payload, { peerId, requestId, handlerName })` |
| Notify every connected peer | `await bus.signal(name, payload)` | `event.data.payload`, with the bound sender at `event.data.source` |
| Dispatch an event in this context only | `await bus.emit(name, data)` | `event.data` |

`signal()` resolves with `{ success, delivered, failed }`. It counts accepted sends, not acknowledgements.

**Origins.** Window transports report the real event origin. Other transports report a fixed label, which must appear in `allowedOrigins`:

| Transport | Origin the bus checks |
|---|---|
| PostMessage (window) | Actual event origin, plus a source-window check |
| MessageChannel | `channel` |
| BroadcastChannel | `broadcast` |
| SharedWorker / ServiceWorker | `sharedworker` / `serviceworker` |
| WebSocket / NativeBridge / originless worker events | The `origin` you pass to `addTransport()` |

## API at a glance

| Operation | API |
|---|---|
| Create a bus with strict defaults | `CrossBus.createSecure({ peerId, allowedOrigins, ...limits })` |
| Attach a channel to a known peer | `const remove = bus.addTransport(transport, { peerId, origin })` |
| Register / remove an RPC handler | `bus.handle(name, fn, { allowedPeers, rateLimit, validatePayload })` / `bus.unhandle(name)` |
| Call a peer | `await bus.request(peerId, name, payload, { timeout })` |
| Call every peer | `await bus.broadcastRequest(name, payload)` returns a `Map` of `{ success, data \| error }` |
| Send a one-way signal | `await bus.signal(name, payload, { exclude })` |
| Listen | `const sub = bus.on(name, fn, { once, priority, mode, signal })`, then `sub.unsubscribe()` |
| Transform or validate traffic | `bus.addInboundHook(fn, priority, options)` / `bus.addOutboundHook(fn, priority, options)` |
| Inspect | `bus.peers`, `bus.healthCheck()`, `bus.diagnose()` |
| Tear down | `bus.destroy()` cancels requests and closes attached transports |

Failed calls reject with a `CrossBusError` whose `code` identifies the cause, such as `ERR_RESPONSE_TIMEOUT`, `ERR_NO_HANDLER`, `ERR_PEER_NOT_FOUND` or `ERR_PAYLOAD_TOO_LARGE`. See the [full API reference](docs/API.md) for every option, default and error.

## Transports

| Transport | Connects | Your application provides |
|---|---|---|
| `PostMessageTransport` | Windows, iframes, workers | The target window/worker and exact origins |
| `MessageChannelTransport` | Two `MessagePort`s | An authenticated way to transfer the remote port |
| `BroadcastChannelTransport` | Same-origin tabs and frames | A channel name; all tabs share one bound peer |
| `SharedWorkerTransport` | Tabs and a shared worker | The worker script and its routing |
| `ServiceWorkerTransport` | Pages and a service worker | A registered worker and its routing |
| `WebSocketTransport` | Browser and server | A compatible JSON backend |
| `NativeBridgeTransport` | JavaScript and a native host | The [Swift (WKWebView) or Java (AndroidX) adapter](native/README.md) |

Worker transports do not add persistence or an offline queue. `MessageChannelTransport` can use an opt-in compact encoding (`wireFormat: 'compact'` for 0.1.3+ receivers). Both ends must support the chosen format, because there is no negotiation. See the [compact encoding notes](docs/API.md#compact-messagechannel-encoding).

## Entry points and optional modules

| Import | Contents | Minified + gzip (level 9) |
|---|---|---:|
| `crossbus` | Bus, emitters, all transports, streams, presence, ordering utilities | 23,329 B |
| `crossbus/core` | The `CrossBus` class alone (with its event API); no transports | 12,735 B |
| `crossbus/nano` | `createNanoEmitter()`, a minimal local emitter | 331 B |

Sizes are measured on the current development build with `node tests/benchmarks/sizes.js`. A default `import` resolves the unminified ESM build, and bundlers can tree-shake unused exports. `require('crossbus')` is available for the root entry. Subpaths are ESM-only.

Optional modules are separate subpaths; load them on demand:

```js
const { withSchemaValidation } = await import('crossbus/plugins/schema-validation');
service.handle('save', withSchemaValidation({
  type: 'object', required: ['id'], properties: { id: { type: 'string' } }
}, payload => ({ saved: payload.id })));
```

| Subpath | Provides |
|---|---|
| `crossbus/plugins/retry` | `withRetry`, `createRetryWrapper` |
| `crossbus/plugins/circuit-breaker` | `CircuitBreaker`, `createPeerCircuitBreaker` |
| `crossbus/plugins/encryption` | AES-256-GCM via the global Web Crypto API (Node 18 needs `--experimental-global-webcrypto`); key distribution is up to you |
| `crossbus/plugins/compression` | `Compression`, `withCompression` |
| `crossbus/plugins/rate-limiter` | `RateLimiter`, `withRateLimiter` |
| `crossbus/plugins/batch` | `withBatching` and batchers (enable unbatching on receivers) |
| `crossbus/plugins/schema-validation` | A documented subset of JSON Schema, not a full validator |
| `crossbus/enterprise` | Tracing, metrics, backpressure, message versioning |
| `crossbus/testing` | `MockTransport`, `createConnectedMocks` |

For large data, the root module exports a [`StreamManager`](docs/STREAMING.md) that uses bounded buffering and optional flow control. For local-only events, `createFastEmitter()` and `crossbus/nano` invoke raw callbacks. Their throughput does not measure cross-context messaging.

## Security model

What CrossBus enforces:

- **Exact origins.** `createSecure()` rejects missing or wildcard allowlists. Window transports also verify the source window.
- **Channel-bound identity.** Responses must come from the requested peer. `allowedPeers` authorizes callers by the peer bound to their channel.
- **Fail-closed hooks and validation.** A rejected inbound request never runs its handler.
- **Resource budgets.** Pending-request and payload limits apply, plus per-handler fixed-window rate limits.

What remains your responsibility:

- Authenticating users and the initial channel setup (for example, how a `MessagePort` is handed over).
- Key management for the encryption plugin.
- Authorizing any forwarding between peers. `isHub` does not route automatically.
- Telling tabs apart on BroadcastChannel, where all tabs share one bound peer.

The [security guide](SECURITY.md) covers the threat model and limits. To report a vulnerability, follow its private disclosure process. These are project-maintained checks, not an independent security certification.

## Performance

CrossBus publishes measurements instead of fixed speed claims. Each study keeps exact builds, input hashes, raw samples, unchanged competitor controls and its regressions. CI re-verifies the retained datasets.

In the current [compact-v2 study](docs/RPC_WIRE_V2.md), 64 concurrent 1 KiB echo calls gave these medians in calls/s:

| Runtime | Standard | Compact v1 | Compact v2 | birpc 4.2.0 (cached) | Penpal 8.0.1 (cached + timeout) |
|---|---:|---:|---:|---:|---:|
| Node | 154,750 | 182,029 | 195,753 | 211,365 | 192,425 |
| Bun | 104,485 | 199,904 | 221,296 | 137,573 | 120,532 |
| Chrome (same page) | 91,022 | 93,091 | 96,376 | 102,400 | 96,832 |
| Chrome Worker | 137,912 | 136,080 | 152,836 | 142,718 | 154,566 |

CrossBus ran with its default guards and 30-second deadlines. The other libraries have different APIs and security semantics. These numbers come from one development machine for one workload. They are not a ranking: birpc and Penpal are faster in several cells, and Worker results vary. The [benchmark guide](docs/BENCHMARKS.md) explains how to reproduce them. Use `bun run bench`, `bun run bench:bun` and `bun run bench:browser` for correctness-checked local runs.

## Compatibility

| Environment | Status |
|---|---|
| Node.js | 18+. CI installs the packed package on Node 18, 20, 22 and 24. |
| Bun | Used for development and the test suites. |
| Browsers | Chrome is tested in CI. The 0.1.5 focused qualification passed on Chrome 155, Firefox 160, Safari 27.2 and physical iPad Safari 27.2 ([receipts](docs/QUALIFICATION.md)). |
| TypeScript | Bundled declarations are checked with strict consumers on TypeScript 6.0 and 5.9. |
| iOS / macOS | Swift adapter for WKWebView, iOS 15+ / macOS 12+ (SwiftPM or CocoaPods from source) |
| Android | Java adapter for AndroidX WebView, API 23+ (local Gradle AAR) |

The native SDKs are built from this repository; they are not published to CocoaPods or Maven Central. Physical iPad and Pixel 7 Pro receipts cover 0.1.5 only.

## Choosing CrossBus

CrossBus fits when one application connects several kinds of contexts and needs consistent origin checks, peer-bound authorization, budgets and teardown. Simpler tools may suit narrower needs:

- [Comlink](https://github.com/GoogleChromeLabs/comlink): proxy-style remote objects, typically for a single worker.
- [birpc](https://github.com/antfu-collective/birpc): minimal function RPC over a transport you supply.
- [Penpal](https://github.com/Aaronius/penpal): parent/iframe connections with a built-in handshake.

The [source-reviewed comparison](docs/COMPETITOR_ANALYSIS.md) records design differences and measured tradeoffs at exact versions.

## Versions and status

CrossBus is pre-1.0. Read the [changelog](CHANGELOG.md) before upgrading. Wire formats are opt-in and never negotiated silently.

| Version | Status | Main changes | Evidence |
|---|---|---|---|
| [0.1.7](https://www.npmjs.com/package/crossbus/v/0.1.7) | npm `latest` ([publication record](docs/RELEASING.md)) | Security fixes for the encryption, compression, schema, rate-limiter and tracing plugins and the iOS adapter; faster sequential RPC. Encrypted endpoints must upgrade together | [security audit](docs/AUDIT.md), [deadline-timer record](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/benchmarks/deadline-timer-0.1.7), [changelog](CHANGELOG.md) |
| [0.1.6](https://www.npmjs.com/package/crossbus/v/0.1.6) | Published | Opt-in `compact-v2` MessageChannel RPC (0.1.6+ receivers); faster Node base64 streams | [compact-v2 study](docs/RPC_WIRE_V2.md), [optimization snapshot](docs/OPTIMIZATION_016.md), [audit](docs/AUDIT.md) |
| [0.1.5](https://www.npmjs.com/package/crossbus/v/0.1.5) | Published | Bounded streams with flow control; shared RPC timeout timer; native SDK packaging | [release comparison](docs/NEXT_RELEASE.md), [qualification](docs/QUALIFICATION.md), [publication record](docs/RELEASING.md) |
| [0.1.4](https://www.npmjs.com/package/crossbus/v/0.1.4) | Published | Pooled browser UUIDs; serializer and transfer fixes | [Worker RPC study](docs/WORKER_RPC.md) |
| [0.1.3](https://www.npmjs.com/package/crossbus/v/0.1.3) | Published | Opt-in compact encoding; WebSocket and stream fixes | [competitor study](docs/COMPETITOR_ANALYSIS.md), [RPC grouping prototype](docs/RPC_BATCHING.md) |

The `compact-v2` example ([rpc-compact-v2.mjs](examples/quickstart/rpc-compact-v2.mjs)) requires 0.1.6 or later on both endpoints.

## Documentation

| Guide | Covers |
|---|---|
| [Getting started](docs/GETTING_STARTED.md) | First endpoints and connecting separate contexts |
| [API reference](docs/API.md) | Every option, default, error and transport |
| [Architecture](docs/ARCHITECTURE.md) | Protocol, routing and responsibilities |
| [Integration patterns](docs/ADVANCED.md) | Hub forwarding, group signals, retry |
| [Streaming](docs/STREAMING.md) | Stream options, flow control and compatibility |
| [Native adapters](native/README.md) | Swift WKWebView and Java AndroidX integration |
| [Security](SECURITY.md) | Threat model, controls and disclosure |
| [Benchmarks](docs/BENCHMARKS.md) | Methodology and reproduction |
| [Examples](docs/EXAMPLES.md) | Runnable demos and application scaffolds |
| [AI agent guide](docs/AI-GUIDE.md) | Using CrossBus between agent contexts |

## Development

Use Node 24 and Bun:

```sh
npm ci --legacy-peer-deps
bun run release:check      # lint, types, build, unit/package tests, declarations, coverage gate
bun run test:all           # adds Chrome e2e, integration and documentation tests
bun run test:experiments   # repository-only prototypes
bun run test:native        # Swift/Java adapter compile check (requires native SDKs)
```

Browser tests need Chrome; set `CHROME_PATH` if it is not found automatically. The 0.1.7 release qualification passed 1,301 tests across 89 files with zero failures. Source line coverage was 96.68%; this is line coverage, not branch coverage. See the [audit record](docs/AUDIT.md) for scope, plus the [development](docs/DEVELOPMENT.md), [contributing](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/CONTRIBUTING.md) and [release](docs/RELEASING.md) guides.

## License

[Apache-2.0](LICENSE)
