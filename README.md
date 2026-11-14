<p align="center"><img src="https://raw.githubusercontent.com/GiuseppeScottoLavina/crossbus/master/docs/logo-400.png" alt="CrossBus" width="120" height="120"></p>

# CrossBus

Signals and request/response messaging for browser windows, iframes, workers, tabs and native WebViews. The npm package has no runtime dependencies and includes ESM, CommonJS and TypeScript declarations.

[API](docs/API.md) · [Getting started](docs/GETTING_STARTED.md) · [Benchmarks](docs/BENCHMARKS.md) · [Competitor study](docs/COMPETITOR_ANALYSIS.md) · [Native bridges](native/README.md) · [Security](SECURITY.md)

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

SharedWorker and ServiceWorker transports do not implement persistent storage or an offline message queue. Native integration requires an application host. The unreleased 0.1.5 checkout adds SwiftPM/CocoaPods configuration and an Android AAR build, with [physical iPad/Pixel qualification](docs/QUALIFICATION.md). These SDKs are not published to CocoaPods or Maven Central.

## Performance and release status

Version 0.1.3 adds an optional `MessageChannelTransport({ wireFormat: 'compact' })` encoding. It requires CrossBus 0.1.3+ receivers and keeps the public envelope, payload limits, hooks and peer checks. Standard encoding remains the default for compatibility with 0.1.2. See [API requirements](docs/API.md#compact-messagechannel-encoding) and the [versioned competitor study](docs/COMPETITOR_ANALYSIS.md) before selecting it.

Version 0.1.3 is [published on npm](https://www.npmjs.com/package/crossbus/v/0.1.3). Its release qualification passed 1,150 tests across 73 files with zero failures/skips, and source line coverage was 95.90% (4,441/4,631). The [audit](docs/AUDIT.md) records scope, post-release tooling updates and remaining qualification. The playground uses actual CrossBus channels, module Workers and iframe forwarding; its documentation-only deployment layout is browser-tested.

The study found RPC improvements on Node/Bun and faster local stream buffering. Chrome RPC results were mixed, including regressions; compact encoding was slower for large payloads in Chrome Workers. Comlink, birpc and Penpal remain faster in several measured cases. Check the workload-specific tables before choosing an encoding; no overall performance lead is established.

A separate [explicit RPC grouping prototype](docs/RPC_BATCHING.md) explores further gains without changing the package API. For 64 concurrent 1 KiB echo calls, paired-process median group/stock ratios were 1.34× on Node, 1.91× on Bun and 2.00× in same-page headless Chrome. Worker results were variable, and large payloads regressed in several runtimes. The prototype is excluded from npm and uses shared group-graph semantics; it is not a transparent replacement for individual calls or evidence of a universal lead.

Version [0.1.4 is published on npm](https://www.npmjs.com/package/crossbus/v/0.1.4). It adds browser UUID generation using pooled fresh Web Crypto bytes and fixes serialized transport reception, typed-view transfer discovery and buffer-budget accounting. In headless Chrome Worker tests with 64 concurrent 1 KiB calls, paired-process median throughput ratios against 0.1.3 were 1.15× standard and 1.21× compact. Node/Bun showed no general gain; some hook/large-payload cases regressed, and the minified gzip bundle grew by 822 bytes. See the [Worker RPC study](docs/WORKER_RPC.md) for all samples, controls and limits. With opt-in `autoTransfer`, typed views now move their entire eligible backing ArrayBuffer and detach all sender aliases; JSON-string mode rejects explicit transfer lists. These measurements compare the exact frozen 0.1.3 and 0.1.4 runtimes; the published 0.1.3 package is unchanged.

The **0.1.5 development candidate is not published on npm**. It adds [bounded streaming](docs/STREAMING.md), optional consumption acknowledgements and native binary chunks, shared default RPC timeout scheduling, and stricter iOS protocol-marker validation. The [candidate comparison](docs/NEXT_RELEASE.md) records measured gains, regressions and bundle cost separately from functional qualification.

In that comparison, default base64 streaming over same-event-loop MessageChannels improves by paired medians of 3.90×/7.19× in Chrome and 5.12×/5.95× in Bun for 1/4 MiB transfers; Node regresses about 4–5%. Standard 64-concurrent / 1 KiB RPC improves 1.11× in same-page Chrome, with mixed results elsewhere. These are distinct workloads, not native-device or universal superiority claims; all samples, controls and the +3,015-byte minified gzip cost are retained in the report.

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

The 0.1.5 checkout was checked locally on 14 November 2026. These results apply to the retained candidate bytes; npm 0.1.4 and earlier releases have their own [historical audit records](docs/AUDIT.md).

| Check | Evidence and scope |
|---|---|
| Library checks | 1,199 tests across 81 files, plus 43 experimental tests across five files; zero failures/skips |
| Source line coverage | 96.22% (5,011/5,208); this is line coverage, not branch coverage or proof of bug freedom |
| Browser qualification | Ten focused cases on Chrome 155, Firefox 160, desktop Safari 27.2 and physical iPad Safari 27.2; [receipts and scope](docs/QUALIFICATION.md) |
| Native WebViews | Eleven JavaScript assertions plus native invocation/guard checks on physical iPadOS 27.2.1 and Pixel 7 Pro / Android 17, including navigation and teardown |
| Performance | [Repeated candidate/baseline RPC study](docs/NEXT_RELEASE.md); complete samples and unchanged competitor controls are retained |

The iframe demo has its own [executable documentation tests](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/tests/docs/readme.test.js). Browser/device qualification covers the tested cases and versions, rather than every transport or OS release. These are project checks, not an independent security certification. The measurements do not establish that CrossBus is the fastest or most complete library in every workload.

To check the current repository, use Node 24 and Bun for development:

```sh
npm ci --legacy-peer-deps
bun run release:check
bun run test:all
bun run test:experiments # RPC grouping prototypes and timeout-resource checks
# On a Mac configured with the required native SDKs:
bun run test:native
```

Browser tests need Chrome; set `CHROME_PATH` to an installed executable if needed. See [development setup](docs/DEVELOPMENT.md), [benchmark reproduction](docs/BENCHMARKS.md) and [release procedure](docs/RELEASING.md).

Licensed under [Apache-2.0](LICENSE).
