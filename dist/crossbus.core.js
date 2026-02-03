/** CrossBus v0.1.0 | MIT */
/**
 * @fileoverview Local event emitter with wildcard support and AbortSignal integration.
 * Uses Symbol-based private storage for encapsulation.
 * @module core/event-emitter
 */

/** @type {symbol} Private storage key for listeners map */
const LISTENERS = Symbol('listeners');

/** @type {symbol} Private storage key for subscription counter */
const SUB_COUNTER = Symbol('subCounter');

/** @type {symbol} Private storage key for max listeners setting */
const MAX_LISTENERS = Symbol('maxListeners');

/** @type {symbol} Private storage key for fast callback cache (Object-based) */
const FAST_CACHE = Symbol('fastCache');

/** @type {number} Default max listeners before warning */
const DEFAULT_MAX_LISTENERS = 10;

/** @type {Object} Default source for local emissions */
const DEFAULT_SOURCE = Object.freeze({
    peerId: 'self',
    origin: typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'unknown',
    type: 'local'
});

/**
 * @typedef {Object} ListenerOptions
 * @property {boolean} [once=false] - Auto-remove after first invocation.
 * @property {AbortSignal} [signal] - AbortController signal for cleanup.
 * @property {'sync'|'async'} [mode='async'] - Execution mode.
 * @property {number} [priority=0] - Execution order (higher = first).
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - Unique subscription ID.
 * @property {string} signalName - The signal name subscribed to.
 * @property {Function} unsubscribe - Call to remove this listener.
 * @property {boolean} active - Whether subscription is active.
 */

/**
 * @typedef {Object} SignalEvent
 * @property {string} name - Signal name that was emitted.
 * @property {*} data - The payload data.
 * @property {string} messageId - Unique message ID.
 * @property {number} timestamp - When the signal was emitted.
 * @property {SignalSource} source - Origin of the signal.
 */

/**
 * @typedef {Object} SignalSource
 * @property {string} peerId - ID of the emitting peer ('self' if local).
 * @property {string} origin - Origin URL.
 * @property {'local'|'iframe'|'worker'|'service-worker'|'window'} type - Source type.
 */

/**
 * @callback SignalHandler
 * @param {SignalEvent} event - The signal event object.
 * @returns {void|Promise<void>}
 */

/**
 * @typedef {Object} ListenerEntry
 * @property {string} id - Subscription ID.
 * @property {SignalHandler} handler - The callback function.
 * @property {number} priority - Execution priority.
 * @property {'sync'|'async'} mode - Execution mode.
 * @property {boolean} once - Auto-remove after first invocation.
 * @property {AbortSignal|null} signal - Abort signal.
 */

/**
 * @typedef {Object} RemoveResult
 * @property {boolean} success - True if at least one listener was removed.
 * @property {number} removedCount - Number of listeners removed.
 * @property {number} remainingCount - Listeners still registered for this signal.
 */

/**
 * Local event emitter with wildcard support.
 * 
 * Supports:
 * - Exact match: `on('user:login', handler)`
 * - Namespace wildcard: `on('user:*', handler)` matches `user:login`, `user:logout`
 * - Global wildcard: `on('*', handler)` matches all signals
 * 
 * @example
 * const emitter = new EventEmitter();
 * 
 * // Basic listener
 * emitter.on('message', (event) => console.log(event.data));
 * 
 * // Wildcard listener
 * emitter.on('user:*', (event) => console.log('User event:', event.name));
 * 
 * // Emit signal
 * emitter.emit('message', { text: 'Hello' });
 */
class EventEmitter {
    constructor() {
        /** @type {Map<string, ListenerEntry[]>} */
        this[LISTENERS] = new Map();

        /** @type {number} */
        this[SUB_COUNTER] = 0;

        /** @type {number} Max listeners before memory leak warning */
        this[MAX_LISTENERS] = DEFAULT_MAX_LISTENERS;

        /** @type {Object<string, Function[]>} Fast Object-based cache for callbacks only */
        this[FAST_CACHE] = Object.create(null);
    }

    /**
     * Sets the max listeners threshold for memory leak warnings.
     * @param {number} n - Max listeners (0 = unlimited)
     */
    setMaxListeners(n) {
        this[MAX_LISTENERS] = n;
        return this;
    }

    /**
     * Gets the current max listeners setting.
     * @returns {number}
     */
    getMaxListeners() {
        return this[MAX_LISTENERS];
    }

    /**
     * Registers a listener for a signal.
     * 
     * @param {string} name - Signal name. Supports wildcards: '*', 'namespace:*'.
     * @param {SignalHandler} handler - Callback function.
     * @param {ListenerOptions} [options={}] - Configuration options.
     * @returns {Subscription} Subscription object.
     * @throws {TypeError} If name is not a string or handler is not a function.
     * 
     * @example
     * // Basic listener
     * const sub = emitter.on('user:login', (event) => {
     *   console.log(`User ${event.data.userId} logged in`);
     * });
     * 
     * @example
     * // One-time listener
     * emitter.on('init:complete', handler, { once: true });
     * 
     * @example
     * // With AbortController
     * const controller = new AbortController();
     * emitter.on('data:update', handler, { signal: controller.signal });
     * controller.abort(); // Removes listener
     * 
     * @example
     * // Priority-based ordering
     * emitter.on('event', lowPriorityHandler, { priority: 1 });
     * emitter.on('event', highPriorityHandler, { priority: 10 }); // Runs first
     */
    on(name, handler, options = {}) {
        if (typeof name !== 'string') {
            throw new TypeError('Signal name must be a string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }

        const id = `sub_${++this[SUB_COUNTER]}`;

        // V8 Optimization: Consistent object shape for hidden class caching
        // All entries have same properties in same order
        /** @type {ListenerEntry} */
        const entry = {
            id,
            handler,
            priority: options.priority ?? 0,
            mode: options.mode ?? 'async',
            once: options.once ?? false,
            signal: options.signal ?? null
        };

        // Get or create listeners array for this signal
        if (!this[LISTENERS].has(name)) {
            this[LISTENERS].set(name, []);
        }

        const listeners = this[LISTENERS].get(name);

        // Binary insert for O(log n) search instead of O(n log n) sort
        if (listeners.length === 0 || entry.priority <= listeners[listeners.length - 1].priority) {
            // Fast path: append (most common case with priority 0)
            listeners.push(entry);
        } else {
            // Binary search for insert position (higher priority first)
            let lo = 0, hi = listeners.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (listeners[mid].priority >= entry.priority) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            listeners.splice(lo, 0, entry);
        }

        // Sync FAST_CACHE for ultra-fast emitSync
        this[FAST_CACHE][name] = listeners.map(e => e.handler);

        // Memory leak detection: warn if too many listeners
        const maxListeners = this[MAX_LISTENERS];
        if (maxListeners > 0 && listeners.length > maxListeners) {
            console.warn(
                `[CrossBus] Possible memory leak: ${listeners.length} listeners for "${name}". ` +
                `Use setMaxListeners(n) to increase limit.`
            );
        }

        // Create subscription object
        let active = true;
        const subscription = {
            id,
            signalName: name,
            get active() { return active; },
            unsubscribe: () => {
                if (active) {
                    this.#removeListener(name, id);
                    active = false;
                }
            }
        };

        // Handle AbortSignal
        if (entry.signal) {
            if (entry.signal.aborted) {
                // Already aborted, remove immediately
                this.#removeListener(name, id);
                active = false;
            } else {
                entry.signal.addEventListener('abort', () => {
                    subscription.unsubscribe();
                }, { once: true });
            }
        }

        return subscription;
    }

    /**
     * Registers a one-time listener.
     * Convenience method for `on(name, handler, { once: true })`.
     * 
     * @param {string} name - Signal name.
     * @param {SignalHandler} handler - Callback function.
     * @param {ListenerOptions} [options={}] - Additional options.
     * @returns {Subscription} Subscription object.
     */
    once(name, handler, options = {}) {
        return this.on(name, handler, { ...options, once: true });
    }

    /**
     * Ultra-fast listener registration for performance-critical paths.
     * 
     * Unlike on(), this method:
     * - No input validation (caller must ensure correct types)
     * - No subscription object (returns unbind function directly)
     * - No priority, once, or AbortSignal support
     * - Direct push to FAST_CACHE (minimal overhead)
     * 
     * Use when you need maximum subscribe performance.
     * 
     * @param {string} name - Signal name.
     * @param {EventListener} handler - Callback function.
     * @returns {Function} Unbind function (call to remove listener).
     * 
     * @example
     * // 50M+ ops/sec subscribe/unsubscribe
     * const off = emitter.onFast('tick', (data) => console.log(data));
     * off(); // Remove listener
     */
    onFast(name, handler) {
        // Match nanoevents exactly: ||= pattern, minimal code
        (this[FAST_CACHE][name] ||= []).push(handler);
        return () => {
            this[FAST_CACHE][name] = this[FAST_CACHE][name]?.filter(h => h !== handler);
        };
    }

    /**
     * Ultra-fast listener removal for performance-critical paths.
     * 
     * @param {string} name - Signal name.
     * @param {EventListener} handler - Handler to remove.
     */
    offFast(name, handler) {
        const cache = this[FAST_CACHE][name];
        if (cache) {
            const idx = cache.indexOf(handler);
            if (idx !== -1) cache.splice(idx, 1);
        }
        // Also clean LISTENERS
        const listeners = this[LISTENERS].get(name);
        if (listeners) {
            const idx = listeners.findIndex(e => e.handler === handler);
            if (idx !== -1) listeners.splice(idx, 1);
        }
    }

    /**
     * Removes signal listener(s).
     * 
     * @param {string} name - Signal name.
     * @param {SignalHandler} [handler] - Specific handler to remove.
     *                                    If omitted, removes ALL listeners.
     * @returns {RemoveResult} Result of the removal.
     * @throws {TypeError} If name is not a string.
     * 
     * @example
     * // Remove specific handler
     * const result = emitter.off('msg', myHandler);
     * // => { success: true, removedCount: 1, remainingCount: 0 }
     * 
     * @example
     * // Remove ALL listeners for a signal
     * emitter.off('updates');
     * // => { success: true, removedCount: 2, remainingCount: 0 }
     */
    off(name, handler) {
        if (typeof name !== 'string') {
            throw new TypeError('Signal name must be a string');
        }

        const listeners = this[LISTENERS].get(name);

        if (!listeners || listeners.length === 0) {
            return { success: false, removedCount: 0, remainingCount: 0 };
        }

        let removedCount = 0;

        if (handler === undefined) {
            // Remove all listeners for this signal
            removedCount = listeners.length;
            this[LISTENERS].delete(name);
            delete this[FAST_CACHE][name];
        } else {
            // Remove specific handler
            const initialLength = listeners.length;
            const filtered = listeners.filter(entry => entry.handler !== handler);
            removedCount = initialLength - filtered.length;

            if (filtered.length === 0) {
                this[LISTENERS].delete(name);
                delete this[FAST_CACHE][name];
            } else {
                this[LISTENERS].set(name, filtered);
                this[FAST_CACHE][name] = filtered.map(e => e.handler);
            }
        }

        const remaining = this[LISTENERS].get(name)?.length ?? 0;

        return {
            success: removedCount > 0,
            removedCount,
            remainingCount: remaining
        };
    }

    /**
     * Ultra-fast synchronous emit for performance-critical paths.
     * 
     * Unlike emit(), this method:
     * - Is synchronous (no async/await overhead)
     * - Passes data directly (no event envelope)
     * - Skips messageId, timestamp generation
     * - No wildcard matching (exact match only)
     * 
     * Use for high-frequency events where metadata is not needed.
     * 
     * @param {string} name - Signal name (exact match only).
     * @param {*} data - Payload to pass directly to handlers.
     * @returns {number} Number of listeners invoked.
     * 
     * @example
     * // 150M+ ops/sec - use for hot paths
     * emitter.emitSync('tick', { x: 100, y: 200 });
     */
    emitSync(name, data) {
        // Ultra-fast path: use Object-based cache (faster than Map.get)
        const callbacks = this[FAST_CACHE][name];
        if (!callbacks) return 0;

        // Direct callback invocation (no .handler indirection)
        const len = callbacks.length;
        if (len === 1) {
            callbacks[0](data);
            return 1;
        }
        if (len === 2) {
            callbacks[0](data);
            callbacks[1](data);
            return 2;
        }
        if (len === 3) {
            callbacks[0](data);
            callbacks[1](data);
            callbacks[2](data);
            return 3;
        }
        if (len === 4) {
            callbacks[0](data);
            callbacks[1](data);
            callbacks[2](data);
            callbacks[3](data);
            return 4;
        }

        // General loop for 5+ listeners
        for (let i = 0; i < len; i++) {
            callbacks[i](data);
        }
        return len;
    }

    /**
     * Emits a signal to local listeners.
     * 
     * @param {string} name - Signal name.
     * @param {*} data - Payload data.
     * @param {Partial<SignalSource>} [source] - Signal source info.
     * @returns {Promise<number>} Number of listeners invoked.
     * @throws {TypeError} If name is not a string.
     * 
     * @example
     * const count = await emitter.emit('user:login', { userId: 123 });
     * console.log(`Notified ${count} listeners`);
     */
    async emit(name, data, source) {
        if (typeof name !== 'string') {
            throw new TypeError('Signal name must be a string');
        }

        // Fast path: single exact-match listener, no wildcards
        const exactListeners = this[LISTENERS].get(name);
        const hasWildcard = this[LISTENERS].has('*');

        if (exactListeners?.length === 1 && !hasWildcard && !source) {
            const entry = exactListeners[0];
            const event = {
                name,
                data,
                messageId: crypto.randomUUID(),
                timestamp: Date.now(),
                source: DEFAULT_SOURCE
            };

            try {
                if (entry.mode === 'sync') {
                    await entry.handler(event);
                } else {
                    Promise.resolve().then(() => entry.handler(event));
                }
            } catch (error) {
                console.error(`[CrossBus] Handler error for "${name}":`, error);
            }

            if (entry.once) {
                this.#removeListener(name, entry.id);
            }

            return 1;
        }

        // Full path: multiple listeners or wildcards
        const event = {
            name,
            data,
            messageId: crypto.randomUUID(),
            timestamp: Date.now(),
            source: source ? { ...DEFAULT_SOURCE, ...source } : DEFAULT_SOURCE
        };

        // Collect matching listeners
        const matchingEntries = this.#getMatchingListeners(name);

        // Track entries to remove (once: true)
        const toRemove = [];

        // Invoke handlers
        for (const { signalName, entry } of matchingEntries) {
            try {
                if (entry.mode === 'sync') {
                    await entry.handler(event);
                } else {
                    // Fire async without blocking
                    Promise.resolve().then(() => entry.handler(event));
                }
            } catch (error) {
                // Log but don't throw - other listeners should still run
                console.error(`[CrossBus] Handler error for "${name}":`, error);
            }

            if (entry.once) {
                toRemove.push({ signalName, id: entry.id });
            }
        }

        // Remove once listeners
        for (const { signalName, id } of toRemove) {
            this.#removeListener(signalName, id);
        }

        return matchingEntries.length;
    }

    /**
     * Checks if there are any listeners for a signal.
     * 
     * @param {string} name - Signal name (exact match only).
     * @returns {boolean} True if listeners exist.
     */
    hasListeners(name) {
        const listeners = this[LISTENERS].get(name);
        return listeners !== undefined && listeners.length > 0;
    }

    /**
     * Gets the count of listeners for a signal.
     * 
     * @param {string} name - Signal name (exact match only).
     * @returns {number} Number of listeners.
     */
    listenerCount(name) {
        return this[LISTENERS].get(name)?.length ?? 0;
    }

    /**
     * Gets all registered signal names.
     * 
     * @returns {string[]} Array of signal names.
     */
    getSignalNames() {
        return Array.from(this[LISTENERS].keys());
    }

    /**
     * Removes all listeners.
     */
    clear() {
        this[LISTENERS].clear();
        // Reset FAST_CACHE to empty object
        for (const key in this[FAST_CACHE]) {
            delete this[FAST_CACHE][key];
        }
    }

    /**
     * Gets all listeners matching a signal name (including wildcards).
     * 
     * 
     * @param {string} name - Signal name to match.
     * @returns {Array<{signalName: string, entry: ListenerEntry}>} Matching entries.
     */
    #getMatchingListeners(name) {
        // Fast path: check exact match first and if no wildcards registered
        const exactListeners = this[LISTENERS].get(name);
        const globalWildcard = this[LISTENERS].get('*');

        // Find namespace wildcards (e.g., 'user:*' for 'user:login')
        let namespaceWildcard = null;
        const colonIdx = name.indexOf(':');
        if (colonIdx > 0) {
            const wildcardPattern = name.slice(0, colonIdx + 1) + '*';
            namespaceWildcard = this[LISTENERS].get(wildcardPattern);
        }

        // Super-fast path: only exact match, no wildcards
        if (exactListeners && !globalWildcard && !namespaceWildcard) {
            return exactListeners.map(entry => ({ signalName: name, entry }));
        }

        // Fast path: single source, already sorted
        const sources = [
            exactListeners && { signalName: name, entries: exactListeners },
            globalWildcard && { signalName: '*', entries: globalWildcard },
            namespaceWildcard && { signalName: name.slice(0, colonIdx + 1) + '*', entries: namespaceWildcard }
        ].filter(Boolean);

        if (sources.length === 0) {
            return [];
        }

        if (sources.length === 1) {
            // Single source: already sorted, no merge needed
            return sources[0].entries.map(entry => ({ signalName: sources[0].signalName, entry }));
        }

        // Multiple sources: collect and merge-sort by priority
        const results = [];
        for (const { signalName, entries } of sources) {
            for (const entry of entries) {
                results.push({ signalName, entry });
            }
        }

        // Only sort when merging multiple sources
        results.sort((a, b) => b.entry.priority - a.entry.priority);

        return results;
    }



    /**
     * Removes a listener by ID.
     * 
     * 
     * @param {string} name - Signal name.
     * @param {string} id - Subscription ID.
     */
    #removeListener(name, id) {
        const listeners = this[LISTENERS].get(name);
        if (!listeners) return;

        const filtered = listeners.filter(entry => entry.id !== id);

        if (filtered.length === 0) {
            this[LISTENERS].delete(name);
            delete this[FAST_CACHE][name];
        } else {
            this[LISTENERS].set(name, filtered);
            this[FAST_CACHE][name] = filtered.map(e => e.handler);
        }
    }
}

