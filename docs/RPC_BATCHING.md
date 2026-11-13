# Explicit RPC grouping research — 13 November 2026

This is an opt-in prototype outside the npm package and export map. It does not change the approved 0.1.3 runtime, its default wire format, or the existing batch-signals plugin. The exact approved runtime is archived with SHA-256 `a4cbc5b9610d41a4c0d73b7b3221f75084909f7e3e1c9da3613f40a72e5caff3`. Both endpoints must opt into the adapter. There is no automatic capability negotiation.

Explicit groups improve some concurrent echo workloads. Single-call performance does not improve consistently; real Worker gains are smaller and variable. These measurements do not establish a universal performance lead. Competitor results below use individual RPCs; equivalent bulk methods in those libraries were not implemented or measured.

## Why a separate explicit operation

The strict transparent control (batch16/batch64) snapshots each request independently before postponing its native send. That preserves independent-call object graphs, but adds structured clones. Fewer postMessage calls do not necessarily make it faster; the throughput table retains these negative results.

The explicit operation sends 1–64 normal CrossBus request envelopes in one native structured-clone graph, and can group replies already ready in the first microtask checkpoint. Slow replies are sent separately and do not block ready replies. Shared references between group inputs remain shared remotely. Some ready reply graphs may also share references, while later replies do not: applications must not depend on inter-result identity. This is a new value-oriented contract, not a transparent replacement for independent calls.

Each member still uses normal bus payload/pending limits, handler authorization, rate limits, hooks, timeout and transport-bound peer checks. Asynchronous outbound hooks may miss the synchronous grouping window and fall back to individual sends. A native clone failure closes the binding and cancels pending requests to that peer. Groups are not transactions and do not roll back executed handlers.

See the [prototype contract and runnable demo](https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/experiments/rpc-batching/README.md), [implementation](https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/experiments/rpc-batching/group-transport.js), and [regression tests](https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/tests/experiments/rpc-group.test.js). These files are deliberately excluded from npm; no documented package API for grouping is claimed.

## Primary evidence: separate process pairs

Apple M1 Max, macOS arm64; Node v24.15.0, Bun 1.3.14, HeadlessChrome/155.0.8059.79. Chrome is headless. The non-Worker topology uses two real MessagePorts in one process/page; Worker results use an actual module Worker. Payloads contain a 1 KiB ASCII text field, excluding envelope overhead, with distinct preallocated objects per operation.

Three fresh stock/group process pairs per runtime alternate which variant runs first. Each process also measures unchanged birpc/Penpal controls. Within each process: 4,096 warmup calls per case, nine samples of 4,096 calls, rotating library order; cached remote methods, startup excluded. Ratios below divide each paired process's throughput medians; the reported median and range span three pairs. They are observed ranges, not confidence intervals. Controls expose process variation and are not used to normalize away unfavorable results.

| Runtime | Concurrent calls | Group / stock (range) | Unchanged birpc ratio (range) | Unchanged Penpal ratio (range) |
| --- | --- | --- | --- | --- |
| node | 16 | 1.17× (1.16×–1.24×) | 1.01× (0.98×–1.05×) | 1.00× (0.97×–1.00×) |
| node | 64 | 1.34× (1.29×–1.37×) | 0.98× (0.98×–1.01×) | 0.94× (0.93×–1.03×) |
| bun | 16 | 1.69× (1.61×–1.74×) | 1.02× (0.97×–1.02×) | 0.99× (0.99×–1.03×) |
| bun | 64 | 1.91× (1.82×–1.96×) | 0.99× (0.96×–1.01×) | 0.99× (0.98×–1.00×) |
| chrome | 16 | 1.81× (1.69×–1.88×) | 0.99× (0.94×–1.01×) | 1.04× (0.96×–1.08×) |
| chrome | 64 | 2.00× (1.85×–2.06×) | 1.00× (0.93×–1.00×) | 0.98× (0.96×–1.09×) |
| chrome-worker | 16 | 1.21× (0.95×–1.35×) | 1.04× (0.98×–1.05×) | 1.03× (1.00×–1.11×) |
| chrome-worker | 64 | 1.09× (1.04×–1.18×) | 1.09× (0.90×–1.09×) | 0.97× (0.96×–1.04×) |

In the Worker case with 16 concurrent calls, at least one process pair regressed. The 64-call Worker ratios are close enough to observed control movement that they should not be treated as a robust universal acceleration. Node/Bun and same-page Chrome gains are more consistent within this retained sample.

## Complete primary throughput, including negative controls

