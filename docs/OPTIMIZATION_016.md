# 0.1.6 optimization — snapshot before RPC v2

This historical snapshot of the 0.1.6 candidate precedes the [RPC v2 update](RPC_WIRE_V2.md); its measurements and functional receipts apply to the frozen runtime identified below. This study compares its frozen candidate with the exact published 0.1.5 minified runtime, SHA-256 `a03f24df92d7d7ea94676720cc986975618985deb8c8b07b4e8e3d33f9bfa9e9`. The baseline comes from the registry/CI-identical archive recorded in [RELEASING.md](RELEASING.md). The 0.1.5 tag and archive remain unchanged.

## Changes and boundaries

Node's old base64 fallback built a binary string byte by byte before `btoa`. Inspector sampling identifies that loop and `btoa` as substantial CPU costs in this workload. The new fallback uses the existing Node Buffer global for encoding. Decoding still calls `atob` for strict alphabet, padding and whitespace validation, then copies the validated binary string natively into a plain, exact-size Uint8Array. Standard typed-array base64 APIs retain precedence. Browser bundles add no Buffer import or polyfill.

Reader queues now store each chunk beside its captured byte charge in one FIFO. Pulling a chunk still releases its original charge, including when callers mutate data after enqueueing. Compaction retains the same chunk-count threshold. Redundant private async wrappers are removed; public operations retain promises, error propagation and cancellation.

The production RPC implementation is unchanged. The compiled core runtime is byte-identical to 0.1.5 after removing its version banner. Protocol values and the package export map are unchanged. Origin checks, authenticated peer binding, payload budgets, pending quotas, hooks, timeouts and flow-control limits remain enabled.

## Measurements

The [selected candidate tables and raw samples](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/benchmarks/optimization-016/selected) retain all measured cells, controls, source snapshots and input hashes. Three fresh-process pairs alternate baseline/candidate order. Each stream case has two warmup transfers and seven samples of four transfers; every receiver byte, frame ledger and original buffer ownership is checked. Both versions exercise the same four modes, 64,000-byte chunks and 1/4 MiB inputs. Native modes change representation and are compared with the matching baseline mode.

RPC cases use real MessageChannels locally in Node/Bun/Chrome and between the main context and a real Chrome Worker. The primary matrix uses 1 KiB text and concurrency 1/16/64; guards use 0/64 KiB and concurrency 1/64. Standard/compact wire, async hooks, birpc cached and Penpal cached with timeout are included. Every response and exact remote handler count is checked. Library semantics still differ; the competitors are controls, not interchangeable implementations. Dependency versions are recorded in every RPC dataset.

The selected campaign retains **72 datasets**, **34,560,000 checked RPC calls** and **4,320 checked stream transfers**: a 66-dataset full matrix plus six longer Bun follow-up datasets. Rates are measured on this Apple M1 Max/darwin arm64 machine; runtimes are Node 24.15.0, Bun 1.3.14 and headless Chrome 155.0.8059.79.

| Base64 case | 0.1.5 MiB/s | Candidate MiB/s | Median paired ratio | Observed ratio range |
|---|---:|---:|---:|---:|
| Node, 1 MiB | 59.7 | 185.9 | 3.163x | 3.051–3.176x |
| Node, 4 MiB | 65.0 | 185.4 | 2.854x | 2.841–2.874x |
| Bun, 1 MiB | 436.6 | 478.8 | 1.019x | 0.996–1.144x |
| Bun, 4 MiB | 492.8 | 500.4 | 0.994x | 0.990–1.022x |
| Chrome, 1 MiB | 322.6 | 317.5 | 0.984x | 0.898–1.008x |
| Chrome, 4 MiB | 348.6 | 356.3 | 1.000x | 0.996–1.034x |

The rate columns are medians of process medians; the ratio column is the median of three paired process ratios, so dividing the two rate columns can give a different number. The confirmed large gain is Node base64 delivery. Bun/Chrome and the other native/flow modes do not show a general acceleration; all modes remain in the complete tables.

RPC throughput does not establish a general improvement. At 64 concurrent 1 KiB calls, paired ratios are 1.000x standard/1.014x compact on Node, 0.992x/0.994x on Bun, 0.986x/0.991x in Chrome and 1.000x/1.035x in Chrome Workers. Hook cases include regressions: the Worker compact+hooks cell is 0.971x, with an observed 0.869–0.997x range. The production core runtime remains unchanged, but that fact does not guarantee identical throughput from the larger whole-module bundle.

The shortest Bun empty-payload guard recorded 0.902x for compact+hooks, with all three paired ratios below one. A separate longer check used 8,192 warmup calls and nine samples of 16,384 calls: its paired median was 1.027x, observed 0.970–1.037x. The earlier drop was not reproduced under this longer workload. Both datasets remain available; this does not turn the mixed RPC results into a universal speedup.

The remaining competitor gap is visible in the selected 1 KiB/concurrency-64 case below (candidate process medians, calls/s). These paths have different guarantees; [source review](COMPETITOR_ANALYSIS.md) and the retained CPU profiles describe mechanisms, not an isolated percentage attribution of the entire gap.

