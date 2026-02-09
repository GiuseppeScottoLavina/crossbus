# CrossBus: A High-Performance, Security-First Communication Infrastructure for Multi-Agent Browser Applications

**Authors:** Giuseppe Scotto La Vina¹  
**Affiliation:** ¹Independent Research  
**Date:** January 2026  
**Keywords:** Cross-context messaging, Multi-agent systems, Browser security, CRDTs, Causal Ordering, Real-time communication

---

## Abstract

Modern web applications increasingly rely on cross-context communication between iframes, Web Workers, Service Workers, and browser tabs. Existing solutions like Comlink, Penpal, and post-robot provide developer-friendly abstractions but trade performance for convenience and lack comprehensive security models. We present **CrossBus**, a zero-dependency communication library that achieves ~170 million operations per second for local events while maintaining defense-in-depth security through origin validation, ReDoS-protected pattern matching, and a three-way handshake protocol. Beyond basic messaging, CrossBus introduces infrastructure for distributed browser systems, including **Causal Ordering** via Vector Clocks for consistency across agents, **SharedWorker/ServiceWorker** transports for persistent state, and an **Encryption** layer using AES-256-GCM. Our evaluation demonstrates that CrossBus achieves competitive or better throughput than existing event emitter libraries while enabling complex multi-agent architectures in the browser.

---

## 1. Introduction

### 1.1 Motivation

The browser has evolved from a document viewer to a distributed computing platform. Modern applications embed third-party widgets in iframes, offload computation to Web Workers, synchronize state across tabs, and increasingly host AI agents that coordinate through message passing. The `postMessage` API provides the foundational primitive, but its low-level nature creates friction:

- **No built-in request/response** pattern
- **Manual origin validation** prone to developer error
- **No connection lifecycle** management
- **No consistency guarantees** for distributed state

Libraries like Comlink [1], Penpal [2], and post-robot [3] address ergonomics but introduce performance overhead and provide limited security guarantees. Furthermore, none address the consistency challenges of **distributed multi-agent systems** running across multiple browser contexts (tabs/workers).

### 1.2 Contributions

This paper makes the following contributions:

1. **CrossBus Architecture**: A hub-and-spoke messaging system supporting signals, request/response RPC, and broadcast with automatic peer management.

2. **Distributed Consistency**: Implementation of **Vector Clocks** and **Causal Ordering** middleware to ensure causal consistency in distributed agent systems without a central server.

3. **Security Model**: A defense-in-depth approach including three-way handshake, origin allowlisting with ReDoS-protected wildcards, and optional **AES-256-GCM encryption** for end-to-end privacy.

4. **Multi-Transport Layer**: Unification of `postMessage`, `BroadcastChannel`, `MessageChannel`, `SharedWorker`, and `ServiceWorker` under a single API.

5. **Performance Engineering**: Techniques achieving ~170M ops/sec for local events through zero-allocation hot paths and V8-optimized call sites.

---

## 2. Related Work

### 2.1 Browser Messaging Primitives

The **postMessage API** (HTML5) enables cross-origin communication between Window objects. **BroadcastChannel** (2016) provides publish-subscribe across same-origin contexts. **SharedWorkers** allow shared state between tabs/iframes from the same origin.

### 2.2 Existing Libraries

**Comlink** [1] wraps Web Workers with ES6 Proxies. While ergonomic, it creates new handler functions per request, increasing GC pressure, and lacks origin validation.

**Penpal** [2] provides promise-based iframe communication. It supports origin validation but lacks hub routing and causal ordering guarantees.

**post-robot** [3] offers reliability via ACKs but adds significant latency and serialization overhead.

### 2.3 Comparison Matrix

| Feature | CrossBus | Comlink | Penpal | post-robot |
|---------|-----------|---------|--------|------------|
| **Throughput (ops/sec)** | **~170M** | ~10M | ~5M | ~1M |
| **Routing Topology** | Hub/Peer/Mesh | Peer-to-Peer | Peer-to-Peer | Peer-to-Peer |
| **Causal Ordering** | **Yes** (VectorClock) | No | No | No |
| **Encrypted Transport** | **Yes** (AES-GCM) | No | No | No |
| **Offline Support** | **Yes** (ServiceWorker) | No | No | No |
| **Zero Dependencies** | **Yes** | Yes | Yes | Yes |

---

## 3. Architecture

### 3.1 Design Principles

CrossBus is designed around four principles:

1. **Security by Default**: Empty origin allowlist means same-origin only.
2. **Zero Runtime Dependencies**: Self-contained to minimize supply chain attacks.
3. **Performance-First**: Hot paths use synchronous, zero-allocation code.
4. **Agent-Centric**: Built-in primitives for capability negotiation and task orchestration.

