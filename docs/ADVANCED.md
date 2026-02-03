# Advanced Communication Patterns

Detailed examples for complex cross-context communication scenarios.

---

## Iframe ↔ Iframe Communication

Two iframes can't communicate directly - they must go through a hub (parent page).

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Parent Page (Hub)                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  const hub = new CrossBus({ isHub: true, peerId: 'hub' })││
│  │                                                          ││
│  │  hub.addTransport(PostMessageTransport(iframeA))        ││
│  │  hub.addTransport(PostMessageTransport(iframeB))        ││
│  └─────────────────────────────────────────────────────────┘│
│                      ↑                ↑                     │
│                      │                │                     │
│  ┌────────────────┐  │                │  ┌────────────────┐ │
│  │ Iframe A       │  │                │  │ Iframe B       │ │
│  │ (widget-a)     │←─┘                └─→│ (widget-b)     │ │
│  └────────────────┘                      └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Parent Page (Hub)

```javascript
// parent.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const hub = new CrossBus({ 
    peerId: 'hub', 
    isHub: true,
    allowedOrigins: ['https://trusted-domain.com']
});

// Connect iframe A
const iframeA = document.getElementById('iframe-a');
iframeA.onload = () => {
    hub.addTransport(
        new PostMessageTransport(iframeA.contentWindow, { 
            targetOrigin: 'https://trusted-domain.com' 
        }),
        { peerId: 'widget-a' }
    );
};

// Connect iframe B
const iframeB = document.getElementById('iframe-b');
iframeB.onload = () => {
    hub.addTransport(
        new PostMessageTransport(iframeB.contentWindow, { 
            targetOrigin: 'https://trusted-domain.com' 
        }),
        { peerId: 'widget-b' }
    );
};

// Hub can also listen to signals passing through
hub.on('*', (event) => {
    console.log(`[Hub] ${event.source.peerId} → ${event.name}`);
});
```

### Iframe A (Widget)

```javascript
// widget-a.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const widget = new CrossBus({ 
    peerId: 'widget-a',
    allowedOrigins: ['https://parent-domain.com']
});

widget.addTransport(
    new PostMessageTransport(window.parent, { 
        targetOrigin: 'https://parent-domain.com' 
    }),
    { peerId: 'hub' }
);

// Send to Widget B (goes through hub)
widget.signal('chat:message', { 
    text: 'Hello from A!',
    from: 'widget-a'
});

// Listen for messages from Widget B
widget.on('chat:message', (event) => {
    if (event.data.from === 'widget-b') {
        console.log('Message from B:', event.data.text);
    }
});
```

### Iframe B (Widget)

```javascript
// widget-b.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const widget = new CrossBus({ 
    peerId: 'widget-b',
    allowedOrigins: ['https://parent-domain.com']
});

widget.addTransport(
    new PostMessageTransport(window.parent, { 
        targetOrigin: 'https://parent-domain.com' 
    }),
    { peerId: 'hub' }
);

// Request data from Widget A (routed through hub)
const response = await widget.request('widget-a', 'getData', { key: 'user' });

// Listen for signals
widget.on('chat:message', (event) => {
    if (event.data.from === 'widget-a') {
        console.log('Message from A:', event.data.text);
        
        // Reply
        widget.signal('chat:message', {
            text: 'Got it!',
            from: 'widget-b'
        });
    }
});
```

---

## Iframe ↔ Worker Communication

An iframe needs to communicate with a worker through the parent hub.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Parent Page (Hub)                                          │
│                                                             │
│  hub.addTransport → Worker                                  │
│  hub.addTransport → Iframe                                  │
│                                                             │
│  ┌────────────┐           ┌────────────┐                    │
│  │  Iframe    │←── Hub ──→│   Worker   │                    │
│  │  (UI)      │           │  (Compute) │                    │
│  └────────────┘           └────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### Parent Page (Hub)

```javascript
// parent.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const hub = new CrossBus({ peerId: 'hub', isHub: true, allowedOrigins: ['*'] });

// Connect worker
const worker = new Worker('./compute-worker.js', { type: 'module' });
hub.addTransport(new PostMessageTransport(worker), { peerId: 'worker' });

// Connect iframe
const iframe = document.getElementById('widget');
iframe.onload = () => {
    hub.addTransport(
        new PostMessageTransport(iframe.contentWindow, { targetOrigin: '*' }),
        { peerId: 'widget' }
    );
};
```

### Worker

```javascript
// compute-worker.js
import { CrossBus, PostMessageTransport } from 'crossbus';

const worker = new CrossBus({ peerId: 'worker', allowedOrigins: ['*'] });
worker.addTransport(new PostMessageTransport(self), { peerId: 'hub' });

// Heavy computation handler
worker.handle('compute', async (payload) => {
    const { numbers } = payload;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / numbers.length;
    return { sum, avg, count: numbers.length };
});

// Progress signals
worker.handle('processLarge', async (payload) => {
    const chunks = chunkArray(payload.data, 1000);
    let processed = 0;
    
    for (const chunk of chunks) {
        await processChunk(chunk);
        processed += chunk.length;
        
        // Signal progress back to iframe
        worker.signal('progress', { 
            percent: Math.round(processed / payload.data.length * 100)
        });
    }
    
    return { success: true };
});
```

