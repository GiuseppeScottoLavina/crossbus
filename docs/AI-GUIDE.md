# CrossBus AI Agent Guide

> **For AI Coding Assistants**: Copy-paste ready patterns for building complex browser applications.

## Quick Start (Copy-Paste)

### Hub (Main Page)
```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

const hub = new CrossBus({ 
  isHub: true, 
  peerId: 'hub',
  allowedOrigins: ['*'] // Required for receiving messages
});

// Handle requests from agents
hub.handle('getData', async (payload) => {
  return { data: await fetchData(payload.id) };
});

// Connect iframe agent
const iframe = document.getElementById('agent-frame');
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
  targetOrigin: '*'
}), { peerId: 'agent-1' }); // Specify remote peer ID
```

### Agent (Iframe/Worker)
```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

const agent = new CrossBus({ 
  peerId: 'agent-1',
  allowedOrigins: ['*'] 
});
agent.addTransport(new PostMessageTransport(window.parent, {
  targetOrigin: '*'
}), { peerId: 'hub' }); // Specify hub as remote peer

// Request data from hub
const result = await agent.request('hub', 'getData', { id: 5 });

// Broadcast signal
agent.signal('agent:ready', { name: 'agent-1' });
```

---

## Common Patterns

### Pattern 1: Multi-Tab Sync
```javascript
import { CrossBus, BroadcastChannelTransport } from 'crossbus';

const bus = new CrossBus({ 
  peerId: `tab-${Date.now()}`,
  allowedOrigins: ['*'] 
});
bus.addTransport(new BroadcastChannelTransport('my-app'), { peerId: '*' });

// Sync state across tabs
bus.on('state:update', (event) => {
  localStorage.setItem('state', JSON.stringify(event.data));
});

// Broadcast changes
function updateState(newState) {
  bus.signal('state:update', newState);
}
```

### Pattern 2: Iframe Orchestration
```javascript
// HUB: Manage multiple iframe agents
const hub = new CrossBus({ 
  isHub: true, 
  peerId: 'hub',
  allowedOrigins: ['*'] 
});

const agents = ['agent-a', 'agent-b', 'agent-c'];
const iframes = agents.map(id => {
  const iframe = document.createElement('iframe');
  iframe.src = `/agents/${id}.html`;
  iframe.id = id;
  document.body.appendChild(iframe);
  return { iframe, id };
});

// Connect each agent
iframes.forEach(({ iframe, id }) => {
  iframe.onload = () => {
    hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
      targetOrigin: '*'
    }), { peerId: id }); // Each iframe gets its own peerId
  };
});

// Request from specific agent
const result = await hub.request('agent-a', 'process', { data: [...] });
```

### Pattern 3: Worker Offloading
```javascript
// Main thread
const worker = new Worker('worker.js');
const bus = new CrossBus({ 
  peerId: 'main',
  allowedOrigins: ['*'] 
});
bus.addTransport(new PostMessageTransport(worker), { peerId: 'worker' });

// Offload heavy computation
const result = await bus.request('worker', 'compute', { 
  numbers: Array(1000000).fill(0).map(() => Math.random())
});
```

```javascript
// worker.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const bus = new CrossBus({ 
  peerId: 'worker',
  allowedOrigins: ['*'] 
});
bus.addTransport(new PostMessageTransport(self), { peerId: 'main' });

bus.handle('compute', ({ numbers }) => {
  return { sum: numbers.reduce((a, b) => a + b, 0) };
});
```

### Pattern 4: With Encryption
```javascript
import { CrossBus } from 'crossbus';
import { Encryption, withEncryption } from 'crossbus/plugins/encryption';

const key = await Encryption.deriveKey('shared-secret', 'my-app-salt');
const bus = new CrossBus({ peerId: 'secure-peer' });
withEncryption(bus, key);

// All messages now encrypted automatically
bus.signal('secret:data', { sensitive: true });
```

### Pattern 5: Rate Limited
```javascript
import { CrossBus } from 'crossbus';
import { RateLimiter, withRateLimiter } from 'crossbus/plugins/rate-limiter';

const bus = new CrossBus({ peerId: 'api-client' });
withRateLimiter(bus, {
  maxRequestsPerSecond: 10,
  maxBurstSize: 20
});
```

### Pattern 6: High-Frequency Batching
```javascript
import { CrossBus } from 'crossbus';
import { withBatching } from 'crossbus/plugins/batch';

const bus = new CrossBus({ peerId: 'telemetry' });
withBatching(bus, { windowMs: 16 }); // 60fps batching

// Send many signals efficiently
for (const point of dataPoints) {
  bus.signal('data:point', point);
}
```

---

## Workflow Recipes

