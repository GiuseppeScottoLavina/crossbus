# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-11-14

- Add opt-in stream consumption acknowledgements, bounded credit windows, acknowledgement/lifetime deadlines, cancellation, native binary chunks and serialized concurrent writes/end. Default base64 framing remains compatible with 0.1.4; flow mode requires compatible 0.1.5 endpoints and does not silently downgrade.
- Use optional standard typed-array base64 encode/decode methods when available, retaining canonical padded chunks and tight-loop btoa/atob fallbacks on older engines. Verify empty/all-byte/chunk-boundary compatibility and measure binary delivery separately from RPC.
- Bound stream queues, reorder windows, control messages and manager stream counts. Reassemble bounded out-of-order chunks, reject invalid end sequences and release queues on cancellation. Applications buffering more than 1,024 chunks or 8 MiB must consume incrementally or explicitly configure their limits.
- Share one timer across default-timeout RPC requests on each CrossBus instance. Custom deadlines retain individual timers; peer matching, pending quotas and timeout behavior remain enforced. Record resource savings separately from throughput results.
- Reject boolean protocol markers in the Swift adapter; Foundation's NSNumber bridging previously let `true` pass as numeric `1`.
- Add local SwiftPM/CocoaPods configuration and a Gradle Android AAR/source/POM build, including license verification and an AAR consumer. Native registries are not published by these changes.
- Retain focused Chrome/Firefox/Safari/iPad browser and physical iPad/Pixel WebView receipts with exact input hashes; add native compile/package jobs and Chrome qualification to CI.
- Preserve older benchmark locks/artifacts and record a separate 0.1.4/0.1.5 paired-process RPC comparison. Historical releases and tags are unchanged.

## [0.1.4] - 2026-11-13

- Amortize browser UUID entropy calls using fresh Web Crypto byte slices and canonical UUID v4 formatting; retain native Node/Bun UUID generation and the existing no-Web-Crypto fallback. Performance scope is recorded separately from UUID-only diagnostics.
- Decode the existing MessageChannel and PostMessage JSON-string serializer fallback before protocol validation. Authenticate window origin/source before decoding, preserve per-message guards, reject explicit JSON transfer lists and avoid detaching buffers omitted by serialization.
- Discover actual typed-array/DataView backing storage without enumerating numeric indices or ignored custom properties. Opt-in `autoTransfer` moves eligible same-realm ArrayBuffers in full, detaching every sender alias; Node Buffers and shared storage keep their previous copy/share behavior.
- Apply payload budgets to native buffer storage lengths even when public `buffer` or `byteLength` properties are shadowed.
- Update ESLint to 10.14.0, Rollup to 4.68.2, Prettier to 3.9.10 and Puppeteer Core to 25.17.0 with a combined, clean-installable lockfile. Regenerate source maps and the bundle report.
- Record the verified npm 0.1.3 publication in the README and release guide; keep the published archive and tag separate from post-release development changes.
- Refresh development dependencies and their lockfile: @eslint/js 10.0.1, globals 17.14.0, @rollup/plugin-terser 1.0.2, rollup-plugin-visualizer 7.1.3 and TypeScript 6.0.3.
- Preserve declaration output paths under TypeScript 6 with explicit source roots and Node type inclusion; use a separate strict configuration for consumer declaration checks and verify TypeScript 5.9 compatibility in CI.
- Regenerate private helper declarations and the bundle visualization. The package export map is unchanged; the tagged 0.1.3 archive remains separate from this development version.
- Include @eslint packages and globals in the existing grouped minor/patch Dependabot updates; major upgrades still require separate review.

## [0.1.3] - 2026-11-13

- Reduce owned message-record, synchronous inbound-dispatch, debug and pending-request lookup overhead while retaining validation, timeout and peer checks.
- Add opt-in compact MessageChannel encoding for compatible 0.1.3+ receivers; standard encoding remains the default for 0.1.2 interoperability.
- Correct deep/cyclic payload accounting and charge typed views for their complete backing storage, including SharedArrayBuffer.
- Fix binary stream chunk boundaries and empty binary streams; validate chunk sizes, bind streams to their source peer and add explicit manager destruction.
- Fix empty routing targets, obsolete handler cleanup, missing-origin acceptance outside browsers, destruction event delivery and presence cleanup.
- Settle WebSocket connection failures/early closure, share concurrent connection attempts, honor subprotocols, add listener removal and bound offline queues with serialized snapshots.
- Replace simulated documentation playground behavior with actual CrossBus, module Workers and iframe transports. Ship the exact documentation bundle and a pinned local Markdown parser with its license; validate Markdown document routes and error rendering.
- Add source-reviewed Comlink/birpc/Penpal and emitter comparisons with correctness checks, frozen bundles and repeated isolated Node/Bun/Chrome/Worker measurements; see the competitor study for results and tradeoffs.
- Clean generated distribution files before building, synchronize documentation assets and validate packaged Markdown links and mixed-version MessageChannel interoperability.
- Retain repository-only explicit RPC grouping prototypes, 40 regression tests and a reproducible performance study. Experimental adapters are excluded from npm and do not change the public API or default wire format; see `docs/RPC_BATCHING.md` for graph semantics, gains and regressions.

