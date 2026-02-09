# CrossBus Performance Optimization Patterns

> Lessons learned from analyzing nanoevents and optimizing to ~170M ops/sec

## Pattern 1: Object vs Map for String Key Lookup

**Problem**: `Map.get(key)` has overhead vs direct property access.

**Before (slow)**:
```javascript
const STORAGE = Symbol('storage');
this[STORAGE] = new Map();

get(key) {
    return this[STORAGE].get(key);
}
```

**After (fast)**:
```javascript
const CACHE = Symbol('cache');
this[CACHE] = Object.create(null);  // No prototype chain

get(key) {
    return this[CACHE][key];
}
```

**Why**: 
- Object property access is a single hash lookup
- Map.get() involves method call overhead
- `Object.create(null)` avoids prototype chain lookup

**When to use**: String keys only. Map is better for object keys or when you need `.size`, `.keys()`, etc.

---

## Pattern 2: Eliminate Property Indirection

**Problem**: Each `.property` access costs time.

**Before (slow)**:
```javascript
const entries = this.entries;
for (let i = 0; i < len; i++) {
    entries[i].handler(data);  // .handler indirection
}
```

**After (fast)**:
```javascript
// Store callbacks directly, not entry objects
const callbacks = this.callbacks;
for (let i = 0; i < len; i++) {
    callbacks[i](data);  // Direct call
}
```

**Why**: Every property access is a lookup. Direct array of functions = 1 lookup. Array of objects with `.handler` = 2 lookups.

---

## Pattern 3: Loop Unrolling for Common Cases

**Problem**: Loop overhead (increment, comparison) adds up at high frequency.

**Before (slow)**:
```javascript
for (let i = 0; i < len; i++) {
    callbacks[i](data);
}
```

**After (fast)**:
```javascript
if (len === 1) {
    callbacks[0](data);
    return 1;
}
if (len === 2) {
    callbacks[0](data);
    callbacks[1](data);
    return 2;
}
// ... up to 4
// General loop for 5+
for (let i = 0; i < len; i++) {
    callbacks[i](data);
}
```

**Why**: 
- Branch prediction works well for consistent patterns
- Eliminates loop variable increment/comparison for 80%+ of cases
- V8 can inline constant-length calls

---

## Pattern 4: Dual Storage (Feature + Speed)

**Problem**: Need full features (priority, once, etc.) but also max speed.

**Solution**: Maintain two data structures:
```javascript
constructor() {
    // Full feature storage (for off(), priority sorting, etc.)
    this[LISTENERS] = new Map();
    
    // Ultra-fast cache (callbacks only)
    this[FAST_CACHE] = Object.create(null);
}

on(name, handler, options) {
    // Add to full storage
    this[LISTENERS].get(name).push(entry);
    
    // Sync fast cache
    this[FAST_CACHE][name] = listeners.map(e => e.handler);
}

emitSync(name, data) {
    // Use fast cache only
    const callbacks = this[FAST_CACHE][name];
    // ...
}
```

**Trade-off**: Extra memory (~32 bytes per event name), but 1.28x faster emit.

---

## Pattern 5: Avoid Allocation in Hot Paths

**Problem**: Object creation triggers GC.

**Before (slow)**:
```javascript
emit(name, data) {
    const event = {
        name,
        data,
        timestamp: Date.now(),
        id: crypto.randomUUID()
    };
    handler(event);
}
```

**After (fast)**:
```javascript
// For hot paths, pass data directly
emitSync(name, data) {
    callbacks[0](data);  // No object creation
}

// Full event envelope only when needed
emit(name, data) {
    // ... create event only for async path
}
```

---

## Pattern 6: Minimal API for Hot Paths

**Problem**: Feature-rich methods have overhead (validation, objects, etc.)

**Solution**: Provide stripped-down alternative methods:

```javascript
// Feature-rich (slower)
on(name, handler, { priority, once, signal }) { ... }

// Ultra-fast (matches nanoevents)
onFast(name, handler) {
    (this[FAST_CACHE][name] ||= []).push(handler);
    return () => {
        this[FAST_CACHE][name] = this[FAST_CACHE][name]?.filter(h => h !== handler);
    };
}
```

**Why**:
- No input validation
- No subscription object creation
- No ID generation
- Returns closure directly (like nanoevents)
- Only touches FAST_CACHE

---

## Benchmark Results (2026-01-23 Optimization Run)

Results from the optimization session when these patterns were applied. Current performance may vary:

| Test | CrossBus | nanoevents | Winner |
|------|-----------|------------|--------|
| emit (1 listener) | **185.93M** | 172.89M | 🏆 CrossBus |
| emit (10KB payload) | **113.75M** | 107.63M | 🏆 CrossBus |
| emit (10 listeners) | 66.47M | 66.87M | ~99% parity |
| onFast+off cycle | 42.48M | 47.10M | ~90% parity |

### Overall Improvements (2026-01-23):

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| emit (1 listener) | 148.87M | 185.93M | **+25%** |
| emit (10 listeners) | 18.87M | 66.47M | **+252%** |
| on/off cycle | 3.14M | 42.48M | **+1252%** |
| getPeer (100 peers) | 6.98M | **205.9M** | **+2850%** |
| route unicast | 136K | **6.14M** | **+4414%** (45x) |

---

## Components Optimized

| Component | Pattern Applied | Status |
|-----------|-----------------|--------|
| EventEmitter | FAST_CACHE, loop unrolling, onFast | ✅ Done |
| MessageRouter | peerCache, sendFnCache, peerIds | ✅ Done |
| PendingRequests | Object-based #cache | ✅ Done |
| OriginValidator | Already optimal | ✅ Done |

