# GEMINI.md - AI Agent Instructions for CrossBus

> **For AI Agents**: This document contains specific instructions for working effectively with CrossBus.

**IMPORTANT GLOBAL RULE**:
> **ALWAYS use English** for code, documentation, comments, and websites.
> **Italian is for CHAT ONLY** with the user.
> Even if the user speaks Italian, your output artifacts must be in English.

---

## 🎯 What is CrossBus

CrossBus is a library for cross-context communication in browsers:
- **Iframes ↔ Parent**: PostMessageTransport
- **Tab ↔ Tab**: BroadcastChannelTransport
- **Main ↔ Worker**: PostMessageTransport
- **Browser ↔ Server**: WebSocketTransport
- **WebView ↔ Native App**: NativeBridgeTransport

---

## 📋 Quick Reference for AI Agents

### Hub Pattern (Orchestrator)
```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

const hub = new CrossBus({ isHub: true, peerId: 'hub', allowedOrigins: ['*'] });

// Connect iframe
const iframe = document.getElementById('my-iframe');
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
    targetOrigin: '*'
}), { peerId: 'agent-1' }); // Specify remote peer ID

// Handle requests
hub.handle('getData', async (payload) => {
    return { data: await fetchData(payload.id) };
});
```

### Agent Pattern (Spoke)
```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

const agent = new CrossBus({ peerId: 'agent-1', allowedOrigins: ['*'] });
agent.addTransport(new PostMessageTransport(window.parent, {
    targetOrigin: '*'
}), { peerId: 'hub' }); // Specify remote peer (hub)

// Request data from hub
const result = await agent.request('hub', 'getData', { id: 5 });
```

### Multi-Tab Sync Pattern
```javascript
import { CrossBus, BroadcastChannelTransport } from 'crossbus';

const bus = new CrossBus({ peerId: `tab-${Date.now()}`, allowedOrigins: ['*'] });
bus.addTransport(new BroadcastChannelTransport('my-app-channel'), { peerId: '*' });

bus.on('sync', (event) => console.log('Received:', event.data));
bus.signal('sync', { message: 'Hello tabs!' });
```

---

## ❌ Common Mistakes (AVOID!)

### 1. Forgetting destroy()
```javascript
// ❌ WRONG - Memory leak
function Component() {
    const bus = new CrossBus({ peerId: 'temp' });
    // Component destroyed but bus remains
}

// ✅ CORRECT
function Component() {
    const bus = new CrossBus({ peerId: 'temp' });
    return () => bus.destroy(); // Cleanup
}
```

### 2. Duplicate PeerIds
```javascript
// ❌ WRONG - Routing conflict
const bus1 = new CrossBus({ peerId: 'agent' });
const bus2 = new CrossBus({ peerId: 'agent' }); // ERROR!

// ✅ CORRECT
const bus1 = new CrossBus({ peerId: 'agent-1' });
const bus2 = new CrossBus({ peerId: 'agent-2' });
```

### 3. Not handling errors on request()
```javascript
// ❌ WRONG - Silent crash
const data = await bus.request('peer', 'action', {});

// ✅ CORRECT
try {
    const data = await bus.request('peer', 'action', {}, { timeout: 5000 });
} catch (error) {
    if (error.code === 'TIMEOUT') {
        // Peer not responding
    }
}
```

### 4. targetOrigin '*' in production
```javascript
// ⚠️ INSECURE in production
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
    targetOrigin: '*' // Accepts any origin
}));

// ✅ SECURE
hub.addTransport(new PostMessageTransport(iframe.contentWindow, {
    targetOrigin: 'https://trusted-domain.com'
}));
```

---

## 🔧 Troubleshooting

### "Messages not arriving"
1. Verify `peerId`s are unique
2. Check `targetOrigin` in transport
3. Ensure iframe/worker is loaded before sending

### "Request timeout"
1. Did the peer register the handler? (`hub.handle('name', fn)`)
2. Is timeout sufficient? (default: 30s)
3. Is peer connected? (check `hub.peers`)

### "TypeError: Cannot read property 'send'"
1. Was transport added? (`bus.addTransport(...)`)
2. Is iframe loaded? (use `iframe.onload`)

---

## 📦 Import Paths

