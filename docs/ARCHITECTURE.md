# CrossBus.js Architecture

> **Modern cross-context messaging for browsers**
> Zero dependencies • TypeScript-ready • Plugin architecture • Zero memory leaks

---

## Design Principles

1. **Reliability First** - ACK by default, fire-and-forget as option
2. **Zero Leaks** - Rigorous resource lifecycle, automatic cleanup
3. **Transferable Support** - ArrayBuffer, MessagePort, etc.
4. **Modular Core** - Pay only for what you use
5. **Hub Topology** - Main thread orchestrates, clean shutdown

---

## Bundle Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BUILD OUTPUT                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  crossbus.core.min.js (~10KB)    ← Core only                   │
│  crossbus.min.js (~15KB)         ← Core + common plugins       │
│  crossbus.full.min.js (~15KB)    ← Everything                  │
│                                                                 │
│  Plugins (standalone, import common):                           │
│  ├── crossbus.retry.min.js (~1KB)                              │
│  ├── crossbus.circuit-breaker.min.js (~1KB)                    │
│  └── crossbus.metrics.min.js (~1KB)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Source Structure

```
src/
├── common/                    # Shared (included in all bundles)
│   ├── types.js               # Enums, constants
│   ├── errors.js              # CrossBusError class
│   └── utils.js               # Helpers (UUID, clone check, etc.)
│
├── core/                      # Core module (~4KB)
│   ├── event-emitter.js       # Local pub/sub
│   ├── peer-registry.js       # Peer management
│   ├── protocol.js            # Message encoding/decoding
│   ├── transport.js           # PostMessage abstraction
│   ├── handshake.js           # Connection negotiation
│   ├── router.js              # Hub routing logic
│   ├── pending.js             # Request/response tracking
│   └── bus.js                 # CrossBus class
│
├── plugins/                   # Optional plugins
│   ├── retry.js               # Retry with backoff
│   ├── circuit-breaker.js     # Circuit breaker pattern
│   ├── metrics.js             # Observability
│   └── debug.js               # Debug logging
│
└── index.js                   # Entry point
```

---

## Resource Lifecycle

### Allocation

```
connect() called
    │
    ▼
┌─────────────────────────────────┐
│ RESOURCES ALLOCATED:            │
│ • PeerRegistry entry            │
│ • MessagePort (if direct)       │
│ • Event listeners on target     │
│ • Heartbeat interval            │
│ • Pending requests map entry    │
│ • Message queue (if offline)    │
└─────────────────────────────────┘
```

### Deallocation (MANDATORY on any exit path)

```
disconnect() / destroy() / error
    │
    ▼
┌─────────────────────────────────┐
│ CLEANUP CHECKLIST:              │
│ ☑ Remove from PeerRegistry      │
│ ☑ Close MessagePort             │
│ ☑ Remove event listeners        │
│ ☑ Clear heartbeat interval      │
│ ☑ Reject pending requests       │
│ ☑ Clear message queue           │
│ ☑ Notify peer (if graceful)     │
│ ☑ Emit 'peer:disconnected'      │
└─────────────────────────────────┘
```

### WeakRef Strategy

```javascript
// For targets that may be GC'd (iframes removed from DOM)
#peerTargets = new Map();  // peerId -> WeakRef<target>

// Periodic cleanup of dead refs
#cleanupInterval = setInterval(() => {
  for (const [id, ref] of this.#peerTargets) {
    if (ref.deref() === undefined) {
      this.#handlePeerLost(id, 'gc');
    }
  }
}, 5000);
```

### FinalizationRegistry

```javascript
// Auto-cleanup when peer target is GC'd
#registry = new FinalizationRegistry((peerId) => {
  this.#handlePeerLost(peerId, 'finalized');
});

// Register on connect
this.#registry.register(target, peerId);
```

---

## Protocol Specification

### Message Envelope

```javascript
{
  _cb: 1,                    // Protocol marker (compact)
  v: 1,                      // Version
  id: 'uuid',                // Message ID
  t: 'sig'|'req'|'res'|'ack'|'hsk'|'png'|'bye',  // Type (short)
  ts: 1705...,               // Timestamp
  p: { ... },                // Payload
  r: {                       // Routing (optional)
    s: 'source',
    d: 'dest',
    ttl: 5
  },
  tr: [ArrayBuffer, ...]     // Transferables (not sent, used locally)
}
```

