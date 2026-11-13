# Reproducible performance measurements

Run after building, with other benchmark/test workloads stopped:

```sh
bun run build
bun run bench             # Node
bun run bench:bun         # Bun
bun run bench:browser     # installed Chrome, headless
bun run bench:memory      # Node --expose-gc, lifecycle/heap observations
node tests/benchmarks/sizes.js
bun run bench:paired     # same-process diagnostic
bun run bench:rpc        # versioned Comlink MessageChannel comparison
node tests/benchmarks/isolated.js --runtime node
node tests/benchmarks/isolated.js --runtime bun
node tests/benchmarks/isolated.js --runtime chrome
bun run bench:report     # after collecting every runtime and refreshing sizes/memory
```

The runner writes `benchmarks/verified-node.json`, `verified-bun.json`, `verified-chrome.json` and `sizes.json`. Each performance report records its runtime, platform/CPU, dependency versions, Git revision, dirty-tree state and SHA-256 hashes of the measured artifacts and workload. The primary optimization comparison uses `--paired --variant baseline` and `--paired --variant candidate` in three fresh process pairs per runtime, alternating process order; explicit `--output` filenames retain each run. Add `--browser` for fresh Chrome instances or run the same command with Bun. `bun run bench:report` verifies current hashes and regenerates the snapshot from all retained measurements. `verified-node-before-fast-removal.json` is an earlier audit run retained for context, not an equivalent before/after experiment: the workload and machine load differed. No improvement percentage is derived from it.

Local dispatch tests use 0, 1, 10 and 100 listeners, a 10 KiB payload-reference workload and a subscription/removal cycle. Handlers perform observable counter/checksum updates, verified outside the timed loop. Each case calibrates its batch size, warms the engine, rotates execution order across libraries and records nine samples with median/min/max. The iteration cap means very fast cases may be shorter than the target duration. Zero-listener cases have no observable callback work and are diagnostic only. Results measure the tested APIs and semantics, not all capabilities of a library.

CrossBus's full EventEmitter is measured through `onFast()`/`emitSync()` for raw synchronous callbacks, not its asynchronous event-envelope API. Fast and nano emitters are measured separately. EventEmitter3, mitt and nanoevents are development-only comparison dependencies; their exact versions are in each report. A 10 KiB local payload is passed by reference: it does not measure serialization, transfer or byte throughput.

RPC tests use actual MessageChannel endpoints with structured cloning and full CrossBus request/response processing. Each payload size has 100 warmup calls and 1,000 measured sequential round trips, with payload correctness checks and p50/p95/p99 latency. Sizes describe the ASCII text field, excluding envelope overhead. Signal-routing tests await each operation and verify all send callbacks, using synchronous mock peers; these are not cross-context signal delivery measurements.

Bundle size measurements distinguish the unminified entry actually selected by the export map from explicitly minified artifacts. gzip uses level 9. Sizes include the generated license banner and source-map reference. They are whole-file sizes, not consumer tree-shaken bundle sizes.

These runs do not establish performance on Safari, Firefox, mobile WebViews, physical devices, network transports or every application workload. Headless Chrome results do not establish interaction/rendering performance. No independent security certification, overall completeness ranking or universal fastest-library claim is made.

Older JSON under `tests/benchmarks/` and `tests/perf/` is marked `historical-unverified`. Earlier harnesses had a nine-listener test labelled ten, fixed ordering, single short samples, empty callbacks or missing awaits. Their published rankings, coverage and size claims have been withdrawn. Legacy runner filenames now forward to the verified suite.

See [AUDIT.md](AUDIT.md) for the current local validation status and outstanding qualification work.

## Current 0.1.3 candidate study

The later [explicit RPC grouping experiment](RPC_BATCHING.md) retains separate raw data and adapters outside the npm export map. It includes a strict transparent negative control, paired fresh processes, real Workers, latency, native-send counts, payload/hook guard conditions and teardown checks. Its bulk operation has different object-graph semantics from independent calls; it does not change the approved runtime or establish an equivalent competitor bulk comparison.

See [competitor source analysis and current measurements](COMPETITOR_ANALYSIS.md). That study uses the published 0.1.2 runtime as its baseline, current pinned Comlink/birpc/Penpal/nanoevents/mitt/EventEmitter3 versions, three fresh process pairs per runtime and a separate real-Worker comparison. Its artifacts are retained separately under `benchmarks/optimization-study/`.

The snapshot below records the earlier optimization round; it is historical evidence, not the current candidate's ranking.

## Measured snapshot — 12 November 2026

These measurements were collected from the pre-release 0.1.1 working build. Its exact candidate bundles are preserved in benchmarks/measured-0.1.1/ and checked against the original hashes. Version 0.1.2 adds the Node 18 UUID fallback and retained license/version banners; this historical snapshot does not time that final archive. The separate 0.1.3 competitor study includes the exact published 0.1.2 runtime as its baseline. Size measurements below describe the build recorded in that snapshot.

Apple M1 Max, darwin arm64. Local dispatch uses raw callbacks and preallocated payloads; values below are medians of nine samples, in millions of emits per second.

| Runtime | CrossBus emitSync, 1 listener | nanoevents, 1 listener | CrossBus emitSync, 10 listeners | nanoevents, 10 listeners |
|---|---:|---:|---:|---:|
| Node v24.15.0 | 59.32 | 73.66 | 30.55 | 14.90 |
| Bun 1.3.14 | 98.28 | 112.84 | 51.51 | 29.94 |
| HeadlessChrome/155.0.8059.79 | 67.98 | 68.09 | 32.67 | 12.96 |