### Recipe 1: Dashboard with Live Updates
```javascript
// 1. Create hub
const hub = new CrossBus({ isHub: true, peerId: 'dashboard' });

// 2. Add transports for data sources
hub.addTransport(new WebSocketTransport({ url: 'wss://api.example.com' }));
hub.addTransport(new BroadcastChannelTransport('dashboard-sync'));

// 3. Listen for updates
hub.on('price:update', (event) => updatePriceChart(event.data));
hub.on('order:new', (event) => addToOrderList(event.data));

// 4. Request initial data
const prices = await hub.request('ws-peer', 'getPrices', {});
const orders = await hub.request('ws-peer', 'getOrders', { limit: 100 });
```

### Recipe 2: Plugin Pipeline
```javascript
import { CrossBus } from 'crossbus';
import { withRetry } from 'crossbus/plugins/retry';
import { createPeerCircuitBreaker } from 'crossbus/plugins/circuit-breaker';
import { withBatching } from 'crossbus/plugins/batch';

// Build pipeline
let bus = new CrossBus({ peerId: 'robust-client' });
bus = withRetry(bus, { maxRetries: 3 });
bus = createPeerCircuitBreaker(bus, { threshold: 5 });
bus = withBatching(bus, { windowMs: 50 });
```

---

## Transport Selection Guide

| Scenario | Transport | Why |
|----------|-----------|-----|
| Iframe communication | `PostMessageTransport` | Standard iframe messaging |
| Multiple tabs sync | `BroadcastChannelTransport` | Cross-tab broadcast |
| Web Worker | `PostMessageTransport` | Worker uses postMessage |
| Shared Worker | `SharedWorkerTransport` | Single shared instance |
| Service Worker | `ServiceWorkerTransport` | Background sync/cache |
| Server connection | `WebSocketTransport` | Real-time bidirectional |
| iOS/Android WebView | `NativeBridgeTransport` | Native app bridge |

---

## Error Handling
```javascript
try {
  const result = await bus.request('peer', 'action', data, { timeout: 5000 });
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Peer didn't respond in time
  } else if (error.code === 'PEER_DISCONNECTED') {
    // Peer is no longer available
  } else if (error.code === 'HANDLER_NOT_FOUND') {
    // Peer doesn't have this handler
  }
}
```

---

## Checklist for Complex Apps

- [ ] Choose appropriate transport(s) for your architecture
- [ ] Set `isHub: true` for the orchestrator
- [ ] Use unique `peerId` for each context
- [ ] Add encryption for sensitive data
- [ ] Add rate limiting for public-facing endpoints
- [ ] Use batching for high-frequency signals
- [ ] Handle errors with try/catch on requests
- [ ] Clean up with `bus.destroy()` when done

---

## ❌ Anti-Patterns (DO NOT DO)

### 1. Forgetting cleanup
```javascript
// ❌ MEMORY LEAK
function createWidget() {
    const bus = new CrossBus({ peerId: 'widget' });
    // Widget destroyed but bus still exists!
}

// ✅ CORRECT - Always cleanup
function createWidget() {
    const bus = new CrossBus({ peerId: 'widget' });
    return {
        destroy: () => bus.destroy()
    };
}
```

### 2. Duplicate peerIds
```javascript
// ❌ ROUTING CONFLICT - Messages won't route correctly
const bus1 = new CrossBus({ peerId: 'agent' });
const bus2 = new CrossBus({ peerId: 'agent' }); // BAD!

// ✅ CORRECT - Unique IDs
const bus1 = new CrossBus({ peerId: 'agent-1' });
const bus2 = new CrossBus({ peerId: 'agent-2' });
```

### 3. Missing error handling
```javascript
// ❌ SILENT FAILURE - Will crash on timeout/disconnect
const data = await bus.request('peer', 'action', {});

// ✅ CORRECT - Always handle errors
try {
    const data = await bus.request('peer', 'action', {}, { timeout: 5000 });
} catch (error) {
    if (error.code === 'TIMEOUT') {
        console.log('Peer not responding');
    } else if (error.code === 'PEER_DISCONNECTED') {
        console.log('Peer disconnected');
    }
}
```

### 4. Wildcard origin in production
```javascript
// ❌ SECURITY RISK - Accepts any origin
hub.addTransport(new PostMessageTransport(target, { targetOrigin: '*' }));

// ✅ SECURE - Whitelist trusted origins only
hub.addTransport(new PostMessageTransport(target, { 
    targetOrigin: 'https://trusted.example.com' 
}));
```

### 5. Sending before connection
```javascript
// ❌ MESSAGE LOST - Iframe not loaded yet
const iframe = document.createElement('iframe');
iframe.src = '/agent.html';
document.body.appendChild(iframe);
hub.addTransport(new PostMessageTransport(iframe.contentWindow));
hub.signal('hello', {}); // Lost!

// ✅ CORRECT - Wait for load
iframe.onload = () => {
    hub.addTransport(new PostMessageTransport(iframe.contentWindow));
    hub.signal('hello', {}); // Arrives correctly
};
```

---

## 🔧 Troubleshooting

### "Messages not arriving"

