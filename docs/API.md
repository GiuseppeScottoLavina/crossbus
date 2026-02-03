# CrossBus API Reference

Complete API documentation for CrossBus.js.

---

## Table of Contents

- [CrossBus Class](#crossbus-class)
- [Methods](#methods)
  - [connect()](#connecttarget-options)
  - [disconnect()](#disconnectpeerid-options)
  - [destroy()](#destroy)
  - [emit()](#emitname-data-dest-options)
  - [request()](#requestname-data-dest-options)
  - [broadcast()](#broadcastname-data-options)
  - [on()](#onname-handler-options)
  - [once()](#oncename-handler-options)
  - [off()](#offname-handler)
  - [handle()](#handlename-handler)
  - [unhandle()](#unhandlename)
  - [addInboundHook()](#addinboundhookhookfn-priority)
  - [addOutboundHook()](#addoutboundhookhookfn-priority)
  - [removeInboundHook()](#removeinboundhookhookfn)
  - [removeOutboundHook()](#removeoutboundhookhookfn)
  - [createDirectChannel()](#createdirectchannelpeera-peerb)
  - [getStatus()](#getstatus)
  - [getPeer()](#getpeerid)
  - [getPeers()](#getpeers)
- [Types](#types)
- [Error Codes](#error-codes)
- [Events](#events)

---

## CrossBus Class

### Constructor

```javascript
new CrossBus(options)
```

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for this bus instance |
| `allowedOrigins` | `string[]` | `[]` | Trusted origins for cross-origin messages. Empty = same-origin only. Use `['*']` to allow all (insecure) |
| `defaultReliable` | `boolean` | `true` | Whether `emit()` waits for ACK by default |
| `ackTimeout` | `number` | `5000` | Timeout (ms) waiting for ACK |
| `requestTimeout` | `number` | `30000` | Timeout (ms) waiting for response |
| `handshakeTimeout` | `number` | `10000` | Timeout (ms) for peer handshake |
| `heartbeatInterval` | `number` | `15000` | Interval (ms) for ping. `0` = disabled |
| `heartbeatTimeout` | `number` | `5000` | Timeout (ms) waiting for pong |
| `autoReconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectInterval` | `number` | `3000` | Initial reconnect delay (ms) |
| `maxReconnectAttempts` | `number` | `5` | Max reconnection attempts |
| `maxPeers` | `number` | `100` | Maximum connected peers |
| `maxPendingRequests` | `number` | `1000` | Maximum pending requests |
| `maxQueueSize` | `number` | `100` | Max queued messages per offline peer |
| `maxMessageSize` | `number` | `1048576` | Max message size (1MB) |
| `plugins` | `Plugin[]` | `[]` | Optional plugins to install |

#### Example

```javascript
import { CrossBus } from 'crossbus';

const bus = new CrossBus({
  id: 'main-app',
  allowedOrigins: ['https://widget.example.com'],
  defaultReliable: true,
  plugins: []
});
```

---

## Methods

### connect(target, options)

Establishes connection with a peer.

```javascript
await bus.connect(target, options): Promise<PeerConnection>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `HTMLIFrameElement \| Worker \| ServiceWorker \| Window \| MessagePort` | Peer to connect |
| `options.id` | `string` | Unique peer ID |
| `options.origin` | `string` | Expected origin (required for cross-origin) |
| `options.timeout` | `number` | Handshake timeout override |

#### Returns

```typescript
interface PeerConnection {
  peerId: string;
  origin: string;
  type: 'iframe' | 'worker' | 'sw' | 'window' | 'port';
  status: 'connected';
  connectedAt: number;
  disconnect(): void;
}
```

#### Errors

- `ERR_ORIGIN_FORBIDDEN` - Origin not in allowedOrigins
- `ERR_PEER_EXISTS` - Peer ID already exists
- `ERR_HANDSHAKE_TIMEOUT` - Handshake timed out
- `ERR_MAX_PEERS` - Maximum peers reached

#### Example

```javascript
// Connect to iframe
const iframe = document.getElementById('widget');
const peer = await bus.connect(iframe, {
  id: 'widget',
  origin: 'https://widget.example.com'
});

// Connect to worker
const worker = new Worker('worker.js');
await bus.connect(worker, { id: 'calc-worker' });

// Connect to parent (from iframe/worker)
await bus.connect(self.parent || self, { id: 'parent' });
```

---

### disconnect(peerId, options?)

Disconnects a peer.

```javascript
bus.disconnect(peerId, options?): void
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `peerId` | `string` | | Peer to disconnect |
| `options.graceful` | `boolean` | `true` | Notify peer before disconnect |
| `options.reason` | `string` | | Reason for disconnect |

#### Example

```javascript
bus.disconnect('widget', { 
  graceful: true, 
  reason: 'User navigated away' 
});
```

---

### destroy()

Destroys the bus instance, cleaning up all resources.

```javascript
bus.destroy(): void
```

**Important**: After calling `destroy()`, all methods will throw `ERR_DESTROYED`.

#### Cleanup Actions

- Disconnects all peers (gracefully)
- Clears all event listeners
- Rejects all pending requests
- Clears all intervals/timeouts
- Removes all references

---

### emit(name, data, dest?, options?)

Emits a signal to a peer.

```javascript
await bus.emit(name, data, dest?, options?): Promise<EmitResult>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | | Signal name |
| `data` | `any` | | Payload (must be structured-cloneable) |
| `dest` | `string` | | Target peer ID. Omit for local only |
| `options.reliable` | `boolean` | `true` | Wait for ACK |
| `options.timeout` | `number` | `5000` | ACK timeout |
| `options.transfer` | `Transferable[]` | | Objects to transfer |
| `options.autoTransfer` | `boolean` | `false` | Auto-detect transferables |

#### Returns

```typescript
interface EmitResult {
  success: boolean;
  messageId: string;
  timestamp: number;
  delivery: 'local' | 'sent' | 'acked' | 'queued' | 'timeout' | 'failed';
  peerId?: string;
  error?: string;
}
```

#### Errors

- `ERR_PEER_NOT_FOUND` - Unknown peer
- `ERR_PEER_DISCONNECTED` - Peer is offline
- `ERR_ACK_TIMEOUT` - ACK not received
- `ERR_CLONE_ERROR` - Data not cloneable
- `ERR_TRANSFER_ERROR` - Transfer failed

#### Examples

```javascript
// Reliable (default) - waits for ACK
const result = await bus.emit('config:update', { theme: 'dark' }, 'widget');
console.log(result.delivery); // 'acked'

// Fire-and-forget - no ACK
await bus.emit('log:event', data, 'logger', { reliable: false });

// With transferable
const buffer = new ArrayBuffer(1024);
await bus.emit('data:chunk', buffer, 'worker', { transfer: [buffer] });

// Local only (no dest)
await bus.emit('internal:event', data);
```

---

### emitSync(name, data)

**Ultra-fast synchronous emit** for performance-critical paths.

```javascript
bus.emitSync(name, data): number
```

Unlike `emit()`, this method:
- Is synchronous (no async/await overhead)
- Passes data directly to handlers (no event envelope)
- Skips messageId, timestamp generation
- Exact match only (no wildcards)

**Performance:** 210M ops/sec (9ns per call)

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Signal name (exact match only) |
| `data` | `any` | Payload to pass directly to handlers |

#### Returns

`number` - Count of listeners invoked.

#### Example

```javascript
// Ultra-fast for hot paths (210M ops/sec)
const count = bus.emitSync('tick', { x: 100, y: 200 });
console.log(`Notified ${count} listeners`);
```

---

### setMaxListeners(n)

Sets the maximum number of listeners before a memory leak warning is emitted.

```javascript
bus.setMaxListeners(n): this
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | `number` | Max listeners (0 = unlimited) |

#### Example

```javascript
// Increase limit for high-listener scenarios
bus.setMaxListeners(50);
```

---

### getMaxListeners()

Returns the current max listeners setting.

```javascript
bus.getMaxListeners(): number
```

---

### addInboundHook(hookFn, priority?)

Registers a hook to transform incoming message payloads.

```javascript
bus.addInboundHook(hookFn, priority?): () => boolean
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hookFn` | `MessageHook` | | Hook function `(payload, context) => payload` |
| `priority` | `number` | `10` | Execution order (lower = first) |

#### Hook Context

```typescript
interface HookContext {
  type: 'signal' | 'request' | 'response';
  direction: 'inbound' | 'outbound';
  peerId?: string;
  handlerName?: string;
}
```

#### Returns

Unsubscribe function that returns `true` if hook was removed.

#### Example

```javascript
// Decryption hook
const unsubscribe = bus.addInboundHook(async (payload, ctx) => {
  return await decrypt(payload);
});

// Logging hook (no modification)
bus.addInboundHook((payload, ctx) => {
  console.log(`[${ctx.direction}] ${ctx.type}:`, payload);
  return payload;
}, 5); // priority 5 runs before default 10

// Remove hook
unsubscribe();
```

---

### addOutboundHook(hookFn, priority?)

Registers a hook to transform outgoing message payloads.

```javascript
bus.addOutboundHook(hookFn, priority?): () => boolean
```

Same signature as `addInboundHook`. Outbound hooks run on:
- `signal()` payloads before broadcast
- `request()` payloads before sending
- Response payloads before returning to requester

#### Example

```javascript
// Encryption pipeline
bus.addOutboundHook(async (payload) => await compress(payload), 10);
bus.addOutboundHook(async (payload) => await encrypt(payload), 20);
// Runs: compress (10) → encrypt (20)

// Symmetric crypto: encrypt outbound, decrypt inbound
bus.addOutboundHook(encrypt);
bus.addInboundHook(decrypt);
```

---

### removeInboundHook(hookFn)

Removes a previously registered inbound hook.

```javascript
bus.removeInboundHook(hookFn): boolean
```

Returns `true` if hook was found and removed.

---

### removeOutboundHook(hookFn)

Removes a previously registered outbound hook.

```javascript
bus.removeOutboundHook(hookFn): boolean
```

Returns `true` if hook was found and removed.

---

### request(name, data, dest, options?)

Sends request and waits for response.

```javascript
await bus.request(name, data, dest, options?): Promise<any>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | | Request name |
| `data` | `any` | | Request payload |
| `dest` | `string` | **required** | Target peer ID |
| `options.timeout` | `number` | `30000` | Response timeout |
| `options.transfer` | `Transferable[]` | | Objects to transfer |

#### Returns

Response data from the handler.

#### Errors

- `ERR_PEER_NOT_FOUND` - Unknown peer
- `ERR_NO_HANDLER` - No handler registered
- `ERR_HANDLER_ERROR` - Handler threw exception
- `ERR_RESPONSE_TIMEOUT` - No response received

#### Example

```javascript
// Request user data
const user = await bus.request('user:get', { id: 42 }, 'api-worker');
console.log(user.name);

// With timeout
try {
  const result = await bus.request('slow:operation', {}, 'worker', {
    timeout: 60000
  });
} catch (err) {
  if (err.code === 'ERR_RESPONSE_TIMEOUT') {
    console.log('Operation took too long');
  }
}
```

---

### broadcast(name, data, options?)

Broadcasts signal to all connected peers.

```javascript
await bus.broadcast(name, data, options?): Promise<BroadcastResult>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | | Signal name |
| `data` | `any` | | Payload |
| `options.includeSelf` | `boolean` | `true` | Trigger local listeners |
| `options.exclude` | `string[]` | `[]` | Peers to exclude |
| `options.reliable` | `boolean` | `true` | Wait for ACKs |
| `options.timeout` | `number` | `5000` | Timeout per peer |

#### Returns

```typescript
interface BroadcastResult {
  success: boolean;
  messageId: string;
  timestamp: number;
  totalPeers: number;
  sentCount: number;
  ackedCount: number;
  failedCount: number;
  details: Array<{
    peerId: string;
    status: 'acked' | 'sent' | 'failed' | 'excluded';
    error?: string;
  }>;
}
```

#### Example

```javascript
// Broadcast to all
const result = await bus.broadcast('app:refresh', { version: '2.0' });
console.log(`Notified ${result.ackedCount}/${result.totalPeers} peers`);

// Exclude specific peer
await bus.broadcast('sync', data, { exclude: ['slow-peer'] });

// Don't trigger local listeners
await bus.broadcast('remote:only', data, { includeSelf: false });
```

---

### on(name, handler, options?)

Registers a signal listener.

```javascript
bus.on(name, handler, options?): Subscription
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Signal name. Supports wildcards: `*`, `user:*` |
| `handler` | `Function` | `(event) => void \| Promise<void>` |
| `options.once` | `boolean` | Auto-remove after first call |
| `options.signal` | `AbortSignal` | Abort controller signal |
| `options.priority` | `number` | Execution order (higher = first) |

#### Handler Event

```typescript
interface SignalEvent {
  name: string;           // Signal name
  data: any;              // Payload
  messageId: string;      // Unique message ID
  timestamp: number;      // When emitted
  source: {
    peerId: string;       // Sender ID ('self' if local)
    origin: string;       // Sender origin
    type: 'local' | 'iframe' | 'worker' | 'sw' | 'window';
  };
}
```

#### Returns

```typescript
interface Subscription {
  id: string;
  signalName: string;
  active: boolean;
  unsubscribe(): void;
}
```

#### Examples

```javascript
// Basic listener
bus.on('user:login', (event) => {
  console.log(`User ${event.data.userId} from ${event.source.peerId}`);
});

// Wildcard
bus.on('user:*', (event) => {
  console.log('User event:', event.name);
});

// Global (all signals)
bus.on('*', (event) => {
  console.log('Any signal:', event.name);
});

// With AbortController
const controller = new AbortController();
bus.on('data', handler, { signal: controller.signal });
controller.abort(); // Removes listener

// One-time
bus.on('init', handler, { once: true });
```

---

### once(name, handler, options?)

Registers a one-time listener. Alias for `on(name, handler, { once: true })`.

---

### off(name, handler?)

Removes listeners.

```javascript
bus.off(name, handler?): RemoveResult
```

#### Returns

```typescript
interface RemoveResult {
  success: boolean;
  removedCount: number;
  remainingCount: number;
}
```

#### Examples

```javascript
// Remove specific handler
bus.off('event', myHandler);

// Remove ALL listeners for signal
bus.off('event');
```

---

### handle(name, handler)

Registers a request handler.

```javascript
bus.handle(name, handler): void
```

The handler receives the same event as `on()` and **must return a value** (or Promise) that becomes the response.

#### Example

```javascript
// Sync handler
bus.handle('user:get', (event) => {
  return users.find(u => u.id === event.data.id);
});

// Async handler
bus.handle('db:query', async (event) => {
  const result = await database.query(event.data.sql);
  return result.rows;
});

// Error handling
bus.handle('risky:operation', (event) => {
  if (!event.data.valid) {
    throw new Error('Invalid input');
    // Requester receives ERR_HANDLER_ERROR
  }
  return processData(event.data);
});
```

---

### unhandle(name)

Removes a request handler.

```javascript
bus.unhandle(name): boolean
```

Returns `true` if handler was removed.

---

### createDirectChannel(peerA, peerB)

Creates a direct MessageChannel between two peers (bypasses hub routing).

```javascript
await bus.createDirectChannel(peerA, peerB): Promise<DirectChannel>
```

**Hub mode only**. Throw `ERR_NOT_SUPPORTED` in peer mode.

#### Returns

```typescript
interface DirectChannel {
  id: string;
  peerA: string;
  peerB: string;
  active: boolean;
  close(): void;
  on(event: 'close', handler: (reason: string) => void): void;
}
```

#### Example

```javascript
// Create direct channel between widget and worker
const channel = await hub.createDirectChannel('widget', 'worker');

// Now widget ↔ worker communicate directly
// Messages don't pass through hub

// Close when done
channel.close();
```

---

### getStatus()

Returns complete bus status.

```javascript
bus.getStatus(): BusStatus
```

#### Returns

```typescript
interface BusStatus {
  id: string;
  destroyed: boolean;
  peers: Record<string, PeerInfo>;
  channels: DirectChannel[];
  stats: {
    messagesIn: number;
    messagesOut: number;
    bytesIn: number;
    bytesOut: number;
  };
}
```

---

### getPeer(id)

Returns peer info by ID.

```javascript
bus.getPeer(id): PeerInfo | undefined
```

---

### getPeers()

Returns all connected peers.

```javascript
bus.getPeers(): PeerInfo[]
```

---

## Types

### PeerInfo

```typescript
interface PeerInfo {
  id: string;
  type: 'iframe' | 'worker' | 'sw' | 'window' | 'port';
  origin: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';
  connectedAt: number;
  lastSeen: number;
  reconnectAttempts: number;
}
```

---

## Error Codes

| Code | Retryable | Description |
|------|-----------|-------------|
| `ERR_HANDSHAKE_TIMEOUT` | ✅ | Handshake timed out |
| `ERR_HANDSHAKE_REJECTED` | ❌ | Peer rejected connection |
| `ERR_ORIGIN_FORBIDDEN` | ❌ | Origin not allowed |
| `ERR_PEER_EXISTS` | ❌ | Peer ID already exists |
| `ERR_PEER_NOT_FOUND` | ❌ | Unknown peer |
| `ERR_PEER_DISCONNECTED` | ✅ | Peer is offline |
| `ERR_RECONNECT_FAILED` | ❌ | Max reconnects reached |
| `ERR_ACK_TIMEOUT` | ✅ | ACK not received |
| `ERR_RESPONSE_TIMEOUT` | ✅ | Response not received |
| `ERR_NO_HANDLER` | ❌ | No request handler |
| `ERR_HANDLER_ERROR` | ❌ | Handler threw exception |
| `ERR_CLONE_ERROR` | ❌ | Data not cloneable |
| `ERR_TRANSFER_ERROR` | ❌ | Transfer failed |
| `ERR_MESSAGE_TOO_LARGE` | ❌ | Message exceeds maximum size |
| `ERR_DESTROYED` | ❌ | Bus was destroyed |
| `ERR_QUEUE_FULL` | ❌ | Message queue is full |
| `ERR_INVALID_MESSAGE` | ❌ | Invalid message format |
| `ERR_VERSION_MISMATCH` | ❌ | Protocol version mismatch |
| `ERR_UNREACHABLE` | ✅ | Destination peer is unreachable |
| `ERR_TTL_EXCEEDED` | ❌ | Message TTL exceeded (possible routing loop) |
| `ERR_NO_ROUTE` | ❌ | No route to destination |
| `ERR_HANDLER_TIMEOUT` | ✅ | Handler did not respond within timeout |
| `ERR_CHANNEL_FAILED` | ✅ | Failed to create direct channel |
| `ERR_CHANNEL_CLOSED` | ❌ | Channel was closed unexpectedly |
| `ERR_MAX_PEERS` | ❌ | Maximum number of peers reached |
| `ERR_MAX_PENDING` | ❌ | Maximum pending requests reached |

### Error Handling Best Practices

```javascript
import { CrossBusError, isRetryable, ErrorCode } from 'crossbus';

try {
  const result = await bus.request('widget', 'getData', { id: 5 });
} catch (error) {
  if (error instanceof CrossBusError) {
    console.log('Code:', error.code);        // 'ERR_RESPONSE_TIMEOUT'
    console.log('Message:', error.message);  // 'Response not received within timeout'
    console.log('Details:', error.details);  // { requestId, targetPeer, handlerName, timeout }
    console.log('Retryable:', error.retryable); // true
    console.log('Timestamp:', error.timestamp); // 1737534000000
    
    // Check if worth retrying
    if (isRetryable(error)) {
      // Retry logic here
    }
    
    // Handle specific errors
    switch (error.code) {
      case ErrorCode.PEER_NOT_FOUND:
        console.log('Peer does not exist');
        break;
      case ErrorCode.RESPONSE_TIMEOUT:
        console.log('Request timed out, consider increasing timeout');
        break;
      case ErrorCode.MAX_PENDING:
        console.log('Too many pending requests, slow down');
        break;
    }
  }
}
```

### CrossBusError Properties

| Property | Type | Description |
|----------|------|-------------|
| `code` | `ErrorCode` | Error code constant (e.g., `'ERR_PEER_NOT_FOUND'`) |
| `message` | `string` | Human-readable error message |
| `details` | `object` | Additional context (varies by error) |
| `retryable` | `boolean` | Whether the operation can be retried |
| `cause` | `Error?` | Original error that caused this error |
| `timestamp` | `number` | When error occurred (ms since epoch) |

---

## Events

Listen to lifecycle events:

```javascript
bus.on('peer:connected', ({ peerId, type, origin }) => {});
bus.on('peer:disconnected', ({ peerId, reason, graceful }) => {});
bus.on('peer:reconnecting', ({ peerId, attempt, maxAttempts }) => {});
bus.on('peer:failed', ({ peerId, error }) => {});
bus.on('error', ({ code, message, details }) => {});
```

---

## NativeBridgeTransport

Transport for Android/iOS WebView communication.

```javascript
import { NativeBridgeTransport } from 'crossbus';

const transport = new NativeBridgeTransport({
  androidInterface: 'CrossBus',   // Android bridge name
  iosHandler: 'crossbus',         // iOS handler name
  initTimeout: 5000,               // Wait for bridge (ms)
  heartbeatInterval: 30000         // Heartbeat every 30s
});

await transport.ready;
console.log(transport.bridgeType); // 'android' | 'ios' | 'none'

transport.onMessage((msg, { bridgeType }) => {
  console.log(`From ${bridgeType}:`, msg);
});

transport.send({ type: 'hello', data: 123 });
transport.destroy();
```

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `detectBridge()` | `'android' \| 'ios' \| 'none'` | Detects available bridge |
| `isSupported()` | `boolean` | True if any bridge available |

---

## StreamManager

For transferring large payloads in chunks.

```javascript
import { StreamManager, WritableSignalStream, ReadableSignalStream } from 'crossbus';

const streams = new StreamManager((peerId, msg) => bus.send(peerId, msg));

// Send stream
const stream = streams.createStream('upload', 'peer-1', {
  chunkSize: 64000,
  meta: { filename: 'data.json' }
});

await stream.write(data1);
await stream.write(data2);
await stream.end({ checksum: '...' });

// Receive streams
streams.onStream('upload', async (stream) => {
  console.log('Receiving:', stream.meta.filename);
  
  // Option 1: Iterate chunks
  for await (const chunk of stream) {
    await processChunk(chunk);
  }
  
  // Option 2: Collect all
  const data = await stream.collect();
});

// Handle incoming stream messages
bus.on('stream', (msg, ctx) => {
  streams.handleMessage(msg, ctx.peerId);
});
```

### WritableSignalStream

| Method | Description |
|--------|-------------|
| `open(meta?)` | Opens stream (auto-called on first write) |
| `write(data)` | Writes data chunk (string, ArrayBuffer, object) |
| `end(meta?)` | Ends stream with optional final metadata |
| `abort(reason?)` | Aborts stream with error |

### ReadableSignalStream

| Property | Type | Description |
|----------|------|-------------|
| `streamId` | `string` | Stream identifier |
| `name` | `string` | Stream name/type |
| `meta` | `object` | Stream metadata |
| `ended` | `boolean` | Whether stream ended |

| Method | Returns | Description |
|--------|---------|-------------|
| `[Symbol.asyncIterator]()` | `AsyncIterator` | Iterate chunks |
| `collect()` | `Promise<Uint8Array \| string>` | Collect all data |

---

## PresenceManager

Real-time online peer tracking with heartbeat.

```javascript
import { PresenceManager, createPresence } from 'crossbus';

// With CrossBus integration
const presence = createPresence(bus, {
  heartbeatInterval: 15000,   // Heartbeat every 15s
  timeout: 45000              // Offline after 45s silence
});

// Track joins/leaves
presence.on('join', ({ peerId, meta }) => console.log(`${peerId} online`));
presence.on('leave', ({ peerId }) => console.log(`${peerId} offline`));
presence.on('update', ({ peerId, peer }) => console.log(`${peerId} updated`));

// Query presence
const online = presence.getOnlinePeers();  // ['peer-1', 'peer-2']
presence.isOnline('peer-1');               // true
const peer = presence.getPeer('peer-1');   // { peerId, status, lastSeen, meta }

// Set own status
presence.setStatus('away', { reason: 'brb' });
presence.setMeta({ avatar: 'url' });

// Cleanup
presence.destroy();
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `void` | Start heartbeat |
| `stop()` | `void` | Stop heartbeat, announce leave |
| `setStatus(status, meta?)` | `void` | Update own status |
| `setMeta(meta)` | `void` | Update own metadata |
| `getOnlinePeers()` | `string[]` | List of online peer IDs |
| `getAllPeers()` | `PeerPresence[]` | All peer presences |
| `getPeer(id)` | `PeerPresence?` | Get specific peer |
| `isOnline(id)` | `boolean` | Check if peer online |
| `handleMessage(msg, peerId)` | `void` | Handle presence message |
| `destroy()` | `void` | Clean up resources |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ peerId, meta }` | Peer came online |
| `leave` | `{ peerId }` | Peer went offline |
| `update` | `{ peerId, peer }` | Peer presence updated |
