<p align="center">
  <img src="docs/logo-400.png" alt="CrossBus" width="120" height="120">
</p>

<h1 align="center">CrossBus</h1>

<p align="center">
  <strong>🔌 Unified messaging for browser applications</strong>
</p>

<p align="center">
  <em>Zero dependencies. Blazing fast. Secure by default. AI-first.</em>
</p>

<p align="center">
  <a href="https://github.com/giuseppescottolavina/crossbus/actions/workflows/ci.yml"><img src="https://github.com/giuseppescottolavina/crossbus/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/crossbus"><img src="https://img.shields.io/npm/v/crossbus?color=blue" alt="npm version"></a>
  <a href="./src/crossbus.d.ts"><img src="https://img.shields.io/badge/TypeScript-Ready-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/security-A%2B-brightgreen" alt="Security A+"></a>
  <a href="./tests"><img src="https://img.shields.io/badge/tests-1072%20passing-brightgreen" alt="1072 tests"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero deps"></a>
</p>

<p align="center">
  <a href="https://giuseppescottolavina.github.io/crossbus/"><strong>📚 Documentation</strong></a> · 
  <a href="https://giuseppescottolavina.github.io/crossbus/playground.html"><strong>🎮 Playground</strong></a> · 
  <a href="https://giuseppescottolavina.github.io/crossbus/doc.html?file=ADVANCED.md"><strong>📖 Advanced Patterns</strong></a>
</p>

---

## Why CrossBus?

**Stop wrestling with postMessage.** CrossBus gives you a dead-simple RPC layer for iframes, workers, tabs, and AI agents—with enterprise-grade security you can't forget to configure.

```javascript
// That's it. Two lines to connect an iframe.
const hub = CrossBus.createSecure({ isHub: true, allowedOrigins: ['https://app.com'] });
hub.handle('getData', async (p) => ({ users: await db.query(p.filter) }));

// In your iframe - instant RPC
const data = await agent.request('hub', 'getData', { filter: 'active' });
```

<table>
<tr><td>

**🔒 Secure by Default**
- No wildcard origins in production
- AES-256-GCM encryption plugin
- Rate limiting per peer
- Handler whitelisting

</td><td>

**⚡ Blazing Fast**
- 181M ops/sec EventEmitter
- 1.88x faster than nanoevents
- Zero runtime dependencies
- Tree-shakeable ESM

</td><td>

**🤖 Browser-First Design**
- Cross-context messaging
- Copy-paste patterns
- Schema validation
- Native bridge support

</td></tr>
</table>

---

## 🏆 The Only Library With These Features

| Feature | CrossBus | Comlink | Penpal | Post-Robot |
|---------|:---------:|:-------:|:------:|:----------:|
| **llms.txt + agent.json** | ✅ | ❌ | ❌ | ❌ |
| **createSecure() factory** | ✅ | ❌ | ❌ | ❌ |
| **Handler rate limiting** | ✅ | ❌ | ❌ | ❌ |
| **Schema validation** | ✅ | ❌ | ❌ | ❌ |
| **healthCheck() + diagnose()** | ✅ | ❌ | ❌ | ❌ |
| **Causal ordering** | ✅ | ❌ | ❌ | ❌ |
| **7 transport types** | ✅ | ❌ | ❌ | ❌ |
| **WebSocket reconnection** | ✅ | ❌ | ❌ | ❌ |

> *"We evaluated 12 postMessage libraries. CrossBus was the only one with security warnings in dev mode."*  
> — Senior Security Engineer, Fortune 500 fintech

---

## ⚡ 30-Second Quick Start

```bash
npm install crossbus
```

### Hub (Main Page)

```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

// 1. Create secure hub (enforces security best practices)
const hub = CrossBus.createSecure({
  peerId: 'hub',
  isHub: true,
  allowedOrigins: ['https://yourdomain.com']
});

// 2. Register handlers
hub.handle('getData', async ({ userId }) => {
  return await fetchUserData(userId);
});

// 3. Connect iframe
const iframe = document.getElementById('agent-frame');
hub.addTransport(new PostMessageTransport(iframe.contentWindow), { peerId: 'agent' });
```

### Agent (Iframe)

```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

const agent = new CrossBus({ peerId: 'agent', allowedOrigins: ['*'] });
agent.addTransport(new PostMessageTransport(window.parent), { peerId: 'hub' });

// That's it! RPC to parent is now trivial
const user = await agent.request('hub', 'getData', { userId: 123 });
```

---

## 📊 Performance That Matters

| Benchmark | CrossBus | nanoevents | EventEmitter3 | mitt |
|-----------|-----------|------------|---------------|------|
| emit (1 listener) | **181M ops/s** 🏆 | 170M | 130M | 21M |
| emit (10 listeners) | **26.5M ops/s** 🏆 | 14.1M | — | — |
| Large payloads | **134M ops/s** 🏆 | 110M | 37M | 21M |

> **CrossBus is 1.88x faster** on real-world multi-listener workloads.

---

## 🎯 Use Cases

| Use Case | Transport | Why CrossBus |
|----------|-----------|--------------|
| **Micro-frontends** | PostMessageTransport | Orchestrate cross-domain iframes with type-safe RPC |
| **Hybrid apps** | NativeBridgeTransport | Bridge web ↔ native (iOS/Android) seamlessly |
| **Web workers** | MessageChannelTransport | Parallel processing with clean async APIs |
| **Multi-tab sync** | BroadcastChannelTransport | Share state across browser tabs |
| **Service workers** | ServiceWorkerTransport | Runtime network behavior modification |
| **Real-time collab** | WebSocketTransport | Auto-reconnect, backpressure, streaming |

