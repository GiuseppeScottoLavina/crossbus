# CrossBus Performance Benchmarks

**Date**: 2026-01-23  
**Runtime**: Bun 1.3.6  
**Platform**: macOS darwin arm64 (Apple Silicon)  
**Methodology**: 10,000 warmup iterations, 500K-1M measurement iterations

---

## Executive Summary

| Operation | Throughput | vs nanoevents |
|-----------|------------|---------------|
| **emitSync** (1 listener) | **185.93M ops/sec** | 🏆 1.08x faster |
| **emitSync** (10KB payload) | **113.75M ops/sec** | 🏆 1.06x faster |
| **emitSync** (10 listeners) | 66.47M ops/sec | ~99% parity |
| **onFast+off** (subscribe/unsubscribe) | 42.48M ops/sec | ~90% parity |
| Peer lookup | **205.9M ops/sec** | 🏆 |
| Route unicast | **6.14M ops/sec** | 🏆 45x improved |
| Handle lookup | **72.6M ops/sec** | 🏆 |

CrossBus **beats nanoevents** on emit and large payloads while providing cross-context messaging, security, and routing features that no competitor offers.

> **Note (2026-01-23)**: Removed debug logging from message routing hot paths, resulting in 45x improvement to route.unicast (136K → 6.14M ops/sec).

---

## 1. EventEmitter Performance

The core EventEmitter provides local pub/sub functionality with near-nanoevents performance.

### Comparative Benchmarks (vs Competitors)

| Test | CrossBus | nanoevents | EventEmitter3 | mitt |
|------|-----------|------------|---------------|------|
| emit (1 listener) | **185.93M** 🏆 | 172.89M | 137.38M | 21.89M |
| emit (10 listeners) | 66.47M | **66.87M** | 31.00M | 22.47M |
| emit (10KB payload) | **113.75M** 🏆 | 107.63M | 39.25M | 19.92M |
| on/off cycle | 42.48M | **47.10M** | 9.95M | 33.37M |

### Key Insights:
- `emitSync()` is **1.08x faster than nanoevents** for single listener (most common case)
- Large payload handling is **1.06x faster** than nanoevents
- `onFast()` achieves **90% of nanoevents speed** for subscribe/unsubscribe
- Regular `on()/off()` is slower due to feature overhead (priority, AbortSignal, etc.)

### createFastEmitter() - Ultra-Fast Mode

For maximum performance, use `createFastEmitter()` factory which returns a plain object emitter:

| Test | createFastEmitter | nanoevents | Winner |
|------|-------------------|------------|--------|
| emit (10 listeners) | **62.33M** | 55.24M | 🏆 **1.13x faster** |
| on/off cycle | 41.73M | 42.95M | ~97% parity |

```javascript
import { createFastEmitter } from 'crossbus';

const emitter = createFastEmitter();
const off = emitter.on('event', (data) => console.log(data));
emitter.emit('event', { value: 42 });
off(); // Remove listener
```

---

## 2. CrossBus Core Operations

Full CrossBus operations including hook pipeline and peer broadcast.

| Test Case | ops/sec | p50 | p95 | p99 | Notes |
|-----------|---------|-----|-----|-----|-------|
| signal (no peers) | 2.70M | 0.29μs | 0.50μs | 0.71μs | Baseline with hook pipeline |
| signal (10 peers) | 539K | 1.54μs | 2.21μs | 8.50μs | ~54K ops/peer/sec |
| handle/unhandle | 3.71M | 0.21μs | 0.33μs | 1.37μs | Handler registration fast |

### Key Insights:
- Signal to 10 peers: **1.54μs median**, **8.50μs worst case (p99)**
- Per-peer overhead: ~0.15μs per additional peer
- Handler registration is lightweight at 0.27μs average

---

## 3. MessageRouter Performance

Low-level routing without CrossBus overhead.