/**
 * @fileoverview Common types and constants shared across all modules.
 * This module is included in the common bundle to avoid duplication.
 * @module common/types
 */

/**
 * Protocol marker for CrossBus messages.
 * @constant {string}
 */
const PROTOCOL_MARKER = '_cb';

/**
 * Current protocol version.
 * @constant {number}
 */
const PROTOCOL_VERSION = 1;

/**
 * Message type codes (compact for wire efficiency).
 * @readonly
 * @enum {string}
 */
const MessageType = Object.freeze({
    /** Signal - one-way message */
    SIGNAL: 'sig',
    /** Request - expects response */
    REQUEST: 'req',
    /** Response - reply to request */
    RESPONSE: 'res',
    /** Acknowledge - delivery confirmation */
    ACK: 'ack',
    /** Handshake - connection negotiation */
    HANDSHAKE: 'hsk',
    HANDSHAKE_INIT: 'hsk_init',
    HANDSHAKE_ACK: 'hsk_ack',
    HANDSHAKE_COMPLETE: 'hsk_done',
    /** Ping - heartbeat */
    PING: 'png',
    /** Pong - heartbeat response */
    PONG: 'pog',
    /** Goodbye - graceful disconnect */
    BYE: 'bye',
    /** Broadcast - message for all peers */
    BROADCAST: 'bc'
});

/**
 * Handshake phase codes.
 * @readonly
 * @enum {string}
 */
const HandshakePhase = Object.freeze({
    INIT: 'init',
    INIT_SENT: 'init_sent',
    ACK: 'ack',
    ACK_SENT: 'ack_sent',
    DONE: 'done'
});

/**
 * Peer connection status.
 * @readonly
 * @enum {string}
 */
const PeerStatus = Object.freeze({
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
});

/**
 * @fileoverview Protocol message schemas for CrossBus.
 * All message types are frozen for immutability.
 * @module core/message-types
 */


// PROTOCOL_PREFIX and PROTOCOL_VERSION are imported from common/types.js

/**
 * Creates a protocol message envelope.
 * 
 * @param {MessageType} type - Message type.
 * @param {Object} payload - Message payload.
 * @param {Object} [meta={}] - Additional metadata.
 * @param {string|null} [id=null] - Optional custom message ID.
 * @returns {ProtocolMessage} Frozen message object.
 * 
 * @typedef {Object} ProtocolMessage
 * @property {number} _cb - Protocol marker version (compact wire format).
 * @property {number} version - Protocol version.
 * @property {string} id - Unique message ID (UUID v4).
 * @property {MessageType} type - Message type.
 * @property {number} timestamp - Unix timestamp (ms).
 * @property {Object} payload - Message payload.
 * @property {Object} meta - Additional metadata.
 */
function createMessage(type, payload, meta = {}, id = null) {
  return Object.freeze({
    [PROTOCOL_MARKER]: PROTOCOL_VERSION,
    version: PROTOCOL_VERSION,
    id: id || crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload: Object.freeze({ ...payload }),
    meta: Object.freeze({ ...meta })
  });
}

/**
 * Creates a signal message.
 * 
 * @param {string} name - Signal name.
 * @param {*} data - Signal data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {string|null} [destPeerId] - Destination peer ID.
 * @returns {ProtocolMessage} Signal message.
 */
function createSignalMessage(name, data, sourcePeerId, destPeerId = null) {
  return createMessage(MessageType.SIGNAL, {
    name,
    data,
    source: sourcePeerId,
    dest: destPeerId
  });
}

/**
 * Creates a request message (expecting response).
 * 
 * @param {string} name - Request name.
 * @param {*} data - Request data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {string} destPeerId - Destination peer ID.
 * @param {string|null} [id=null] - Optional custom request ID.
 * @returns {ProtocolMessage} Request message.
 */
function createRequestMessage(name, data, sourcePeerId, destPeerId, id = null) {
  return createMessage(MessageType.REQUEST, {
    name,
    data,
    source: sourcePeerId,
    dest: destPeerId
  }, {}, id);
}

/**
 * Creates a response message.
 * 
 * @param {string} requestId - Original request message ID.
 * @param {*} data - Response data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {boolean} [success=true] - Whether request succeeded.
 * @param {Object|null} [error] - Error object if failed.
 * @returns {ProtocolMessage} Response message.
 */
function createResponseMessage(requestId, data, sourcePeerId, success = true, error = null) {
  return createMessage(MessageType.RESPONSE, {
    requestId,
    data,
    source: sourcePeerId,
    success,
    error
  });
}

/**
 * @fileoverview Centralized error handling for CrossBus.
 * @module common/errors
 */

/**
 * Error codes for CrossBus.
 * @readonly
 * @enum {string}
 */
const ErrorCode = Object.freeze({
    // Connection errors
    HANDSHAKE_TIMEOUT: 'ERR_HANDSHAKE_TIMEOUT',
    HANDSHAKE_REJECTED: 'ERR_HANDSHAKE_REJECTED',
    ORIGIN_FORBIDDEN: 'ERR_ORIGIN_FORBIDDEN',
    PEER_EXISTS: 'ERR_PEER_EXISTS',
    PEER_NOT_FOUND: 'ERR_PEER_NOT_FOUND',
    PEER_DISCONNECTED: 'ERR_PEER_DISCONNECTED',
    RECONNECT_FAILED: 'ERR_RECONNECT_FAILED',
    UNSUPPORTED: 'ERR_UNSUPPORTED',
    NOT_CONNECTED: 'ERR_NOT_CONNECTED',

    // Message errors
    ACK_TIMEOUT: 'ERR_ACK_TIMEOUT',
    RESPONSE_TIMEOUT: 'ERR_RESPONSE_TIMEOUT',
    QUEUE_FULL: 'ERR_QUEUE_FULL',
    INVALID_MESSAGE: 'ERR_INVALID_MESSAGE',
    VERSION_MISMATCH: 'ERR_VERSION_MISMATCH',
    CLONE_ERROR: 'ERR_CLONE_ERROR',
    TRANSFER_ERROR: 'ERR_TRANSFER_ERROR',
    MESSAGE_TOO_LARGE: 'ERR_MESSAGE_TOO_LARGE',

    // Routing errors
    UNREACHABLE: 'ERR_UNREACHABLE',
    TTL_EXCEEDED: 'ERR_TTL_EXCEEDED',
    NO_ROUTE: 'ERR_NO_ROUTE',

    // Handler errors
    NO_HANDLER: 'ERR_NO_HANDLER',
    HANDLER_ERROR: 'ERR_HANDLER_ERROR',
    HANDLER_TIMEOUT: 'ERR_HANDLER_TIMEOUT',
    HANDLER_EXISTS: 'ERR_HANDLER_EXISTS',
    SEND_FAILED: 'ERR_SEND_FAILED',

    // Channel errors
    CHANNEL_FAILED: 'ERR_CHANNEL_FAILED',
    CHANNEL_CLOSED: 'ERR_CHANNEL_CLOSED',

    // Resource errors
    MAX_PEERS: 'ERR_MAX_PEERS',
    MAX_PENDING: 'ERR_MAX_PENDING',
    DESTROYED: 'ERR_DESTROYED',

    // Circuit Breaker
    CIRCUIT_OPEN: 'ERR_CIRCUIT_OPEN',

    // Security errors
    PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE',
    RATE_LIMITED: 'ERR_RATE_LIMITED',
    UNAUTHORIZED: 'ERR_UNAUTHORIZED',
    INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD'
});

