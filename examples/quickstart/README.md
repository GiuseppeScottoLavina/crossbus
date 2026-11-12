# Runnable quickstarts

## Browser iframe demo

Prerequisites: Node.js 18+ and a repository checkout containing `dist/crossbus.js`. From the repository root:

```sh
node examples/quickstart/server.js
```

Open **http://127.0.0.1:8780/**. The app creates an iframe served at **http://127.0.0.1:8781/**; it displays `{"id":123,"status":"ready"}` after an RPC round trip. These two addresses are local servers started by the command. Both ports must be free. Ctrl+C stops them.

The server serves `hub.html`, `hub.js`, `widget.html` and `widget.js` directly. Both HTML files contain the import map for the committed bundle, and `/config.json` supplies the other server's origin. No bundler, external domain, dependency install or generated test-only page is required. Keep this server bound to loopback; it is a development example.

For deployment, serve the modules and configure both actual origins through your application's configuration. The local ports are only demo defaults.

## Node RPC example

From the checkout, run `node examples/quickstart/rpc.mjs`; it prints `5`. To use the published package in another project, follow the root README's `npm install crossbus` instructions and copy `rpc.mjs` there. It connects two endpoints in one process using MessageChannel and closes both afterward.

## Verification

`bun run test:docs` starts this same server on available ports, executes the actual HTML/modules on three page loads, checks the RPC result and browser errors, and runs the exact README RPC snippet in Node. The test does not substitute domains or synthesize replacement HTML.
