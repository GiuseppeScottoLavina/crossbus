# Getting started

Install with `npm install crossbus`. The [README](../README.md) includes a complete Node MessageChannel example and instructions to run the browser iframe demo. In a repository checkout, run `node examples/quickstart/server.js` and open `http://127.0.0.1:8780/`. The command starts both local origins, serves the actual HTML/import maps and supplies each endpoint's exact peer origin. No bundler or dependency install is required for this demo. The parent attaches its transport before navigating the iframe. The widget announces `widget:ready` after installing its listener, and waits for `hub:ready` before its first RPC. An RPC method is invoked as `request(peerId, handlerName, payload)`, in that order.

Import `CrossBus` first and load optional features dynamically. For a real MessageChannel pair in one JavaScript environment:

```js
import { CrossBus } from 'crossbus';
const { MessageChannelTransport } = await import('crossbus');
const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
const channel = new MessageChannelTransport();
a.addTransport(channel, { peerId: 'b', origin: 'channel' });
b.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'a', origin: 'channel' });
b.handle('sum', ({ a, b }) => a + b);
console.log(await a.request('b', 'sum', { a: 2, b: 3 })); // 5
// On teardown:
a.destroy(); b.destroy();
```

For separate contexts, transfer `channel.remotePort` to the other context through an authenticated `postMessage` exchange, then call `fromPort()` there. The initial exchange must validate origin and source. `channel` is the MessageChannel transport's origin label, not a network origin. Use that exact label in the bus allowlist.

Use `bus.signal(name, data)` for remote signals and `bus.emit(name, data)` for local events. A remote signal listener reads `event.data.payload`; a local event listener reads `event.data`. `signal()` counts accepted transport sends, not acknowledgments.

Load native host adapters using the [iOS/Android guide](../native/README.md). ServiceWorker/SharedWorker/WebSocket transports require their application counterpart. See the [API](API.md) for actual options, [security boundaries](../SECURITY.md), and [benchmarks](BENCHMARKS.md) for measured performance.

For development, run `bun run build`, `bun run test`, `bun run test:types`, `bun run test:e2e` and `bun run test:integration`. Chrome must be installed; use `CHROME_PATH` to select a specific executable.

The complete files are stored in [examples/quickstart/](../examples/quickstart/). `bun run test:docs` runs the README's exact Node module and serves the actual browser files across two origins, without substituting domains or generating replacement HTML.