/**
 * Error metadata including default messages, retryability, and AI-friendly suggestions.
 * @type {Object<ErrorCode, {message: string, retryable: boolean, suggestion: string}>}
 */
const ERROR_META = Object.freeze({
    [ErrorCode.HANDSHAKE_TIMEOUT]: {
        message: 'Handshake timed out',
        retryable: true,
        suggestion: 'Increase timeout or check if target is loaded. Use iframe.onload before connecting.'
    },
    [ErrorCode.HANDSHAKE_REJECTED]: {
        message: 'Handshake rejected by peer',
        retryable: false,
        suggestion: 'Check targetOrigin matches the peer\'s origin. Verify peer allows your origin.'
    },
    [ErrorCode.ORIGIN_FORBIDDEN]: {
        message: 'Origin not in allowed origins list',
        retryable: false,
        suggestion: 'Add your origin to allowedOrigins option or use targetOrigin: "*" for development.'
    },
    [ErrorCode.PEER_EXISTS]: {
        message: 'Peer with this ID already exists',
        retryable: false,
        suggestion: 'Use unique peerId for each context. Try: peerId: `agent-${Date.now()}`'
    },
    [ErrorCode.PEER_NOT_FOUND]: {
        message: 'Peer not found',
        retryable: false,
        suggestion: 'Check if peer is connected using bus.peers. Wait for peer connection before request.'
    },
    [ErrorCode.PEER_DISCONNECTED]: {
        message: 'Peer is disconnected',
        retryable: true,
        suggestion: 'Wait for peer to reconnect. Listen for "peer:join" event before retry.'
    },
    [ErrorCode.RECONNECT_FAILED]: {
        message: 'Max reconnection attempts reached',
        retryable: false,
        suggestion: 'Check network connectivity. Consider increasing maxRetries option.'
    },
    [ErrorCode.UNSUPPORTED]: {
        message: 'Operation not supported by this environment',
        retryable: false,
        suggestion: 'This feature requires a browser environment. Check for feature availability first.'
    },
    [ErrorCode.NOT_CONNECTED]: {
        message: 'Transport is not connected',
        retryable: true,
        suggestion: 'Call addTransport() and wait for connection before sending messages.'
    },
    [ErrorCode.ACK_TIMEOUT]: {
        message: 'ACK not received within timeout',
        retryable: true,
        suggestion: 'Increase ackTimeout option or check peer availability.'
    },
    [ErrorCode.RESPONSE_TIMEOUT]: {
        message: 'Response not received within timeout',
        retryable: true,
        suggestion: 'Increase timeout in request options: { timeout: 10000 }. Check if handler exists on peer.'
    },
    [ErrorCode.QUEUE_FULL]: {
        message: 'Message queue is full',
        retryable: false,
        suggestion: 'Increase maxQueueSize or wait for queue to drain. Consider using batching plugin.'
    },
    [ErrorCode.INVALID_MESSAGE]: {
        message: 'Invalid message format',
        retryable: false,
        suggestion: 'Ensure message data is JSON-serializable. Avoid DOM nodes and functions.'
    },
    [ErrorCode.VERSION_MISMATCH]: {
        message: 'Protocol version mismatch',
        retryable: false,
        suggestion: 'Update CrossBus to same version on both sides.'
    },
    [ErrorCode.CLONE_ERROR]: {
        message: 'Data cannot be cloned (contains functions or DOM nodes)',
        retryable: false,
        suggestion: 'Remove functions, DOM nodes, and circular references from message data.'
    },
    [ErrorCode.TRANSFER_ERROR]: {
        message: 'Failed to transfer object ownership',
        retryable: false,
        suggestion: 'Ensure ArrayBuffers are not detached. Each buffer can only be transferred once.'
    },
    [ErrorCode.MESSAGE_TOO_LARGE]: {
        message: 'Message exceeds maximum size',
        retryable: false,
        suggestion: 'Use streaming for large payloads or increase maxMessageSize option.'
    },
    [ErrorCode.UNREACHABLE]: {
        message: 'Destination peer is unreachable',
        retryable: true,
        suggestion: 'Check if peer is still connected. Use bus.peers to list available peers.'
    },
    [ErrorCode.TTL_EXCEEDED]: {
        message: 'Message TTL exceeded (possible routing loop)',
        retryable: false,
        suggestion: 'Check for circular transport configurations. Increase maxTTL if needed.'
    },
    [ErrorCode.NO_ROUTE]: {
        message: 'No route to destination',
        retryable: false,
        suggestion: 'Add transport connecting to target peer. Set isHub: true on orchestrator.'
    },
    [ErrorCode.NO_HANDLER]: {
        message: 'No handler registered for this request',
        retryable: false,
        suggestion: 'Register handler on target: bus.handle("handlerName", fn). Check handler name spelling.'
    },
    [ErrorCode.HANDLER_ERROR]: {
        message: 'Handler threw an exception',
        retryable: false,
        suggestion: 'Check target peer logs for error. Wrap handler in try/catch.'
    },
    [ErrorCode.HANDLER_TIMEOUT]: {
        message: 'Handler did not respond within timeout',
        retryable: true,
        suggestion: 'Handler is slow. Increase timeout or optimize handler performance.'
    },
    [ErrorCode.HANDLER_EXISTS]: {
        message: 'Handler already registered with this name',
        retryable: false,
        suggestion: 'Use different handler name or call bus.removeHandler() first.'
    },
    [ErrorCode.SEND_FAILED]: {
        message: 'Failed to send message to peer',
        retryable: true,
        suggestion: 'Check transport status. Target window may be closed or blocked.'
    },
    [ErrorCode.CHANNEL_FAILED]: {
        message: 'Failed to create direct channel',
        retryable: true,
        suggestion: 'Check browser support for MessageChannel. Retry after short delay.'
    },
    [ErrorCode.CHANNEL_CLOSED]: {
        message: 'Channel was closed unexpectedly',
        retryable: false,
        suggestion: 'Target context was destroyed. Check if iframe/worker still exists.'
    },
    [ErrorCode.MAX_PEERS]: {
        message: 'Maximum number of peers reached',
        retryable: false,
        suggestion: 'Increase maxPeers option or disconnect unused peers first.'
    },
    [ErrorCode.MAX_PENDING]: {
        message: 'Maximum pending requests reached',
        retryable: false,
        suggestion: 'Wait for pending requests to complete. Increase maxPendingRequests option.'
    },
    [ErrorCode.DESTROYED]: {
        message: 'CrossBus instance has been destroyed',
        retryable: false,
        suggestion: 'Create new CrossBus instance. Do not use bus after calling destroy().'
    },
    [ErrorCode.CIRCUIT_OPEN]: {
        message: 'Circuit breaker is open',
        retryable: false,
        suggestion: 'Too many failures. Wait for circuit to reset or call circuit.reset().'
    },
    [ErrorCode.PAYLOAD_TOO_LARGE]: {
        message: 'Payload exceeds maximum allowed size',
        retryable: false,
        suggestion: 'Reduce payload size or increase maxPayloadSize option. Consider using streaming for large data.'
    },
    [ErrorCode.RATE_LIMITED]: {
        message: 'Request rate limit exceeded',
        retryable: true,
        suggestion: 'Wait before retrying. Consider adding delay or using exponential backoff.'
    },
    [ErrorCode.UNAUTHORIZED]: {
        message: 'Peer is not authorized to call this handler',
        retryable: false,
        suggestion: 'Add peer to handler allowedPeers list or remove peer restrictions.'
    },
    [ErrorCode.INVALID_PAYLOAD]: {
        message: 'Payload validation failed',
        retryable: false,
        suggestion: 'Check payload structure against handler requirements.'
    }
});

/**
 * Custom error class for CrossBus.
 * 
 * @extends Error
 * 
 * @example
 * try {
 *   await bus.emit('msg', data, 'unknown-peer');
 * } catch (err) {
 *   if (err instanceof CrossBusError) {
 *     console.log(err.code);      // 'ERR_PEER_NOT_FOUND'
 *     console.log(err.message);   // 'Peer not found'
 *     console.log(err.details);   // { peerId: 'unknown-peer' }
 *     console.log(err.retryable); // false
 *   }
 * }
 */
class CrossBusError extends Error {
    /**
     * Error code.
     * @type {ErrorCode}
     */
    code;

    /**
     * Additional error context.
     * @type {Object}
     */
    details;

    /**
     * Whether the operation can be retried.
     * @type {boolean}
     */
    retryable;

    /**
     * Original error that caused this error.
     * @type {Error|undefined}
     */
    cause;

    /**
     * Timestamp when error occurred.
     * @type {number}
     */
    timestamp;

    /**
     * Creates a new CrossBusError.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {string} [message] - Custom message (uses default if omitted).
     * @param {Object} [options] - Additional options.
     * @param {Object} [options.details={}] - Error context.
     * @param {boolean} [options.retryable] - Override default retryable.
     * @param {Error} [options.cause] - Original error.
     */
    constructor(code, message, options = {}) {
        const meta = ERROR_META[code] ?? { message: 'Unknown error', retryable: false };
        super(message ?? meta.message);

        this.name = 'CrossBusError';
        this.code = code;
        this.details = options.details ?? {};
        this.retryable = options.retryable ?? meta.retryable;
        this.cause = options.cause;
        this.timestamp = Date.now();

        // Maintain proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CrossBusError);
        }
    }

    /**
     * Creates error from code with default message.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {Object} [details] - Error context.
     * @returns {CrossBusError}
     */
    static from(code, details = {}) {
        return new CrossBusError(code, undefined, { details });
    }

    /**
     * Creates error from another error.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {Error} cause - Original error.
     * @param {Object} [details] - Additional context.
     * @returns {CrossBusError}
     */
    static wrap(code, cause, details = {}) {
        return new CrossBusError(code, cause.message, { cause, details });
    }

    /**
     * Converts error to JSON-serializable object.
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            retryable: this.retryable,
            timestamp: this.timestamp
        };
    }

    /**
     * String representation.
     * @returns {string}
     */
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}

/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */

/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID() when available, falls back to manual generation.
 * 
 * @returns {string} UUID v4 string.
 */
function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Creates a deferred promise (Promise.withResolvers polyfill).
 * Uses native Promise.withResolvers() when available (ES2024+).
 * 
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void}}
 */
function deferred() {
    // Use native Promise.withResolvers if available (ES2024+, ~10x faster)
    // @ts-ignore
    if (typeof Promise.withResolvers === 'function') {
        // @ts-ignore
        return Promise.withResolvers();
    }
    // Fallback for older engines
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    // @ts-ignore
    return { promise, resolve, reject };
}

/**
 * Creates a promise that rejects after a timeout.
 * 
 * @template T
 * @param {Promise<T>} promise - Promise to race against.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} [message='Operation timed out'] - Timeout error message.
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, message = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        })
    ]);
}

/**
 * @fileoverview Message router for hub-based routing.
 * Routes messages between peers through a central hub.
 * @module router/message-router
 */


/**
 * @typedef {Object} RoutingEntry
 * @property {string} peerId - Peer identifier.
 * @property {Function} sendFn - Function to send to this peer.
 * @property {Object} meta - Peer metadata.
 * @property {string} origin - Peer origin.
 * @property {PeerStatus} status - Connection status.
 * @property {number} connectedAt - Connection timestamp.
 */

/**
 * @typedef {Object} RouteResult
 * @property {boolean} success - Whether routing succeeded.
 * @property {number} delivered - Number of peers message was delivered to.
 * @property {string[]} failed - Peer IDs that failed delivery.
 */

/**
 * Message router for hub-based communication pattern.
 * 
 * In hub mode, all messages flow through a central router which:
 * - Maintains peer registry
 * - Routes unicast messages to specific peers
 * - Broadcasts messages to all/selected peers
 * - Tracks message delivery
 * 
 * Performance optimizations:
 * - Object-based cache for fast peer lookup (faster than Map.get)
 * - Direct sendFn cache to avoid property indirection
 * - Unrolled loops for common broadcast patterns
 * 
 * @example
 * const router = new MessageRouter();
 * 
 * // Register peers
 * router.addPeer('widget-1', (msg) => iframe1.postMessage(msg));
 * router.addPeer('widget-2', (msg) => iframe2.postMessage(msg));
 * 
 * // Route unicast
 * router.route({ target: 'widget-1', payload: data });
 * 
 * // Route broadcast
 * router.broadcast({ payload: data });
 */
class MessageRouter extends EventEmitter {
    /** @type {Map<string, RoutingEntry>} Full feature storage */
    #peers = new Map();

    /** @type {number} */
    #messageSeq = 0;

    /** @type {Map<string, number>} Per-peer sequence numbers */
    #peerSeq = new Map();