### Type Codes

| Code | Full Name | Description |
|------|-----------|-------------|
| `sig` | Signal | One-way message with optional ACK |
| `req` | Request | Expects response |
| `res` | Response | Reply to request |
| `ack` | Acknowledge | Delivery confirmation |
| `hsk` | Handshake | Connection negotiation |
| `png` | Ping | Heartbeat |
| `bye` | Goodbye | Graceful disconnect |

---

## Transferable Support

```javascript
// Sending ArrayBuffer (zero-copy)
const buffer = new ArrayBuffer(1024);
await bus.emit('data:chunk', buffer, 'worker', {
  transfer: [buffer]  // Ownership transferred
});
// buffer.byteLength === 0 after send (transferred)

// Sending MessagePort
const { port1, port2 } = new MessageChannel();
await bus.emit('channel:offer', { port: port2 }, 'iframe', {
  transfer: [port2]
});

// Auto-detection option
await bus.emit('data', largeBuffer, 'worker', {
  autoTransfer: true  // Automatically detect transferables
});
```

---

## API Reference

### Constructor

```javascript
const bus = new CrossBus({
  // Required
  id: string,                      // Unique bus ID

  // Security
  allowedOrigins: string[],        // Default: [] (same-origin only)

  // Reliability (defaults favor reliability)
  ackTimeout: number,              // Default: 5000ms
  requestTimeout: number,          // Default: 30000ms
  
  // Lifecycle
  heartbeatInterval: number,       // Default: 15000ms (0 = disabled)
  heartbeatTimeout: number,        // Default: 5000ms
  autoReconnect: boolean,          // Default: true
  maxReconnectAttempts: number,    // Default: 5
  
  // Performance options
  defaultReliable: boolean,        // Default: true (ACK enabled)
  
  // Plugins
  plugins: Plugin[]                // Default: []
});
```

### Core Methods

```javascript
// Connect to peer
await bus.connect(target, {
  id: string,
  origin?: string,            // Required for cross-origin
  timeout?: number
}): Promise<PeerConnection>

// Disconnect peer
bus.disconnect(peerId, { graceful?: boolean, reason?: string }): void

// Destroy bus (cleanup everything)
bus.destroy(): void

// Send signal (reliable by default)
await bus.emit(name, data, dest?, {
  reliable?: boolean,         // Default: true (wait for ACK)
  timeout?: number,
  transfer?: Transferable[],
  autoTransfer?: boolean
}): Promise<EmitResult>

// Send request (always waits for response)
await bus.request(name, data, dest, {
  timeout?: number,
  transfer?: Transferable[]
}): Promise<any>

// Broadcast to all peers
await bus.broadcast(name, data, {
  includeSelf?: boolean,
  exclude?: string[],
  reliable?: boolean
}): Promise<BroadcastResult>

// Listen for signals
bus.on(name, handler, options?): Subscription
bus.once(name, handler, options?): Subscription
bus.off(name, handler?): RemoveResult

// Handle requests
bus.handle(name, handler): void
bus.unhandle(name): void

// Create direct channel between peers (hub only)
await bus.createDirectChannel(peerA, peerB): Promise<DirectChannel>

// Status
bus.getStatus(): BusStatus
bus.getPeer(id): PeerInfo | undefined
bus.getPeers(): PeerInfo[]
```

### Events

```javascript
// Lifecycle
bus.on('peer:connected', ({ peerId, type, origin }) => {})
bus.on('peer:disconnected', ({ peerId, reason, graceful }) => {})
bus.on('peer:reconnecting', ({ peerId, attempt, maxAttempts }) => {})
bus.on('peer:failed', ({ peerId, error }) => {})

// Errors
bus.on('error', ({ code, message, details, retryable }) => {})

// Debug (only with debug plugin)
bus.on('debug:message:in', (message) => {})
bus.on('debug:message:out', (message) => {})
```

---

## Plugin API

