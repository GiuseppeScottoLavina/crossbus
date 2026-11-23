# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Skill declaration:** `package.json` declares the packaged skill as `"agents": { "skills": [{ "name": "crossbus", "path": "./skills/crossbus" }] }`, for tools that read declared skills before scanning `skills/<name>/SKILL.md`. The keywords gain `agent-skills`. `tests/package/skill.test.js` checks that each declared skill ships, holds a `SKILL.md` and carries the declared name.

## [0.1.9] - 2026-11-23

Packaging and documentation release. Runtime code, wire formats and the native adapters are unchanged from 0.1.8; the built files in `dist/` differ only in their version banner.

- **Coding-agent skill:** the package now ships `skills/crossbus/` (`SKILL.md` plus `references/advanced.md`). It covers choosing between request, signal and broadcast, a two-peer MessageChannel example, transport wiring, diagnosis by error code, and recipes for streams, hubs, plugins, presence and causal order. `bun run test` runs its example against the checkout and checks that its version pins match package.json; the packed-consumer smoke test runs the same example from the installed package.
- **Agent metadata:** `agent.json` points to the skill as `agentSkill`, and the README explains where to copy it from `node_modules/crossbus/skills/crossbus/` or how to read it from jsDelivr.

## [0.1.8] - 2026-11-19

Fixes from a review after 0.1.7 ([docs/AUDIT.md](docs/AUDIT.md)), each with a regression test. Encrypted 0.1.7 and 0.1.8 endpoints interoperate in both directions. Page and tooling changes since 0.1.7 follow.

- **Encryption replay protection (security fix):** in 0.1.7 two copies of an encrypted message that arrived together were both accepted, because the hook checked the IV before decrypting and recorded it only afterwards. Over a real MessageChannel, a signal duplicated on the wire reached its listener twice, and a duplicated request would run its handler twice. Also, a full IV cache (50,000 entries, reached in seconds at the measured 9,000–27,000 encrypted RPC/s) forgot entries that could still be replayed. Each `withEncryption()` installation is now a sending session that numbers its messages inside the ciphertext. The receiver checks and records the number in one step after authentication, against a sliding window per session (`replayWindow`, default 4,096; `maxReplaySessions`, default 1,024). Messages from 0.1.7 senders are still accepted once per IV, and a full cache now refuses them (`ERR_REPLAY_CAPACITY`). A session stops at 2³² messages (`ERR_ENCRYPTION_LIMIT`). 0.1.7 and 0.1.8 endpoints interoperate in both directions; `tests/unit/encryption-replay-window.test.js` checks this against the published 0.1.7 plugin. The PBKDF2 default is unchanged so derived keys still match; the documentation now recommends 600,000 iterations.
- **Teardown and disconnection.**
  - `MessageChannelTransport.destroy()` no longer closes a remote port that `fromPort()` has adopted. In the same-context pattern from the getting-started guide, destroying one side closed the other side's port and dropped any message still queued for it.
  - A cleanup returned by `addTransport()` no longer removes a later registration that reuses its peer ID. Before, that registration silently stopped receiving.
  - New `addTransport(transport, { goodbye: true })`, for channels with exactly one remote bus. When the binding ends (cleanup, `removePeer()` or `destroy()`), it sends a `bye` envelope, and the receiving side ends its own binding at once. Its pending requests then reject with `ERR_PEER_DISCONNECTED` immediately, instead of at `requestTimeout`. It is off by default: a 0.1.7 receiver logs one warning for a `bye`, and on shared channels such as BroadcastChannel one leaving tab would end the binding for all.
  - New `StreamManager.closePeer(peerId, reason?)` ends one peer's streams locally; call it on `peer:disconnected`.
  - `destroy()` rejects requests to `addPeer()` peers with `ERR_DESTROYED` and the message "CrossBus instance has been destroyed" (before, a plain `Error('All requests cancelled')` with no code). A `signal()` whose outbound hooks were still running also rejects with `ERR_DESTROYED`, as `request()` already did; before, it reported success with 0 deliveries.
  - `tests/unit/teardown.test.js` also checks, from a separate Node process, that no port or timer outlives `destroy()`.
  - A security-audit test that could expire under load now gives its first request a longer timeout.
  - The worker-pool demo no longer reports an uncaught `ERR_PEER_DISCONNECTED` when a setting restarts the Workers while a render is in flight; that render is now treated as stale. The demo test reproduces the race.