### Iframe

```javascript
// widget.js (inside iframe)
import { CrossBus, PostMessageTransport } from 'crossbus';

const widget = new CrossBus({ peerId: 'widget', allowedOrigins: ['*'] });
widget.addTransport(
    new PostMessageTransport(window.parent, { targetOrigin: '*' }),
    { peerId: 'hub' }
);

// Request computation from worker (routed through hub)
async function runComputation() {
    const result = await widget.request('worker', 'compute', {
        numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    });
    
    console.log('Sum:', result.sum);
    console.log('Average:', result.avg);
}

// Listen for progress updates
widget.on('progress', (event) => {
    updateProgressBar(event.data.percent);
});
```

---

## BroadcastChannel (Multi-Tab Sync)

Synchronize state across all browser tabs without a hub.

```javascript
import { CrossBus, BroadcastChannelTransport } from 'crossbus';

// Each tab creates its own bus with unique ID
const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const bus = new CrossBus({ 
    peerId: tabId,
    allowedOrigins: ['*']
});

// Connect to shared channel - all tabs on same origin will receive messages
bus.addTransport(
    new BroadcastChannelTransport('my-app-sync'),
    { peerId: '*' }  // '*' means any peer
);

// Sync cart across tabs
bus.on('cart:update', (event) => {
    if (event.source.peerId !== tabId) {  // Ignore own messages
        updateLocalCart(event.data.cart);
    }
});

// When cart changes locally
function addToCart(item) {
    cart.push(item);
    bus.signal('cart:update', { cart });
}

// Sync theme preference
bus.on('theme:change', (event) => {
    document.body.className = event.data.theme;
});

function setTheme(theme) {
    document.body.className = theme;
    bus.signal('theme:change', { theme });
}
```

---

## SharedWorker (Multiple Tabs, Single Worker)

All tabs share one worker instance for efficient resource usage.

### Main Thread (any tab)

```javascript
import { CrossBus, SharedWorkerTransport } from 'crossbus';

const tabId = `tab-${Date.now()}`;
const bus = new CrossBus({ peerId: tabId, allowedOrigins: ['*'] });

const sharedWorker = new SharedWorker('./shared-worker.js', { type: 'module' });
bus.addTransport(new SharedWorkerTransport(sharedWorker), { peerId: 'shared' });

// All tabs can request from the same worker
const data = await bus.request('shared', 'getData', { key: 'users' });

// Listen for broadcasts from worker
bus.on('data:updated', (event) => {
    refreshUI(event.data);
});
```

### SharedWorker

```javascript
// shared-worker.js
import { CrossBus, SharedWorkerTransport } from 'crossbus';

const worker = new CrossBus({ peerId: 'shared', isHub: true, allowedOrigins: ['*'] });

// Each connecting tab gets a transport
self.onconnect = (e) => {
    const port = e.ports[0];
    worker.addTransport(new SharedWorkerTransport(port));
};

// Shared state
let cache = {};

worker.handle('getData', (payload) => {
    return cache[payload.key] || null;
});

worker.handle('setData', (payload) => {
    cache[payload.key] = payload.value;
    
    // Notify all connected tabs
    worker.signal('data:updated', { key: payload.key, value: payload.value });
    
    return { success: true };
});
```

---

## Best Practices

### 1. Always Use Unique Peer IDs

```javascript
// ✅ Good - unique IDs
const bus = new CrossBus({ peerId: `widget-${Date.now()}` });

// ❌ Bad - duplicate IDs cause routing issues
const bus = new CrossBus({ peerId: 'widget' });
```

### 2. Always Clean Up

```javascript
// React
useEffect(() => {
    const bus = new CrossBus({ peerId: 'component' });
    return () => bus.destroy();
}, []);

// Vanilla
window.addEventListener('beforeunload', () => bus.destroy());
```

### 3. Wait for Iframe/Worker Load

```javascript
// ❌ Bad - iframe not loaded yet
iframe.src = '/widget.html';
hub.addTransport(new PostMessageTransport(iframe.contentWindow));

// ✅ Good - wait for load
iframe.onload = () => {
    hub.addTransport(new PostMessageTransport(iframe.contentWindow));
};
```

### 4. Use Specific Origins in Production

```javascript
// ❌ Development only
{ targetOrigin: '*' }

// ✅ Production
{ targetOrigin: 'https://trusted.example.com' }
```

---

## Try It Live

🎮 **[Open Playground →](playground.html)**

Test iframe↔iframe and worker communication interactively!