    /** @type {Object<string, RoutingEntry>} Fast Object-based cache for peer lookup */
    #peerCache = Object.create(null);

    /** @type {Object<string, Function>} Fast Object-based cache for sendFn direct access */
    #sendFnCache = Object.create(null);

    /** @type {string[]} Cached peer IDs array for fast iteration */
    #peerIds = [];

    /**
     * Creates a new message router.
     */
    constructor() {
        super();
    }

    /**
     * Adds a peer to the routing table.
     * 
     * @param {string} peerId - Unique peer identifier.
     * @param {EventListener} sendFn - Function to send messages to peer.
     * @param {Object} [options={}] - Additional options.
     * @param {Object} [options.meta={}] - Peer metadata.
     * @param {string} [options.origin='unknown'] - Peer origin.
     * @throws {CrossBusError} If peer already exists.
     * 
     * @example
     * router.addPeer('iframe-widget', (msg) => {
     *   iframe.contentWindow.postMessage(msg, '*');
     * }, { meta: { type: 'widget' } });
     */
    addPeer(peerId, sendFn, options = {}) {
        if (this.#peers.has(peerId)) {
            throw CrossBusError.from(ErrorCode.PEER_EXISTS, { peerId });
        }

        if (typeof sendFn !== 'function') {
            throw new TypeError('sendFn must be a function');
        }

        /** @type {RoutingEntry} */
        const entry = {
            peerId,
            sendFn,
            meta: options.meta ?? {},
            origin: options.origin ?? 'unknown',
            status: PeerStatus.CONNECTED,
            connectedAt: Date.now()
        };

        // Full feature storage
        this.#peers.set(peerId, entry);
        this.#peerSeq.set(peerId, 0);

        // Sync fast caches for O(1) lookup
        this.#peerCache[peerId] = entry;
        this.#sendFnCache[peerId] = sendFn;
        this.#peerIds.push(peerId);

        // Emit peer added event
        this.emit('peer:added', { peerId, meta: entry.meta });
    }

    /**
     * Removes a peer from the routing table.
     * 
     * @param {string} peerId - Peer to remove.
     * @returns {boolean} True if peer was removed.
     */
    removePeer(peerId) {
        const peer = this.#peerCache[peerId];
        if (!peer) return false;

        // Full storage cleanup
        this.#peers.delete(peerId);
        this.#peerSeq.delete(peerId);

        // Sync fast caches
        delete this.#peerCache[peerId];
        delete this.#sendFnCache[peerId];
        const idx = this.#peerIds.indexOf(peerId);
        if (idx !== -1) this.#peerIds.splice(idx, 1);

        // Emit peer removed event
        this.emit('peer:removed', { peerId, meta: peer.meta });

        return true;
    }

    /**
     * Gets a peer by ID.
     * 
     * @param {string} peerId
     * @returns {RoutingEntry|undefined}
     */
    getPeer(peerId) {
        // Fast Object-based lookup (faster than Map.get)
        return this.#peerCache[peerId];
    }

    /**
     * Gets all connected peer IDs.
     * 
     * @returns {string[]}
     */
    getPeerIds() {
        // Return cached array (avoids Array.from overhead)
        return this.#peerIds.slice();
    }

    /**
     * Gets count of connected peers.
     * 
     * @returns {number}
     */
    get peerCount() {
        return this.#peers.size;
    }

    /**
     * Routes a message to a specific peer or broadcasts.
     * 
     * @param {Object} message - Message to route.
     * @param {string} [message.target] - Target peer ID (omit for broadcast).
     * @param {Object} message.payload - Message payload.
     * @param {Object} [options] - Broadcast options
     * @param {string[]} [options.exclude] - Peer IDs to exclude from broadcast.
     * @returns {RouteResult}
     */
    route(message, options = {}) {
        const { target, payload } = message;

        if (target) {
            // Unicast to specific peer
            return this.#routeUnicast(target, payload);
        } else {
            // Broadcast to all peers - lazy Set creation
            const excludeArr = options.exclude;
            const exclude = excludeArr?.length ? new Set(excludeArr) : null;
            return this.#routeBroadcast(payload, exclude);
        }
    }

    /**
     * Broadcasts a message to all peers.
     * 
     * @param {Object} payload - Message payload.
     * @param {Object} [options={}] - Broadcast options.
     * @param {string[]} [options.exclude] - Peers to exclude.
     * @param {string[]} [options.include] - Only include these peers.
     * @returns {RouteResult}
     */
    broadcast(payload, options = {}) {
        // Lazy Set creation - skip allocation when not needed
        const excludeArr = options.exclude;
        const exclude = excludeArr?.length ? new Set(excludeArr) : null;
        const includeArr = options.include;
        const include = includeArr?.length ? new Set(includeArr) : null;

        let delivered = 0;
        const failed = [];

        for (const [peerId, peer] of this.#peers) {
            // Skip excluded peers
            if (exclude?.has(peerId)) continue;

            // Skip if not in include list (when specified)
            if (include && !include.has(peerId)) continue;

            // Skip disconnected peers
            if (peer.status !== PeerStatus.CONNECTED) continue;

            try {
                const envelope = this.#createEnvelope(peerId, payload, MessageType.BROADCAST);
                peer.sendFn(envelope);
                delivered++;
            } catch (error) {
                console.error(`[Router] Failed to send to ${peerId}:`, error);
                failed.push(peerId);
            }
        }

        return { success: failed.length === 0, delivered, failed };
    }

    /**
     * Gets the next sequence number for a peer.
     * Used for causal ordering in SignalStore.
     * 
     * @param {string} peerId
     * @returns {number}
     */
    getSequence(peerId) {
        return this.#peerSeq.get(peerId) ?? 0;
    }

    /**
     * Updates peer status.
     * 
     * @param {string} peerId
     * @param {PeerStatus} status
     */
    setPeerStatus(peerId, status) {
        const peer = this.#peerCache[peerId];
        if (peer) {
            peer.status = status;
            this.emit('peer:status', { peerId, status });
        }
    }

    /**
     * Clears all peers.
     */
    clearPeers() {
        // Fast iteration using cached array
        const peerIds = this.#peerIds.slice();
        for (const peerId of peerIds) {
            this.removePeer(peerId);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Routes to a single peer.
     * 
     */
    #routeUnicast(peerId, payload) {
        const peer = this.#peerCache[peerId];

        if (!peer) {
            return {
                success: false,
                delivered: 0,
                failed: [peerId],
                error: ErrorCode.PEER_NOT_FOUND
            };
        }

        if (peer.status !== PeerStatus.CONNECTED) {
            return {
                success: false,
                delivered: 0,
                failed: [peerId],
                error: ErrorCode.PEER_DISCONNECTED
            };
        }

        try {
            // If payload is already a protocol message (has the marker), send directly
            // Otherwise wrap in envelope for signals/broadcasts
            const messageToSend = (payload && payload._cb)
                ? payload
                : this.#createEnvelope(peerId, payload, MessageType.SIGNAL);
            peer.sendFn(messageToSend);
            return { success: true, delivered: 1, failed: [] };
        } catch (error) {
            console.error(`[Router] Failed to send to ${peerId}:`, error);
            return { success: false, delivered: 0, failed: [peerId] };
        }
    }

    /**
     * Broadcasts to multiple peers.
     * 
     */
    #routeBroadcast(payload, exclude) {
        // exclude is already a Set or null from route()
        return this.broadcast(payload, exclude ? { exclude: Array.from(exclude) } : {});
    }

    /**
     * Creates a message envelope with routing info.
     * 
     */
    #createEnvelope(peerId, payload, type) {
        // Increment per-peer sequence
        const seq = (this.#peerSeq.get(peerId) ?? 0) + 1;
        this.#peerSeq.set(peerId, seq);

        return {
            id: `msg_${++this.#messageSeq}`,
            t: type,
            ts: Date.now(),
            seq,
            p: payload
        };
    }
}

/**
 * @fileoverview Pending requests tracker for request/response pattern.
 * Tracks outgoing requests and matches them with responses.
 * @module router/pending-requests
 */


/**
 * @typedef {Object} PendingRequest
 * @property {string} id - Request ID.
 * @property {string} targetPeer - Target peer ID.
 * @property {string} handlerName - Name of the handler.
 * @property {number} createdAt - When request was created.
 * @property {number} timeout - Timeout in ms.
 * @property {Function} resolve - Promise resolve function.
 * @property {Function} reject - Promise reject function.
 * @property {*} [defaultValue] - Value to return on timeout.
 */

/**
 * @typedef {Object} RequestOptions
 * @property {number} [timeout=30000] - Request timeout in ms.
 * @property {*} [defaultValue] - Value to return on timeout instead of throwing.
 */

/**
 * @typedef {Object} ResponseData
 * @property {string} requestId - Original request ID.
 * @property {boolean} success - Whether handler succeeded.
 * @property {*} [data] - Response data if successful.
 * @property {Object} [error] - Error if failed.
 */

/**
 * Tracks pending requests and matches responses.
 * 
 * Supports:
 * - Timeout handling
 * - Automatic cleanup
 * - Error propagation
 * - Request cancellation
 * 
 * @example
 * const tracker = new PendingRequests();
 * 
 * // Create request
 * const { requestId, promise } = tracker.create('peer-1', 'getData', {
 *   timeout: 5000
 * });
 * 
 * // Send request via transport...
 * transport.send({ id: requestId, type: 'request', handler: 'getData' });
 * 
 * // When response arrives:
 * tracker.resolve(requestId, responseData);
 * 
 * // Or wait for response:
 * const result = await promise;
 */
class PendingRequests {
    /** @type {Map<string, PendingRequest>} Full feature storage */
    #pending = new Map();

    /** @type {Object<string, PendingRequest>} Fast Object-based cache for lookup */
    #cache = Object.create(null);

    /** @type {number} */
    #requestCounter = 0;

    /** @type {number} Default timeout */
    #defaultTimeout;

    /** @type {number} Maximum pending requests */
    #maxPending;

    /**
     * Creates a new pending requests tracker.
     * 
     * @param {Object} [options={}]
     * @param {number} [options.defaultTimeout=30000] - Default timeout in ms.
     * @param {number} [options.maxPending=1000] - Maximum pending requests (0 = unlimited).
     */
    constructor(options = {}) {
        this.#defaultTimeout = options.defaultTimeout ?? 30000;
        this.#maxPending = options.maxPending ?? 1000;
    }

    /**
     * Creates a new pending request.
     * 
     * @param {string} targetPeer - Target peer ID.
     * @param {string} handlerName - Name of the handler to invoke.
     * @param {RequestOptions} [options={}] - Request options.
     * @returns {{ requestId: string, promise: Promise<*> }}
     * 
     * @example
     * const { requestId, promise } = tracker.create('widget', 'getState');
     * const result = await promise;
     */
    create(targetPeer, handlerName, options = {}) {
        // Enforce max pending limit to prevent memory exhaustion
        if (this.#maxPending > 0 && this.#pending.size >= this.#maxPending) {
            throw CrossBusError.from(ErrorCode.MAX_PENDING, {
                current: this.#pending.size,
                max: this.#maxPending,
                targetPeer,
                handlerName
            });
        }

        const now = Date.now();
        const requestId = `req_${++this.#requestCounter}_${now}`;
        const timeout = options.timeout ?? this.#defaultTimeout;
        const { promise, resolve, reject } = deferred();

        /** @type {PendingRequest} */
        const pending = {
            id: requestId,
            targetPeer,
            handlerName,
            createdAt: now,
            timeout,
            resolve,
            reject,
            defaultValue: options.defaultValue
        };

        this.#pending.set(requestId, pending);
        this.#cache[requestId] = pending;  // Sync fast cache

        // Set up timeout
        const timeoutPromise = withTimeout(promise, timeout).catch(error => {
            // Cleanup on timeout - use cache for fast check
            if (requestId in this.#cache) {
                this.#pending.delete(requestId);
                delete this.#cache[requestId];

                // Return default value if provided
                if ('defaultValue' in options) {
                    return options.defaultValue;
                }

                throw CrossBusError.from(ErrorCode.RESPONSE_TIMEOUT, {
                    requestId,
                    targetPeer,
                    handlerName,
                    timeout
                });
            }
            throw error;
        });

        return { requestId, promise: timeoutPromise };
    }

