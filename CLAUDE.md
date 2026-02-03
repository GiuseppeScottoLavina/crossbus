# CLAUDE.md - Instructions for Claude/Anthropic Agents

> **For Claude and Anthropic AI models**: Copy-paste ready patterns for CrossBus.

---

## TL;DR

CrossBus = cross-context messaging (iframes, workers, tabs, WebSocket).

```javascript
// Hub (orchestrator)
import { CrossBus } from 'crossbus';
const hub = new CrossBus({ isHub: true, peerId: 'hub', allowedOrigins: ['*'] });

// Agent (spoke in iframe/worker)
const agent = new CrossBus({ peerId: 'agent-1', allowedOrigins: ['*'] });
```

---

## 🚀 Production Setup (Use This!)

```javascript
// ALWAYS use createSecure() for production
const hub = CrossBus.createSecure({
  peerId: 'production-hub',
  isHub: true,
  allowedOrigins: ['https://your-domain.com']
});
// Enforces: strictMode, maxPayloadSize, maxPendingRequests
```

---

## 📋 Core API Cheatsheet

| Task | Code |
|------|------|
| Broadcast to all | `bus.signal('event', data)` |
| RPC to peer | `await bus.request('peerId', 'handler', data)` |
| Register handler | `bus.handle('name', (payload) => result)` |
| Listen to signals | `bus.on('event', (e) => process(e.data))` |
| Add transport | `bus.addTransport(transport, {peerId: 'remote'})` |
| Check health | `bus.healthCheck()` |
| Cleanup | `bus.destroy()` |

---

## 🔌 Transports

| Transport | Use Case | Code |
|-----------|----------|------|
| PostMessage | iframe ↔ parent | `new PostMessageTransport(window.parent)` |
| BroadcastChannel | tab ↔ tab | `new BroadcastChannelTransport('channel')` |
| WebSocket | browser ↔ server | `new WebSocketTransport({url: 'ws://...'})` |

---

## 🛡️ Security Options

```javascript
bus.handle('sensitiveAction', handler, {
  allowedPeers: ['trusted-agent'],  // Whitelist
  rateLimit: 10,                    // Max calls/sec
  validatePayload: (p) => p.id != null
});
```

---

## 🔍 Schema Validation

```javascript
import { withSchemaValidation } from 'crossbus/plugins/schema-validation';

const schema = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' } }
};

bus.handle('createUser', withSchemaValidation(schema, async (p) => {
  // p is pre-validated!
}));
```

---

## 🐛 Debugging

```javascript
const bus = new CrossBus({
  debug: true,
  debugPrefix: '[Agent]'
});
// Logs: [Agent] → SIGNAL "event" to 3 peers
```

---

## ❌ Common Mistakes

1. **Forgetting destroy()** → Memory leak
2. **Duplicate peerIds** → Routing errors
3. **No error handling on request()** → Silent failures
4. **targetOrigin: '*' in production** → Security risk

---

## 📚 Extended Resources

- `llms.txt` - AI-optimized documentation
- `agent.json` - A2A Agent Card
- `docs/AGENTS.md` - Multi-agent patterns
- `docs/AI-GUIDE.md` - Copy-paste patterns
- `schemas/` - JSON Schemas for handlers

---

*CrossBus: The cross-context messaging library for browsers.*