- **Stream fixes from a seeded fuzz test.**
  - `tests/unit/stream-fuzz.test.js` drives two `StreamManager`s through a simulated channel that reorders, duplicates and drops frames, with random chunk sizes, encodings, windows and consumer pace, and with aborts, cancellations and manager destruction. It checks:
    - every run settles on both sides;
    - exact data when nothing was lost;
    - the writer never exceeds its credit window, and the reader never holds more chunks than the window;
    - nothing stays open, and every error carries an `ERR_STREAM_*` code.
  - It found two defects:
    - a reader received a remote error as a plain `Error` with no code, while writers and the documentation report it as `ERR_STREAM_CANCELLED`;
    - `StreamManager.destroy()` marked itself destroyed before notifying, so its peer was never told and waited for its acknowledgement deadline (30 s by default) or, for a legacy reader, forever. It now sends each peer an error frame first.
  - 4,000 seeds pass, and the harness catches an off-by-one credit window.
- Add live demos to the GitHub Pages site (`docs/demos/`): a fractal rendered across Web Workers with request/response, tabs kept in sync over BroadcastChannel, and an encrypted channel whose replay, forgery and tampering attempts are refused. Each page draws a live trace of the real envelopes it sends and shows the source it runs. A Chrome test runs every demo from the Pages folder alone. The build also copies `dist/plugins/encryption.min.js` into `docs/assets/plugins/`.
- The worker-pool demo stops zooming in at about 2.8e-14 per pixel. Past that depth 64-bit floats cannot tell neighbouring pixels apart and the image broke into blocks. The `+` button is then disabled and the caption says why.
- Pages site discoverability: add a sitemap, canonical URLs, Open Graph and Twitter cards with a social image (`docs/og-card.png`) and JSON-LD on the home page. Documentation pages now take their title and description from the document they show. The orphaned `site.html` redirects to the home page, and unused images that still showed the project's former name were removed. In `package.json`, `homepage` now points to the Pages site, the keywords are broader and the description matches the README. npm shows them from 0.1.8.
- Redesign the home page, documentation viewer and playground with the design system of the live demos, in light and dark themes. The home page runs a real module Worker and shows the code it runs. The previous placeholder statistics are replaced by content from the README: message kinds, the transport matrix, the security model with its limits, optional modules, compatibility and alternatives. The documentation viewer gains an "On this page" list, a menu button on phones, scrollable tables, coloured JavaScript and a link to each source file. Before, a phone had to scroll documentation sideways. All pages share one header and footer, written by `scripts/site-chrome.js`. `tests/docs/site.test.js` checks the shared chrome, the live home page and the documentation viewer, and that no page scrolls sideways at 390 or 1,280 px.
- Build with TypeScript 7.0.2 (was 6.0.3). The source JSDoc now uses explicit `@typedef` declarations for enum-like constants and TypeScript-syntax function types, which TypeScript 7 requires; it still type-checks with TypeScript 6. The minified bundles are byte-identical. The generated declarations type-check for strict consumers on TypeScript 7.0, 6.0 and 5.9; CI now also tests 6.0. A checker-based comparison found the same public types (details in `docs/DEVELOPMENT.md`).
- Qualify the published 0.1.7 on a physical iPad (iPadOS 27.2.1): all eleven Safari browser cases, the WKWebView native host, and a second host run with a test-only patch in which the Swift bridge rejects a non-JSON reply (`CrossBus` error 2) before accepting a valid one. The receipts, patch and archived 0.1.7 inputs are in `benchmarks/qualification/2026-11-19/`. `tests/qualification/check-receipts.js` now verifies them in CI, including that the patched host is the original plus exactly the patch.

## [0.1.7] - 2026-11-15

Security fixes from a local audit of 0.1.6; each finding has a regression test in `tests/unit/security-audit-0.1.7.test.js`.