### 3.2 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                       CrossBus Core                        │
├───────────────┬──────────────────────┬──────────────────────┤
│  Event System │    Message Router    │   Consistency Layer  │
│ (EventEmitter)│   (Routing/Peers)    │   (Vector Clocks)    │
├───────────────┴──────────────────────┴──────────────────────┤
│                Security & Validation Layer                  │
│   (OriginValidator • Handshake • Encryption • RateLimit)    │
├─────────────────────────────────────────────────────────────┤
│                      Transport Layer                        │
│ PostMessage • Broadcast • Worker • SharedWorker • ServiceWorker │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Causal Ordering

For multi-agent systems where agents run in parallel (e.g., Planner in Worker A, Executor in Worker B), message order matters. CrossBus implements **Causal Broadcast** using Vector Clocks:

1. Each peer maintains a vector $V$ where $V[i]$ is the number of events from peer $i$.
2. On send, peer $i$ increments $V[i]$ and attaches $V$ to the message.
3. On receive, peer $j$ buffers the message until:
   - $W[k] \le V[k]$ for all $k$ (causal past is satisfied)
   - $W[i] = V[i] - 1$ (message is the next regular one from sender)

This ensures that if Agent A tells Agent B "do X", and Agent B tells Agent C "result of X", Agent C will never see "result of X" before "do X".

---

## 4. Security Analysis

### 4.1 Threat Model

We consider threats including malicious iframes, cross-origin injection, DoS (flooding), and data interception via compromised extensions.

### 4.2 Mitigations

1. **Origin Validation**: ReDoS-protected wildcards (e.g., `*.example.com`).
2. **End-to-End Encryption**: Optional **AES-256-GCM** plugin derives keys via PBKDF2 and encrypts payloads before they leave the transport layer. This protects against browser extensions identifying traffic.
3. **Rate Limiting**: Token bucket algorithm limits requests per peer/second (e.g., 100 req/min) to prevent CPU exhaustion.
4. **Three-Way Handshake**: (INIT → ACK → COMPLETE) ensures mutual authentication before data exchange.

---

## 5. Performance Evaluation

### 5.1 Methodology

Benchmarks executed on Apple Silicon (M2), Runtime: Bun 1.3.6. Methodology: 1M iterations.

### 5.2 Local Event Throughput

| Library | 1 Listener | 10 Listeners | 10KB Payload |
|---------|------------|--------------|--------------|
| **CrossBus** | **172M** 🏆 | 57M | **111M** |
| nanoevents | 170M | **73M** 🏆 | 116M |
| EventEmitter3 | 131M | 31M | 40M |

CrossBus achieves **~170M ops/sec** using a highly optimized `emitSync` path that avoids Promise allocation for local events.

### 5.3 Transport Latency (Round Trip)

| Transport | Median Latency |
|-----------|----------------|
| MessageChannel | 0.08ms |
| BroadcastChannel | 0.15ms |
| SharedWorker | 0.45ms |
| ServiceWorker | 1.20ms |

---

## 6. Multi-Agent Applications

CrossBus provides the nervous system for browser-based AI:

### 6.1 Agent Topology

- **Hub**: Orchestrator (Main Thread)
- **Spokes**:
  - LLM Agent (Web Worker / WebGPU)
  - Tool Agent (Sandbox Iframe)
  - Memory Agent (SharedWorker / IndexedDB)

### 6.2 Example Workflow

1. **Orchestrator** sends `plan:create` to Planner (Worker).
2. **Planner** streams tokens back via `stream:chunk`.
3. **Planner** requests `tool:execute` via Orchestrator.
4. **Orchestrator** routes request to Tool Agent (Iframe).
5. **Tool Agent** executes safely and returns result.

---

## 7. Implementation

- **Language**: ES2024 JavaScript
- **Bundler**: Rollup (Terser minification)
- **Size**: 51KB raw / ~15KB gzip (Full), 456B raw / 295B gzip (Nano)
- **Tests**: 1074 unit/integration tests

---

## 8. Conclusion

CrossBus addresses the need for secure, consistent, and high-performance communication in modern browser architectures. With **Causal Ordering**, **Encryption**, and **Cross-Tab Transports**, it provides infrastructure specifically designed for the distributed requirements of local-first multi-agent systems.

**Availability**: https://github.com/giuseppescottolavina/crossbus  
**License**: Apache 2.0

---

## References

[1] Surma. "Comlink." Google Chrome Labs, 2017.  
[2] A. Anderson. "Penpal." 2018.  
[3] D. Blumenthal. "post-robot." PayPal, 2016.  
[4] L. Lamport. "Time, Clocks, and the Ordering of Events in a Distributed System." CACM, 1978.
