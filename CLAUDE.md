# CrossBus integration instructions

Read [AGENTS.md](AGENTS.md) for contributor rules and [docs/API.md](docs/API.md) for the implemented API. Use core imports first and dynamic imports for optional transports/plugins. The [getting started guide](docs/GETTING_STARTED.md) has a working MessageChannel pair; [native/README.md](native/README.md) covers the Swift and AndroidX host adapters.

RPC is `request(peerId, handlerName, payload)`. A remote signal listener reads `event.data.payload`, with its bound peer ID at `event.data.source`. `emit()` is local. Configure explicit bus and transport origins and use channel-bound identities. Validation hook failure stops processing. `destroy()` closes attached transports and registered resources.

Run `bun run build`, `bun run test`, `bun run test:types`, `bun run test:e2e` and `bun run test:integration`. Benchmarks are repeated and correctness-checked; use `bun run bench`, `bun run bench:bun`, `bun run bench:browser`. Report evidence and limits from [docs/BENCHMARKS.md](docs/BENCHMARKS.md) and [docs/AUDIT.md](docs/AUDIT.md), without fixed throughput promises, independent security ratings or claims of universal leadership.
