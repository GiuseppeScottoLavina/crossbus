# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Security audit (A+ rating)

### Performance
- **~170M ops/sec** emitSync (1 listener)
- **57M ops/sec** emitSync (10 listeners)
- Competitive with nanoevents on emit workloads

### Tests
- **1074 tests** passing
- **98.41%** line coverage on core