| Check | Solution |
|-------|----------|
| PeerIds unique? | Each context needs unique `peerId` |
| Transport added? | Call `bus.addTransport()` |
| Target loaded? | Wait for `iframe.onload` or `worker.onmessage` |
| Origin correct? | Set `targetOrigin` to exact origin or `'*'` for dev |

### "Request timeout"

| Check | Solution |
|-------|----------|
| Handler registered? | Call `bus.handle('name', fn)` on target |
| Peer connected? | Check `bus.peers` for connected peers |
| Timeout long enough? | Increase with `{ timeout: 10000 }` |
| Handler throwing? | Wrap handler in try/catch |

### "TypeError: Cannot read property..."

| Error | Cause | Solution |
|-------|-------|----------|
| `send of undefined` | No transport | Add transport first |
| `contentWindow of null` | Iframe not in DOM | Wait for append |
| `close of undefined` | Already destroyed | Check `bus.isDestroyed` |

---

## 🏗️ Architecture Decision Tree

```
QUESTION: How many contexts need to communicate?

→ 2 contexts (parent ↔ iframe)
   └── Use: PostMessageTransport
       
→ 2+ browser tabs
   └── Use: BroadcastChannelTransport
       
→ Main thread ↔ Worker
   └── Use: PostMessageTransport(worker)
       
→ Browser ↔ Server
   └── Use: WebSocketTransport
       
→ Multiple features sharing worker
   └── Use: SharedWorkerTransport
       
→ Background sync / offline
   └── Use: ServiceWorkerTransport
       
→ WebView ↔ Native App
   └── Use: NativeBridgeTransport
```

---

## 📝 TypeScript Quick Reference

```typescript
import { CrossBus, PostMessageTransport } from 'crossbus';

// Define your own types as needed
interface CrossBusConfig {
    peerId: string;
    isHub?: boolean;
    timeout?: number;
}

// Create bus with typed config
const options: CrossBusConfig = {
    peerId: 'my-app',
    isHub: true,
    timeout: 5000
};

const bus = new CrossBus(options);

// Typed handler
interface UserData {
    id: number;
    name: string;
}

bus.handle<UserData>('getUser', async (payload) => {
    return { id: payload.id, name: 'John' };
});

// Typed request
const user = await bus.request<UserData>('peer', 'getUser', { id: 1 });
console.log(user.name); // TypeScript knows this is string
```

---

## 📦 Complete Import Reference

```javascript
// CORE - Always available
import { 
    CrossBus,
    PostMessageTransport,
    BroadcastChannelTransport,
    MessageChannelTransport,
    SharedWorkerTransport,
    ServiceWorkerTransport,
    NativeBridgeTransport,
    WebSocketTransport
} from 'crossbus';

// PLUGINS - Subpath imports
import { withEncryption, Encryption } from 'crossbus/plugins/encryption';
import { withRateLimiter, RateLimiter } from 'crossbus/plugins/rate-limiter';
import { withBatching, MessageBatcher } from 'crossbus/plugins/batch';
import { withRetry, createRetryWrapper } from 'crossbus/plugins/retry';
import { createPeerCircuitBreaker, CircuitBreaker } from 'crossbus/plugins/circuit-breaker';
import { withCompression, Compression } from 'crossbus/plugins/compression';

// ENTERPRISE - Opt-in
import { Tracer, Span, tracingPlugin } from 'crossbus/enterprise';
import { Metrics, globalMetrics } from 'crossbus/enterprise';
import { BackpressureController } from 'crossbus/enterprise';
import { MessageVersioning } from 'crossbus/enterprise';

// TESTING - For unit tests
import { MockTransport, createConnectedMocks } from 'crossbus/testing';
```

---

## 🚀 One-Liner Recipes

```javascript
// Quick hub setup
const hub = new CrossBus({ isHub: true, peerId: 'hub' });

// Quick agent setup
const agent = new CrossBus({ peerId: 'agent' });

// Connect to iframe
hub.addTransport(new PostMessageTransport(iframe.contentWindow));

// Sync across tabs
bus.addTransport(new BroadcastChannelTransport('my-app'));

// Connect to worker
bus.addTransport(new PostMessageTransport(worker));

// Connect to WebSocket
bus.addTransport(new WebSocketTransport({ url: 'wss://api.example.com' }));

// Add encryption
withEncryption(bus, await Encryption.deriveKey('secret', 'salt'));

// Add rate limiting
withRateLimiter(bus, { maxRequestsPerSecond: 10 });

// Add retry logic
withRetry(bus, { maxRetries: 3 });

// Add batching for high-frequency
withBatching(bus, { windowMs: 16 });
```

---

## 📋 JSON Schemas

Machine-readable schemas are available in `schemas/`:

```javascript
// Validate handler contracts
import schema from 'crossbus/schemas/handlers/getData.schema.json';
// Use with AJV or other JSON Schema validators
```

---

*Last updated: 2026-01-25*
