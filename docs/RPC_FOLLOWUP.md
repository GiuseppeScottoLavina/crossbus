# RPC optimization follow-up — 13 November 2026

This study compares the approved 0.1.3 snapshot in master commit 3a3c6bb with the subsequent internal RPC candidate. These are two **different builds of the unreleased 0.1.3 candidate**, identified by frozen bundle and source hashes. This is separate from the [12 November comparison against published 0.1.2](COMPETITOR_ANALYSIS.md).

The 1 KiB Node standard path moved only about 1% in the paired medians, inside observed variation. Some Bun improvements are also seen in unchanged comparator controls. Large Chrome Worker payloads regress in several candidate cases. These measurements do not justify promoting this combined experiment as a general performance improvement or claiming a theoretical limit.

Apple M1 Max, darwin arm64. Runtimes: Node v24.15.0, Bun 1.3.14, HeadlessChrome/155.0.8059.79; Bun revision 191edc04ab1ff64d423e4fae9a0d5ee00ee7f3dd. Chrome is headless.

## Changes under evaluation

- RPC packets use the live peer binding directly, retaining connected-state checks and send-error behavior while avoiding unneeded routing-input/result/failed-array allocations. Signals and the public MessageRouter API retain their behavior.
- Inbound processing snapshots the payload property once and reuses it for normalization, validation and response settlement. Standard/legacy forms, asynchronous hooks, destruction checks and response-peer matching remain covered.
- The default MessageChannel send method has a short direct path; optional codecs, compact encoding and automatic transferable discovery use the general path. The original graph and explicit transfer lists are preserved.
- Compact encoding checks canonical builder field order with linear comparisons, falling back to the complete set check for reordered records. Extensions still use standard encoding; the wire format is unchanged.

This is an **unmerged experiment, not a selected release build**: the results include regressions and do not establish a general speedup. The approved master snapshot remains separate. There are no new public methods/options or protocol changes. Payload budgets, request limits, immutable envelopes, origins, hook failure behavior and bound-peer checks remain enabled in all normal-guard comparison rows. Record-type shortcuts, origin memoization and a separate response-dispatch branch were trialled and discarded after mixed runtime results.

## Method and reproduction

Run one runtime at a time, with other tests/benchmarks stopped:

```sh
bun run build
bun run bench:rpc-followup
bun run bench:rpc-followup:bun
bun run bench:rpc-followup:browser
bun run bench:rpc-followup:workers
bun run bench:rpc-followup:memory
bun run bench:rpc-followup:profile
bun run bench:rpc-followup:report
```

Three fresh baseline/candidate process pairs alternate process order. Each case has 4,096 warm-up calls and nine batches of 4,096 checked calls, rotating library order. Cases cover 0/1,024/65,536-byte ASCII text fields and 1/16 in-flight calls. Every response scalar/full text is verified; an extra untimed stats RPC verifies the exact remote handler invocation count. Real Chrome module Workers include scheduling and exclude startup/handshake. The payload-budget ablation is local-only and separately labelled; it is excluded from normal-guard rankings.