These separate mixed-configuration processes warm all six cases, rather than isolating stock/group. Each entry is the median of three process medians, in thousands of completed logical RPCs per second. CrossBus cases use standard MessageChannel encoding, default secure bus guards and 30 s timeouts. birpc 4.2.0 uses its default 60 s timeout; Penpal 8.0.1 uses explicit 30 s call timeouts. All receive exactly one application argument and return the same verified echo. Their broader APIs and validation work differ; this is not a claim of equivalent full feature sets or equivalent bulk APIs.

| Runtime | Calls | Stock kRPC/s | Strict16 | Strict64 | Explicit group | birpc | Penpal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| node | 1 | 103.2 | 98.8 | 100.5 | 98.3 | 146.7 | 126.9 |
| node | 16 | 141.5 | 104.5 | 103.9 | 182.5 | 197.2 | 177.6 |
| node | 64 | 145.3 | 104.4 | 109.7 | 200.4 | 200.3 | 186.0 |
| bun | 1 | 80.1 | 76.6 | 77.9 | 78.1 | 104.2 | 90.3 |
| bun | 16 | 95.0 | 73.4 | 74.0 | 153.4 | 127.5 | 112.4 |
| bun | 64 | 97.8 | 75.0 | 80.3 | 183.4 | 134.1 | 115.7 |
| chrome | 1 | 66.6 | 64.0 | 66.2 | 66.7 | 90.2 | 83.6 |
| chrome | 16 | 78.2 | 85.5 | 86.8 | 141.2 | 101.6 | 93.9 |
| chrome | 64 | 75.3 | 84.6 | 88.1 | 155.2 | 100.9 | 93.9 |
| chrome-worker | 1 | 36.9 | 34.9 | 34.7 | 34.5 | 46.1 | 42.0 |
| chrome-worker | 16 | 99.9 | 79.2 | 76.3 | 117.7 | 133.9 | 132.1 |
| chrome-worker | 64 | 117.0 | 113.5 | 84.3 | 138.8 | 162.5 | 142.7 |

## Burst completion latency

Separate from throughput: 128 burst completion RTT samples per condition/process, including grouping and full result verification. Values below are medians of three paired-process percentiles, in milliseconds. They measure the entire group, not an individual request's latency. The JSON summary retains observed ranges and all raw files retain the samples. Browser clock quantization is preserved; sub-millisecond tails are exploratory rather than production latency guarantees.

| Runtime | Calls | Stock p50 / p95 / p99 ms | Group p50 / p95 / p99 ms |
| --- | --- | --- | --- |
| node | 16 | 0.108 / 0.128 / 0.142 | 0.084 / 0.113 / 0.145 |
| node | 64 | 0.421 / 0.484 / 0.533 | 0.324 / 0.470 / 0.536 |
| bun | 16 | 0.158 / 0.234 / 0.252 | 0.091 / 0.134 / 0.159 |
| bun | 64 | 0.601 / 0.737 / 1.604 | 0.322 / 0.407 / 0.747 |
| chrome | 16 | 0.200 / 0.300 / 0.300 | 0.100 / 0.200 / 0.200 |
| chrome | 64 | 0.800 / 1.000 / 1.500 | 0.400 / 0.500 / 1.500 |
| chrome-worker | 16 | 0.100 / 0.200 / 0.300 | 0.100 / 0.200 / 0.400 |
| chrome-worker | 64 | 0.500 / 0.700 / 2.800 | 0.400 / 0.600 / 1.500 |

## Native sends, correctness and lifecycle

Counting starts only after timed throughput and latency, avoiding a batching advantage from reduced instrumentation overhead. In the untimed phase, for 1,024 logical calls with this immediate echo handler, all retained no-hook group cases sent exactly:

| Concurrent calls | Stock client / server sends | Group client / server sends |
| --- | --- | --- |
| 1 | 1,024 / 1,024 | 1024 / 1024 |
| 16 | 1,024 / 1,024 | 64 / 64 |
| 64 | 1,024 / 1,024 | 16 / 16 |

The reduction in sends is not an equal multiplier in throughput: serialization, Promise settlement, timers, validation and scheduling remain. Every result's scalar/full text, result count and exact remote invocation count were checked. 21,430,272 logical echo calls were checked across the 54 timing datasets. All 55 datasets' current source/runtime/dependency hashes and sample/count invariants are verified by [the report generator](https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/experiments/rpc-batching/report.js).

