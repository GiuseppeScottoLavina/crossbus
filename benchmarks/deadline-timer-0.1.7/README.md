# Idle deadline-timer reuse and single-listener remote emit — 15 November 2026

Baseline **A** is the master build after the 0.1.7 security fixes (`878928c`, minified SHA-256 `bd1452885a3aecddc499e629bca1eb332823228e850ea51b70ffbebb9d40f343`). Candidate **B** adds two changes:

1. `PendingRequests` keeps the shared default-deadline timer armed, unreferenced where the runtime supports it, while no pooled request is pending, and reuses it for the next one. Each sequential request used to clear and recreate a native timer.
2. `EventEmitter.emit()` takes its single-listener path when a `source` is supplied, which is how every received remote signal is emitted. The event shape is unchanged.

## Method

`tools/ab.mjs` alternates A and B over fresh processes and reports the median of the per-pair ratios (B/A) and their range. The six pairs each take seven samples after warmup. RPC uses the correctness-checked `experiments/rpc-wire-v2/workloads.js` echo at 1 KiB:
- Node and Bun: 4,096 calls per sample.
- Chrome same page: 16,384 calls per sample.
- Chrome module Worker: 8,192 calls per sample.

`tools/local-workloads.js` checks signal fan-out over real MessageChannels and local `emit()` against a checksum. Runtimes were Node 24.15.0, Bun 1.3.14 and headless Chrome via puppeteer-core, all on one Apple M1 Max machine. In the earlier audit, unchanged-code (A/A) controls stayed within about ±1% at the median, with individual pairs between 0.93 and 1.06. Bun's local signal control showed a bias of about +2%. Raw per-process results are in `samples/`.

## Results (median paired ratio B/A, range)

| Runtime | c=1 standard | c=1 standard + hooks | c=1 compact-v2 | c=1 compact-v2 + hooks | c=64 (four cases) |
|---|---|---|---|---|---|
| Node | 1.056 (1.025–1.118) | 1.052 (1.004–1.113) | 1.054 (1.021–1.131) | 1.061 (1.025–1.128) | 0.996–1.014 |
| Bun | 1.016 (0.952–1.066) | 1.035 (0.957–1.047) | 1.022 (0.992–1.048) | 1.022 (0.976–1.055) | 0.983–1.012 |
| Chrome, same page | 1.086 (1.077–1.117) | 1.079 (1.044–1.099) | 1.084 (1.056–1.110) | 1.070 (1.057–1.090) | 0.992–0.996 |
| Chrome Worker | 1.048 (0.986–1.114) | 1.041 (1.007–1.081) | 1.036 (1.010–1.055) | 1.058 (1.039–1.078) | 0.986–1.032 (noisy) |

**Signals.** On Node, remote signal fan-out was 1.036 (1.015–1.083) for one receiver and 1.031 (1.000–1.054) for eight. Local `emit()` was unchanged at 0.988–0.997. The earlier audit found no Chrome signal gain.

## Interpretation and limits

- **c=1:** the gain applies to sequential RPC, where the pending list empties after every call.
- **c=64:** the list rarely empties, and ratios stay within control noise.
- **Bun:** the gain is small and some pairs are below 1.
- **Chrome Worker at c=64:** too noisy to conclude anything.
- **Browsers:** there is no `unref`, so after the last request one timer callback may fire up to the default timeout later. It holds a reference to the tracker until then, unless the bus is destroyed.
- **Process lifetime:** Node and Bun processes still exit while the tracker is idle; `tests/unit/deadline-scheduler.test.js` checks this.
- **Size:** the minified root grows by 36 bytes gzip level 9 (23,293 → 23,329).

These are scoped local measurements, not throughput promises or a ranking.
