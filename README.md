<p align="center"><img src="https://raw.githubusercontent.com/GiuseppeScottoLavina/crossbus/master/docs/logo-400.png" alt="CrossBus" width="120" height="120"></p>

# CrossBus

Signals and request/response messaging for browser windows, iframes, workers, tabs and native WebViews. The npm package has no runtime dependencies and includes ESM, CommonJS and TypeScript declarations.

[API](docs/API.md) · [Getting started](docs/GETTING_STARTED.md) · [Benchmarks](docs/BENCHMARKS.md) · [Native bridges](native/README.md) · [Security](SECURITY.md)

## Run your first request

Prerequisite: Node.js 18 or newer. Create a project and install the published package:

```sh
mkdir crossbus-demo
cd crossbus-demo
npm init -y
npm install crossbus
```

Save the following as `rpc.mjs`. It connects two endpoints through a real MessageChannel in one Node process; it does not open a browser or contact a remote service.

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

Run it:

```sh
node rpc.mjs
```

Expected output: `5`. The same file is maintained in [examples/quickstart/rpc.mjs](examples/quickstart/rpc.mjs).

## Run the browser iframe demo

This complete example starts an app at `http://127.0.0.1:8780` and a widget at `http://127.0.0.1:8781`. These are local addresses served by the command below. The two ports create distinct browser origins.

With Node.js 18+ and Git installed, run:

```sh
git clone https://github.com/GiuseppeScottoLavina/crossbus.git
cd crossbus
node examples/quickstart/server.js
```

Open **http://127.0.0.1:8780/** in a browser. The iframe should display:

```json
{"id":123,"status":"ready"}
```

Both ports must be available. Stop the servers with Ctrl+C. This demo serves the repository's committed distribution, so no dependency install or build is required. Both HTML files include the import map that resolves `crossbus` to the served bundle.

The [parent module](examples/quickstart/hub.js) installs its transport before navigating the iframe. The [widget module](examples/quickstart/widget.js) registers its listener, announces `widget:ready` and waits for `hub:ready` before making its request. Both use exact origins supplied by the local server. `bun run test:docs` starts this same server and loads these same HTML and JavaScript files, without rewriting their URLs or generating replacement pages.

For your own deployment, configure each endpoint's actual origin and serve the modules with your application's bundler or import map. The local demo's ports are not deployment requirements.

## Messaging API

| Operation | API |
|---|---|
| Register an RPC handler | `bus.handle(name, handler)` |
| Call a peer and wait for its response | `await bus.request(peerId, name, payload)` |
| Send a one-way signal | `await bus.signal(name, payload)` |
| Listen for a signal | `bus.on(name, event => event.data.payload)` |
| Attach a known peer's transport | `bus.addTransport(transport, { peerId, origin })` |
| Close transports and cancel pending requests | `bus.destroy()` |

Remote signal listeners receive the payload at `event.data.payload` and the sender at `event.data.source`. Local event listeners registered with `on()` and invoked with `emit()` receive their data at `event.data`. `signal()` counts accepted sends; it does not acknowledge delivery. See [API details](docs/API.md) for options, errors and cleanup.

## Transports and prerequisites

| Transport | Connects | Application prerequisite |
|---|---|---|
| PostMessageTransport | Windows, iframes and workers | A known target and explicit origins |
| MessageChannelTransport | Two MessagePorts | Transfer a port when connecting separate contexts |
| BroadcastChannelTransport | Same-origin contexts | A shared channel name and application routing |
| SharedWorkerTransport | Tabs and a shared worker | A worker script with message routing |
| ServiceWorkerTransport | Pages and a service worker | A registered worker with message routing |
| WebSocketTransport | Browser and server | A compatible server |
| NativeBridgeTransport | JavaScript and a native WebView host | The [Swift or Java source adapter](native/README.md) integrated into your app |

SharedWorker and ServiceWorker transports do not implement persistent storage or an offline message queue. The iOS/Android adapters are source integrations; CocoaPods/Maven packages and physical-device runtime qualification are not provided.

## Optional features

Plugin subpaths provide retry, circuit breaker, encryption, compression, rate limiting, batching and a documented subset of JSON Schema validation. For example, on the `service` endpoint above, before destroying it:

```js
const { withSchemaValidation } = await import('crossbus/plugins/schema-validation');
service.handle('save', withSchemaValidation({
  type: 'object', required: ['id'], properties: { id: { type: 'string' } }
}, payload => ({ saved: payload.id })));
```

Load optional plugins dynamically. `crossbus/core` is a separate core entry point. Dynamically importing `crossbus` itself loads the root module, including its exported transports; consumer bundlers may tree-shake unused exports.

For local synchronous events, `crossbus/nano` provides `createNanoEmitter()`. The main module also exports `EventEmitter.emitSync()` and `createFastEmitter()`. Their local callback throughput does not measure serialization or cross-context RPC.

`createSecure()` requires explicit origins and rejects wildcard patterns. Handler options include `allowedPeers`, `rateLimit` and `validatePayload`. Payload limits estimate in-memory size. Hook failures reject processing. Peer authorization depends on the transport's trusted endpoint binding. See [security boundaries](SECURITY.md) before integrating untrusted contexts.

## Verification and performance evidence

The [0.1.2 release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.2) was checked on 12 November 2026:

| Check | Evidence and scope |
|---|---|
| Published npm archive | [Registry metadata](https://registry.npmjs.org/crossbus/0.1.2); its SHA-256 matches the release's `SHA256SUMS` |
| Package consumers | [Passing CI](https://github.com/GiuseppeScottoLavina/crossbus/actions/runs/43196537107): Node 18/20/22/24, all 12 exports, declarations, ESM/CommonJS and minified MessageChannel RPC |
| Source and browser behavior | 1,093 local tests passed with zero failures/skips; lint, type checking, build and Chrome integration also passed in that release's CI |
| Source line coverage | 95.64% (4,322/4,519) for that release; [methodology and limits](docs/AUDIT.md) |
| Native adapters | Swift iOS and Java Android compilation passed locally; device runtime tests remain pending |
| Performance | [Repeated Node/Bun/Chrome measurements](docs/BENCHMARKS.md), with raw samples and exact measured bundles; these measurements predate the final 0.1.2 compatibility/banner changes |

The current iframe demo has its own [executable documentation tests](tests/docs/readme.test.js). Historical release counts above do not describe every later revision. These are project checks, not an independent security certification. Safari/Firefox and physical mobile WebViews remain unqualified. The measurements do not establish that CrossBus is the fastest or most complete library in every workload.

To check the current repository, use Node 24 and Bun for development:

```sh
npm ci --legacy-peer-deps
bun run release:check
bun run test:all
# On a Mac configured with the required native SDKs:
bun run test:native
```

Browser tests need Chrome; set `CHROME_PATH` to an installed executable if needed. See [development setup](docs/DEVELOPMENT.md), [benchmark reproduction](docs/BENCHMARKS.md) and [release procedure](docs/RELEASING.md).

Licensed under [Apache-2.0](LICENSE).