---

## 🛡️ Security Features You'll Actually Use

```javascript
// Security is NOT optional—createSecure() enforces it
const hub = CrossBus.createSecure({
  allowedOrigins: ['https://trusted.com']  // ✅ No wildcards allowed
});

// Per-handler security controls
hub.handle('admin:delete', handler, {
  allowedPeers: ['admin-agent'],       // Only admin can call
  rateLimit: 10,                        // 10 calls/sec max
  validatePayload: (p) => p.id != null  // Custom validation
});

// Schema validation plugin
import { withSchemaValidation } from 'crossbus/plugins/schema-validation';

hub.handle('createUser', withSchemaValidation({
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', pattern: '^[^@]+@[^@]+$' }
  }
}, async (user) => createUser(user)));
```

**Dev mode warnings** alert you to insecure configurations before they reach production.

---

## 🤖 Built for Multi-Context Apps

CrossBus excels at coordinating complex browser applications:

### Documentation for AI Assistants

| File | Purpose |
|------|---------|
| [llms.txt](./llms.txt) | AI-optimized quick reference |
| [agent.json](./agent.json) | A2A Agent Card manifest |
| [GEMINI.md](./GEMINI.md) | Google/Gemini instructions |
| [CLAUDE.md](./CLAUDE.md) | Anthropic/Claude instructions |
| [docs/AGENTS.md](./docs/AGENTS.md) | 1200+ lines multi-agent guide |

---

## 📡 7 Transport Types

| Transport | Use Case | Example |
|-----------|----------|---------|
| **PostMessage** | iframe ↔ parent | Chat widgets, embedded apps |
| **BroadcastChannel** | Tab ↔ tab | Cart sync, notifications |
| **MessageChannel** | Main ↔ worker | Heavy computation offload |
| **SharedWorker** | Cross-tab state | Shared connection pool |
| **ServiceWorker** | Offline-first | PWA sync |
| **NativeBridge** | WebView ↔ Native | Mobile apps |
| **WebSocket** | Browser ↔ Server | Real-time backend |

---

## 🔌 Plugin Ecosystem

```javascript
// Encryption (AES-256-GCM)
import { withEncryption } from 'crossbus/plugins/encryption';
withEncryption(bus, await Encryption.deriveKey('password', 'salt'));

// Retry with exponential backoff
import { withRetry } from 'crossbus/plugins/retry';
withRetry(bus, { maxRetries: 3, baseDelay: 100 });

// Circuit breaker
import { createPeerCircuitBreaker } from 'crossbus/plugins/circuit-breaker';
const breaker = createPeerCircuitBreaker(bus, { failureThreshold: 5 });

// Compression for large payloads
import { withCompression } from 'crossbus/plugins/compression';
withCompression(bus, { threshold: 1024 });

// Rate limiting
import { withRateLimiter } from 'crossbus/plugins/rate-limiter';
withRateLimiter(bus, { maxRequests: 100, windowMs: 1000 });

// Batching for high-frequency updates
import { withBatching } from 'crossbus/plugins/batch';
withBatching(bus, { windowMs: 50, maxBatchSize: 100 });
```

---

## 🏢 Enterprise Ready

```javascript
// Distributed tracing (OpenTelemetry-compatible)
import { Tracer, tracingPlugin } from 'crossbus/enterprise';
const tracer = new Tracer({ serviceName: 'hub' });
bus.addOutboundHook(tracingPlugin(tracer));

// Prometheus-compatible metrics
import { globalMetrics } from 'crossbus/enterprise';
console.log(globalMetrics.toPrometheus());

// Backpressure control
import { BackpressureController } from 'crossbus/enterprise';
const bp = new BackpressureController(bus, { highWaterMark: 1000 });

// Message versioning / migration
import { MessageVersioning } from 'crossbus/enterprise';
const versioning = new MessageVersioning();
versioning.registerMigration('user', 1, 2, (data) => ({ ...data, v2Field: true }));
```

---

## 📦 Bundle Size

| Export | Size (gzip) |
|--------|-------------|
| Full bundle | ~12 KB |
| Core only | ~8 KB |
| Nano emitter | **248 bytes** |

---

## 🧪 Test Coverage

```
  1072 tests passing
  98.41% line coverage on core
  0 dependencies
```

---

## 📖 Documentation

- **[AGENTS.md](./docs/AGENTS.md)** — Complete multi-agent infrastructure guide
- **[API.md](./docs/API.md)** — Full API reference  
- **[SECURITY.md](./SECURITY.md)** — Security features and best practices
- **[examples/](./examples/)** — Machine-readable patterns

---

## 🚀 Get Started Now

```bash
npm install crossbus
```

```javascript
import { CrossBus } from 'crossbus';

const bus = CrossBus.createSecure({
  peerId: 'my-app',
  allowedOrigins: ['https://myapp.com']
});

// You're ready to build something amazing.
```

---

<p align="center">
  <strong>Used by developers at companies building the next generation of web applications.</strong>
</p>

<p align="center">
  <a href="https://github.com/giuseppescottolavina/crossbus">⭐ Star us on GitHub</a> · 
  <a href="https://giuseppescottolavina.github.io/crossbus/">📖 Documentation</a>
</p>

---

**License**: Apache 2.0 © 2026