| Runtime | CrossBus standard | CrossBus compact | birpc 4.2.0 cached | Penpal 8.0.1 cached + timeout |
|---|---:|---:|---:|---:|
| Node | 119,167 | 150,238 | 163,223 | 152,157 |
| Bun | 80,955 | 150,690 | 107,427 | 95,007 |
| Chrome | 70,017 | 75,018 | 83,934 | 78,467 |
| Chrome Worker | 120,826 | 120,117 | 134,295 | 121,543 |

The complete minified root changes from **73,205 to 73,307 bytes raw** and **22,003 to 22,050 bytes gzip level 9** (+47 gzip bytes). Core remains **11,747 bytes minified gzip** and **31,178 bytes for the unminified gzip entry**. The default root export selects unminified ESM/CJS; the unminified ESM gzip changes from 57,164 to 57,323 bytes. These are whole-file sizes, not installed package or tree-shaken consumer sizes. This round does not recover the earlier 0.1.5 feature cost or establish a minimum possible bundle size.

Several browser attempts ended with `TargetCloseError` before producing a valid dataset; their cause was not established. They are recorded in `selected/failures.json` and excluded from throughput data. All 72 selected datasets are complete and verified. Later Worker runs used a dedicated copy of the same browser executable, with identical SHA-256, recorded in `selected/browser-executable.json`.


## Rejected experiments

A literal-inlining trial reduced the minified core by 101 gzip bytes but its longer real-Worker follow-up recorded standard RPC with async hooks at 0.955x the 0.1.5 throughput and 0.957x the stream-only variant; all three candidate/stream paired ratios were below one. This small size saving did not justify the measured performance tradeoff. The change was reverted. The initial 66-dataset trial and 18-dataset follow-up remain under `benchmarks/optimization-016/data` and `followup`, with a separate [verifier and complete tables](https://github.com/GiuseppeScottoLavina/crossbus/blob/master/benchmarks/optimization-016/RESULTS.md). The selected stream-only runtime is byte-identical to the stream variant in that follow-up, SHA-256 `f96eae45eed69fe2ecca25595a4242dc2be0411f84400a0a04331879ef5cddc1`.

A shared default RPC-options object removed temporary allocations but did not provide a consistent cross-runtime improvement. Its three-pair Node/Bun/Chrome pilot, both bundles and individual ratios are retained under `benchmarks/optimization-016/rejected/default-options`. This is a bundle-level trial including capability sharing/compiler layout, not proof of an isolated allocation cost. It is excluded from production.

Flattening reader option fields saved raw bytes but increased gzip size. Factoring repeated reader-limit validation also increased gzip size and added a temporary object. Increasing Terser passes from three to ten produced identical output sizes. These changes were discarded. An alternate strict Buffer base64 decoder was larger; retaining `atob` avoids maintaining a second validation grammar.

## Verification and reproduction

The final source passed **1,244 tests across 87 files**: 1,070 unit, 17 packaged exports, 44 experiments and 113 browser/integration/documentation tests. Source line coverage is **96.29% (5,031/5,225)** against the 90% gate; it is not branch coverage. Lint, source type checking and consumer declarations pass on the installed TypeScript 6 compiler and TypeScript 5.9.3.

The exact minified runtime passed the focused ten-case browser suite in Chrome 155, Firefox 160 and Safari 27.2 on macOS. Node 18.20.8 and 24.15.0 each passed six canonical binary lengths and 4,121 deterministic atob-parity inputs, including malformed strings, exact owned backing storage and subview boundaries. A separate regression checks release of captured byte charges after a reordered queued view is detached. Receipts and fixture inputs are retained under `selected/qualification`.

Isolated packed-package checks cover all 12 exports, declaration inclusion, ESM/CommonJS/minified and compact RPC, and base64/native flow-controlled streams. Their Node 18/24 receipts are retained beside the browser receipts. No npm publication is performed by these checks.


Physical iPad/Pixel receipts in [QUALIFICATION.md](QUALIFICATION.md) remain scoped to 0.1.5. Version 0.1.6 has no new physical-device or native throughput claim.

Verify preserved evidence without timing or hardware:

```sh
node experiments/optimization-016/selected-report.js
node experiments/optimization-016/selected-sizes.js
node experiments/optimization-016/report.js # rejected trials
node tests/qualification/check-receipts.js
```

Add `--check-current` to the optimization report to require matching live source/build inputs. For a new measurement campaign, use a separate copy/output directory: runners refuse to overwrite retained datasets. After building and freezing its inputs, run:

```sh
node experiments/optimization-016/selected-isolated.js stream node
node experiments/optimization-016/selected-isolated.js stream bun
node experiments/optimization-016/selected-isolated.js stream chrome
# Repeat RPC primary and guard profiles for node, bun, chrome, chrome-worker.
node experiments/optimization-016/selected-isolated.js rpc node primary
node experiments/optimization-016/selected-isolated.js rpc node guard
```

Measured throughput includes verification overhead and the tested machine/engine scheduling. It is not native bridge, network, rendering or all-application performance. Paired observed ranges are not confidence intervals. These results do not establish an absolute performance ceiling or universal leadership.
