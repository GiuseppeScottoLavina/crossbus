# Worker RPC optimization — 0.1.4 development candidate

This study compares a frozen 0.1.3 runtime with the unreleased 0.1.4 candidate. It measures individual RPCs with the existing default security/resource checks. It does not establish a universal performance lead or qualify iOS/Android, Safari or Firefox. Both exact bundles and source snapshots are retained under [benchmarks/worker-rpc](https://github.com/giuseppescottolavina/crossbus/tree/master/benchmarks/worker-rpc).

At 64 concurrent 1 KiB calls, standard Chrome Worker throughput has a paired median ratio of 1.15× (1.09–1.24); compact has 1.21× (1.13–1.41). Same-page standard Chrome improves across the three tested concurrency levels. Worker standard plus async hooks at 64 calls is mixed (0.98× (0.93–1.05)). Node/Bun show no general gain, and the guard matrix retains a Bun empty-payload regression and a Chrome Worker 64 KiB regression. Tail latency also worsens in some cases. The candidate increases minified gzip size by 822 bytes. These tradeoffs rule out a blanket speedup claim.

## Changes and CPU evidence

Baseline CPU profiles cover a real Chrome module Worker, 1/16/64 concurrent calls, 1/64 KiB text and synchronous/asynchronous-hook configurations. Each case warms up 4,096 checked calls and samples another 32,768. Both endpoint profiles retain idle and GC samples. At 1 KiB / 64 calls, native UUID generation is a visible cost; the monolithic message-handler frame also includes native lazy deserialization. Self-time samples are diagnostic, not exact native-operation costs or uninstrumented throughput.

The candidate consumes 16 fresh Web Crypto bytes per UUID from 2,048-byte refills and builds canonical UUID v4 strings from numeric code units. The initial concatenating-string formatter showed mixed RPC results and was replaced before this study; those provisional timings are excluded. Node/Bun keep their native UUID path. A separate [UUID diagnostic](https://github.com/giuseppescottolavina/crossbus/tree/master/experiments/worker-rpc/uuid-probe.js) measures formatting/checksum overhead too; it cannot substitute for RPC measurements.

The same candidate fixes serialized MessageChannel/PostMessage input, transfer-list ownership in JSON mode, typed-view transfer discovery and shadowed buffer-budget properties. Default transport encoding remains structured clone with automatic transfer disabled. Timed text workloads do not measure binary transfer performance, the JSON fallback or a change in ownership semantics. Regression tests exercise those fixes separately with valid RPCs, rejected protected handlers and real Chrome Workers/windows.

Inspection of the pinned competitor sources explains some remaining costs: birpc creates a 21-character Math.random-based call ID and returns a short record containing the same ID; Penpal generates one UUID for a call and reuses it for the reply. CrossBus uses a counter/timestamp request ID and generates a fresh UUID for the response envelope, in addition to carrying the original request ID. It builds immutable envelopes and enforces payload/pending budgets, bound-peer response matching and handler checks. Pooling removes repeated Web Crypto provider calls but keeps that protocol and those checks. Native cloning, timers, Promise settlement and Worker scheduling remain. This source-level diagnosis does not assign an exact fraction of the speed gap to each feature; all compared module hashes are recorded in the datasets.

## Method

Apple M1 Max, macOS arm64. Node v24.15.0; Bun 1.3.14; HeadlessChrome/155.0.8059.79 (headless). Node/Bun and same-page Chrome use two real MessagePorts in one event loop. Worker rows use an actual module Worker; startup is excluded and scheduling is included.

Three fresh baseline/candidate process pairs per runtime alternate variant order. Primary cases: 4,096 warmup calls, nine samples of 4,096 checked calls and 128 separately sampled burst-completion RTTs per case. Guard cases: 2,048 warmup calls, five samples of 2,048 and the same RTT sample count. Library order rotates across samples/process pairs. Distinct preallocated member objects carry an ASCII text field (sizes exclude the envelope). Every scalar/full text, response count and exact remote invocation count is checked. 25,503,744 calls were checked across 48 datasets.

Ratios below are candidate/baseline paired process medians, then median and observed range across three pairs. Ranges are not confidence intervals. Unchanged controls expose process/JIT variation and do not normalize away unfavorable results. Latency is completion of the whole concurrent burst, not a single-call percentile. Chrome clock quantization and only 128 latency samples limit tail precision; raw p50/p95/p99 values are retained. No profiler, build or test ran concurrently with these timings.

CrossBus uses createSecure(), default payload/pending limits, transport-bound peers and 30-second request timeouts. Comparators are birpc 4.2.0 with its default 60-second timeout and Penpal 8.0.1 with cached methods and an explicit 30-second timeout. Their authorization/validation APIs differ. Both controls use individual calls, native structured clone and the same payload checks in the harness. These are application comparisons, not equivalent security-feature implementations. Comlink 4.4.2 is installed and supported by the harness but is not timed in this matrix; see the earlier [competitor study](COMPETITOR_ANALYSIS.md) for its measured configurations.

## Primary throughput ratios: 1 KiB text

| Runtime | Concurrent | Standard | Standard + async hooks | Compact | Compact + async hooks |
|---|---:|---:|---:|---:|---:|
| node | 1 | 0.99× (0.96–1.07) | 0.99× (0.99–1.00) | 0.99× (0.97–1.01) | 0.99× (0.99–1.02) |
| node | 16 | 0.98× (0.94–1.01) | 0.97× (0.96–1.01) | 0.97× (0.97–1.03) | 1.00× (0.96–1.02) |
| node | 64 | 0.97× (0.93–1.02) | 1.01× (1.00–1.01) | 1.01× (0.97–1.03) | 0.97× (0.95–1.02) |
| bun | 1 | 0.99× (0.94–1.01) | 0.97× (0.94–1.01) | 0.98× (0.91–1.05) | 0.96× (0.96–1.04) |
| bun | 16 | 0.99× (0.98–1.01) | 1.00× (0.98–1.04) | 1.01× (1.01–1.03) | 1.00× (1.00–1.04) |
| bun | 64 | 0.99× (0.99–1.03) | 1.01× (1.01–1.04) | 1.02× (1.00–1.03) | 0.95× (0.95–1.00) |
| chrome | 1 | 1.08× (1.04–1.23) | 1.06× (1.04–1.08) | 1.11× (1.08–1.14) | 1.11× (1.07–1.16) |
| chrome | 16 | 1.13× (1.10–1.15) | 1.10× (1.00–1.14) | 1.14× (1.09–1.15) | 1.09× (1.09–1.13) |
| chrome | 64 | 1.08× (1.04–1.11) | 1.07× (1.07–1.10) | 1.10× (1.06–1.10) | 1.10× (1.09–1.12) |
| chrome-worker | 1 | 1.08× (1.04–1.10) | 1.06× (1.02–1.07) | 1.09× (1.04–1.14) | 1.08× (1.07–1.08) |
| chrome-worker | 16 | 1.08× (1.07–1.10) | 1.10× (1.07–1.16) | 1.12× (1.06–1.29) | 1.12× (1.07–1.17) |
| chrome-worker | 64 | 1.15× (1.09–1.24) | 0.98× (0.93–1.05) | 1.21× (1.13–1.41) | 1.22× (1.02–1.24) |

## Candidate absolute throughput: 64 concurrent, 1 KiB

Median across three candidate process medians, checked calls/second. Feature differences above still apply.

| Runtime | Standard | Compact | birpc cached | Penpal + timeout |
|---|---:|---:|---:|---:|
| node | 148,570 | 183,455 | 207,228 | 188,483 |
| bun | 94,407 | 162,471 | 126,904 | 111,392 |
| chrome | 82,414 | 87,335 | 106,390 | 96,150 |
| chrome-worker | 134,737 | 141,241 | 148,945 | 139,320 |

## Unchanged controls: primary throughput ratios

| Runtime | Concurrent | birpc | Penpal + timeout |
|---|---:|---:|---:|
| node | 1 | 0.99× (0.96–1.01) | 1.01× (1.00–1.03) |
| node | 16 | 1.00× (1.00–1.01) | 0.94× (0.88–1.03) |
| node | 64 | 1.02× (1.00–1.07) | 1.00× (0.97–1.02) |
| bun | 1 | 0.98× (0.96–1.02) | 0.98× (0.96–0.99) |
| bun | 16 | 1.00× (0.99–1.02) | 1.02× (0.99–1.03) |
| bun | 64 | 0.99× (0.99–1.00) | 0.99× (0.99–1.00) |
| chrome | 1 | 0.96× (0.95–1.07) | 0.99× (0.94–1.04) |
| chrome | 16 | 1.03× (0.99–1.07) | 1.07× (1.00–1.16) |
| chrome | 64 | 1.05× (1.01–1.05) | 1.04× (0.99–1.05) |
| chrome-worker | 1 | 1.03× (1.01–1.07) | 1.04× (0.97–1.04) |
| chrome-worker | 16 | 1.01× (0.95–1.13) | 1.05× (0.96–1.13) |
| chrome-worker | 64 | 0.89× (0.89–0.95) | 0.98× (0.95–1.11) |

## Guards: empty and 64 KiB text

All cases and negative ratios are retained. These cases use fewer samples; compare their control ranges before attributing changes to the candidate.

| Runtime | Text bytes | Concurrent | Standard | Standard + hooks | birpc control | Penpal control |
|---|---:|---:|---:|---:|---:|---:|
| node | 0 | 1 | 1.01× (1.00–1.02) | 1.02× (0.98–1.02) | 1.00× (0.99–1.02) | 0.98× (0.96–1.04) |
| node | 0 | 64 | 0.97× (0.95–1.05) | 0.98× (0.96–1.00) | 1.01× (0.98–1.07) | 0.97× (0.96–1.01) |
| node | 65536 | 1 | 1.01× (0.95–1.04) | 0.98× (0.97–1.02) | 1.01× (1.00–1.03) | 1.00× (0.98–1.03) |
| node | 65536 | 64 | 0.99× (0.95–0.99) | 1.01× (0.96–1.05) | 0.97× (0.96–1.01) | 1.00× (0.98–1.04) |
| bun | 0 | 1 | 1.02× (1.00–1.04) | 0.99× (0.96–1.01) | 1.01× (1.01–1.06) | 1.01× (0.98–1.02) |
| bun | 0 | 64 | 0.89× (0.89–1.00) | 1.04× (0.99–1.10) | 0.94× (0.91–0.99) | 1.00× (0.98–1.03) |
| bun | 65536 | 1 | 0.99× (0.98–1.00) | 1.01× (0.98–1.01) | 1.00× (1.00–1.01) | 1.00× (1.00–1.00) |
| bun | 65536 | 64 | 1.00× (0.99–1.02) | 1.00× (1.00–1.01) | 1.00× (1.00–1.01) | 1.01× (0.98–1.01) |
| chrome | 0 | 1 | 1.06× (1.05–1.15) | 1.06× (1.05–1.08) | 1.00× (0.96–1.02) | 0.99× (0.96–0.99) |
| chrome | 0 | 64 | 1.07× (1.06–1.11) | 1.04× (1.04–1.08) | 0.95× (0.94–1.00) | 1.01× (0.96–1.01) |
| chrome | 65536 | 1 | 1.00× (0.98–1.00) | 1.01× (1.00–1.02) | 0.98× (0.98–0.99) | 0.99× (0.97–1.01) |
| chrome | 65536 | 64 | 1.00× (0.99–1.03) | 1.02× (0.99–1.03) | 1.00× (0.98–1.01) | 1.01× (0.98–1.04) |
| chrome-worker | 0 | 1 | 1.05× (1.02–1.07) | 1.02× (1.00–1.03) | 1.00× (0.99–1.02) | 1.00× (0.99–1.02) |
| chrome-worker | 0 | 64 | 1.16× (1.16–1.18) | 1.11× (1.10–1.25) | 0.98× (0.87–0.99) | 1.02× (0.97–1.02) |
| chrome-worker | 65536 | 1 | 1.03× (1.02–1.03) | 1.02× (1.01–1.09) | 0.99× (0.74–1.02) | 1.00× (1.00–1.00) |
| chrome-worker | 65536 | 64 | 0.96× (0.94–1.04) | 0.99× (0.99–1.01) | 1.02× (1.00–1.04) | 0.94× (0.91–0.99) |

## Primary burst p99: 64 concurrent, 1 KiB

Median of each process's observed p99, milliseconds. These three-process summaries do not pool latency distributions.

| Runtime | Standard baseline → candidate | Hooks baseline → candidate |
|---|---:|---:|
| node | 0.61 → 0.69 | 0.65 → 1.19 |
| bun | 1.42 → 1.43 | 1.82 → 1.93 |
| chrome | 1.60 → 1.90 | 2.40 → 2.30 |
| chrome-worker | 2.30 → 1.30 | 2.50 → 3.50 |

## Size and reproducibility

Minified main bundle: 60,260 → 62,953 bytes raw; 18,166 → 18,988 bytes gzip level 9. These are minified artifacts; package root imports resolve to the unminified ESM/CJS entries. Bundle size is not transport throughput.

Run each command sequentially, on an otherwise idle machine:

```sh
bun run build
node experiments/worker-rpc/isolated.js --runtime chrome --worker --profile primary
node experiments/worker-rpc/isolated.js --runtime chrome --profile primary
node experiments/worker-rpc/isolated.js --runtime node --profile primary
node experiments/worker-rpc/isolated.js --runtime bun --profile primary
# Repeat all four selections with --profile guard.
node experiments/worker-rpc/report.js
```

The coordinator deliberately measures the frozen baseline/candidate snapshots, not whichever dist was most recently built. To measure new code, explicitly replace the candidate snapshot and manifest, collect a complete new matrix and rerun the verifier. The [report generator](https://github.com/giuseppescottolavina/crossbus/tree/master/experiments/worker-rpc/report.js) verifies artifact/source/dependency hashes, counts, raw samples, latency percentiles, all 48 timing datasets, 24 diagnostic profiles and three UUID diagnostics. Baseline profiles map their historical lockfile to an archived copy. Dirty-tree metadata reflects uncommitted measured inputs; exact bytes are identified by SHA-256. Published v0.1.3 and its npm archive are unchanged.
