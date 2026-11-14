# Local audit — 14 November 2026

## 0.1.5 publication record

On 14 November 2026, npm **0.1.5** and its `latest` tag were verified against the exact archive from [CI 43585215006](https://github.com/GiuseppeScottoLavina/crossbus/actions/runs/43585215006), source commit `1114ea83cfaff39cdf074ee5ff2812b032c64971`. The downloaded registry tarball matches that archive byte for byte, SHA-256 `093d973dfd7393cb2895335fb4a656e54292342bbf52d2926772d4cd9cc612aa`. Isolated registry consumers passed on Node 18.20.8 and 24.15.0, including all exports, minified/compact RPC and both stream encodings. The [GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.5) preserves the archive, checksum and release manifest. This publication record is separate from the qualification below and does not broaden its measured scope.

## 0.1.5 release qualification

The candidate passes **1,199 library tests / 81 files** and **43 experimental tests / five files**, with zero failures/skips. Lint, source types, build, packaged documentation/exports and consumer declarations pass. Source line coverage is **5,011 / 5,208 (96.22%)**, not branch coverage or proof of bug freedom. The release coverage gate remains 90%.

The runtime adds a shared default RPC deadline scheduler and bounded streaming with opt-in consumption credits, native binary chunks, cancellation, sequence reassembly and deadlines. A base64 review caught a callback-based decoding regression before release; the final codec uses optional standard typed-array base64 APIs and preserves tight-loop fallbacks on older engines. Default base64 interoperation with 0.1.4 is tested; flow mode requires compatible endpoints and does not silently downgrade.

Focused [browser/device qualification](QUALIFICATION.md) now includes ten cases each on Chrome, Firefox, desktop Safari and **physical iPad Safari**, plus eleven JavaScript assertions and native ledgers/guards on a **physical iPad and Pixel 7 Pro**. Navigation, denied-origin/subframe rejection, bidirectional valid RPC and teardown are covered. The physical iOS test exposed boolean NSNumber acceptance as protocol marker `1`; the fixed bridge rejects it. Receipts identify the exact final library/host/fixture hashes and are verified separately from compile checks.

SwiftPM, strict local CocoaPods lint for iOS/macOS, Android AAR/source/POM/license verification and a consumer of that local AAR passed. CI adds Swift and Android packaging jobs alongside the Node consumer matrix. These checks do not publish native SDK registries or npm; registry publication is recorded separately in [RELEASING.md](RELEASING.md). Historical v0.1.3/v0.1.4 tags and release archives remain unchanged.

The package regression test creates a real native build-cache fixture and checks npm's file list. It excludes `native/android/artifacts/` as well as ordinary Gradle/build directories; an earlier local qualification cache under that custom path was caught by comparing the local and clean-CI tarballs. The source adapters, SDK configuration and documentation link targets remain included.

The [candidate study](NEXT_RELEASE.md) retains a separate paired-process RPC matrix and one-way binary stream comparison. Resource tests observe 128 pending default RPCs using one native timeout and zero after destruction. Throughput, binary representation changes, bundle growth and functional mobile qualification have separate scopes; no universal performance/completeness lead is established.

## 0.1.4 publication record

On 13 November 2026, npm publication of **0.1.4** was verified against the exact archive from [CI 43500587011](https://github.com/GiuseppeScottoLavina/crossbus/actions/runs/43500587011), source commit `309b040f2e48d52d88a21cbe34c005d479f89077`. The downloaded registry tarball matches that tested archive byte for byte, SHA-256 `8fda380febe008cc9c4db1dccfc2cd30eb7058c0ecf5a8b8a6f81123a29ff2c1`. The [GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.4) preserves the same archive, checksum and release manifest. Publication does not extend browser/device qualification or change the scopes of the measurements below.

## 0.1.4 qualification

The development candidate passes **1,169 library tests / 79 files** and **42 experimental tests / 4 files**, with zero failures/skips. Lint, source types, build, package exports and consumer declarations pass with TypeScript 6.0.3 and 5.9.3. Source line coverage is **4,525 / 4,729 (95.69%)**; this does not measure branch coverage or establish absence of vulnerabilities. The additional tests verify browser/Worker UUID entropy use and failure propagation, valid JSON-string RPC, window origin/source rejection, hook/ACL rejection without handler execution, typed-view transfer ownership and native buffer-budget accounting.

Changes affect runtime bytes in this candidate: browser UUID generation, serialized MessageChannel/PostMessage reception, JSON transfer-list handling and typed-view discovery/budgets. The default structured-clone wire format and public export map remain unchanged. Automatic transfer remains opt-in and now moves eligible typed-view backing buffers in full; all sender aliases detach. The [Worker RPC study](WORKER_RPC.md) retains frozen 0.1.3 and 0.1.4 artifacts and separate CPU diagnostics; historical benchmark data is not relabeled as current performance. Physical iOS/Android and Safari/Firefox qualification remain pending.

This section records **pre-publication qualification** of the 0.1.4 candidate. Its publication is recorded above. The published 0.1.3 npm archive and immutable tag are separate. The tooling-only statements below describe the earlier `6f13d80` checkout, before these runtime changes.

The locally packed 0.1.4 archive passes isolated consumer checks on Node 18.20.8 and 24.15.0: all 12 exports/declarations, ESM/CommonJS, standard/compact minified RPC, schema rejection and native source inclusion. The complete timing matrix contains **48 datasets / 25,503,744 checked calls**, plus 24 baseline CPU profiles and three UUID diagnostics. The report verifier checks exact inputs and all timing/count invariants. Both older study verifiers continue checking their historical runtimes/sources against preserved snapshots rather than presenting their results as 0.1.4 performance. No npm publication is performed by these checks.

## Post-release development dependency refresh

The additional grouped tooling update resolves ESLint 10.14.0, Rollup 4.68.2 and Prettier 3.9.10; Puppeteer Core resolves to 25.17.0. Their combined lockfile also passed clean installation, the release gate, all 1,150 library tests and 40 prototype tests, with consumer declarations checked by TypeScript 6.0.3 and 5.9.3. Source maps and the generated visualization were refreshed. JavaScript/CJS bundle bytes still match `v0.1.3`.

The registry was checked on 13 November 2026: **0.1.3 is now published**, and its reported npm integrity matches the exact CI archive attached to the GitHub release. The pre-publication checks below are historical. This tooling refresh does not replace that archive or move its tag.

The five older Dependabot upgrades are integrated against the current master with a matching lockfile: @eslint/js 10.0.1, globals 17.14.0, @rollup/plugin-terser 1.0.2, rollup-plugin-visualizer 7.1.3 and TypeScript 6.0.3. A clean `npm ci --legacy-peer-deps` succeeded. Node 24 remains the development runtime; this does not raise the package consumer's Node >=18 requirement.

TypeScript 6 initially failed on the changed type-inclusion/output-root defaults and the command-line consumer check. Explicit source configuration and a separate strict consumer configuration resolve those failures without changing source APIs or relaxing checks. Consumer declarations also pass with TypeScript 5.9.3. The private static helper declarations in compression/encryption and the standalone bundle visualization were regenerated.

The release gate passed with **95.90% source line coverage (4,441 / 4,631)**, the complete library suite passed **1,150 tests / 73 files**, and the separate prototype suite passed **40 tests / 3 files**, with zero failures/skips. JavaScript runtime source, public exports and every generated JavaScript bundle remain unchanged; the minified main runtime retains SHA-256 `a4cbc5b9610d41a4c0d73b7b3221f75084909f7e3e1c9da3613f40a72e5caff3`. The grouping report verifier still validates all 55 retained datasets; no new performance claim is inferred from the tooling upgrade. The `v0.1.3` tag and prepared release archive are unchanged. GitHub CI and merge status are verified separately when integrating this update.

## Repository-only RPC grouping experiment

The [grouping study](RPC_BATCHING.md) uses the exact approved master runtime (`3a3c6bb`) with adapters outside `src/`, the npm file list and all 12 package exports. Standard encoding, runtime defaults and the prepared 0.1.3 public API are unchanged. Both endpoints must install the prototype; it has explicit shared-graph semantics and no capability negotiation. It is not the existing signal-batching plugin.

Local validation passed the release gate (lint, source/consumer types, clean build, unit/package tests and source coverage), the complete library suite (**1,150 tests / 73 files**), and a separate **40 experimental tests / 3 files**, all with zero failures/skips. The prototype demo returned `[5,9]` on Node 18.20.8 and 24.15.0. Source line coverage remains **4,441 / 4,631 (95.90%)** and excludes the experimental adapters; no experimental coverage percentage is claimed. The package dry run confirms those adapters are excluded from npm. Browser tests required permission to open local ports; the restricted sandbox attempt failed before starting its servers, and the unrestricted rerun passed without changing assertions.

The study retains 55 verified datasets, including 54 timing datasets with **21,430,272** checked echo calls, native-send counts, burst completion latency, payload/hook guard conditions and a separate teardown study. For 64 concurrent 1 KiB calls, paired-process median group/stock ratios were **1.34× Node, 1.91× Bun and 2.00× same-page headless Chrome**. Worker ratios were smaller and variable; one 16-call process pair regressed. Large 64 KiB groups regressed on Node/Chrome, and asynchronous hooks kept ordinary sends. The strict transparent control often lost throughput despite fewer posts. These results support further work on an opt-in bulk operation, not a universal speed or feature leadership claim. Comparator bulk APIs, protocol negotiation and physical-device qualification remain outside this experiment. GitHub publication/CI and npm publication are separate operations.

## 0.1.3 pre-publication qualification

Before publication, the 0.1.3 candidate passed **1,150 tests across 73 files, zero failures and zero skips**, including real Chrome module Workers, two-origin iframe examples, the documentation-only publish root and a live WebSocket server. Lint, source/consumer type checks, clean build and the release gate passed. Unit coverage was **4,441 / 4,631 executable source lines (95.90%)**; the 90% line gate remains enforced. Branch coverage is not reported by this Bun LCOV output.

New regressions cover full typed-array backing storage, SharedArrayBuffer, 20,000-level payload graphs, recursive listener mutation, stale cleanup registration identity, empty peer routing, response peer binding, absent origins outside browser windows, stream source ownership/chunking/destruction and WebSocket connection/queue lifecycle. Compact packets are decoded before normal bus checks; extension metadata falls back to standard encoding. Default MessageChannel interoperability with the published 0.1.2 runtime is tested.

The playground now invokes the library through real MessageChannels, module Workers and PostMessageTransport iframes. Its local fixture responses are identified as demo data. The Pages build includes its actual bundle and pinned Markdown parser with license; safe document routing and text-only error/log rendering have browser coverage. Package documentation links are checked against the actual npm file list. These checks establish the tested behavior, not independent certification or complete absence of bugs.

Swift compilation passed against the iOS simulator SDK (arm64 iOS 15 target); Java compilation passed against Android API 35 and cached AndroidX WebKit. No physical-device runtime qualification was added. The [competitor study](COMPETITOR_ANALYSIS.md) records source inspection, exact measured bundles, isolated process repetitions and the limits of its claims. Publication, remote CI and live Pages deployment remain separate from local validation. The historical evidence below describes 0.1.2.

The prepared 0.1.3 tarball was installed in a separate consumer and checked on Node 18.20.8 and 24.15.0: all 12 exports, declarations, ESM/CommonJS/minified standard and compact RPC, schema rejection and native source inclusion passed. At that pre-publication registry check, latest remained 0.1.2 and 0.1.3 was absent. Publication was verified later, as recorded above.

## 0.1.2 release record

This audit records local validation for the 0.1.2 release candidate. Publication and CI results are recorded separately on the [GitHub release](https://github.com/giuseppescottolavina/crossbus/releases/tag/v0.1.2) and [Actions page](https://github.com/giuseppescottolavina/crossbus/actions). These checks are not independent certification or a guarantee that all bugs have been found.

## Corrected behavior

- Inbound/outbound hook errors stop processing. Inbound RPC validation failures return errors without executing handlers. Batched logical signals re-enter the validation pipeline.
- Configured pending-request limits and conservative in-memory payload budgets are enforced. Settled requests release timeout resources. Failed sends reject promptly without abandoned requests.
- Responses are matched to both request and peer. Window transport events retain their actual origin. Strict wildcard rejection also applies in production and cannot be disabled through the secure factory.
- Bus destruction closes attached transports and registered cleanup, presence and batch resources. Handler removal clears its authorization/rate state, and caller capability arrays are not mutated.
- `MessageChannelTransport.fromPort()` now constructs an object with initialized private fields. Cyclic structures no longer recurse forever when discovering transferables.
- Emitter fixes cover namespace wildcards, duplicate wildcard dispatch, recursive once handling, subscription/AbortSignal cleanup, mixed fast/regular subscriptions, prototype-property event names and empty-string removal.
- Standard protocol broadcasts pass through directly, avoiding nested per-peer envelopes and making standard native signals available without an extra router wrapper.
- Native initialization honors custom names, bounds queues, rejects timeouts, propagates send failures and cancels polling on destruction. Swift WKWebView and Java AndroidX adapters are included as source, with origin/main-frame restrictions and JSON-safe delivery.
- Schema-validation's missing runtime bundle is generated. All package subpaths have declaration conditions. Build banners state Apache-2.0 and minification preserves public/wire properties.
- Documentation no longer describes nonexistent facade methods or presents local emitter throughput as cross-context RPC. Unverified comparison matrices, fixed passing-test badges, size claims and the A+ security rating were removed.

## Validation

For the 0.1.2 release, the final local complete suite passed **1,093 tests across 64 files**, with **zero failures and zero skips**: 974 unit tests, 15 packaged export/interoperability tests, 89 Chrome E2E tests, 12 browser integration tests and 3 documentation tests. Checks cover source behavior and actual ESM, CommonJS and minified MessageChannel request/response. Consumer TypeScript checks, lint, source type checking and build also passed.

The source-only LCOV report measured **4,322 / 4,519 executable lines (95.64%)**. `bun run test:coverage` now enforces an aggregate 90% source-line minimum. The old Vitest config is unused by the Bun scripts; its branch target was not an active gate. Bun's current LCOV output here has no branch counters, so branch coverage is **not verified**. The measured line ratio does not imply complete security or behavior coverage.

Swift type checking passed against the installed iOS simulator SDK, targeting arm64 iOS 15. Java compilation passed against Android API 35 and cached AndroidX WebKit. `bun run test:native` repeats these compile checks on a configured Mac. Native protocol-envelope interoperability is also tested with JavaScript host doubles; this is distinct from running either native adapter in a real WebView.

The packed npm candidate includes the generated schema-validation runtime/declarations and both native sources. Isolated consumer checks passed on Node 18.20.8 and Node 24.15.0, covering all 12 exports, ESM/CommonJS, minified RPC and schema rejection. Core messaging now uses the UUID fallback when global Web Crypto is absent on Node 18. GitHub Actions checks coverage, packaged exports, consumer declarations, browser tests and a packed-consumer Node 18/20/22/24 matrix. Its actual results must be read from Actions. npm publication is a separate operation; see [RELEASING.md](RELEASING.md).

## Performance evidence

See [BENCHMARKS.md](BENCHMARKS.md) and the JSON artifacts in `benchmarks/` for repeated Node, Bun and headless Chrome measurements, raw samples, runtime/CPU details and artifact hashes. The runner verifies callback counts/checksums and actual MessageChannel round trips. A separate seven-round memory/lifecycle run cancelled all 200 pending requests per round and observed timeout resources return from 200 to zero after destruction; its heap deltas are process observations, not exact object sizes. It aborts on correctness failures rather than publishing their timings. Bundle sizes distinguish default unminified exports from minified variants.

## Historical qualification limits (0.1.2)

At the 0.1.2 audit, physical iOS/Android navigation/teardown and Safari/Firefox qualification were pending; the 0.1.5 record above adds focused checks for specific devices/versions. Local package qualification covered Node 18.20.8 and 24.15.0; the [release CI matrix](https://github.com/GiuseppeScottoLavina/crossbus/actions/runs/43196537107) also passed on Node 18, 20, 22 and 24. Native sources were not published CocoaPods/Maven packages and did not include an application-level native RPC handler registry or pending-request manager. The 0.1.5 packaging work still does not publish those registries or add those application facilities. JSON Schema support remains a subset; full standards compliance is not claimed.

Shared/service worker persistence, offline message delivery, automatic mesh routing, distributed locks and turnkey AI-framework adapters are not provided by merely enabling a transport or importing utilities. They need application design or additional implementation. No workload-independent performance or completeness leadership has been established.

## Documentation and optimization follow-up

Before this release was prepared, the actual GitHub README was read via the authenticated GitHub API on 12 November 2026. Its blob SHA was `e6266d3fd2a5e7ecef36d99fc8533cd662cd9001`; it still contained the older A+ badge and throughput claims. That observation describes the pre-release remote state. Publication of this revision must be verified against the release commit; editing a local README alone does not establish a live GitHub update.

The release's README iframe test substituted local domains and generated its own HTML. That verified the messaging exchange but did not establish that the shipped example was independently runnable. The documentation follow-up adds a complete local server, both HTML/import maps, and a Node RPC module. The revised test executes those actual files across two origins and checks the README's exact Node example. An explicit widget/parent ready exchange avoids relying on iframe load events to imply asynchronous module readiness. Relative Markdown links/images are checked against the checkout, and stale API/support claims in generated JSDoc were corrected.

The follow-up performance changes keep the protocol and resource limits: pending requests use one authoritative Map and one owned Promise/timeout; settlement clears timers synchronously. Calls without hooks skip the redundant asynchronous hook layer while retaining payload checks. RPC returns its tracked Promise directly and still returns rejected Promises for immediate errors. Payload accounting avoids per-message closure/key-array allocation; synchronous transports reuse existing marked protocol envelopes. Empty local emissions avoid unused event metadata.

Preserved pre-change bundles and three fresh baseline/candidate process pairs per runtime establish the primary comparison basis. Process order alternates and each process records nine samples. Multiple fresh processes and unchanged-code controls expose runtime/JIT variation; no speed claim is inferred from the unchanged nano emitter. A separate versioned Comlink MessageChannel comparison measures the same echo payload and topology. See the refreshed [benchmark report](BENCHMARKS.md).
