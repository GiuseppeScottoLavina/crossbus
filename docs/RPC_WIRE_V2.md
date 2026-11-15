# Compact v2 RPC development study — 15 November 2026

Version 0.1.6 is unpublished. The new `compact-v2` format is available in this development checkout, not npm 0.1.5. It requires updated receiving endpoints and has no automatic negotiation or downgrade. Standard remains the default; compact v1 remains compatible with 0.1.3+ receivers. The [API guide](API.md#compact-messagechannel-encoding) records options and boundaries.

## Implementation and compatibility

The original compact request/signal tuple contains eight elements and an ordinary response nine. Version 2 combines the string tag and message kind in one numeric discriminator: requests/signals use seven elements; general responses eight. A successful response whose error is exactly null uses six, reconstructing success=true/error=null. IDs, timestamps, source/destination, data and other success/error values are preserved. Header extensions, custom metadata and noncanonical shapes fall back to standard objects. These are tuple element counts, not measured serialized byte sizes.

Application data retains the existing compact mode's structured-clone graph semantics. Envelope/payload wrappers are reconstructed; standard mode is required for raw transport code depending on application-data references to those wrappers. Transfer ownership, peer binding, payload/pending quotas, hooks and deadlines remain enforced. Native bridge encoding is unchanged.

Standard received objects now bypass the compact-array decoder function and go directly to the existing protocol validator. Compact arrays retain decoder shape/type validation before dispatch.

## Measurements

The selected main matrix retains **36 datasets and 56,079,360 checked echo calls**. The directed Worker follow-up adds three datasets and 812,160 calls, for **39 datasets / 56,891,520 calls**. Six additional directed Node dispatch datasets are retained separately. The initial prototype has its own complete 36-dataset matrix and is not merged into the selected ratios.

At the 1 KiB text field, v2/v1 ratios within the selected candidate are below. Hooks mean async identity hooks on both directions of both endpoints.

| Runtime | In flight | Hooks | Median ratio | Observed range |
|---|---:|---|---:|---|
| node | 1 | false | 1.052x | 1.001–1.081x |
| node | 1 | true | 1.025x | 1.018–1.028x |
| node | 64 | false | 1.084x | 0.992–1.096x |
| node | 64 | true | 1.056x | 0.947–1.158x |
| bun | 1 | false | 1.067x | 1.062–1.092x |
| bun | 1 | true | 1.031x | 1.029–1.084x |
| bun | 64 | false | 1.101x | 1.082–1.107x |
| bun | 64 | true | 1.095x | 1.067–1.110x |
| chrome | 1 | false | 1.030x | 0.972–1.075x |
| chrome | 1 | true | 1.005x | 0.953–1.218x |
| chrome | 64 | false | 1.024x | 1.004–1.035x |
| chrome | 64 | true | 1.027x | 1.000–1.047x |
| chrome-worker | 1 | false | 1.002x | 0.992–1.003x |
| chrome-worker | 1 | true | 1.020x | 0.994–1.027x |
| chrome-worker | 64 | false | 1.124x | 0.912–1.134x |
| chrome-worker | 64 | true | 0.988x | 0.904–1.065x |

The useful repeated gain is chiefly Node/Bun, particularly at concurrency 64. Chrome gains are smaller. Worker results are variable and do not establish a general acceleration: the empty-payload/concurrency-64 v2+hooks cell records 0.906x (0.905–1.000x), while the 64 KiB/concurrency-64 v2+hooks cell is 0.986x (0.972–0.990x). Keep v1 or standard when they suit the measured workload better. The full tables preserve every payload/concurrency cell, rather than selecting only wins.

The separate existing-format guard matrix also contains regressions and noisy Worker cells. Its 64 KiB/concurrency-1 compact-v1+hooks cell initially recorded 0.804x (0.798–1.149x), while unchanged comparator controls varied substantially. A directed check compared old/new endpoints within each process, with nine samples and three fresh processes: standard+hooks was 1.015x (ratios 1.015, 0.979, 1.018), and compact-v1+hooks was 0.999x (0.998, 0.999, 1.348). The original large drop was not reproduced in that check; it is still retained. These observations do not establish zero regressions or a universal improvement of the default mode.

Selected candidate calls/s for the 1 KiB/concurrency-64 case (medians of process medians):

| Runtime | Standard | Compact v1 | Compact v2 | birpc cached | Penpal cached + timeout |
|---|---:|---:|---:|---:|---:|
| node | 154,750 | 182,029 | 195,753 | 211,365 | 192,425 |
| bun | 104,485 | 199,904 | 221,296 | 137,573 | 120,532 |
| chrome | 91,022 | 93,091 | 96,376 | 102,400 | 96,832 |
| chrome-worker | 137,912 | 136,080 | 152,836 | 142,718 | 154,566 |

These are specific API paths with different guarantees, not an overall ranking. Sequential Node and Chrome RPC still trail the tested cached competitors in this workload; v2 does not close every gap.

The whole minified root grows from **73,307 to 74,185 bytes raw** and **22,050 to 22,267 bytes gzip level 9** (+217 gzip bytes). These are whole-file sizes; the package root selects unminified ESM/CJS entries. Core source and protocol semantics remain separate from this MessageChannel encoding option.

The initial prototype routed standard objects through the compact decoder function. After its Node guard results showed a decrease, the selected implementation added the direct standard-object path. A separate three-pair Node check and the final full matrix are retained; the earlier prototype data were not overwritten.


## Reproduction and interpretation

The baseline is master commit `98debd4613d8faa2f028b4724449cbfd2168b98f`, the prior unpublished 0.1.6 snapshot with minified SHA-256 `f96eae45eed69fe2ecca25595a4242dc2be0411f84400a0a04331879ef5cddc1`. These are two builds of development 0.1.6; neither is a newly published npm version.

The [retained campaign](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/benchmarks/rpc-wire-v2) separates the initial prototype, selected implementation, directed Node dispatch check and within-process Worker follow-up. Sources, bundle hashes, package/dependency inputs and all samples are retained. No earlier study, npm archive or release tag is replaced.

Each matrix uses Node, Bun, headless Chrome and real Chrome module Workers. Payload text fields are 0/1,024/65,536 ASCII bytes at concurrency 1/64. Each case warms for 8,192 calls and records seven samples of 4,096 calls, rotating case order. Every result scalar/full text and exact remote echo invocation count is verified. Startup/handshake and preallocated payload setup are excluded; scheduling, cloning and validation are included. Burst RTT is sampled separately in 64 groups.

The selected wire comparison repeats all eight cases in three fresh processes per runtime. V2/v1 ratios compare process medians within each process, then take the median across three processes. Separate guard comparisons use three alternating baseline/candidate process pairs with the same six existing-codec/control cases on both sides. A rate column formed from process medians need not divide to the reported paired ratio. Observed ranges are not confidence intervals.

Comparators are cached birpc 4.2.0 and Penpal 8.0.1 with a cached 30-second timeout option. birpc defaults to 60 seconds; CrossBus retains its default guards and 30-second deadline. Their APIs and guarantees differ. Source review is in [COMPETITOR_ANALYSIS.md](COMPETITOR_ANALYSIS.md). The new header format addresses clone work; it does not assign the entire competitor gap to one mechanism or establish universal leadership.

The retained runners refuse to overwrite historical datasets. To repeat a wire measurement, choose a fresh output filename and use the frozen selected bundle:

```sh
node experiments/rpc-wire-v2/run.js \
  --artifact benchmarks/rpc-wire-v2/selected/candidate/crossbus.min.js \
  --samples 7 --iterations 4096 --warmup 8192 --latency-groups 64 \
  --sizes 0,1024,65536 --concurrency 1,64 --order 0 \
  --output artifacts/rpc-v2-repeat-node-1.json
```

Repeat in three fresh processes with orders 0/1/2 and distinct filenames. Use Bun for the Bun case; add `--browser` for Chrome and `--browser --worker` for real Workers. `selected-isolated.js` and `followup-isolated.js` record the exact full campaign plans; use them only in a separate campaign working copy whose output paths are fresh. Existing-format guard comparisons select the same six non-v2 cases on baseline and candidate. Keep other benchmark/test workloads stopped during timing.

## Functional qualification

The final source passed **1,269 tests across 88 files**: 1,225 unit/package/browser/integration/documentation tests plus 44 experiment tests. Source line coverage is **96.25% (5,060/5,257)** against the 90% gate; it is not branch coverage. Lint, source checking and consumer declarations passed with TypeScript 6.0.3 and 5.9.3.

The focused browser suite passed eleven cases each in Chrome 155, Firefox 160 and Safari 27.2 on macOS, now explicitly including v2 graph cloning, reverse/concurrent RPC, async hooks and protected handlers. Unit tests cover all format pairs, malformed tuples, null versus undefined error fields, cyclic/aliased data, transferred storage and a forged response from the wrong bound peer. Rejected requests must leave protected handler counts unchanged.

Isolated Node 18/24 packed-package checks cover every export, ESM/CJS/minified standard/v1/v2 RPC, schema rejection and bounded streams. Receipts and fixture inputs are retained under `benchmarks/rpc-wire-v2/selected/qualification`. These checks do not publish to npm.

Verify retained data without timing or device access:

```sh
node experiments/rpc-wire-v2/report.js --initial
node experiments/rpc-wire-v2/report.js
node experiments/rpc-wire-v2/sizes.js
```

Use `--check-current` only with the selected report when requiring matching live source/build inputs. The historical initial report deliberately verifies its archived source.

Physical iPad/Pixel receipts remain specific to 0.1.5. Native compilation and the desktop browser checks do not extend those physical-device receipts or measure native throughput.

From a built development checkout, run the complete example:

```sh
bun run build
node examples/quickstart/rpc-compact-v2.mjs
```

Expected output: `5`. It connects and destroys both endpoints in one Node process; no browser, external server or bundler is required. Do not use this option against an older receiver.
