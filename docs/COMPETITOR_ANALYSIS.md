# Competitor source review and optimization study

This study compares the published CrossBus 0.1.2 runtime with the 0.1.3 candidate on the same machine. It measures the installed versions below, not an unspecified latest release. Runtime, source/bundle hashes, exact versions, raw samples and dirty-tree status are retained with each result.

## Code inspected

| Library | Installed version | Inspected implementation | Relevant design |
|---|---|---|---|
| Comlink | 4.4.2 | `dist/esm/comlink.mjs`; [upstream code](https://github.com/GoogleChromeLabs/comlink/blob/main/src/comlink.ts) | Remote-object proxies, argument/return wire conversion, a pending Map and no default per-call timeout. Repeated `remote.echo` property access constructs a method proxy; the cached variant avoids that path. |
| birpc | 4.2.0 | `dist/index.mjs`; [upstream repository](https://github.com/antfu-collective/birpc) | Small request/reply records, a pending Map, a 60-second default timeout and a generated call closure on proxy property access. It accepts application-supplied transport/serialization functions. |
| Penpal | 8.0.1 | `dist/penpal.mjs`; [upstream repository](https://github.com/Aaronius/penpal) | Connection handshake, messenger validation and method-path proxies. Calls have no deadline unless CallOptions supplies one. Both cached/no-timeout and cached/30-second-timeout cases are measured. |
| nanoevents | 10.0.0 | `index.js`; [upstream repository](https://github.com/ai/nanoevents) | A small callback-array loop; unsubscribe filters to a new array. Its variadic API differs from CrossBus's single-payload fast emitters. |
| mitt | 3.0.1 | `dist/mitt.mjs`; [upstream code](https://github.com/developit/mitt/blob/main/src/index.ts) | Map-backed registration and copied callback arrays during dispatch, with wildcard handling. |
| EventEmitter3 | 5.0.4 | `index.js` and `dist/eventemitter3.esm.js`; [upstream code](https://github.com/primus/eventemitter3/blob/5.0.4/index.js) | Stores a single listener separately from multiple-listener arrays; supports context, once and multiple arguments. |

These APIs have different guarantees. Proxy traversal, origin/authentication boundaries, payload budgets, timeout policy, listener semantics and startup costs must be considered separately from a throughput number.

## What changed and why

- Specialized message builders freeze their own payload records directly and reuse immutable empty metadata. The generic builder still copies caller-owned payload/metadata before freezing. No public envelope field was removed.
- Requests avoid constructing debug text when logging is disabled. Completed inbound responses use a fulfilled dispatch result rather than allocating another asynchronous processing/catch chain. Hooks still run in order, failures still reject and pending responses still match their bound peer.
- The payload budget walks graphs iteratively and allocates its seen/work collections only for nested objects. It now counts a view's full backing store and SharedArrayBuffer storage; deep graphs do not exhaust the JavaScript call stack. These are correctness improvements as well as implementation changes.
- Local emitter algorithms retain their previous callback-array semantics, covered by additional recursive/mutation tests. A single-listener empty-array reuse trial was discarded after repeated Node measurements showed a registration/removal regression.
- WebSocket connection attempts settle on failures/early closure, share concurrent attempts, honor subprotocols and retain serialized, count-bounded offline snapshots. Obsolete handler cleanup cannot remove newer registrations. Missing origins in runtimes without location are not implicitly trusted, and explicitly empty routing targets never become broadcasts.
- Buffered streams use a read cursor with bounded compaction. Binary chunks are encoded independently; invalid chunk sizes are rejected, source peers own their streams, and manager destruction releases readers.
- Compact MessageChannel encoding is opt-in. It removes repeated property names and reconstructible envelope structure from standard signal/RPC packets. Custom metadata and extension fields fall back to the standard representation. Decoded packets pass through the same validation, authorization and limits. Application data graphs are structured-cloned; compact wrapper objects are reconstructed, so raw envelope-reference identity requires standard mode. Receivers must support this format; it is not negotiated automatically.

Inspection suggests that cloning the larger CrossBus envelope, its immutable record construction and its payload/request checks contribute to its gap on some workloads. A local Node CPU profile also identified send/clone work, envelope construction, graph accounting and request tracking. This is a diagnosis of tested paths, not proof that one feature explains the entire difference. The compact/default comparison isolates a wire-format choice while retaining the bus checks.

Counter-based message IDs and a WeakSet ownership shortcut were trialled and rejected after diagnostics failed to show a consistent benefit. The retained implementation preserves UUID generation for signal/response IDs and does not add per-message ownership tracking. Two additional Promise/await variants were rejected after isolated Chrome comparisons failed to remove the observed hook-path regression.

## Reproduction

Build once, stop other tests/benchmarks, then run one command at a time:

```sh
bun run build
bun run bench:study
bun run bench:study:bun
bun run bench:study:browser
bun run bench:study:workers
bun run bench:study:memory
bun run bench:study:report
```

Each runtime comparison alternates baseline/candidate process order across three fresh pairs. Each process warms the cases and records nine samples with rotating library order. RPC uses identical echo payloads, complete response checks and remote handler invocation counts, 0/1,024/65,536-byte text fields and 1/16 in-flight calls. The cross-thread study uses real Chrome module Workers and transferred MessagePorts: scheduling is included, startup and handshakes are excluded. The same-event-loop study isolates more of the protocol/clone overhead. Neither represents a network server, Safari or a physical mobile WebView.

Emitter callbacks update observable counters and checksums. Subscription/removal checks verify that no listener remains. Local emission passes references; it is not a byte-copy benchmark. The buffered-stream case measures enqueue/collect, not transport delivery.

Preserved baseline/candidate bundles live in `benchmarks/optimization-study/`. The report generator verifies the recorded hashes before generating results. Observed ranges are process-pair variation, not statistical confidence intervals. Overall fastest-library or completeness leadership is not inferred.

## Measured results

Apple M1 Max; darwin arm64. Collected on 2026-11-12. Runtime versions: Node v24.15.0, Bun 1.3.14, HeadlessChrome/155.0.8059.79. Bun revision: 191edc04ab1ff64d423e4fae9a0d5ee00ee7f3dd. Chrome is headless.

The frozen candidate is version **0.1.3**, unreleased at measurement time and subsequently published. These are historical results, not measurements of the current development version; see the [0.1.4 Worker RPC study](WORKER_RPC.md) for the next comparison. The baseline is byte-identical to the minified runtime/nano files in the published 0.1.2 archive. The summary and all process samples are in [optimization-study](https://github.com/GiuseppeScottoLavina/crossbus/tree/perf/verified-0.1.3/benchmarks/optimization-study). The verifier checks the frozen candidate source archive against its original source hashes, rather than requiring a later checkout to equal 0.1.3. Metadata records the previous HEAD and dirty status rather than pretending these files were committed at measurement time.

### Interpretation

For the 1 KiB text field, the standard RPC path improved on Node/Bun. Chrome showed mixed results, including regressions; optional compact encoding was particularly unfavorable for large payloads in the real-Worker test. This candidate does not establish a browser RPC speedup or an overall lead over the competitors. Additional lifecycle/security fixes and the larger bundle are explicit tradeoffs. The stream-buffer workload improved across the measured engines, with a much larger effect on Node; it is a local enqueue/collect result.

### RPC before/after

Candidate/baseline throughput; median of three paired process ratios, with the observed minimum–maximum in parentheses. Compact is compared with baseline standard encoding. Every row uses the same echo data and concurrency.

| Runtime/topology | Text bytes | In flight | Standard | Standard + hooks | Compact | Compact + hooks |
|---|---:|---:|---:|---:|---:|---:|
| node | 0 | 1 | 1.13× (1.12–1.16) | 1.17× (1.08–1.18) | 1.30× (1.25–1.33) | 1.30× (1.19–1.31) |
| node | 1024 | 1 | 1.15× (1.07–1.18) | 1.13× (1.02–1.19) | 1.29× (1.25–1.33) | 1.29× (1.18–1.30) |
| node | 65536 | 1 | 1.03× (0.98–1.10) | 1.05× (1.00–1.11) | 1.09× (1.04–1.17) | 1.09× (1.08–1.17) |
| node | 0 | 16 | 1.10× (1.02–1.14) | 1.10× (1.08–1.15) | 1.34× (1.29–1.39) | 1.30× (1.29–1.36) |
| node | 1024 | 16 | 1.07× (1.00–1.10) | 1.03× (0.98–1.14) | 1.21× (1.19–1.26) | 1.24× (1.16–1.26) |
| node | 65536 | 16 | 1.02× (0.97–1.09) | 0.95× (0.93–1.03) | 1.11× (1.09–1.11) | 1.01× (0.98–1.09) |
| bun | 0 | 1 | 1.18× (1.15–1.21) | 1.06× (0.98–1.16) | 1.50× (1.45–1.53) | 1.38× (1.32–1.51) |
| bun | 1024 | 1 | 1.08× (1.03–1.15) | 1.10× (0.98–1.10) | 1.42× (1.37–1.53) | 1.39× (1.36–1.53) |
| bun | 65536 | 1 | 1.02× (1.00–1.02) | 1.03× (1.02–1.04) | 1.41× (1.34–1.44) | 1.39× (1.39–1.40) |
| bun | 0 | 16 | 1.13× (1.01–1.16) | 1.10× (1.08–1.15) | 1.58× (1.47–1.59) | 1.49× (1.43–1.50) |
| bun | 1024 | 16 | 1.17× (1.12–1.22) | 1.03× (1.01–1.04) | 1.55× (1.54–1.70) | 1.50× (1.45–1.60) |
| bun | 65536 | 16 | 1.02× (0.99–1.02) | 0.99× (0.96–1.03) | 1.48× (1.41–1.51) | 1.42× (1.41–1.45) |
| chrome | 0 | 1 | 1.10× (1.01–1.10) | 0.89× (0.83–0.93) | 1.16× (1.11–1.18) | 1.03× (1.02–1.15) |
| chrome | 1024 | 1 | 0.99× (0.93–1.01) | 0.98× (0.93–0.99) | 1.01× (0.97–1.02) | 1.01× (0.99–1.06) |
| chrome | 65536 | 1 | 0.97× (0.94–1.11) | 0.99× (0.93–1.06) | 0.96× (0.94–1.01) | 0.97× (0.87–1.01) |
| chrome | 0 | 16 | 1.02× (0.97–1.05) | 0.97× (0.87–0.97) | 1.06× (1.05–1.11) | 1.02× (1.01–1.06) |
| chrome | 1024 | 16 | 0.91× (0.91–1.06) | 0.96× (0.89–1.05) | 1.05× (0.96–1.07) | 0.97× (0.97–1.11) |
| chrome | 65536 | 16 | 0.98× (0.96–1.01) | 0.98× (0.98–1.01) | 0.94× (0.93–0.97) | 0.95× (0.94–0.95) |
| chrome Worker | 0 | 1 | 1.01× (0.97–1.04) | 1.01× (0.99–1.02) | 1.02× (1.01–1.06) | 1.01× (1.00–1.03) |
| chrome Worker | 1024 | 1 | 1.03× (1.00–1.15) | 1.01× (0.99–1.14) | 1.03× (1.00–1.13) | 1.02× (1.01–1.13) |
| chrome Worker | 65536 | 1 | 1.00× (0.97–1.01) | 1.04× (0.99–1.09) | 0.78× (0.72–0.92) | 0.95× (0.69–0.97) |
| chrome Worker | 0 | 16 | 1.01× (0.99–1.07) | 1.00× (0.98–1.14) | 1.04× (1.04–1.13) | 1.03× (1.00–1.19) |
| chrome Worker | 1024 | 16 | 0.90× (0.89–1.06) | 1.04× (0.94–1.08) | 1.05× (0.96–1.09) | 1.03× (0.95–1.08) |
| chrome Worker | 65536 | 16 | 1.02× (0.97–1.04) | 0.99× (0.95–0.99) | 0.96× (0.93–0.96) | 0.93× (0.88–0.95) |

### Competitor throughput

Calls/s for the 1,024-byte field, median of three process medians. A ratio of these medians can differ from the median of paired process ratios above. All payload sizes and ordinary/cached proxy variants remain in the raw JSON; this table uses the cached competitors and includes Penpal with and without a per-call timeout. CrossBus uses its default limits and 30-second request timeout. These are measured API paths with different features, not interchangeable products.

| Runtime/topology | In flight | 0.1.2 standard | 0.1.3 standard | 0.1.3 compact | Comlink cached | birpc cached | Penpal cached | Penpal + timeout |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| node | 1 | 96,990 | 111,143 | 124,601 | 95,207 | 147,194 | 143,459 | 129,538 |
| node | 16 | 133,383 | 141,615 | 167,838 | 115,250 | 198,150 | 189,501 | 177,559 |
| bun | 1 | 78,660 | 85,346 | 112,091 | 99,791 | 113,737 | 101,956 | 99,285 |
| bun | 16 | 90,765 | 105,981 | 142,038 | 128,252 | 140,850 | 130,784 | 124,582 |
| chrome | 1 | 73,669 | 69,660 | 72,624 | 78,168 | 96,604 | 95,701 | 85,333 |
| chrome | 16 | 80,000 | 73,669 | 81,270 | 86,050 | 101,386 | 105,567 | 92,252 |
| chrome Worker | 1 | 32,201 | 35,930 | 36,056 | 41,290 | 46,758 | 48,075 | 44,329 |
| chrome Worker | 16 | 89,825 | 83,934 | 92,252 | 123,373 | 126,420 | 138,378 | 142,222 |

### Local emitter and stream workloads

Candidate/baseline throughput ratios. Emission passes object references and executes observable callbacks; buffered stream results measure enqueue/collect in memory, not transport or byte-copy throughput.

| Runtime | API/workload | Listeners | After/before, median (range) |
|---|---|---:|---:|
| node | CrossBus emitSync: emit | 1 | 1.01× (0.97–1.06) |
| node | CrossBus fast: emit | 1 | 1.00× (0.95–1.06) |
| node | CrossBus nano: emit | 1 | 1.00× (0.97–1.06) |
| node | CrossBus emitSync: emit | 10 | 1.00× (0.97–1.04) |
| node | CrossBus fast: emit | 10 | 1.00× (0.95–1.05) |
| node | CrossBus nano: emit | 10 | 1.01× (0.96–1.05) |
| node | CrossBus emitSync: emit | 100 | 1.00× (0.96–1.05) |
| node | CrossBus fast: emit | 100 | 1.00× (0.97–1.04) |
| node | CrossBus nano: emit | 100 | 1.00× (0.98–1.05) |
| node | CrossBus emitSync: subscribe+unsubscribe | 0 | 0.97× (0.96–0.99) |
| node | CrossBus fast: subscribe+unsubscribe | 0 | 0.97× (0.95–1.00) |
| node | CrossBus nano: subscribe+unsubscribe | 0 | 0.96× (0.96–1.00) |
| node | CrossBus stream: buffered text chunks | — | 26.80× (26.25–27.17) |
| bun | CrossBus emitSync: emit | 1 | 0.99× (0.97–1.04) |
| bun | CrossBus fast: emit | 1 | 1.02× (1.00–1.04) |
| bun | CrossBus nano: emit | 1 | 1.02× (1.00–1.03) |
| bun | CrossBus emitSync: emit | 10 | 1.00× (0.99–1.01) |
| bun | CrossBus fast: emit | 10 | 1.00× (1.00–1.00) |
| bun | CrossBus nano: emit | 10 | 1.01× (1.00–1.01) |
| bun | CrossBus emitSync: emit | 100 | 0.99× (0.96–1.00) |
| bun | CrossBus fast: emit | 100 | 0.99× (0.96–0.99) |
| bun | CrossBus nano: emit | 100 | 0.99× (0.97–1.00) |
| bun | CrossBus emitSync: subscribe+unsubscribe | 0 | 0.94× (0.91–1.05) |
| bun | CrossBus fast: subscribe+unsubscribe | 0 | 0.94× (0.92–1.00) |
| bun | CrossBus nano: subscribe+unsubscribe | 0 | 0.97× (0.96–1.00) |
| bun | CrossBus stream: buffered text chunks | — | 1.23× (1.22–1.45) |
| chrome | CrossBus emitSync: emit | 1 | 0.98× (0.97–0.99) |
| chrome | CrossBus fast: emit | 1 | 0.99× (0.97–1.00) |
| chrome | CrossBus nano: emit | 1 | 1.00× (0.99–1.00) |
| chrome | CrossBus emitSync: emit | 10 | 1.01× (1.01–1.01) |
| chrome | CrossBus fast: emit | 10 | 1.01× (0.99–1.01) |
| chrome | CrossBus nano: emit | 10 | 1.00× (0.99–1.01) |
| chrome | CrossBus emitSync: emit | 100 | 1.01× (1.00–1.01) |
| chrome | CrossBus fast: emit | 100 | 1.01× (1.00–1.01) |
| chrome | CrossBus nano: emit | 100 | 1.01× (0.99–1.01) |
| chrome | CrossBus emitSync: subscribe+unsubscribe | 0 | 1.01× (1.01–1.04) |
| chrome | CrossBus fast: subscribe+unsubscribe | 0 | 1.00× (0.98–1.03) |
| chrome | CrossBus nano: subscribe+unsubscribe | 0 | 1.01× (1.00–1.04) |
| chrome | CrossBus stream: buffered text chunks | — | 1.22× (1.22–1.26) |

Full competitor emitter results, including 1/10/100 listeners and subscribe/unsubscribe, are retained in the summary and raw reports. Subsample millisecond timing and JIT variation can affect very fast loops; a changed ratio alone does not identify its cause.

### Sizes and lifecycle

Whole minified file sizes; gzip level 9 and Brotli quality 11. These include version/license banners and all exports in the file. The package export map selects unminified main/nano files; consumer tree-shaking sizes were not measured.

| Version/file | Raw bytes | gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| 0.1.2/crossbus.min.js | 55,271 | 16,748 | 14,936 |
| 0.1.2/nano.min.js | 535 | 330 | 315 |
| 0.1.3/crossbus.min.js | 60,260 | 18,166 | 16,161 |
| 0.1.3/nano.min.js | 535 | 330 | 315 |

Each version completed seven measured memory rounds of 200 buses × ten peers × one pending request. All 200 requests were cancelled each round; timeout resources returned from 200 to zero. Live cohort heap delta medians: 2,463,416 bytes (0.1.2), 2,530,616 bytes (0.1.3). Raw post-cleanup deltas, including negative noise, remain in JSON. This does not establish exact object sizes or absence of every leak.

Compact wire is a choice for compatible MessageChannel endpoints. Larger bundles and additional lifecycle/security bookkeeping are visible tradeoffs. Results do not establish a universal fastest library, and competitors can remain ahead for particular runtime/payload/concurrency combinations. Physical iOS/Android WebViews and Safari/Firefox were not measured.
