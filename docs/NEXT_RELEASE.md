# 0.1.5 candidate: timeout resources and RPC comparison

This comparison measures the **0.1.5 runtime qualified before publication** against the exact minified runtime from published npm 0.1.4. Its baseline SHA-256 is `b333dcdef51a41da7e4717efaaf537d9710c02679724ce338366882085c2a562`. Both bundles, dependency locks, input/source snapshots, process samples and the [complete generated tables](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/RESULTS.md) are retained in [benchmarks/next-release](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/benchmarks/next-release).

## What changed

CrossBus now shares one native timer for requests whose delay equals the bus default. An intrusive monotonic deadline list unlinks settled requests immediately; custom delays keep independent timers. The authoritative pending Map, one owned Promise per request, payload/pending limits, peer binding, handler authorization and hooks remain in place. Standalone `PendingRequests` keeps individual timers unless explicitly opted in.

The [Node async_hooks resource test](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/tests/experiments/deadline-resources.mjs) issues 128 valid sends held pending, observes one created/live native timeout, checks the 129th request hits its quota, then destroys the bus and observes zero live timers after cleanup. This proves resource reduction for that workload, not faster RPC or absence of all leaks. It does not measure native mobile bridge performance.

The candidate also adds bounded/flow-controlled streams, optional native binary chunks, native SDK packaging and stricter iOS marker validation. Those have [functional tests and device receipts](QUALIFICATION.md). The RPC matrix carries text; binary delivery is measured in a separate study below.

## Method

Apple M1 Max, macOS arm64; Node v24.15.0, Bun 1.3.14 and HeadlessChrome/155.0.8059.79. Node/Bun and same-page Chrome use actual MessagePorts in one event loop. Chrome Worker cases use a real module Worker; startup/handshake is excluded, scheduling is included.

Three fresh baseline/candidate process pairs alternate variant order per runtime/profile. Primary cases have 4,096 warmup calls, nine samples of 4,096 checked calls, 1 KiB text and 1/16/64 concurrency. Guard cases have 2,048 warmup calls, five samples of 2,048, empty/64 KiB text and 1/64 concurrency. Each case separately samples 128 burst-completion RTTs. Library order rotates. Every returned scalar/full text and exact remote handler invocation count is checked. No build, test suite, native job or profiler runs concurrently with the timing matrix.

Ratios are candidate/baseline process medians paired by repetition, then median and observed range across three pairs. Ranges are not confidence intervals. All negative cases, raw p50/p95/p99 values and unchanged controls are retained. Burst p99 is a whole-group completion statistic, not a single-call latency distribution. Clock quantization and 128 samples limit tail precision.

CrossBus uses `createSecure()`, default budgets, bound peers and 30-second timeouts. Controls are birpc 4.2.0 cached calls (default 60-second timeout) and Penpal 8.0.1 cached calls with explicit 30-second timeout. These APIs have different authorization/validation features; they are application comparisons, not implementations of identical security semantics. Comlink 4.4.2 is supported by the preserved harness but is not timed in this matrix.

## Results and interpretation

The RPC matrix contains 48 datasets and 25,503,744 checked calls. At 64 concurrent 1 KiB calls, the paired median standard ratio is 1.11× (1.10–1.12) for same-page Chrome and 1.03× (1.01–1.11) for Chrome Worker. Node standard is 0.99× (0.98–1.02); Bun standard is 1.03× (0.97–1.05). Asynchronous hooks, compact mode, lower concurrency and guard payloads have their own gains and regressions; unchanged controls also vary. These results support resource reduction and scoped browser gains, not an across-the-board speedup.

| Runtime | Standard, 64 concurrent / 1 KiB | Compact, same workload | birpc control | Penpal control |
|---|---:|---:|---:|---:|
| Node | 0.99× (0.98–1.02) | 0.98× (0.97–1.06) | 1.01× (0.96–1.02) | 1.00× (0.97–1.01) |
| Bun | 1.03× (0.97–1.05) | 1.05× (1.03–1.09) | 1.00× (0.97–1.02) | 0.99× (0.97–1.01) |
| Chrome | 1.11× (1.10–1.12) | 1.09× (1.04–1.11) | 0.99× (0.98–1.02) | 0.99× (0.98–1.03) |
| Chrome Worker | 1.03× (1.01–1.11) | 1.00× (0.97–1.11) | 0.97× (0.96–0.98) | 1.02× (0.96–1.10) |