The comparator methods are cached: Comlink 4.4.2, birpc 4.2.0, Penpal 8.0.1 with a 30-second per-call timeout. Comlink has no default per-call timeout; birpc defaults to 60 seconds. Features differ. Installed implementation hashes, runtime versions, dirty-tree state, exact raw samples and frozen bundles are retained in [rpc-followup artifacts](https://github.com/GiuseppeScottoLavina/crossbus/tree/perf/rpc-followup/benchmarks/rpc-followup). The generator verifies them before writing this report.

## RPC with standard guards enabled

After/before ratios are medians of the three paired process-median ratios; parentheses show observed process-pair ranges, not confidence intervals. Ratios below 1 are regressions.

| Runtime/topology | Text bytes | In flight | Standard | Standard + hooks | Compact | Compact + hooks |
|---|---:|---:|---:|---:|---:|---:|
| node | 0 | 1 | 1.04× (1.02–1.07) | 1.05× (1.00–1.08) | 1.08× (1.04–1.11) | 1.05× (1.04–1.07) |
| node | 1024 | 1 | 1.01× (0.96–1.04) | 1.02× (0.96–1.03) | 1.02× (0.98–1.06) | 1.04× (0.98–1.08) |
| node | 65536 | 1 | 1.01× (1.00–1.03) | 1.01× (0.99–1.02) | 1.00× (0.99–1.04) | 1.01× (1.01–1.01) |
| node | 0 | 16 | 1.02× (0.99–1.06) | 1.02× (1.01–1.03) | 1.03× (1.00–1.08) | 1.04× (1.02–1.07) |
| node | 1024 | 16 | 1.01× (0.97–1.04) | 1.02× (0.98–1.03) | 1.02× (0.94–1.14) | 1.01× (1.01–1.03) |
| node | 65536 | 16 | 1.01× (0.97–1.02) | 1.01× (0.98–1.01) | 1.01× (0.97–1.02) | 1.00× (0.98–1.02) |
| bun | 0 | 1 | 1.22× (1.04–1.55) | 1.19× (1.03–1.65) | 1.30× (1.05–1.44) | 1.13× (1.10–1.47) |
| bun | 1024 | 1 | 1.07× (1.04–1.13) | 1.08× (1.05–1.26) | 1.13× (1.06–1.29) | 1.11× (1.09–1.21) |
| bun | 65536 | 1 | 1.02× (0.95–1.10) | 1.01× (0.97–1.13) | 1.04× (0.99–1.05) | 1.04× (0.97–1.11) |
| bun | 0 | 16 | 0.97× (0.90–1.03) | 1.02× (0.89–1.05) | 1.05× (0.93–1.11) | 1.04× (0.88–1.14) |
| bun | 1024 | 16 | 1.02× (0.85–1.06) | 1.03× (0.86–1.06) | 1.07× (0.92–1.10) | 1.08× (0.92–1.19) |
| bun | 65536 | 16 | 1.15× (0.99–1.45) | 1.11× (0.96–1.30) | 1.16× (0.98–1.82) | 1.15× (0.94–1.62) |
| chrome | 0 | 1 | 0.96× (0.96–1.00) | 0.98× (0.96–0.99) | 0.99× (0.96–1.01) | 0.99× (0.96–1.00) |
| chrome | 1024 | 1 | 1.01× (0.96–1.05) | 0.99× (0.96–1.01) | 0.99× (0.96–1.04) | 1.01× (0.96–1.06) |
| chrome | 65536 | 1 | 0.97× (0.94–1.00) | 0.99× (0.97–1.01) | 0.99× (0.98–1.01) | 0.98× (0.98–1.01) |
| chrome | 0 | 16 | 1.00× (1.00–1.01) | 0.97× (0.96–1.03) | 1.00× (1.00–1.06) | 1.02× (0.96–1.04) |
| chrome | 1024 | 16 | 1.02× (0.99–1.04) | 1.01× (0.99–1.04) | 1.04× (0.99–1.06) | 1.04× (1.00–1.05) |
| chrome | 65536 | 16 | 1.06× (0.97–1.09) | 1.04× (0.93–1.10) | 1.03× (0.95–1.08) | 1.03× (0.95–1.08) |
| chrome Worker | 0 | 1 | 1.05× (1.01–1.11) | 1.02× (0.95–1.08) | 1.01× (0.97–1.03) | 1.02× (1.01–1.16) |
| chrome Worker | 1024 | 1 | 1.06× (0.94–1.13) | 1.01× (0.94–1.09) | 1.03× (1.01–1.04) | 1.03× (0.96–1.05) |
| chrome Worker | 65536 | 1 | 0.94× (0.91–0.99) | 0.88× (0.88–1.00) | 0.99× (0.80–1.19) | 0.98× (0.74–1.05) |
| chrome Worker | 0 | 16 | 0.99× (0.98–1.04) | 0.94× (0.94–0.96) | 1.02× (0.98–1.03) | 1.02× (0.98–1.03) |
| chrome Worker | 1024 | 16 | 1.03× (0.97–1.04) | 1.02× (0.93–1.05) | 0.99× (0.94–1.04) | 1.03× (0.99–1.04) |
| chrome Worker | 65536 | 16 | 0.97× (0.95–0.99) | 0.96× (0.95–1.02) | 1.00× (0.99–1.03) | 0.98× (0.96–0.99) |

## Competitor rates and unchanged-code controls

Calls/s for 1 KiB, median of three process medians. These pooled medians do not necessarily produce the paired ratios above when divided. All ordinary production CrossBus values keep the guards enabled. Comparator source bytes are identical between variants; their process ratios help expose environmental/JIT variation.

| Runtime/topology | In flight | Previous standard | New standard | New compact | Comlink cached | birpc cached | Penpal cached, 30s |
|---|---:|---:|---:|---:|---:|---:|---:|
| node | 1 | 115,656 | 114,746 | 133,578 | 94,109 | 152,992 | 137,655 |
| node | 16 | 145,485 | 147,190 | 168,656 | 116,447 | 197,493 | 187,003 |
| bun | 1 | 76,381 | 81,361 | 116,116 | 94,231 | 107,084 | 90,501 |
| bun | 16 | 95,569 | 97,456 | 139,731 | 114,480 | 130,992 | 114,238 |
| chrome | 1 | 68,610 | 67,258 | 68,153 | 74,473 | 97,757 | 86,050 |
| chrome | 16 | 73,143 | 75,018 | 78,921 | 83,422 | 100,887 | 95,701 |
| chrome Worker | 1 | 30,408 | 32,277 | 32,050 | 33,382 | 38,245 | 35,836 |
| chrome Worker | 16 | 100,887 | 102,915 | 101,136 | 106,667 | 126,811 | 136,080 |

The complete summary includes process ratios for unchanged comparator code, all text sizes, both encodings and hook cases. No universal fastest-library claim follows from these results.

## Isolating the payload-budget cost

These diagnostic cases disable **only** maxPayloadSize on controlled test data; all other guards remain. Values below are throughput with budget disabled / enabled for standard encoding and the 1 KiB field, median and observed range across three processes. They are counterfactual diagnostics, not the production candidate or a recommended unsafe configuration. They do not assign the entire competitor gap to validation or establish a precise CPU-time percentage.

| Runtime | In flight | Previous snapshot | New candidate |
|---|---:|---:|---:|
| node | 1 | 1.02× (1.02–1.03) | 1.03× (1.01–1.06) |
| node | 16 | 1.06× (1.03–1.06) | 1.07× (1.05–1.08) |
| bun | 1 | 0.99× (0.99–1.02) | 1.00× (0.98–1.02) |
| bun | 16 | 1.00× (1.00–1.02) | 1.00× (0.98–1.03) |
| chrome | 1 | 1.09× (1.09–1.09) | 1.08× (1.06–1.09) |
| chrome | 16 | 1.08× (1.07–1.11) | 1.08× (1.07–1.10) |

## Size and lifecycle tradeoffs

Whole minified file sizes, including banners, gzip level 9; package exports select unminified entry files and consumer tree-shaking was not measured.

| Snapshot/file | Raw bytes | gzip bytes |
|---|---:|---:|
| baseline/crossbus.min.js | 60,260 | 18,166 |
| baseline/nano.min.js | 535 | 330 |
| candidate/crossbus.min.js | 60,454 | 18,251 |
| candidate/nano.min.js | 535 | 330 |

Both builds completed seven measured lifecycle rounds, cancelling all 200 pending requests per round and returning timeout resources from 200 to zero. Median live cohort heap deltas: 2,530,616 bytes before and 2,530,600 after. Raw post-cleanup deltas retain allocator/JIT noise, including negative values; this is not proof of exact object size or universal absence of leaks.

Safari/Firefox, physical WebViews and network transports were not measured. The source/code inspection identifies costs but does not establish their exact individual contribution to the remaining gap.

## CPU sampling diagnostic

A separate Node Inspector profile samples the current **unminified ESM** after 4,096 warm-up calls, during 131,072 checked sequential 1 KiB standard RPC calls without hooks and with default guards. It is excluded from throughput rankings. Repository URLs are rewritten to repo:/ for privacy; sample ticks and call frames are retained. This samples one runtime/path and does not quantify each feature's causal share of the competitor gap or establish a maximum.

Largest exclusive sampled frames (including native/idle/GC frames when present):

| Frame | Sampled milliseconds |
|---|---:|
| (program) | 432.9 |
| send | 122.5 |
| (idle) | 120.1 |
| postMessage | 113.6 |
| send | 94.8 |
| postMessage | 75.4 |
| resolve | 29.6 |
| (garbage collector) | 27.3 |
| insert | 21.2 |
| create | 21.1 |
| post | 20.7 |
| createResponseMessage | 18.1 |

The full sanitized profile and summary are retained with the study artifacts. Inclusive frame times overlap and must not be added together.