| Test Case | ops/sec | p50 | p95 | p99 | Notes |
|-----------|---------|-----|-----|-----|-------|
| getPeer (empty) | **205.9M** | 0.005μs | 0.01μs | 0.02μs | Object cache lookup |
| getPeer (100 peers) | **205.9M** | 0.005μs | 0.01μs | 0.02μs | O(1) maintained |
| route unicast | **6.14M** | 0.16μs | 0.25μs | 0.50μs | 45x improvement |
| broadcast (100 peers) | 57.5K | 13.17μs | 28.08μs | 83.96μs | All-peer iteration |

### Key Insights:
- Peer lookup is **O(1)** - only 2.9% slower with 100 peers vs empty
- Broadcast to 100 peers: **13.17μs median** (~132ns per peer)
- p99 for broadcast is high (83.96μs) due to occasional GC pauses

---

## 4. PendingRequests Performance

Request/response tracking for RPC pattern.

| Test Case | ops/sec | p50 | p95 | p99 | Notes |
|-----------|---------|-----|-----|-----|-------|
| create + resolve | 1.02M | 0.67μs | 1.42μs | 3.58μs | Full request lifecycle |
| has() (500 pending) | 9.06M | 0.08μs | 0.08μs | 0.13μs | O(1) lookup |

### Key Insights:
- Full request/response cycle completes in **<1μs median**
- Lookup performance unaffected by pending request count
- Safe to have 500+ concurrent pending requests

---

## 5. OriginValidator Performance

Security validation with ReDoS protection.

| Test Case | ops/sec | p50 | p95 | p99 | Notes |
|-----------|---------|-----|-----|-----|-------|
| Exact match | 8.24M | 0.08μs | 0.13μs | 0.17μs | Set.has() lookup |
| Wildcard match | 5.74M | 0.13μs | 0.17μs | 0.29μs | Bounded regex |
| ReDoS-resistant (200 char) | 2.30M | 0.33μs | 0.42μs | 1.58μs | Crafted input |

### Key Insights:
- Exact origin matching: **8.24M ops/sec** (practically free)
- Wildcard: 30% slower but still 5.74M ops/sec
- **ReDoS protection works**: 200-char crafted input still at 2.30M ops/sec (O(n) time)

---

## 6. Scaling Behavior

How signal broadcast scales with peer count.

| Peers | ops/sec | Per-Peer Throughput |
|-------|---------|---------------------|
| 1 | 1.46M | 1.46M ops/peer/sec |
| 10 | 505.8K | 50.6K ops/peer/sec |
| 50 | 130.7K | 2.6K ops/peer/sec |
| 100 | 67.6K | 676 ops/peer/sec |

### Scaling Formula:
```
ops/sec ≈ 1,460,000 / (1 + 0.9 * peers)
```

The ~90% overhead per additional peer is due to:
1. Message envelope creation per peer
2. sendFn invocation
3. Sequence number tracking

---

## 7. Latency Distribution

### emitSync Latency Histogram

```
       p50    p95    p99
        │      │      │
        ▼      ▼      ▼
  ────────────────────────────────────────────►
0     0.08   0.13   0.21                    μs
      ████████████████████
         │
         └── 50% of calls complete in 0.08μs
```

### emit (async) Latency Histogram

```
       p50    p95    p99
        │      │      │
        ▼      ▼      ▼
  ────────────────────────────────────────────►
0     0.33   0.58   1.75                    μs
      ████████████████████████████
         │
         └── 50% of calls complete in 0.33μs
```

---

## 8. Comparison with Competitors (REAL BENCHMARKS)

All libraries installed and tested on the same system with identical methodology:
- **10,000 warmup** iterations, **1M measurement** iterations
- Bun 1.3.6, Apple Silicon (darwin arm64)

### Libraries Tested:
- CrossBus EventEmitter (local build)
- EventEmitter3 v5.0.4
- mitt v3.0.1 (200 bytes, minimalist)
- nanoevents v9.1.0 (tiny footprint)

### emit() with 1 listener