The main minified bundle grows from **62,953 to 73,205 bytes raw**, or **18,988 to 22,003 bytes gzip level 9** (+3,015 gzip bytes). This includes the streaming features and deadline scheduler. Root package imports select unminified ESM/CJS entries; these minified figures are not the default installed download size. See [all entry sizes](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/sizes.json).

The [generated tables](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/RESULTS.md) contain every primary/guard comparison, absolute candidate throughput, unchanged controls and burst p99. The [machine-readable summary](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/summary.json) retains paired samples and exact bundle sizes. Functional browser/mobile qualification does not convert these desktop/headless measurements into native performance evidence. There is no established universal performance lead or proof that further optimization is impossible.

## Binary streams: separate one-way comparison

Three fresh process pairs per Node/Bun/Chrome selection transfer 1 and 4 MiB over raw MessageChannel ports in one event loop. Per case: two warmup transfers, seven samples of four transfers, 64,000-byte chunks and exact original-buffer ownership checks. Timing includes writer creation, open/data/end, receiver `collect()` and verification of every byte; input/port/manager setup is excluded. The ledger checks every open/data/end/ACK count and exact receiving-handler count. Eighteen datasets contain **2,700 checked transfers / 7,077,888,000 checked bytes**. Modes rotate within each candidate process; the baseline supports only base64, so the processes have different available case sets and GC/cache histories. No Worker, network or native mobile host is timed here.

The base64 codec now detects standard typed-array base64 methods; Node 24.15.0 uses the fallback in these runs, while Bun and Chrome expose both methods. Default compatible base64 observations:

| Runtime | 1 MiB paired ratio | 4 MiB paired ratio |
|---|---:|---:|
| Node | 0.96× (0.93–1.00) | 0.95× (0.95–0.96) |
| Bun | 5.12× (5.07–6.07) | 5.95× (5.76–6.15) |
| Chrome | 3.90× (3.86–4.47) | 7.19× (7.18–7.30) |

Node's older fallback incurs a small regression alongside the new queue/sequence bookkeeping. The optional native-binary modes avoid base64: at 4 MiB, native copy (without flow control) has paired median ratios versus 0.1.4 base64 of 2.99× Node, 9.81× Bun and 7.97× Chrome. These are explicitly different representations, not transparent base64 optimizations. Flow modes additionally wait for consumption ACKs; transferring owned internal chunks retains the original caller's input and does not guarantee zero-copy behavior or a win over native copying. All modes, unfavorable cases and ranges are in [the stream tables](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/STREAM_RESULTS.md) and [raw stream summary](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/next-release/stream-summary.json). No competitor stream API is compared.

## Reproduce without overwriting evidence

```sh
node experiments/next-release/report.js
# In this exact candidate checkout, additionally verify live source/dist bytes:
node experiments/next-release/report.js --check-current
node experiments/next-release/stream-report.js
node tests/experiments/deadline-resources.mjs
```

`report.js` checks all 48 datasets, 25,503,744 remote-verified calls, input hashes, sample/iteration counts, ordering, percentile calculations and exact frozen artifacts before generating results. The historical [0.1.4 report](WORKER_RPC.md) remains separate.

`stream-report.js` independently verifies all eighteen binary datasets, their hashes, byte checksums, frame/transfer ledgers and rate summary statistics. `stream-isolated.js` collects those runs sequentially and refuses existing receipt files.

For a new experiment use a fresh directory/coordinator and a freshly built candidate; preserve this record. `freeze.js` retains source/dependency/harness text in `inputs.json` and rejects an existing snapshot. `run.js` invokes the unchanged 0.1.4 workload in fresh processes and refuses existing output paths. Metadata records the previous HEAD/dirty state honestly; exact bytes are identified by hashes rather than an invented clean commit. Runtime/library versions must match the retained verifier or be deliberately recorded in a new study.
