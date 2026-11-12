# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