The Node lifecycle study performs one warmup and seven measured rounds for stock/strict16/group. Each measured round destroys 20 pairs with 16 pending requests each: all 320 requests cancel, pending/queued work is zero, and timeout resources return to zero after the event-loop checkpoint. This covers the measured teardown path, not universal leak freedom. The 40 prototype tests separately cover malformed/nested packets, failed hooks, wrong peers, budgets/rates, snapshot isolation, mixed slow/error replies, full groups, clone failure, direct ArrayBuffer ownership transfer, serialization-getter reentrancy and nested groups. Core source line coverage does not include these experimental files.

## Payload and hook guard conditions

Guard runs use five samples of 2,048 calls after 2,048 warmup calls in each of three fresh processes. Ratios are explicit group / stock, median and observed range. Empty text still includes the scalar/object envelope; 65,536 bytes describes ASCII text only. Large-payload and serial regressions remain visible.

| Runtime | Text bytes | Calls | Group / stock (range) |
| --- | --- | --- | --- |
| node | 0 | 1 | 0.91× (0.90×–0.98×) |
| node | 0 | 64 | 1.42× (1.31×–1.58×) |
| node | 65536 | 1 | 0.98× (0.97×–0.98×) |
| node | 65536 | 64 | 0.68× (0.65×–0.69×) |
| bun | 0 | 1 | 0.96× (0.92×–0.98×) |
| bun | 0 | 64 | 1.43× (1.33×–1.54×) |
| bun | 65536 | 1 | 1.00× (1.00×–1.01×) |
| bun | 65536 | 64 | 4.54× (4.50×–4.70×) |
| chrome | 0 | 1 | 1.00× (0.96×–1.11×) |
| chrome | 0 | 64 | 1.99× (1.90×–2.03×) |
| chrome | 65536 | 1 | 0.98× (0.96×–1.01×) |
| chrome | 65536 | 64 | 0.90× (0.90×–0.90×) |
| chrome-worker | 0 | 1 | 0.99× (0.97×–1.01×) |
| chrome-worker | 0 | 64 | 1.17× (1.05×–1.30×) |
| chrome-worker | 65536 | 1 | 0.99× (0.97×–1.03×) |
| chrome-worker | 65536 | 64 | 0.60× (0.58×–0.63×) |

One asynchronous no-op inbound and outbound hook per CrossBus endpoint is enabled in the hook runs (nine samples of 2,048 calls after 2,048 warmup calls). These calls retain the hooks and use ordinary sends: exactly 1,024 client and 1,024 server posts for the validation phase. The prototype does not optimize this asynchronous pipeline.

| Runtime | Calls | Group / stock with hooks (range) |
| --- | --- | --- |
| node | 16 | 0.94× (0.91×–0.95×) |
| node | 64 | 0.98× (0.98×–0.99×) |
| chrome-worker | 16 | 0.96× (0.92×–0.99×) |
| chrome-worker | 64 | 0.97× (0.94×–0.99×) |

## Reproduction and limits

Run after building, one timing command at a time with other workloads stopped. The full retained matrix is:

```sh
for runtime in node bun chrome; do
  node experiments/rpc-batching/isolated.js --runtime "$runtime"
  node experiments/rpc-batching/isolated.js --runtime "$runtime" --profile guard
  node experiments/rpc-batching/paired.js --runtime "$runtime"
done
node experiments/rpc-batching/isolated.js --runtime chrome --worker
node experiments/rpc-batching/isolated.js --runtime chrome --worker --profile guard
node experiments/rpc-batching/paired.js --runtime chrome --worker
node experiments/rpc-batching/isolated.js --runtime node --profile hooks
node experiments/rpc-batching/isolated.js --runtime chrome --worker --profile hooks
node experiments/rpc-batching/lifecycle.js
bun run bench:batch:report
```

Raw samples, timestamps, dependency versions, workload hashes, all rates and latency percentiles are retained under [benchmarks/rpc-batching](https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/benchmarks/rpc-batching). The tree was dirty while recording because the tested prototype was uncommitted; its exact inputs are identified by hashes. Earlier provisional measurements from before the final reentrancy fixes are excluded. The measured core matches the archived approved master runtime; src/ and public exports are unchanged.

The original [competitor study](COMPETITOR_ANALYSIS.md) covers the approved runtime. This bulk experiment does not replace it. No Safari/Firefox, physical iOS/Android WebView, network, interaction/rendering or native bridge performance is established here. The experimental adapters do not yet provide protocol negotiation or a reviewed public bulk API. Further work must explicitly design those contracts and equivalent competitor bulk controls before making broader comparisons.