```javascript
// Plugin interface
interface Plugin {
  name: string;
  install(bus: CrossBus, options?: object): void;
  destroy?(): void;
}

// Example: Retry plugin
import { retryPlugin } from 'crossbus/plugins/retry';

const bus = new CrossBus({
  id: 'main',
  plugins: [
    retryPlugin({
      maxAttempts: 3,
      baseDelay: 1000,
      backoff: 'exponential'
    })
  ]
});

// Plugin adds methods
await bus.emitWithRetry('name', data, dest);
```

### Available Plugins

| Plugin | Size | Description |
|--------|------|-------------|
| `retry` | ~1KB | Retry with exponential backoff |
| `circuit-breaker` | ~1KB | Circuit breaker pattern |
| `metrics` | ~1KB | Message counts, latency histograms |
| `debug` | ~0.5KB | Console logging, message inspection |

---

## Error Handling

### Error Codes

```javascript
// Connection
ERR_HANDSHAKE_TIMEOUT    // Retryable
ERR_ORIGIN_FORBIDDEN     // Fatal
ERR_PEER_NOT_FOUND       // Fatal
ERR_PEER_DISCONNECTED    // Retryable

// Messages
ERR_ACK_TIMEOUT          // Retryable
ERR_RESPONSE_TIMEOUT     // Retryable
ERR_NO_HANDLER           // Fatal
ERR_HANDLER_ERROR        // Fatal
ERR_CLONE_ERROR          // Fatal
ERR_TRANSFER_ERROR       // Fatal

// Routing
ERR_UNREACHABLE          // Retryable
ERR_TTL_EXCEEDED         // Fatal
```

### CrossBusError

```javascript
try {
  await bus.emit('msg', data, 'unknown');
} catch (err) {
  if (err instanceof CrossBusError) {
    err.code       // 'ERR_PEER_NOT_FOUND'
    err.message    // Human-readable
    err.details    // { peerId: 'unknown' }
    err.retryable  // false
  }
}
```

---

## Security Model

### Origin Validation

```javascript
// Strict: only specific origins
new CrossBus({
  allowedOrigins: ['https://trusted.com', 'https://api.example.com']
});

// Pattern matching
new CrossBus({
  allowedOrigins: ['https://*.example.com']
});

// Same-origin only (default, most secure)
new CrossBus({ allowedOrigins: [] });
```

### Handshake Protocol

```
PEER A (initiator)              PEER B (responder)
       │                               │
       │  HSK_INIT {id, origin, nonce} │
       │ ─────────────────────────────►│
       │                               │ Validate origin
       │                               │ Generate response
       │  HSK_ACK {id, origin, proof}  │
       │ ◄─────────────────────────────│
       │ Validate proof                │
       │                               │
       │  HSK_DONE {success: true}     │
       │ ─────────────────────────────►│
       │                               │
       │  ✓ Both sides CONNECTED       │
```

---

## Performance Considerations

### Fire-and-Forget Mode

```javascript
// When reliability isn't needed (logging, analytics)
bus.emit('analytics:track', data, 'logger', { 
  reliable: false  // No ACK, no waiting
});
```

### Batch Operations

```javascript
// Multiple emits without waiting
const promises = items.map(item => 
  bus.emit('item:process', item, 'worker', { reliable: false })
);
// Don't await if fire-and-forget is acceptable
```

### Direct Channels

```javascript
// For high-frequency communication between specific peers
const channel = await bus.createDirectChannel('renderer', 'physics');
// Now renderer ↔ physics bypass hub completely
```

---

## Memory Budget

| Component | Baseline | Per Peer | Per Message |
|-----------|----------|----------|-------------|
| Core | ~50KB | - | - |
| PeerRegistry | - | ~200B | - |
| Pending Requests | - | - | ~100B |
| Message Queue | - | ~1KB base | ~500B |
| Heartbeat Interval | - | ~50B | - |

### Limits

```javascript
new CrossBus({
  maxPeers: 50,           // Default: 100
  maxPendingRequests: 100, // Default: 1000
  maxQueueSize: 50,        // Default: 100 per peer
  maxMessageSize: 1048576  // Default: 1MB
});
```

---

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

### Required APIs
- `crypto.randomUUID()`
- `structuredClone()` (polyfill provided)
- `WeakRef` / `FinalizationRegistry`
- `BroadcastChannel`
- `MessageChannel`
- `AbortController`