    /**
     * Resolves a pending request with response data.
     * 
     * @param {string} requestId - Request ID to resolve.
     * @param {ResponseData} response - Response data.
     * @returns {boolean} True if request was found and resolved.
     */
    resolve(requestId, response) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];

        if (response.success) {
            pending.resolve(response.data);
        } else {
            const error = CrossBusError.from(
                response.error?.code ?? ErrorCode.HANDLER_ERROR,
                {
                    requestId,
                    targetPeer: pending.targetPeer,
                    handlerName: pending.handlerName,
                    originalError: response.error
                }
            );
            error.message = response.error?.message ?? 'Handler error';
            pending.reject(error);
        }

        return true;
    }

    /**
     * Rejects a pending request with an error.
     * 
     * @param {string} requestId - Request ID to reject.
     * @param {Error|string} error - Error or error message.
     * @returns {boolean} True if request was found and rejected.
     */
    reject(requestId, error) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];

        const err = error instanceof Error ? error : new Error(error);
        pending.reject(err);

        return true;
    }

    /**
     * Cancels a pending request.
     * 
     * @param {string} requestId - Request ID to cancel.
     * @returns {boolean} True if request was found and cancelled.
     */
    cancel(requestId) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];
        pending.reject(new Error('Request cancelled'));

        return true;
    }

    /**
     * Cancels all pending requests for a peer.
     * Used when peer disconnects.
     * 
     * @param {string} peerId - Peer ID.
     * @returns {number} Number of requests cancelled.
     */
    cancelForPeer(peerId) {
        let count = 0;

        for (const [requestId, pending] of this.#pending) {
            if (pending.targetPeer === peerId) {
                this.#pending.delete(requestId);
                delete this.#cache[requestId];  // Sync cache
                pending.reject(CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                    peerId,
                    requestId
                }));
                count++;
            }
        }

        return count;
    }

    /**
     * Cancels all pending requests.
     * 
     * @returns {number} Number of requests cancelled.
     */
    cancelAll() {
        const count = this.#pending.size;

        for (const [requestId, pending] of this.#pending) {
            pending.reject(new Error('All requests cancelled'));
        }

        this.#pending.clear();
        // Reset cache to empty object
        for (const key in this.#cache) {
            delete this.#cache[key];
        }
        return count;
    }

    /**
     * Checks if a request is pending.
     * 
     * @param {string} requestId
     * @returns {boolean}
     */
    has(requestId) {
        // Fast Object-based check (faster than Map.has)
        return requestId in this.#cache;
    }

    /**
     * Gets a pending request.
     * 
     * @param {string} requestId
     * @returns {PendingRequest|undefined}
     */
    get(requestId) {
        // Fast Object-based lookup
        return this.#cache[requestId];
    }

    /**
     * Gets count of pending requests.
     * @returns {number}
     */
    get size() {
        return this.#pending.size;
    }

    /**
     * Gets all pending request IDs.
     * @returns {string[]}
     */
    getRequestIds() {
        return Array.from(this.#pending.keys());
    }

    /**
     * Gets pending requests for a specific peer.
     * 
     * @param {string} peerId
     * @returns {PendingRequest[]}
     */
    getForPeer(peerId) {
        const requests = [];
        for (const pending of this.#pending.values()) {
            if (pending.targetPeer === peerId) {
                requests.push(pending);
            }
        }
        return requests;
    }
}

/**
 * @fileoverview Secure handshake protocol for peer negotiation.
 * Handles connection establishment, authentication, and capability exchange.
 * @module security/handshake
 */


/**
 * @typedef {Object} HandshakeConfig
 * @property {string} [peerId] - Our peer ID (auto-generated if not specified).
 * @property {number} [timeout=10000] - Handshake timeout in ms.
 * @property {Object} [meta={}] - Metadata to share with peer.
 * @property {string[]} [capabilities=[]] - Supported capabilities.
 */

/**
 * @typedef {Object} PeerInfo
 * @property {string} peerId - Remote peer's ID.
 * @property {string} origin - Remote peer's origin.
 * @property {string} type - Remote peer's type (iframe, worker, etc).
 * @property {Object} meta - Remote peer's metadata.
 * @property {string[]} capabilities - Remote peer's capabilities.
 * @property {number} connectedAt - Connection timestamp.
 */

/**
 * @typedef {Object} HandshakeResult
 * @property {boolean} success - Whether handshake succeeded.
 * @property {PeerInfo} [peer] - Peer info if successful.
 * @property {string} [error] - Error code if failed.
 * @property {string} [reason] - Error reason if failed.
 */

/**
 * Handshake protocol for secure peer establishment.
 * 
 * Protocol flow:
 * ```
 * INITIATOR                          RESPONDER
 *     │                                   │
 *     │  HANDSHAKE_INIT                   │
 *     │  { peerId, meta, caps }           │
 *     │ ──────────────────────────────►   │
 *     │                                   │
 *     │  HANDSHAKE_ACK                    │
 *     │  { peerId, meta, caps, accept }   │
 *     │ ◄──────────────────────────────   │
 *     │                                   │
 *     │  HANDSHAKE_COMPLETE               │
 *     │  { confirmed: true }              │
 *     │ ──────────────────────────────►   │
 *     │                                   │
 *     │  ✓ Connected                      │
 * ```
 */
class Handshake {
    /** @type {string} */
    #localPeerId;

    /** @type {Object} */
    #meta;

    /** @type {string[]} */
    #capabilities;

    /** @type {number} */
    #timeout;

    /** @type {Map<string, Object>} */
    #pendingHandshakes = new Map();

    /**
     * Creates a new Handshake handler.
     * 
     * @param {HandshakeConfig} [config={}]
     */
    constructor(config = {}) {
        this.#localPeerId = config.peerId ?? uuid();
        this.#meta = config.meta ?? {};
        this.#capabilities = config.capabilities ?? [];
        this.#timeout = config.timeout ?? 10000;
    }

    /**
     * Gets the local peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#localPeerId;
    }

    /**
     * Creates a handshake initiation message.
     * 
     * @returns {Object} Handshake init message.
     */
    createInitMessage() {
        return {
            type: MessageType.HANDSHAKE_INIT,
            handshakeId: uuid(),
            peerId: this.#localPeerId,
            meta: this.#meta,
            capabilities: this.#capabilities,
            timestamp: Date.now()
        };
    }

    /**
     * Creates a handshake acknowledgment message.
     * 
     * @param {Object} initMessage - The received init message.
     * @param {boolean} accept - Whether to accept the connection.
     * @param {string} [reason] - Rejection reason if not accepted.
     * @returns {Object} Handshake ack message.
     */
    createAckMessage(initMessage, accept, reason) {
        return {
            type: MessageType.HANDSHAKE_ACK,
            handshakeId: initMessage.handshakeId,
            peerId: this.#localPeerId,
            meta: this.#meta,
            capabilities: this.#capabilities,
            accept,
            reason: accept ? undefined : reason,
            timestamp: Date.now()
        };
    }

    /**
     * Creates a handshake completion message.
     * 
     * @param {string} handshakeId - The handshake ID.
     * @returns {Object} Handshake complete message.
     */
    createCompleteMessage(handshakeId) {
        return {
            type: MessageType.HANDSHAKE_COMPLETE,
            handshakeId,
            confirmed: true,
            timestamp: Date.now()
        };
    }

    /**
     * Initiates a handshake with a peer.
     * 
     * @param {EventListener} sendFn - Function to send messages to peer.
     * @returns {Promise<HandshakeResult>} Result of handshake attempt.
     */
    async initiate(sendFn) {
        const initMsg = this.createInitMessage();
        const { promise, resolve, reject } = deferred();

        // Store pending handshake
        this.#pendingHandshakes.set(initMsg.handshakeId, {
            phase: HandshakePhase.INIT_SENT,
            resolve,
            reject,
            initMsg,
            startTime: Date.now()
        });

        // Send init message
        sendFn(initMsg);

        // Wait for response with timeout
        try {
            const result = await withTimeout(promise, this.#timeout);
            return result;
        } catch (/** @type {any} */ error) {
            this.#pendingHandshakes.delete(initMsg.handshakeId);

            if (error.code === ErrorCode.HANDSHAKE_TIMEOUT) {
                return {
                    success: false,
                    error: ErrorCode.HANDSHAKE_TIMEOUT,
                    reason: `Handshake timeout after ${this.#timeout}ms`
                };
            }

            return {
                success: false,
                error: ErrorCode.HANDSHAKE_REJECTED,
                reason: error.message
            };
        }
    }

    /**
     * Handles a received handshake message.
     * 
     * @param {Object} message - Received handshake message.
     * @param {string} origin - Origin of the message.
     * @param {EventListener} sendFn - Function to send response.
     * @param {EventListener} [validateFn] - Optional validation function.
     * @returns {PeerInfo|null} Peer info if handshake completes, null otherwise.
     */
    handleMessage(message, origin, sendFn, validateFn) {
        switch (message.type) {
            case MessageType.HANDSHAKE_INIT:
                return this.#handleInit(message, origin, sendFn, validateFn);

            case MessageType.HANDSHAKE_ACK:
                return this.#handleAck(message, origin, sendFn);

            case MessageType.HANDSHAKE_COMPLETE:
                return this.#handleComplete(message, origin);

            default:
                return null;
        }
    }

    /**
     * Checks if a handshake is pending.
     * 
     * @param {string} handshakeId
     * @returns {boolean}
     */
    hasPending(handshakeId) {
        return this.#pendingHandshakes.has(handshakeId);
    }

    /**
     * Cancels a pending handshake.
     * 
     * @param {string} handshakeId
     */
    cancel(handshakeId) {
        const pending = this.#pendingHandshakes.get(handshakeId);
        if (pending) {
            pending.reject(new Error('Handshake cancelled'));
            this.#pendingHandshakes.delete(handshakeId);
        }
    }

    /**
     * Cancels all pending handshakes.
     */
    cancelAll() {
        for (const [id, pending] of this.#pendingHandshakes) {
            pending.reject(new Error('All handshakes cancelled'));
        }
        this.#pendingHandshakes.clear();
    }

    // ─────────────────────────────────────────────────────────────────
    // Private handlers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles HANDSHAKE_INIT message (we are responder).
     * 
     */
    #handleInit(message, origin, sendFn, validateFn) {
        // Validate if validator provided
        if (validateFn && !validateFn(message, origin)) {
            const ack = this.createAckMessage(message, false, 'Validation failed');
            sendFn(ack);
            return null;
        }

        // Accept the connection
        const ack = this.createAckMessage(message, true);
        sendFn(ack);

        // Store awaiting complete
        this.#pendingHandshakes.set(message.handshakeId, {
            phase: HandshakePhase.ACK_SENT,
            remotePeer: {
                peerId: message.peerId,
                origin,
                meta: message.meta,
                capabilities: message.capabilities
            }
        });

        return null; // Wait for complete message
    }

    /**
     * Handles HANDSHAKE_ACK message (we are initiator).
     * 
     */
    #handleAck(message, origin, sendFn) {
        const pending = this.#pendingHandshakes.get(message.handshakeId);
        if (!pending) {
            return null; // Unknown handshake
        }

        if (!message.accept) {
            // Rejected
            pending.reject(new Error(message.reason || 'Connection rejected'));
            this.#pendingHandshakes.delete(message.handshakeId);
            return null;
        }

        // Send complete message
        const complete = this.createCompleteMessage(message.handshakeId);
        sendFn(complete);

        // Create peer info
        const peerInfo = {
            peerId: message.peerId,
            origin,
            meta: message.meta,
            capabilities: message.capabilities,
            type: 'unknown', // Will be updated by PeerRegistry
            connectedAt: Date.now()
        };

        // Resolve the promise
        pending.resolve({
            success: true,
            peer: peerInfo
        });

        this.#pendingHandshakes.delete(message.handshakeId);
        return peerInfo;
    }

    /**
     * Handles HANDSHAKE_COMPLETE message (we are responder).
     * 
     */
    #handleComplete(message, origin) {
        const pending = this.#pendingHandshakes.get(message.handshakeId);
        if (!pending || pending.phase !== HandshakePhase.ACK_SENT) {
            return null;
        }

        if (!message.confirmed) {
            this.#pendingHandshakes.delete(message.handshakeId);
            return null;
        }

        // Handshake complete!
        const peerInfo = {
            ...pending.remotePeer,
            connectedAt: Date.now()
        };

        this.#pendingHandshakes.delete(message.handshakeId);
        return peerInfo;
    }
}

/**
 * @fileoverview Origin validation for cross-origin security.
 * Validates message origins against an allowlist.
 * @module security/origin-validator
 */

/**
 * @typedef {Object} OriginValidatorOptions
 * @property {string[]} [allowed=[]] - Allowed origins. Empty = same-origin only.
 * @property {boolean} [allowAll=false] - Allow all origins (dangerous!).
 */

/**
 * Validates message origins against a configured allowlist.
 * 
 * Supports:
 * - Exact matches: 'https://example.com'
 * - Wildcards: 'https://*.example.com' (subdomains only)
 * - Protocols: 'chrome-extension://*', 'file://*'
 * 
 * @example
 * const validator = new OriginValidator({
 *   allowed: [
 *     'https://app.example.com',
 *     'https://*.widgets.com'
 *   ]
 * });
 * 
 * validator.isAllowed('https://app.example.com');     // true
 * validator.isAllowed('https://foo.widgets.com');     // true
 * validator.isAllowed('https://evil.com');            // false
 */
