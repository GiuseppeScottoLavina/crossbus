# Getting Started with CrossBus

A comprehensive guide to integrate CrossBus in your project.

---

## Installation

```bash
# From npm
npm install crossbus

# From bun
bun add crossbus
```

---

## Quick Start

### 1. Hub (Main Page / Orchestrator)

The hub is the central coordinator that manages connections to other contexts (iframes, workers, tabs).

```javascript
import { CrossBus, PostMessageTransport } from 'crossbus';

// Create hub instance
const hub = new CrossBus({
    peerId: 'main-hub',
    isHub: true,
    allowedOrigins: ['https://trusted.com']  // Security!
});

// Connect to an iframe
const iframe = document.getElementById('widget-iframe');
iframe.onload = () => {
    hub.addTransport(
        new PostMessageTransport(iframe.contentWindow, { targetOrigin: 'https://trusted.com' }),
        { peerId: 'widget-1' }
    );
};

// Register request handlers
hub.handle('getData', (payload) => {
    return { users: [{ id: 1, name: 'John' }] };
});

// Listen for signals from widgets
hub.on('widget:action', (event) => {
    console.log('Widget did:', event.data);
});
```

### 2. Widget (Iframe / Child)

```javascript
// widget.js - runs inside iframe
import { CrossBus, PostMessageTransport } from 'crossbus';

const widget = new CrossBus({ 
    peerId: 'widget-1',
    allowedOrigins: ['https://your-app.com']  // Parent origin
});

// Connect to parent
widget.addTransport(
    new PostMessageTransport(window.parent, { targetOrigin: 'https://your-app.com' }),
    { peerId: 'main-hub' }
);

// Request data from hub
const data = await widget.request('main-hub', 'getData', {});
console.log(data.users);

// Send signal to hub
widget.signal('widget:action', { clicked: true });
```

### 3. Web Worker

```javascript
// worker.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const worker = new CrossBus({ peerId: 'compute-worker', allowedOrigins: ['*'] });
worker.addTransport(new PostMessageTransport(self), { peerId: 'main' });

worker.handle('compute', (payload) => {
    // Heavy computation
    return { result: payload.a + payload.b };
});
```

```javascript
// main.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const hub = new CrossBus({ peerId: 'main', isHub: true, allowedOrigins: ['*'] });

const worker = new Worker('worker.js', { type: 'module' });
hub.addTransport(new PostMessageTransport(worker), { peerId: 'compute-worker' });

const result = await hub.request('compute-worker', 'compute', { a: 10, b: 32 });
// result = { result: 42 }
```

---

## Core API Methods Explained

### `signal(name, data)` — Fire-and-Forget

**When to use**: When you need to broadcast an event to all peers and don't need a response.

```javascript
// Notify all connected peers that user logged in
hub.signal('user:login', { userId: 123 });

// Progress update - don't care if anyone receives it
hub.signal('task:progress', { percent: 50 });
```

**NOT for**: RPCs where you need a response. Use `request()` instead.

---

### `request(peer, handler, data, options?)` — RPC Call

**When to use**: When you need to call a specific peer and get a response.

```javascript
// Get user from backend worker
const user = await hub.request('api-worker', 'getUser', { id: 5 });

// With timeout
const result = await hub.request('slow-peer', 'compute', data, { timeout: 60000 });
```

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 30000 | Max time to wait for response (ms) |

---

### `handle(name, fn)` — Register RPC Handler

**When to use**: When you want to respond to `request()` calls from other peers.

```javascript
// Sync handler
hub.handle('getUser', (payload) => {
    return users.find(u => u.id === payload.id);
});

// Async handler
hub.handle('fetchData', async (payload) => {
    const response = await fetch(`/api/${payload.endpoint}`);
    return await response.json();
});
```

**Important**: The return value becomes the response. Throw an error to send error response.

---

### `on(name, fn)` — Listen to Signals

**When to use**: When you want to react to signals from other peers.

```javascript
// Listen for specific signal
hub.on('user:login', (event) => {
    console.log('User logged in:', event.data.userId);
    console.log('From peer:', event.source?.peerId);
});

// Wildcard - listen to all user events
hub.on('user:*', (event) => {
    console.log('User event:', event.name);
});
```

---

### `destroy()` — Cleanup Resources

**When to use**: ALWAYS call this when your component unmounts or page unloads.

```javascript
// React example
useEffect(() => {
    const bus = new CrossBus({ peerId: 'my-component' });
    
    return () => {
        bus.destroy(); // CRITICAL: prevents memory leaks
    };
}, []);

// Vanilla JS
window.addEventListener('beforeunload', () => {
    hub.destroy();
});
```