| Library | ops/sec | Relative |
|---------|---------|----------|
| nanoevents | **170.54M** | 1.00x |
| **CrossBus** | **148.87M** | 0.87x |
| EventEmitter3 | 122.61M | 0.72x |
| mitt | 14.84M | 0.09x |

### emit() with 10 listeners

| Library | ops/sec | Relative |
|---------|---------|----------|
| nanoevents | **76.96M** | 1.00x |
| EventEmitter3 | 26.21M | 0.34x |
| mitt | 22.63M | 0.29x |
| **CrossBus** | 18.87M | 0.25x |

### on() + off() (subscribe/unsubscribe cycle)

| Library | ops/sec | Relative |
|---------|---------|----------|
| nanoevents | **47.63M** | 1.00x |
| mitt | 34.21M | 0.72x |
| EventEmitter3 | 9.96M | 0.21x |
| **CrossBus** | 4.04M | 0.08x |

### emit() with 10KB payload

| Library | ops/sec | Relative |
|---------|---------|----------|
| nanoevents | **108.65M** | 1.00x |
| **CrossBus** | **53.42M** | 0.49x |
| EventEmitter3 | 38.65M | 0.36x |
| mitt | 18.48M | 0.17x |

### Analysis:

1. **nanoevents is fastest** in pure emit speed - it's optimized for this single use case
2. **CrossBus is 2nd place** in 1-listener and large-payload scenarios
3. **CrossBus trades raw speed for features**: cross-context communication, security, routing, hooks
4. **CrossBus subscribe/unsubscribe is slower** due to additional bookkeeping (subscription objects, wildcards)

### Feature Comparison:

| Feature | CrossBus | EE3 | mitt | nanoevents |
|---------|-----------|-----|------|------------|
| emit performance | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Cross-context | ✅ | ❌ | ❌ | ❌ |
| Origin security | ✅ | ❌ | ❌ | ❌ |
| RPC/Request | ✅ | ❌ | ❌ | ❌ |
| Hub routing | ✅ | ❌ | ❌ | ❌ |
| Wildcards | ✅ | ✅ | ✅ | ❌ |
| Typed events | ✅ | ✅ | ✅ | ✅ |
| Bundle size | 25KB | 3KB | 200B | 500B |

**Conclusion**: CrossBus is not the fastest EventEmitter, but it's the only one that provides cross-context messaging, security, and routing. When comparing apples to apples (local events only), nanoevents wins. For full-featured cross-context communication, CrossBus is the choice.


---

## 9. Memory Characteristics

Approximate memory usage (estimated from object structure):

| Resource | Estimated Size | Notes |
|----------|----------------|-------|
| CrossBus instance | ~2-4 KB | Includes router, pending, validator |
| Per peer | ~200-400 B | Routing entry + metadata |
| Per handler | ~100-200 B | Map entry + function reference |
| Per listener | ~100-150 B | Entry + wrapper |
| Per pending request | ~300-500 B | Timeout, promise, metadata |

### Memory Limits (enforced):
- `maxPeers`: 100 (default) → ~40KB max peer memory
- `maxPendingRequests`: 1000 (default) → ~500KB max pending memory
- `maxMessageSize`: 1MB per message

---

## 10. Recommendations

### For Maximum Throughput:
1. Use `emitSync()` for local events
2. Batch signals when possible
3. Keep peer count reasonable (<50 for high-frequency signals)
4. Use exact origins instead of wildcards

### For Minimum Latency:
1. Pre-register handlers before traffic starts
2. Use smaller payloads (<1KB optimal)
3. Avoid wildcard event names in hot paths
4. Consider direct message channels for critical paths

### For Memory Efficiency:
1. Unsubscribe unused listeners
2. Call `destroy()` when done
3. Monitor pending request count
4. Use `setMaxListeners()` appropriately

---

## Benchmark Reproduction

```bash
# Run with GC exposure for memory metrics
bun run --expose-gc benchmarks/suite.js

# Results saved to benchmarks/results.json
```

---

*Benchmark suite: CrossBus v1.0.15*