WebSocket offline queues now default to at most 1,000 messages (`maxQueueSize: 0` opts out). Missing transport origins outside browser windows must be explicitly configured. Stream managers can be destroyed explicitly; streams still have no built-in deadline or backpressure. Compact encoding is not negotiated with older peers and must be selected deliberately.

## [0.1.2] - 2026-11-12

- Support core messaging on Node 18 without requiring global Web Crypto.
- Preserve the Apache-2.0/version banner in minified artifacts.
- Verify the exact README iframe modules across two origins, including readiness, and check relative documentation links.
- Reduce RPC Promise/timer and request-table overhead, preserve rejection contracts, and reduce payload/transport allocations.
- Add alternating preserved-bundle comparisons, repeated processes and a versioned Comlink RPC comparison.

- Fix hook failures that previously allowed rejected payloads to reach handlers.
- Enforce pending-request limits and in-memory payload budgets; release settled timeout resources.
- Match RPC responses to their target peer, use actual transport origins and close attached transports on destruction.
- Fix `MessageChannelTransport.fromPort()` private-field initialization.
- Fix namespace wildcard delivery, recursive once listeners, mixed fast/regular registrations and prototype-name event keys.
- Forward standard broadcast envelopes directly, avoiding per-peer wrapping.
- Fix presence/batching integration, preserve signal results and routing options, and run inbound validation on each unbatched signal.
- Bound native initialization queues; honor custom bridge names and propagate initialization/send failures.
- Add origin-restricted Swift WKWebView and Java AndroidX WebView source adapters.
- Generate the missing schema-validation runtime export and declaration conditions for subpaths.
- Correct build license banners and preserve public/wire property names in minified output.
- Add repeated correctness-checked Node/Bun/Chrome benchmarks and package export tests.

Hook rejection and native initialization failure now stop processing; applications relying on previous silent failures must handle these errors.

## [0.1.0] - 2026-02-02

### 🎉 Initial Public Release

First public release of CrossBus — unified messaging for browser applications.

### Features

#### Core
- **7 Transport Types**: PostMessage, BroadcastChannel, MessageChannel, SharedWorker, ServiceWorker, NativeBridge, WebSocket
- **Zero Dependencies**: Pure ES modules, tree-shakeable
- **TypeScript Ready**: Full type definitions included

#### Security
- **Secure by Default**: `createSecure()` factory enforces best practices
- **Origin Validation**: Configurable allowed origins with wildcard support
- **Handler Whitelisting**: `allowedPeers` per handler
- **Encryption Plugin**: AES-256-GCM via Web Crypto API

#### Plugins
- **Rate Limiter**: Token bucket algorithm with per-peer limits
- **Compression**: Native gzip/deflate with configurable threshold
- **Batch Processing**: Automatic message batching
- **Retry**: Exponential backoff with jitter
- **Circuit Breaker**: Fault tolerance for unreliable peers
- **Schema Validation**: JSON Schema validation for payloads

#### Enterprise
- **Distributed Tracing**: W3C Trace Context compatible
- **Metrics**: Prometheus-compatible export
- **Backpressure**: Per-peer queue management
- **Message Versioning**: Schema evolution support

#### AI-First
- **llms.txt**: LLM-readable documentation
- **agent.json**: Structured agent metadata
- **AGENTS.md**: Multi-agent architecture patterns
- **GEMINI.md / CLAUDE.md**: AI-specific integration guides

### Documentation
- Interactive Playground with 4 live demos
- In-browser doc viewer with TOC
- Performance benchmarks
- Security configuration guide (no independent rating established)

### Historical measurements

Earlier throughput, test-count and coverage claims have been withdrawn because their methodology and current applicability were not established. See `docs/BENCHMARKS.md` for reproducible measurements of this checkout.