Full JSON includes 0/100 listeners, registration/removal, CrossBus fast/nano, EventEmitter3 and mitt. This is a versioned workload comparison, not a universal ranking. The local emitter algorithm was retained after trial alternatives failed to show a stable advantage.

## Optimization before/after

The preserved pre-change bundles are in `benchmarks/before-optimization/`. Primary comparisons use **three pairs of fresh processes per runtime**, alternating process order; each process records nine samples after warmup. All payload limits, peer checks and hook behavior remain enabled. The summary is generated in `benchmarks/optimization-summary.json`.

| Runtime | Workload | After / before, median | Observed range across process pairs |
|---|---|---:|---:|
| Node v24.15.0 | pending:create+resolve | 2.27× | 2.15–2.31× |
| Node v24.15.0 | signal:10-peers | 1.19× | 1.19–1.22× |
| Node v24.15.0 | rpc:direct | 1.67× | 1.67–1.70× |
| Node v24.15.0 | rpc:MessageChannel | 1.16× | 1.14–1.28× |
| Node v24.15.0 | rpc:MessageChannel+hooks | 1.14× | 1.10–1.15× |
| Bun 1.3.14 | pending:create+resolve | 1.80× | 1.76–1.85× |
| Bun 1.3.14 | signal:10-peers | 1.32× | 1.26–1.34× |
| Bun 1.3.14 | rpc:direct | 1.57× | 1.57–1.65× |
| Bun 1.3.14 | rpc:MessageChannel | 1.19× | 1.14–1.23× |
| Bun 1.3.14 | rpc:MessageChannel+hooks | 1.20× | 1.17–1.23× |
| HeadlessChrome/155.0.8059.79 | pending:create+resolve | 1.27× | 1.24–1.35× |
| HeadlessChrome/155.0.8059.79 | signal:10-peers | 1.13× | 1.06–1.16× |
| HeadlessChrome/155.0.8059.79 | rpc:direct | 1.17× | 1.07–1.24× |
| HeadlessChrome/155.0.8059.79 | rpc:MessageChannel | 1.09× | 1.07–1.14× |
| HeadlessChrome/155.0.8059.79 | rpc:MessageChannel+hooks | 1.07× | 1.04–1.08× |

These are observed throughput ratios, not guarantees or statistical confidence intervals. `rpc:direct` uses synchronous in-memory forwarding and excludes structured cloning; MessageChannel tests use actual port delivery. The retained same-process paired diagnostic can show JIT identity bias even for identical nano code; it is not the primary improvement estimate. Unchanged emitter controls are present in the isolated-process reports.

## Versioned MessageChannel RPC comparison

CrossBus and Comlink use identical structured-cloned echo payloads, 100 warmup calls and nine batches of 1,000 verified responses, rotating library order. Both port endpoints run in one event loop; this excludes worker/iframe startup and scheduling. Comlink is measured with ordinary proxy access and with its method cached. CrossBus keeps default request/payload limits. The APIs and guarantees differ.

For a 1,024-byte text field, medians of batch throughput:

| Runtime | CrossBus, calls/s | Comlink, calls/s | Comlink cached method, calls/s |
|---|---:|---:|---:|
| Node v24.15.0 | 100,540 | 90,701 | 94,673 |
| Bun 1.3.14 | 78,335 | 99,095 | 101,376 |
| HeadlessChrome/155.0.8059.79 | 70,423 | 74,627 | 79,365 |

Comlink version: **4.4.2**. Reports include empty and 64 KiB text fields, raw samples, dependency versions and hashes. Method usage follows the [Comlink API](https://github.com/GoogleChromeLabs/comlink#api). No overall lead over every messaging library has been established.

## RPC latency and bundle sizes

Actual sequential MessageChannel round trips with a 1,024-byte text field:

| Runtime | p50, ms | p99, ms |
|---|---:|---:|
| Node v24.15.0 | 0.013 | 0.039 |
| Bun 1.3.14 | 0.012 | 0.026 |
| HeadlessChrome/155.0.8059.79 | below timer resolution | 0.100 |

Chrome timer quantization can produce zero-duration individual samples; these do not mean zero latency. The comparative RPC benchmark uses batch timing to avoid this per-call resolution limit. Whole-file sizes below use gzip level 9:

| Artifact | Raw bytes | gzip bytes |
|---|---:|---:|
| `dist/crossbus.js` | 233,134 | 47,799 |
| `dist/crossbus.min.js` | 55,271 | 16,748 |
| `dist/crossbus.core.min.js` | 31,674 | 10,461 |
| `dist/nano.js` | 963 | 467 |
| `dist/nano.min.js` | 535 | 330 |

The export map selects `crossbus.js` and `nano.js`. Minified file sizes are not default export sizes. Consumer tree-shaking size was not measured.

## Memory and pending-request lifecycle

Seven measured rounds create 200 buses, each with ten peers and one unanswered request, after a warmup round. Every round cancelled all 200 requests and returned timeout resources from 200 to zero. Live cohort heap deltas ranged from 2,456,080 to 2,530,504 bytes. Post-cleanup deltas are retained in the JSON, including allocator/JIT noise; these are not exact per-object sizes or proof of universal absence of leaks.
