# CrossBus Examples

Real-world examples for common use cases.

---

## 1. Micro-Frontend Communication

Dashboard with multiple independent widgets:

```javascript
// dashboard.js (Hub)
import { CrossBus } from 'crossbus';

const dashboard = new CrossBus({ 
    peerId: 'dashboard', 
    isHub: true 
});

// Global state
let currentUser = null;

// Handle user selection from any widget
dashboard.handle('setUser', (payload) => {
    currentUser = payload.user;
    // Notify all widgets
    dashboard.signal('user:changed', { user: currentUser });
    return { success: true };
});

// Provide current user to any widget
dashboard.handle('getUser', () => currentUser);
```

```javascript
// user-list-widget.js
const widget = new CrossBus({ peerId: 'user-list' });

function onUserClick(user) {
    widget.request('dashboard', 'setUser', { user });
}
```

```javascript
// user-details-widget.js
const widget = new CrossBus({ peerId: 'user-details' });

widget.on('user:changed', (event) => {
    renderUserDetails(event.payload.user);
});
```

---

## 2. Offloading Work to Web Worker

Heavy computation in background:

```javascript
// main.js
import { CrossBus } from 'crossbus';

const hub = new CrossBus({ peerId: 'main', isHub: true });

// Create worker
const worker = new Worker('./compute-worker.js', { type: 'module' });

// Process images in background
async function processImages(images) {
    const results = [];
    for (const img of images) {
        const result = await hub.request('worker', 'processImage', { 
            imageData: img 
        });
        results.push(result);
    }
    return results;
}
```

```javascript
// compute-worker.js
import { CrossBus } from 'crossbus';

const worker = new CrossBus({ peerId: 'worker' });

worker.handle('processImage', async (payload) => {
    // Heavy image processing
    const processed = await applyFilters(payload.imageData);
    return { processed, timestamp: Date.now() };
});
```

---

## 3. Cross-Tab Synchronization

Keep state in sync across browser tabs:

```javascript
// Any tab
import { CrossBus, BroadcastChannelTransport } from 'crossbus';

const bus = new CrossBus({ peerId: `tab-${Date.now()}` });

// Listen for cart updates from other tabs
bus.on('cart:updated', (event) => {
    updateCartUI(event.payload.cart);
});

// When user adds item
function addToCart(item) {
    cart.push(item);
    updateCartUI(cart);
    
    // Notify other tabs
    bus.signal('cart:updated', { cart });
}
```

---

## 4. Plugin Embedding with Security

Embed third-party widgets safely:

```javascript
// host.js
import { CrossBus, OriginValidator } from 'crossbus';

const hub = new CrossBus({ 
    peerId: 'host',
    isHub: true,
    allowedOrigins: [
        'https://trusted-plugin.com',
        'https://another-trusted.com'
    ]
});

// Only expose safe APIs
hub.handle('getPublicData', () => ({
    theme: 'dark',
    language: 'en'
}));

// Block sensitive operations from plugins
// (don't register handlers for them)
```

```html
<!-- Embed plugin in sandboxed iframe -->
<iframe 
    src="https://trusted-plugin.com/widget"
    sandbox="allow-scripts"
></iframe>
```

---

## 5. Service Worker Communication

Communicate with service worker for offline support:

```javascript
// main.js
import { CrossBus } from 'crossbus';

const hub = new CrossBus({ peerId: 'app', isHub: true });

// Register SW
if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    // Request cached data
    const cachedData = await hub.request('sw', 'getCached', { 
        key: 'user-preferences' 
    });
}
```

```javascript
// sw.js (Service Worker)
import { CrossBus } from 'crossbus';

const sw = new CrossBus({ peerId: 'sw' });

sw.handle('getCached', async (payload) => {
    const cache = await caches.open('app-cache');
    const response = await cache.match(payload.key);
    return response ? await response.json() : null;
});

sw.handle('putCached', async (payload) => {
    const cache = await caches.open('app-cache');
    await cache.put(payload.key, new Response(JSON.stringify(payload.data)));
    return { success: true };
});
```

---

## 6. Request with Timeout and Retry

Resilient communication:

```javascript
import { CrossBus } from 'crossbus';
import { withRetry, RetryStrategies } from 'crossbus/plugins/retry';
import { CircuitBreaker } from 'crossbus/plugins/circuit-breaker';

const bus = new CrossBus({ peerId: 'client' });
const breaker = new CircuitBreaker({ 
    failureThreshold: 3,
    resetTimeout: 30000 
});

async function fetchWithResilience(handler, payload) {
    // Circuit breaker wraps retry logic
    return breaker.execute(() => 
        withRetry(
            () => bus.request('server', handler, payload, { timeout: 5000 }),
            RetryStrategies.STANDARD
        )
    );
}

// Usage
try {
    const data = await fetchWithResilience('getData', { id: 1 });
} catch (e) {
    if (e.code === 'CIRCUIT_OPEN') {
        showOfflineMessage();
    }
}
```

---

## 7. Broadcast Request (Fan-out)

Request from multiple peers simultaneously:

```javascript
import { CrossBus } from 'crossbus';

const hub = new CrossBus({ peerId: 'aggregator', isHub: true });

// Request status from all connected workers
async function getSystemStatus() {
    const responses = await hub.broadcastRequest('getStatus', {});
    
    // responses is Map<peerId, response>
    const statuses = {};
    for (const [peerId, status] of responses) {
        statuses[peerId] = status;
    }
    
    return {
        healthy: Object.values(statuses).every(s => s.healthy),
        workers: statuses
    };
}
```

---

## 8. TypeScript Usage

Full type safety:

```typescript
import { CrossBus, CrossBusOptions } from 'crossbus';
import { withRetry, RetryOptions } from 'crossbus/plugins/retry';

interface User {
    id: number;
    name: string;
}

const bus = new CrossBus({ peerId: 'typed-client' });

// Typed request
const user = await bus.request<User>('hub', 'getUser', { id: 1 });
console.log(user.name);  // TypeScript knows this is a string

// Typed handler
bus.handle('createUser', (payload: { name: string }): User => {
    return { id: Date.now(), name: payload.name };
});
```