- **Encryption (breaking for encrypted deployments):** `withEncryption()` now encrypts every outbound payload, response and RPC error. AES-GCM additional data binds the message type, the signal or handler name and, for replies, the request ID. Inbound plaintext, moved or modified ciphertext, replays within the window and timestamps beyond `maxClockSkew` are rejected. Both endpoints must be upgraded together; `requireEncryption: false` eases migration. `Encryption.decrypt()` now requires a timestamp and rejects future-dated messages instead of warning.
- **Compression:** the inbound hook caps decompressed output (`maxDecompressedBytes`, default 1 MiB) and accepts only `gzip`, `deflate` and `deflate-raw`. A 1 MiB message could previously expand to gigabytes.
- **iOS adapter:** check `JSONSerialization.isValidJSONObject` before serializing received and sent messages. A page could crash the host app by posting a `Date`, `NaN` or `Infinity`, because `try?` does not catch the Objective-C exception.
- **Schema validation:** check `maxItems` before visiting array items and visit only present elements, so a sparse array with a huge `length` no longer blocks the receiver.
- **Rate limiter:** `createHook({ throwOnLimit: false })` now drops limited messages through the new `ERR_MESSAGE_DROPPED` code instead of dispatching them with a null payload.
- **Tracing:** bound stored traces (`maxTraces`, default `maxSpans`); remote trace IDs previously grew memory without limit.
- **Origin patterns:** `PostMessageTransport` and `OriginValidator` share one matcher. `*` is accepted only as the leftmost subdomain labels, the whole host or the port; other positions throw. `https://*.example.com` previously rejected real subdomains while accepting `https://.example.com`, and `OriginValidator` let `https://example.com*` match `example.com.evil.net`.
- **Core:** remote signals cannot trigger the local `destroyed`/`peer:*` events and are delivered with `source.type: 'remote'`; `removePeer()` stops an `addTransport()` channel from dispatching; requests for unknown handlers or from peers outside `allowedPeers` are refused before inbound hooks; handshake messages without a reply channel are ignored and responder state is bounded and expires.
- **Hooks:** `addInboundHook()`/`addOutboundHook()` accept `{ errors: true }` to transform RPC errors. Hook context adds `requestId`, `requestName`, `success`, `batched` and the signal name in `handlerName` for outbound signals.
- **Performance:** keep the shared default RPC deadline timer armed (unreferenced in Node/Bun) while no request is pending, instead of clearing and recreating it for every sequential call. Received remote signals with one listener take the emitter's single-listener path. Sequential 1 KiB echo measured paired medians of 1.05–1.06× on Node, 1.07–1.09× in same-page Chrome, 1.04–1.06× in a Chrome Worker and 1.02–1.04× on Bun, with no change at 64 in flight; see `benchmarks/deadline-timer-0.1.7/`.
- **Hardening:** `createSecure()` rejects zero budgets; allowing the `'null'` origin logs a development warning; `StreamManager` adds `maxIncomingStreamsPerPeer`; a failed version migration rejects the message; the `MessageChannelTransport` JSDoc example checks origin and source during port handoff.

## [0.1.6] - 2026-11-15

- Add opt-in MessageChannel `compact-v2` encoding with numeric tags and constant-field omission for successful responses, reconstructing the original protocol fields. Both endpoints must support the decoder; default standard encoding and compact-v1 compatibility remain available.
- Route standard MessageChannel objects directly to protocol validation, avoiding the compact-array decoder call. Retain paired-process and within-process RPC comparisons, controls, rejected prototypes and Worker follow-up evidence in docs/RPC_WIRE_V2.md.

- Accelerate the Node base64 stream fallback using the existing Buffer global, preserving canonical chunks, strict atob decoding, exact owned storage and standard typed-array codec precedence.
- Store queued stream data and captured byte charges in one FIFO; remove redundant private async wrappers while preserving public promise/error/cancellation behavior.
- Retain the RPC implementation and core runtime after rejecting small bundle reductions with unfavorable measured RPC tradeoffs.
- Retain separate 0.1.5/candidate process-paired stream/RPC evidence, source snapshots, controls and rejected experiments in docs/OPTIMIZATION_016.md. The 0.1.5 physical-device receipts remain historical evidence.

- Declare `success` in the `signal()` return type, matching the runtime result, and check it in the consumer declaration test. Correct shipped JSDoc examples for `broadcastRequest()` results, `healthCheck()` shape, presence listener arguments and the class overview.
- Remove an unreachable strict-mode wildcard branch from the development warning path; the constructor rejection is unchanged and independent of `NODE_ENV`.
- Fix pattern scaffolds: use the Subscription object returned by `on()`, install iframe transports and ready listeners before navigation, register the requested agent handler, describe `'*'` and `isHub` accurately and drop a nonexistent related pattern. Remove a no-op metadata assignment from the tool-agent template.
- Remove wildcard origins from all pattern scaffolds and templates; they now use `createSecure()` with exact origins or the `channel` label. Worker scaffolds use a module Worker over a transferred MessageChannel with a ready handshake and an explicit payload budget. Agent templates announce `agent:ready` on connect, and the orchestrator identifies agents by their bound peer rather than a payload ID, installs iframe transports before navigation and clears tool timeouts. These flows were checked in headless Chrome across two local origins and a module Worker.
- Restructure the README around installation, runnable Node/iframe/Worker examples, core concepts, security responsibilities, scoped performance evidence, compatibility and a version/evidence table; move release-by-release narrative to the versioned studies. The documentation tests now run the inline iframe and Worker snippets in Chrome, and the release guide lists the README fields to refresh per version.
- Align contributing guides with the actual scripts, install command and 90% coverage gate; point stale 0.1.3/0.1.5 "current" references to the 0.1.6 studies and record the 0.1.6 qualification status in docs/AUDIT.md.

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