```javascript
// Core
import { CrossBus } from 'crossbus';

// Transports
import { PostMessageTransport } from 'crossbus';
import { BroadcastChannelTransport } from 'crossbus';
import { WebSocketTransport } from 'crossbus';
import { SharedWorkerTransport } from 'crossbus';
import { ServiceWorkerTransport } from 'crossbus';
import { NativeBridgeTransport } from 'crossbus';

// Plugins (subpath imports)
import { withEncryption } from 'crossbus/plugins/encryption';
import { withRateLimiter } from 'crossbus/plugins/rate-limiter';
import { withBatching } from 'crossbus/plugins/batch';
import { withRetry } from 'crossbus/plugins/retry';
import { createPeerCircuitBreaker } from 'crossbus/plugins/circuit-breaker';
import { withCompression } from 'crossbus/plugins/compression';

// Enterprise (opt-in)
import { Tracer, tracingPlugin } from 'crossbus/enterprise';
import { Metrics, globalMetrics } from 'crossbus/enterprise';
import { BackpressureController } from 'crossbus/enterprise';
import { MessageVersioning } from 'crossbus/enterprise';

// Testing
import { MockTransport, createConnectedMocks } from 'crossbus/testing';
```

---

## 🧪 Testing with MockTransport

```javascript
import { CrossBus } from 'crossbus';
import { createConnectedMocks } from 'crossbus/testing';

// Create two connected mocks
const { transport1, transport2 } = createConnectedMocks('a', 'b');

const busA = new CrossBus({ peerId: 'a' });
const busB = new CrossBus({ peerId: 'b' });

busA.addTransport(transport1);
busB.addTransport(transport2);

// Now busA and busB can communicate in memory
busB.handle('echo', (data) => ({ echoed: data }));
const result = await busA.request('b', 'echo', { msg: 'test' });
// result = { echoed: { msg: 'test' } }
```

---

## 📊 Quick API Reference

| Method | Description | Example |
|--------|-------------|---------|
| `signal(name, data)` | Broadcast to all | `bus.signal('update', { x: 1 })` |
| `request(peer, handler, data)` | RPC to specific peer | `await bus.request('hub', 'get', {})` |
| `handle(name, fn)` | Register handler | `bus.handle('get', () => data)` |
| `on(event, fn)` | Listen to events | `bus.on('update', fn)` |
| `addTransport(t)` | Add channel | `bus.addTransport(transport)` |
| `destroy()` | Cleanup | `bus.destroy()` |

---

## 📋 Additional Resources

| Resource | Path | Description |
|----------|------|-------------|
| JSON Schemas | `schemas/` | Handler contracts for validation |
| Examples | `examples/` | Patterns in JSON + JS format |
| TypeScript | `src/crossbus.d.ts` | Complete type declarations |

---

## 🤖 AI Agent Features (NEW)

### createSecure() - Production-Ready Setup
```javascript
// Recommended for production - enforces security
const bus = CrossBus.createSecure({
  peerId: 'my-agent',
  isHub: true,
  allowedOrigins: ['https://trusted-domain.com']
});
// Automatically sets: strictMode, maxPayloadSize, maxPendingRequests
```

### healthCheck() - Monitor System Status
```javascript
const health = bus.healthCheck();
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   uptime: 123456,
//   peers: { total: 5, ids: [...] },
//   handlers: ['getData', 'setData'],
//   memory: { heapUsed: 12345678 }
// }
```

### Debug Mode - Verbose Logging
```javascript
const bus = new CrossBus({
  debug: true,
  debugPrefix: '[MyHub]'
});
// Console: [MyHub] → SIGNAL "user:login" to 3 peers
```

### Handler Security Options
```javascript
bus.handle('sensitiveData', handler, {
  allowedPeers: ['trusted-agent'],  // Whitelist
  rateLimit: 10,                    // Max 10/sec per peer
  validatePayload: (p) => p.id != null  // Custom validation
});
```

### Schema Validation Plugin
```javascript
import { withSchemaValidation } from 'crossbus/plugins/schema-validation';

const userSchema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', pattern: '^[^@]+@[^@]+$' }
  }
};

bus.handle('createUser', withSchemaValidation(userSchema, async (payload) => {
  // payload is pre-validated!
  return await createUser(payload);
}));
```

---

*Last update: 2026-01-25*
