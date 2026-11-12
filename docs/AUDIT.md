# Local audit — 12 November 2026

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

The final local complete suite passed **1,093 tests across 64 files**, with **zero failures and zero skips**: 974 unit tests, 15 packaged export/interoperability tests, 89 Chrome E2E tests, 12 browser integration tests and 3 documentation tests. Checks cover source behavior and actual ESM, CommonJS and minified MessageChannel request/response. Consumer TypeScript checks, lint, source type checking and build also passed.

The source-only LCOV report measured **4,322 / 4,519 executable lines (95.64%)**. `bun run test:coverage` now enforces an aggregate 90% source-line minimum. The old Vitest config is unused by the Bun scripts; its branch target was not an active gate. Bun's current LCOV output here has no branch counters, so branch coverage is **not verified**. The measured line ratio does not imply complete security or behavior coverage.

Swift type checking passed against the installed iOS simulator SDK, targeting arm64 iOS 15. Java compilation passed against Android API 35 and cached AndroidX WebKit. `bun run test:native` repeats these compile checks on a configured Mac. Native protocol-envelope interoperability is also tested with JavaScript host doubles; this is distinct from running either native adapter in a real WebView.

The packed npm candidate includes the generated schema-validation runtime/declarations and both native sources. Isolated consumer checks passed on Node 18.20.8 and Node 24.15.0, covering all 12 exports, ESM/CommonJS, minified RPC and schema rejection. Core messaging now uses the UUID fallback when global Web Crypto is absent on Node 18. GitHub Actions checks coverage, packaged exports, consumer declarations, browser tests and a packed-consumer Node 18/20/22/24 matrix. Its actual results must be read from Actions. npm publication is a separate operation; see [RELEASING.md](RELEASING.md).

## Performance evidence

See [BENCHMARKS.md](BENCHMARKS.md) and the JSON artifacts in `benchmarks/` for repeated Node, Bun and headless Chrome measurements, raw samples, runtime/CPU details and artifact hashes. The runner verifies callback counts/checksums and actual MessageChannel round trips. A separate seven-round memory/lifecycle run cancelled all 200 pending requests per round and observed timeout resources return from 200 to zero after destruction; its heap deltas are process observations, not exact object sizes. It aborts on correctness failures rather than publishing their timings. Bundle sizes distinguish default unminified exports from minified variants.

## Outstanding qualification

Physical iOS/Android WebView tests, navigation/teardown checks on those devices, Safari/Firefox qualification remain pending. Local package qualification covers Node 18.20.8 and 24.15.0; intermediate versions are covered by the configured CI matrix only when its jobs pass. Native sources are not published CocoaPods/Maven packages and do not include an application-level native RPC handler registry or pending-request manager. JSON Schema support is a subset; full standards compliance is not claimed.

Shared/service worker persistence, offline message delivery, automatic mesh routing, distributed locks and turnkey AI-framework adapters are not provided by merely enabling a transport or importing utilities. They need application design or additional implementation. No workload-independent performance or completeness leadership has been established.

## Documentation and optimization follow-up

Before this release was prepared, the actual GitHub README was read via the authenticated GitHub API on 12 November 2026. Its blob SHA was `e6266d3fd2a5e7ecef36d99fc8533cd662cd9001`; it still contained the older A+ badge and throughput claims. That observation describes the pre-release remote state. Publication of this revision must be verified against the release commit; editing a local README alone does not establish a live GitHub update.

The README's iframe modules now live in `examples/quickstart/`; documentation tests assert that its code blocks match those files and run their request/response exchange across two distinct origins on cold and warm page loads. A ready signal avoids sending before the parent's transport is installed. Relative Markdown links/images are checked against the checkout, and stale API/support claims in generated JSDoc were corrected.

The follow-up performance changes keep the protocol and resource limits: pending requests use one authoritative Map and one owned Promise/timeout; settlement clears timers synchronously. Calls without hooks skip the redundant asynchronous hook layer while retaining payload checks. RPC returns its tracked Promise directly and still returns rejected Promises for immediate errors. Payload accounting avoids per-message closure/key-array allocation; synchronous transports reuse existing marked protocol envelopes. Empty local emissions avoid unused event metadata.

Preserved pre-change bundles and three fresh baseline/candidate process pairs per runtime establish the primary comparison basis. Process order alternates and each process records nine samples. Multiple fresh processes and unchanged-code controls expose runtime/JIT variation; no speed claim is inferred from the unchanged nano emitter. A separate versioned Comlink MessageChannel comparison measures the same echo payload and topology. See the refreshed [benchmark report](BENCHMARKS.md).