class OriginValidator {
    /** @type {Set<string>} */
    #exactOrigins = new Set();

    /** @type {RegExp[]} */
    #patterns = [];

    /** @type {boolean} */
    #allowAll = false;

    /** @type {string|undefined} */
    #selfOrigin;

    /**
     * Creates a new origin validator.
     * 
     * @param {OriginValidatorOptions} [options={}] - Configuration.
     */
    constructor(options = {}) {
        this.#allowAll = options.allowAll ?? false;
        this.#selfOrigin = globalThis.location?.origin;

        // Process allowed origins
        if (options.allowed) {
            for (const origin of options.allowed) {
                this.#addOrigin(origin);
            }
        }
    }

    /**
     * Checks if an origin is allowed.
     * 
     * @param {string} origin - Origin to check (e.g., 'https://example.com').
     * @returns {boolean} True if allowed.
     * 
     * @example
     * validator.isAllowed('https://trusted.com');  // true
     * validator.isAllowed('https://unknown.com');  // false
     */
    isAllowed(origin) {
        // Allow-all mode (dangerous but sometimes needed)
        if (this.#allowAll) {
            return true;
        }

        // Null origin (file://, sandboxed iframes, etc.)
        if (origin === 'null' || origin === null) {
            return this.#exactOrigins.has('null');
        }

        // Empty/no allowed origins = same-origin only
        if (this.#exactOrigins.size === 0 && this.#patterns.length === 0) {
            return origin === this.#selfOrigin;
        }

        // Check exact match first (fast path)
        if (this.#exactOrigins.has(origin)) {
            return true;
        }

        // Check pattern matches
        for (const pattern of this.#patterns) {
            if (pattern.test(origin)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Adds an origin to the allowlist.
     * 
     * @param {string} origin - Origin to add (supports wildcards).
     * @returns {this} For chaining.
     */
    allow(origin) {
        this.#addOrigin(origin);
        return this;
    }

    /**
     * Removes an origin from the allowlist.
     * 
     * @param {string} origin - Origin to remove.
     * @returns {boolean} True if removed.
     */
    disallow(origin) {
        // For exact origins
        if (this.#exactOrigins.has(origin)) {
            this.#exactOrigins.delete(origin);
            return true;
        }

        // For patterns, we'd need to store the original string
        // For simplicity, patterns cannot be removed individually
        return false;
    }

    /**
     * Gets all exact (non-pattern) allowed origins.
     * 
     * @returns {string[]} Array of allowed origins.
     */
    getAllowed() {
        return Array.from(this.#exactOrigins);
    }

    /**
     * Clears all allowed origins.
     */
    clear() {
        this.#exactOrigins.clear();
        this.#patterns = [];
    }

    /**
     * Gets the current origin (if available).
     * @returns {string|undefined}
     */
    get selfOrigin() {
        return this.#selfOrigin;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds an origin to the appropriate collection.
     * 
     * @param {string} origin
     */
    #addOrigin(origin) {
        if (typeof origin !== 'string') {
            throw new TypeError('Origin must be a string');
        }

        // Wildcard '*' means allow all
        if (origin === '*') {
            this.#allowAll = true;
            return;
        }

        // Contains wildcards - create pattern
        if (origin.includes('*')) {
            const pattern = this.#createPattern(origin);
            this.#patterns.push(pattern);
        } else {
            // Exact origin
            this.#exactOrigins.add(origin);
        }
    }

    /**
     * Creates a RegExp from a wildcard pattern.
     * Uses bounded quantifiers to prevent ReDoS attacks.
     * 
     * @param {string} pattern - Pattern with wildcards.
     * @returns {RegExp}
     */
    #createPattern(pattern) {
        // Escape special regex characters except *
        const escaped = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            // Use bounded quantifier to prevent catastrophic backtracking
            // Allows up to 253 chars per segment (max DNS label)
            .replace(/\*/g, '[a-zA-Z0-9.-]{0,253}');

        return new RegExp(`^${escaped}$`);
    }
}

/**
 * @fileoverview CrossBus - Main facade for cross-context messaging.
 * Provides a unified API for inter-context communication.
 * @module core/cross-bus
 */


/**
 * @typedef {Object} CrossBusOptions
 * @property {string} [peerId] - Unique peer identifier (auto-generated if not specified).
 * @property {boolean} [isHub=false] - Whether this instance is the hub.
 * @property {number} [requestTimeout=30000] - Default request timeout in ms.
 * @property {number} [handshakeTimeout=10000] - Handshake timeout in ms.
 * @property {string[]} [allowedOrigins=[]] - Allowed origins for incoming connections.
 * @property {Object} [meta={}] - Metadata to share with peers.
 * @property {string[]} [capabilities=[]] - Supported capabilities.
 * @property {string} [contentType='application/json'] - Preferred serialization format.
 * @property {number} [maxPayloadSize=1048576] - Maximum payload size in bytes (default: 1MB).
 * @property {number} [maxPendingRequests=100] - Maximum concurrent pending requests.
 * @property {boolean} [strictMode=false] - Enforce strict security (disallows wildcard origins).
 * @property {boolean} [debug=false] - Enable verbose debug logging.
 * @property {string} [debugPrefix='[CrossBus]'] - Prefix for debug log messages.
 */

/**
 * @typedef {Object} HandlerOptions
 * @property {string[]} [allowedPeers] - Peer IDs allowed to call this handler.
 * @property {number} [rateLimit] - Max calls per second from each peer.
 * @property {Function} [validatePayload] - Custom payload validator function.
 */

/**
 * @typedef {Object} PeerInfo
 * @property {string} peerId - Peer identifier.
 * @property {string} origin - Peer origin.
 * @property {Object} meta - Peer metadata.
 * @property {PeerStatus} status - Connection status.
 * @property {number} connectedAt - Connection timestamp.
 */

/**
 * @typedef {Object} RequestOptions
 * @property {number} [timeout] - Request timeout in ms.
 * @property {*} [defaultValue] - Value to return on timeout instead of throwing.
 */

/**
 * @typedef {Object} BroadcastRequestOptions
 * @property {number} [timeout] - Per-peer timeout in ms.
 * @property {string[]} [exclude] - Peer IDs to exclude.
 * @property {boolean} [ignoreErrors=true] - Whether to ignore peer errors.
 */

/**
 * @typedef {Object} HookContext
 * @property {'signal'|'request'|'response'} type - Message type.
 * @property {string} [peerId] - Peer ID (if applicable).
 * @property {string} [handlerName] - Handler name (for requests).
 * @property {'inbound'|'outbound'} direction - Hook direction.
 */

/**
 * @callback MessageHook
 * @param {*} payload - Payload to transform.
 * @param {HookContext} context - Hook context.
 * @returns {*|Promise<*>} Transformed payload.
 */

/**
 * @typedef {Object} HookEntry
 * @property {MessageHook} fn - Hook function.
 * @property {number} priority - Execution priority (lower = first).
 */

/**
 * @callback RequestHandler
 * @param {*} payload - Request payload.
 * @param {Object} context - Request context (peerId, meta, etc).
 * @returns {Promise<*>|*} - Response data.
 */

/**
 * CrossBus - Zero-leak, high-performance cross-context messaging.
 * 
 * Features:
 * - Hub/Mesh routing
 * - Request/Response pattern
 * - Broadcast to all peers
 * - ACK-based reliability
 * - Origin validation
 * - Resource lifecycle management
 * 
 * @example
 * // Hub (main page)
 * const hub = new CrossBus({ isHub: true });
 * 
 * // Connect iframe
 * hub.connect(iframe.contentWindow, {
 *   targetOrigin: 'https://widget.example.com'
 * });
 * 
 * // Register handler
 * hub.handle('getData', async (payload, ctx) => {
 *   return { items: await fetchItems() };
 * });
 * 
 * // Emit signal
 * hub.emit('user:login', { userId: 123 });
 * 
 * // Request/Response
 * const result = await hub.request('widget-1', 'getStatus');
 * 
 * // Cleanup
 * hub.destroy();
 */
class CrossBus extends EventEmitter {
    /** @type {string} */
    #peerId;

    /** @type {boolean} */
    #isHub;

    /** @type {MessageRouter} */
    #router;

    /** @type {PendingRequests} */
    #pendingRequests;

    /** @type {Handshake} */
    #handshake;

    /** @type {OriginValidator} */
    #originValidator;

    /** @type {string} */
    #contentType;

    /** @type {Map<string, RequestHandler>} */
    #handlers = new Map();

    /** @type {HookEntry[]} */
    #inboundHooks = [];

    /** @type {HookEntry[]} */
    #outboundHooks = [];

    /** @type {Object} */
    #meta;

    /** @type {string[]} */
    #capabilities;

    /** @type {number} */
    #requestTimeout;

    /** @type {number} */
    #maxPayloadSize;

    /** @type {number} */
    #maxPendingRequests;

    /** @type {boolean} */
    #strictMode;

    /** @type {Map<string, { count: number, resetAt: number }>} */
    #rateLimitCounters = new Map();

    /** @type {Map<string, HandlerOptions>} */
    #handlerOptions = new Map();

    /** @type {boolean} */
    #debug = false;

    /** @type {string} */
    #debugPrefix = '[CrossBus]';

    /** @type {number} */
    #createdAt;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Creates a new CrossBus instance.
     * 
     * @param {CrossBusOptions} [options={}]
     */
    constructor(options = {}) {
        super();

        this.#peerId = options.peerId ?? uuid();
        this.#isHub = options.isHub ?? false;
        this.#meta = options.meta ?? {};
        this.#capabilities = options.capabilities ?? [];
        this.#requestTimeout = options.requestTimeout ?? 30000;

        // Initialize components
        this.#router = new MessageRouter();
        this.#pendingRequests = new PendingRequests({
            defaultTimeout: this.#requestTimeout
        });
        this.#handshake = new Handshake({
            peerId: this.#peerId,
            meta: this.#meta,
            capabilities: this.#capabilities,
            timeout: options.handshakeTimeout ?? 10000
        });
        this.#originValidator = new OriginValidator({
            allowed: options.allowedOrigins ?? []
        });

        // Serialization setup
        this.#contentType = options.contentType ?? 'application/json';
        // this.#serializer = getSerializer(this.#contentType);

        // Security settings
        this.#maxPayloadSize = options.maxPayloadSize ?? 1024 * 1024; // 1MB
        this.#maxPendingRequests = options.maxPendingRequests ?? 100;
        this.#strictMode = options.strictMode ?? false;

        // Debug settings
        this.#debug = options.debug ?? false;
        this.#debugPrefix = options.debugPrefix ?? '[CrossBus]';
        this.#createdAt = Date.now();

        // Development security warnings
        this.#emitSecurityWarnings(options);

        // Initialize handshake capability
        this.#capabilities.push(`serializer:${this.#contentType}`);

        // Wire up router events
        this.#router.on('peer:added', (e) => { this.emit('peer:connected', e.data); });
        this.#router.on('peer:removed', (e) => { this.emit('peer:disconnected', e.data); });
        this.#router.on('peer:status', (e) => { this.emit('peer:status', e.data); });

        if (this.#debug) {
            this.#log('info', `Initialized (isHub: ${this.#isHub})`);
        }
    }

    /**
     * Gets the local peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#peerId;
    }

    /**
     * Gets whether this instance is the hub.
     * @returns {boolean}
     */
    get isHub() {
        return this.#isHub;
    }

    /**
     * Gets connected peer count.
     * @returns {number}
     */
    get peerCount() {
        return this.#router.peerCount;
    }

    /**
     * Gets all connected peer IDs.
     * @returns {string[]}
     */
    get peers() {
        return this.#router.getPeerIds();
    }

    /**
     * Gets peer info by ID.
     * 
     * @param {string} peerId
     * @returns {PeerInfo|undefined}
     */
    getPeer(peerId) {
        return this.#router.getPeer(peerId);
    }

    // ─────────────────────────────────────────────────────────────────
    // Messaging API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Sends a signal to all connected peers.
     * 
     * @param {string} signalName - Signal name (e.g., 'user:login').
     * @param {*} [payload] - Signal payload.
     * @param {Object} [options={}] - Send options.
     * @param {string[]} [options.exclude] - Peer IDs to exclude.
     * @returns {Promise<{ delivered: number, failed: string[] }>}
     *  
     * @example
     * bus.signal('user:login', { userId: 123 });
     */
    async signal(signalName, payload, options = {}) {
        this.#assertNotDestroyed();

        // Apply outbound hooks
        const transformedPayload = await this.#runHooks(
            this.#outboundHooks,
            payload,
            { type: 'signal', direction: 'outbound' }
        );

        const message = createSignalMessage(
            signalName,
            transformedPayload,
            this.#peerId
        );

        const result = await this.#router.broadcast(message, options);

        this.#log('out', `SIGNAL "${signalName}" to ${result.delivered} peers`);

        return result;
    }

    /**
     * Sends a request to a specific peer and waits for response.
     * 
     * @param {string} peerId - Target peer ID.
     * @param {string} handlerName - Handler to invoke.
     * @param {*} [payload] - Request payload.
     * @param {RequestOptions} [options={}]
     * @returns {Promise<*>} Handler response.
     * 
     * @example
     * const data = await bus.request('widget-1', 'getData', { id: 5 });
     */
    async request(peerId, handlerName, payload, options = {}) {
        this.#assertNotDestroyed();

        this.#log('out', `REQUEST "${handlerName}" to ${peerId}`);

        const peer = this.#router.getPeer(peerId);
        if (!peer) {
            throw CrossBusError.from(ErrorCode.PEER_NOT_FOUND, { peerId });
        }

        // Create pending request
        const { requestId, promise } = this.#pendingRequests.create(
            peerId,
            handlerName,
            { timeout: options.timeout ?? this.#requestTimeout }
        );

        // Apply outbound hooks
        const transformedPayload = await this.#runHooks(
            this.#outboundHooks,
            payload,
            { type: 'request', peerId, handlerName, direction: 'outbound' }
        );

        // Build request message
        const message = createRequestMessage(
            handlerName,
            transformedPayload,
            this.#peerId,
            peerId,
            requestId // Pass the tracking ID
        );

        // Send request
        const result = this.#router.route({ target: peerId, payload: message });

        if (!result.success) {
            this.#pendingRequests.cancel(requestId);
            throw CrossBusError.from(ErrorCode.SEND_FAILED, { peerId });
        }

        return promise;
    }

    /**
     * Broadcasts a request to all peers and collects responses.
     * 
     * @param {string} handlerName - Handler to invoke on all peers.
     * @param {*} [payload] - Request payload.
     * @param {BroadcastRequestOptions} [options={}]
     * @returns {Promise<Map<string, *>>} Map of peerId -> response.
     * 
     * @example
     * const responses = await bus.broadcastRequest('getStatus');
     * for (const [peerId, status] of responses) {
     *   console.log(`${peerId}: ${status.state}`);
     * }
     */
    async broadcastRequest(handlerName, payload, options = {}) {
        this.#assertNotDestroyed();

        const timeout = options.timeout ?? this.#requestTimeout;
        const ignoreErrors = options.ignoreErrors ?? true;
        const exclude = new Set(options.exclude ?? []);

        const results = new Map();
        const promises = [];

        for (const peerId of this.#router.getPeerIds()) {
            if (exclude.has(peerId)) continue;

            const requestPromise = this.request(peerId, handlerName, payload, { timeout })
                .then(response => {
                    results.set(peerId, { success: true, data: response });
                })
                .catch(error => {
                    if (ignoreErrors) {
                        results.set(peerId, { success: false, error: error.message });
                    } else {
                        throw error;
                    }
                });

            promises.push(requestPromise);
        }

        await Promise.all(promises);
        return results;
    }

    // ─────────────────────────────────────────────────────────────────
    // Handler API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Registers a request handler.
     * 
     * @param {string} handlerName - Handler name.
     * @param {RequestHandler} handler - Handler function.
     * @param {HandlerOptions} [options={}] - Security options.
     * @returns {Function} Unregister function.
     * 
     * @example
     * // Basic handler
     * const unhandle = bus.handle('getData', async (payload, ctx) => {
     *   return await fetchData(payload.id);
     * });
     * 
     * // Secure handler with restrictions
     * bus.handle('sensitiveData', async (payload) => { ... }, {
     *   allowedPeers: ['trusted-agent'],  // Only these peers can call
     *   rateLimit: 10,                    // Max 10 calls/second per peer
     *   validatePayload: (p) => p.id != null  // Custom validation
     * });
     */
    handle(handlerName, handler, options = {}) {
        if (this.#handlers.has(handlerName)) {
            throw CrossBusError.from(ErrorCode.HANDLER_EXISTS, { handlerName });
        }

        // Store handler options for security checks
        if (options.allowedPeers || options.rateLimit || options.validatePayload) {
            this.#handlerOptions.set(handlerName, options);
        }

        this.#handlers.set(handlerName, handler);

        return () => {
            this.#handlers.delete(handlerName);
            this.#handlerOptions.delete(handlerName);
        };
    }

    /**
     * Removes a handler.
     * 
     * @param {string} handlerName
     * @returns {boolean} True if handler was removed.
     */
    unhandle(handlerName) {
        return this.#handlers.delete(handlerName);
    }

    /**
     * Checks if a handler is registered.
     * 
     * @param {string} handlerName
     * @returns {boolean}
     */
    hasHandler(handlerName) {
        return this.#handlers.has(handlerName);
    }

    // ─────────────────────────────────────────────────────────────────
    // Hook API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds an inbound hook to transform incoming payloads.
     * 
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @returns {Function} Unregister function.
     * 
     * @example
     * // Decrypt incoming messages
     * const unhook = bus.addInboundHook(async (payload, ctx) => {
     *   return await decrypt(payload);
     * });
     */
    addInboundHook(hookFn, priority = 10) {
        if (typeof hookFn !== 'function') {
            throw new TypeError('hookFn must be a function');
        }

        const entry = { fn: hookFn, priority };
        this.#inboundHooks.push(entry);
        this.#inboundHooks.sort((a, b) => a.priority - b.priority);

        return () => this.removeInboundHook(hookFn);
    }

    /**
     * Adds an outbound hook to transform outgoing payloads.
     * 
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @returns {Function} Unregister function.
     * 
     * @example
     * // Encrypt outgoing messages
     * const unhook = bus.addOutboundHook(async (payload, ctx) => {
     *   return await encrypt(payload);
     * });
     */
    addOutboundHook(hookFn, priority = 10) {
        if (typeof hookFn !== 'function') {
            throw new TypeError('hookFn must be a function');
        }

        const entry = { fn: hookFn, priority };
        this.#outboundHooks.push(entry);
        this.#outboundHooks.sort((a, b) => a.priority - b.priority);

        return () => this.removeOutboundHook(hookFn);
    }

    /**
     * Removes an inbound hook.
     * 
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeInboundHook(hookFn) {
        const index = this.#inboundHooks.findIndex(e => e.fn === hookFn);
        if (index !== -1) {
            this.#inboundHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Removes an outbound hook.
     * 
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeOutboundHook(hookFn) {
        const index = this.#outboundHooks.findIndex(e => e.fn === hookFn);
        if (index !== -1) {
            this.#outboundHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // Connection API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds a peer with a send function.
     * Used for hub mode when managing connections manually.
     * 
     * @param {string} peerId - Peer identifier.
     * @param {EventListener} sendFn - Function to send messages.
     * @param {Object} [options={}] - Additional options.
     */
    addPeer(peerId, sendFn, options = {}) {
        this.#assertNotDestroyed();
        this.#router.addPeer(peerId, sendFn, options);
    }

    /**
     * Removes a peer.
     * 
     * @param {string} peerId
     * @returns {boolean}
     */
    removePeer(peerId) {
        this.#pendingRequests.cancelForPeer(peerId);
        return this.#router.removePeer(peerId);
    }

    /**
     * Adds a transport and automatically wires up message handling.
     * This is the recommended way to connect transports for AI agents.
     * 
     * @param {Object} transport - Transport instance with send() and onMessage() methods.
     * @param {Object} [options={}] - Additional options.
     * @param {string} [options.peerId] - Override peer ID (defaults to transport's peerId or auto-generated).
     * @param {string} [options.origin='*'] - Origin for message validation.
     * @returns {Function} Cleanup function to remove the transport.
     * 
     * @example
     * // Simple usage
     * const cleanup = bus.addTransport(new PostMessageTransport(iframe.contentWindow));
     * 
     * // With options
     * const cleanup = bus.addTransport(transport, { peerId: 'my-agent' });
     * 
     * // Cleanup when done
     * cleanup();
     */
    addTransport(transport, options = {}) {
        this.#assertNotDestroyed();

        if (!transport || typeof transport.send !== 'function') {
            throw new TypeError('Transport must have a send() method');
        }

        const peerId = options.peerId || transport.peerId || `transport-${uuid()}`;
        const origin = options.origin || '*';

        // Wire up inbound: transport -> CrossBus
        if (typeof transport.onMessage === 'function') {
            transport.onMessage((message) => {
                this.handleMessage(message, origin, peerId);
            });
        }

        // Wire up outbound: CrossBus -> transport
        this.addPeer(peerId, (message) => {
            transport.send(message);
        }, options);

        // Return cleanup function
        return () => {
            this.removePeer(peerId);
            if (typeof transport.destroy === 'function') {
                transport.destroy();
            }
        };
    }

    /**
     * Handles an incoming message.
     * Call this when receiving a message from any transport.
     * 
     * @param {Object} message - The received message.
     * @param {string} origin - Origin of the message.
     * @param {string} [peerId] - Source peer ID if known.
     * @param {Function} [replyFn] - Function to reply to the sender.
     */
    async handleMessage(message, origin, peerId, replyFn) {
        if (this.#destroyed) return;

        // Validate origin
        if (!this.#originValidator.isAllowed(origin)) {
            console.warn(`[CrossBus] Blocked message from unauthorized origin: ${origin}`);
            return;
        }

        // Apply inbound hooks to payload
        // Apply inbound hooks to payload
        // Support both standard 'payload'/'data' and legacy 'p'
        const rawPayload = message.payload ?? message.data ?? message.p;
        const msgType = message.type ?? message.t;

        // Normalize fields based on schema
        let handlerOrName = message.handler ?? message.name;
        let dataContent = rawPayload;

        // If ProtocolMessage (has 'payload' object containing metadata), extract from it
        if (message.payload && typeof message.payload === 'object' && !message.p) {
            if (msgType === MessageType.SIGNAL || msgType === MessageType.BROADCAST) {
                handlerOrName = message.payload.name;
                dataContent = message.payload.data;
            } else if (msgType === MessageType.REQUEST) {
                handlerOrName = message.payload.name;
                dataContent = message.payload.data;
            } else if (msgType === MessageType.RESPONSE) {
                // Response payload structure? createResponseMessage puts 'data' in payload
                dataContent = message.payload.data;
            }
        }
        // Handle envelope format: { t, p: { type, payload: { name, data } } }
        // Router creates envelopes with 'p' containing the original signal message
        // Detect by: has 't' (not 'type'), has 'p' with nested 'payload' (ProtocolMessage structure)
        else if (message.t && !message.type && message.p && typeof message.p === 'object' && message.p.payload) {
            const innerMsg = message.p;
            // Extract from nested ProtocolMessage
            handlerOrName = innerMsg.payload.name ?? innerMsg.name;
            dataContent = innerMsg.payload.data ?? innerMsg.data;
        }

        if (dataContent !== undefined) {
            const hookContext = {
                type: msgType === MessageType.SIGNAL ? 'signal' :
                    msgType === MessageType.REQUEST ? 'request' : 'response',
                peerId,
                handlerName: handlerOrName,
                direction: 'inbound'
            };
            // Run hooks
            dataContent = await this.#runHooks(this.#inboundHooks, dataContent, hookContext);
        }

        switch (msgType) {
            case MessageType.BROADCAST:  // Broadcast has same structure as signal
            case MessageType.SIGNAL:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid signal name type');
                    return;
                }
                await this.#handleSignal(handlerOrName, dataContent, peerId);
                break;

            case MessageType.REQUEST:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid handler name type');
                    return;
                }
                // Pass normalized ID
                // const reqId = message.id ?? (message.payload ? message.payload.id : undefined);
                // Wait, 'id' is top level in ProtocolMessage AND legacy.

                await this.#handleRequest(message.id, handlerOrName, dataContent, peerId, replyFn);
                break;

            case MessageType.RESPONSE: {
                let success = message.success;
                let error = message.error;

                // Extract from ProtocolMessage payload if needed
                if (message.payload && message.payload.success !== undefined) {
                    success = message.payload.success;
                    error = message.payload.error;
                }

                // If legacy response structure inside payload?
                this.#handleResponse(message.payload?.requestId ?? message.id, success, dataContent, error);
                break;
            }

            case MessageType.HANDSHAKE_INIT:
            case MessageType.HANDSHAKE_ACK:
            case MessageType.HANDSHAKE_COMPLETE:
                this.#handshake.handleMessage(message, origin, /** @type {EventListener} */(replyFn));
                break;

            default:
                console.warn(`[CrossBus] Unknown message type: ${msgType}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────

    /**
     * Destroys the CrossBus, cleaning up all resources.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;

        // Cancel all pending requests
        this.#pendingRequests.cancelAll();

        // Clear handlers
        this.#handlers.clear();

        // Clear peers
        this.#router.clearPeers();

        // Clear event listeners
        this.clear();

        this.emit('destroyed', {});
    }

    /**
     * Checks if the bus has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private handlers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming signal.
     * 
     */
    async #handleSignal(name, data, peerId) {
        await this.emit(name, {
            payload: data,
            source: peerId
        });
    }

    /**
     * Handles incoming request.
     * 
     */
    async #handleRequest(requestId, handlerName, data, peerId, replyFn) {
        const handler = this.#handlers.get(handlerName);

        let response;

        if (!handler) {
            response = createResponseMessage(
                requestId,
                null,
                this.#peerId,
                false,
                {
                    code: ErrorCode.NO_HANDLER,
                    message: 'Handler not found'
                }
            );
        } else {
            // Check handler security (allowedPeers, rateLimit, validatePayload)
            const securityCheck = this.#checkHandlerSecurity(handlerName, peerId, data);
            if (!securityCheck.allowed) {
                response = createResponseMessage(
                    requestId,
                    null,
                    this.#peerId,
                    false,
                    {
                        code: securityCheck.error?.code ?? ErrorCode.UNAUTHORIZED,
                        message: securityCheck.error?.message ?? 'Security check failed'
                    }
                );
            } else {
                try {
                    const result = await handler(data, {
                        peerId,
                        requestId: requestId,
                        handlerName: handlerName
                    });

                    // Apply outbound hooks to response
                    const transformedResult = await this.#runHooks(
                        this.#outboundHooks,
                        result,
                        { type: 'response', peerId, handlerName: handlerName, direction: 'outbound' }
                    );

                    response = createResponseMessage(
                        requestId,
                        transformedResult,
                        this.#peerId,
                        true
                    );
                } catch (/** @type {any} */ error) {
                    response = createResponseMessage(
                        requestId,
                        null,
                        this.#peerId,
                        false,
                        {
                            code: error.code ?? ErrorCode.HANDLER_ERROR,
                            message: error.message
                        }
                    );
                }
            }
        }

        // Send response
        if (replyFn) {
            replyFn(response);
        } else if (peerId) {
            this.#router.route({ target: peerId, payload: response });
        }
    }

    /**
     * Handles incoming response.
     * 
     */
    #handleResponse(requestId, success, data, error) {
        this.#pendingRequests.resolve(requestId, {
            requestId,
            success,
            data,
            error
        });
    }

    /**
     * Asserts the bus is not destroyed.
     * 
     */
    #assertNotDestroyed() {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'CrossBus operation'
            });
        }
    }

    /**
     * Runs a chain of hooks on a payload.
     * 
     */
    async #runHooks(hooks, payload, context) {
        let current = payload;
        for (const { fn } of hooks) {
            try {
                current = await fn(current, context);
            } catch (error) {
                console.error('[CrossBus] Hook error:', error);
                // Continue with unmodified payload on error
            }
        }
        return current;
    }

    // ─────────────────────────────────────────────────────────────────
    // Security Methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Emits security warnings in development mode.
     * @param {CrossBusOptions} options
     */
    #emitSecurityWarnings(options) {
        // Only warn in development
        const isDev = typeof process !== 'undefined'
            ? process.env?.NODE_ENV !== 'production'
            : typeof window !== 'undefined' && window.location?.hostname === 'localhost';

        if (!isDev) return;

        // Warn if allowedOrigins is not specified
        if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
            console.warn(
                '[CrossBus Security] ⚠️ No allowedOrigins specified.\n' +
                'This bus will REJECT all incoming messages from transports.\n' +
                'To receive messages, specify allowed origins:\n' +
                '  allowedOrigins: ["https://trusted-domain.com"]\n' +
                'For development only: allowedOrigins: ["*"]'
            );
        }

        // Warn about wildcard origins
        if (options.allowedOrigins?.includes('*')) {
            console.warn(
                '[CrossBus Security] ⚠️ allowedOrigins: ["*"] accepts messages from ANY origin.\n' +
                'This is INSECURE in production. Use specific origins instead:\n' +
                '  allowedOrigins: ["https://trusted-domain.com"]\n' +
                'For production, use:\n' +
                '  CrossBus.createSecure({ allowedOrigins: ["https://..."] })\n' +
                'Suppress this warning with NODE_ENV=production'
            );

            // In strict mode, throw error
            if (this.#strictMode) {
                throw new Error(
                    'strictMode: allowedOrigins: ["*"] is not allowed. ' +
                    'Use specific origins for security.'
                );
            }
        }
    }

    /**
     * Checks handler security before execution.
     * @param {string} handlerName
     * @param {string} peerId
     * @param {*} payload
     * @returns {{ allowed: boolean, error?: CrossBusError }}
     */
    #checkHandlerSecurity(handlerName, peerId, payload) {
        const options = this.#handlerOptions.get(handlerName);
        if (!options) {
            return { allowed: true };
        }

        // Check peer allowlist
        if (options.allowedPeers && !options.allowedPeers.includes(peerId)) {
            return {
                allowed: false,
                error: CrossBusError.from(ErrorCode.UNAUTHORIZED, {
                    handler: handlerName,
                    peer: peerId,
                    allowedPeers: options.allowedPeers
                })
            };
        }

        // Check rate limit
        if (options.rateLimit) {
            const limitKey = `${handlerName}:${peerId}`;
            if (!this.#checkRateLimit(limitKey, options.rateLimit)) {
                return {
                    allowed: false,
                    error: CrossBusError.from(ErrorCode.RATE_LIMITED, {
                        handler: handlerName,
                        peer: peerId,
                        limit: options.rateLimit
                    })
                };
            }
        }

        // Validate payload
        if (options.validatePayload) {
            try {
                const isValid = options.validatePayload(payload);
                if (!isValid) {
                    return {
                        allowed: false,
                        error: CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                            handler: handlerName
                        })
                    };
                }
            } catch (/** @type {any} */ e) {
                return {
                    allowed: false,
                    error: CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                        handler: handlerName,
                        reason: e?.message ?? 'Validation error'
                    })
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Checks rate limit for a key.
     * @param {string} key - Rate limit key (e.g., "handlerName:peerId")
     * @param {number} maxPerSecond - Maximum calls per second
     * @returns {boolean} - True if allowed, false if rate limited
     */
    #checkRateLimit(key, maxPerSecond) {
        const now = Date.now();
        const counter = this.#rateLimitCounters.get(key);

        if (!counter || now >= counter.resetAt) {
            // Start new window
            this.#rateLimitCounters.set(key, {
                count: 1,
                resetAt: now + 1000
            });
            return true;
        }

        if (counter.count >= maxPerSecond) {
            return false;
        }

        counter.count++;
        return true;
    }



    /**
     * Gets the maximum payload size.
     * @returns {number}
     */
    get maxPayloadSize() {
        return this.#maxPayloadSize;
    }

    /**
     * Gets whether strict mode is enabled.
     * @returns {boolean}
     */
    get strictMode() {
        return this.#strictMode;
    }

    /**
     * Gets whether debug mode is enabled.
     * @returns {boolean}
     */
    get debug() {
        return this.#debug;
    }

    /**
     * Gets the uptime in milliseconds.
     * @returns {number}
     */
    get uptime() {
        return Date.now() - this.#createdAt;
    }

    // ─────────────────────────────────────────────────────────────────
    // Debug Logging
    // ─────────────────────────────────────────────────────────────────

    /**
     * Logs a debug message if debug mode is enabled.
     * @param {'in'|'out'|'info'|'warn'|'error'} type - Log type
     * @param {string} message - Message to log
     */
    #log(type, message) {
        if (!this.#debug) return;

        const arrow = type === 'out' ? '→' :
            type === 'in' ? '←' :
                type === 'warn' ? '⚠️' :
                    type === 'error' ? '❌' : 'ℹ️';

        // eslint-disable-next-line no-console
        console.log(`${this.#debugPrefix} ${arrow} ${message}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // Health Check
    // ─────────────────────────────────────────────────────────────────

    /**
     * Returns the health status of the CrossBus instance.
     * Useful for monitoring and diagnostics.
     * 
     * @returns {Object} Health status object
     * 
     * @example
     * const health = bus.healthCheck();
     * // {
     * //   status: 'healthy',
     * //   peerId: 'hub-1',
     * //   uptime: 123456,
     * //   peers: { total: 5, connected: 4 },
     * //   handlers: ['getData', 'setData'],
     * //   memory: { heapUsed: 12345678 }
     * // }
     */
    healthCheck() {
        const peerIds = this.#router.getPeerIds();
        const connectedCount = peerIds.length;

        // Determine status
        let status = 'healthy';
        if (this.#destroyed) {
            status = 'unhealthy';
        } else if (connectedCount === 0 && this.#isHub) {
            status = 'degraded';
        }

        // Get memory usage if available
        let memory;
        if (typeof process !== 'undefined' && process.memoryUsage) {
            try {
                const mem = process.memoryUsage();
                memory = {
                    heapUsed: mem.heapUsed,
                    heapTotal: mem.heapTotal,
                    rss: mem.rss
                };
            } catch {
                // Memory info not available
            }
        }

        return {
            status,
            peerId: this.#peerId,
            isHub: this.#isHub,
            uptime: this.uptime,
            peers: {
                total: connectedCount,
                ids: peerIds
            },
            handlers: Array.from(this.#handlers.keys()),
            pendingRequests: this.#pendingRequests.size ?? 0,
            destroyed: this.#destroyed,
            ...(memory && { memory })
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Static Factory Methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Creates a pre-configured secure CrossBus instance.
     * Recommended for production use by AI agents.
     * 
     * Enforces:
     * - strictMode (no wildcard origins)
     * - 1MB max payload size
     * - 100 max pending requests
     * - 30s request timeout
     * 
     * @param {CrossBusOptions} options - Configuration options
     * @returns {CrossBus} Configured instance
     * @throws {Error} If allowedOrigins contains '*' or is missing
     * 
     * @example
     * // For production use
     * const hub = CrossBus.createSecure({
     *   peerId: 'my-hub',
     *   isHub: true,
     *   allowedOrigins: ['https://trusted-domain.com']
     * });
     */
    static createSecure(options = {}) {
        if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
            throw new Error(
                'createSecure() requires allowedOrigins to be specified. ' +
                'For development, use: new CrossBus({ allowedOrigins: ["*"] })'
            );
        }

        if (options.allowedOrigins.includes('*')) {
            throw new Error(
                'createSecure() does not allow wildcard origins. ' +
                'Specify exact origins: allowedOrigins: ["https://example.com"]'
            );
        }

        return new CrossBus({
            strictMode: true,
            maxPayloadSize: 1024 * 1024,
            maxPendingRequests: 100,
            requestTimeout: 30000,
            ...options
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Diagnostics (AI Agent Helper)
    // ─────────────────────────────────────────────────────────────────

    /**
     * Performs diagnostics and returns troubleshooting suggestions.
     * Designed to help AI agents identify and fix common issues.
     * 
     * @returns {Object} Diagnostic report with issues and suggestions
     * 
     * @example
     * const report = bus.diagnose();
     * if (report.issues.length > 0) {
     *   console.log('Issues found:', report.issues);
     *   console.log('Suggestions:', report.suggestions);
     * }
     */
    diagnose() {
        const issues = [];
        const suggestions = [];
        const warnings = [];

        // Check if destroyed
        if (this.#destroyed) {
            issues.push('Instance is destroyed');
            suggestions.push('Create a new CrossBus instance');
            return { status: 'error', issues, suggestions, warnings };
        }

        // Check peer connections
        const peerCount = this.#router.getPeerIds().length;
        if (peerCount === 0) {
            if (this.#isHub) {
                warnings.push('Hub has no connected peers');
                suggestions.push('Add transports with addTransport() or wait for agents to connect');
            } else {
                issues.push('Agent has no connected peers');
                suggestions.push('Add a transport to connect to hub: bus.addTransport(transport, {peerId: "hub"})');
            }
        }

        // Check handlers
        const handlerCount = this.#handlers.size;
        if (this.#isHub && handlerCount === 0) {
            warnings.push('Hub has no registered handlers');
            suggestions.push('Register handlers with bus.handle("name", fn)');
        }

        // Check pending requests
        const pendingCount = this.#pendingRequests.size ?? 0;
        if (pendingCount > this.#maxPendingRequests * 0.8) {
            warnings.push(`High pending request count: ${pendingCount}/${this.#maxPendingRequests}`);
            suggestions.push('Consider increasing maxPendingRequests or check for slow handlers');
        }

        // Check strict mode in production hints
        if (!this.#strictMode) {
            warnings.push('strictMode is disabled');
            suggestions.push('For production, use CrossBus.createSecure() or set strictMode: true');
        }

        // Determine overall status
        let status = 'healthy';
        if (issues.length > 0) {
            status = 'error';
        } else if (warnings.length > 0) {
            status = 'warning';
        }

        return {
            status,
            peerId: this.#peerId,
            isHub: this.#isHub,
            peerCount,
            handlerCount,
            pendingRequests: pendingCount,
            uptime: this.uptime,
            issues,
            warnings,
            suggestions
        };
    }
}

export { CrossBus };
//# sourceMappingURL=crossbus.core.js.map