---

## Security Best Practices

### 1. Always Specify `allowedOrigins`

```javascript
// ❌ INSECURE - accepts messages from ANY origin
const bus = new CrossBus({ peerId: 'hub', allowedOrigins: ['*'] });

// ✅ SECURE - only accept from trusted origins
const bus = new CrossBus({ 
    peerId: 'hub', 
    allowedOrigins: ['https://app.example.com', 'https://widget.example.com'] 
});
```

### 2. Use `createSecure()` for Production

```javascript
import { CrossBus } from 'crossbus';

// Production-ready with secure defaults
const bus = CrossBus.createSecure({
    peerId: 'production-hub',
    isHub: true,
    allowedOrigins: ['https://trusted-domain.com']
});
// Automatically enables: strictMode, maxPayloadSize limit, rate limiting
```

### 3. Validate Payloads in Handlers

```javascript
hub.handle('updateUser', (payload) => {
    // Validate input!
    if (!payload.id || typeof payload.id !== 'number') {
        throw new Error('Invalid user ID');
    }
    if (!payload.name || payload.name.length > 100) {
        throw new Error('Invalid name');
    }
    return updateUser(payload);
});
```

---

## Error Handling

### Wrap Requests in Try-Catch

```javascript
try {
    const data = await bus.request('peer', 'getData', {}, { timeout: 5000 });
} catch (error) {
    switch (error.code) {
        case 'TIMEOUT':
            console.error('Peer not responding');
            break;
        case 'NO_HANDLER':
            console.error('Handler not registered on peer');
            break;
        case 'PEER_NOT_FOUND':
            console.error('Peer not connected');
            break;
        default:
            console.error('Request failed:', error.message);
    }
}
```

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `TIMEOUT` | Peer didn't respond in time | Check if peer is connected, increase timeout |
| `NO_HANDLER` | No handler for this request | Register handler on peer: `peer.handle('name', fn)` |
| `PEER_NOT_FOUND` | Unknown peer ID | Check peer ID spelling, wait for connection |
| `ORIGIN_FORBIDDEN` | Message from untrusted origin | Add origin to `allowedOrigins` |

---

## Common Mistakes

### 1. Forgetting `destroy()`

```javascript
// ❌ MEMORY LEAK
function MyComponent() {
    const bus = new CrossBus({ peerId: 'temp' });
    // Bus lives forever even after component unmounts!
}

// ✅ CORRECT
function MyComponent() {
    const bus = new CrossBus({ peerId: 'temp' });
    return () => bus.destroy();
}
```

### 2. Duplicate Peer IDs

```javascript
// ❌ ROUTING CONFLICT
const bus1 = new CrossBus({ peerId: 'my-app' });
const bus2 = new CrossBus({ peerId: 'my-app' }); // Same ID!

// ✅ UNIQUE IDS
const bus1 = new CrossBus({ peerId: 'my-app-1' });
const bus2 = new CrossBus({ peerId: 'my-app-2' });
```

### 3. Sending Before Connection Ready

```javascript
// ❌ MAY FAIL
const iframe = document.createElement('iframe');
document.body.appendChild(iframe);
hub.addTransport(new PostMessageTransport(iframe.contentWindow), { peerId: 'widget' });
hub.request('widget', 'getData', {}); // Widget not loaded yet!

// ✅ WAIT FOR LOAD
const iframe = document.createElement('iframe');
iframe.onload = () => {
    hub.addTransport(new PostMessageTransport(iframe.contentWindow), { peerId: 'widget' });
    hub.request('widget', 'getData', {}); // Safe now
};
document.body.appendChild(iframe);
```

---

## Plugins

### Retry Plugin

Automatically retry failed requests:

```javascript
import { withRetry } from 'crossbus/plugins/retry';

const result = await withRetry(() => 
    bus.request('flaky-peer', 'getData')
);
```

### Circuit Breaker

Prevent cascading failures:

```javascript
import { CircuitBreaker } from 'crossbus/plugins/circuit-breaker';

const breaker = new CircuitBreaker({ failureThreshold: 3 });

try {
    await breaker.execute(() => bus.request('peer', 'data'));
} catch (e) {
    if (e.code === 'CIRCUIT_OPEN') {
        // Circuit is open, peer is down
    }
}
```

---

## Next Steps

- [API Reference](./API.md) - Full API documentation
- [Architecture](./ARCHITECTURE.md) - Design and internals
- [Examples](./EXAMPLES.md) - Real-world use cases
- [Agents Guide](./AGENTS.md) - For AI agent developers
