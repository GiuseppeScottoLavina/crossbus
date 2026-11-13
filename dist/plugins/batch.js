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
Object.freeze({
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

// Internal implementation, not a package export. Each UUID consumes 16 fresh
// bytes; the RFC version/variant bits are imposed only while formatting.
const ENTROPY_BYTES = 2048; // 128 UUIDs, below Web Crypto's 65,536-byte quota.

/**
 * Build an independent generator backed by the supplied cryptographic fill.
 * Refills publish only after success, so an entropy failure cannot expose
 * partially filled bytes or repeat an exhausted slice.
 * @param {(bytes: Uint8Array<ArrayBuffer>) => void} fill
 * @returns {() => string} A canonical lowercase UUID v4 generator.
 */
function createUuidPool(fill) {
    let bytes = new Uint8Array(0);
    let cursor = 0;
    /** @type {ReturnType<typeof flatFormatter>|undefined} */
    let format;
    return function uuidV4() {
        if (cursor === bytes.length) {
            const fresh = new Uint8Array(ENTROPY_BYTES);
            fill(fresh);
            if (!format) format = flatFormatter();
            bytes = fresh;
            cursor = 0;
        }
        const i = cursor;
        cursor += 16;
        return /** @type {ReturnType<typeof flatFormatter>} */(format)(bytes, i);
    };
}

/**
 * Format into a reusable ASCII buffer and return an owned, flat string.
 * Concatenating hexadecimal pairs creates string ropes which the native
 * structured clone must later flatten, moving allocation back into RPC sends.
 */
function flatFormatter() {
    const alphabet = '0123456789abcdef';
    const pairs = new Uint16Array(256);
    for (let n=0;n<256;n++) pairs[n]=(alphabet.charCodeAt(n>>4)<<8)|alphabet.charCodeAt(n&15);
    const ascii = new Uint8Array(36);
    ascii[8]=ascii[13]=ascii[18]=ascii[23]=45;
    const view = new DataView(ascii.buffer);
    /** @param {Uint8Array<ArrayBuffer>} bytes @param {number} i */
    return (bytes, i) => {
        view.setUint16(0,pairs[bytes[i]]);
        view.setUint16(2,pairs[bytes[i+1]]);
        view.setUint16(4,pairs[bytes[i+2]]);
        view.setUint16(6,pairs[bytes[i+3]]);
        view.setUint16(9,pairs[bytes[i+4]]);
        view.setUint16(11,pairs[bytes[i+5]]);
        view.setUint16(14,pairs[(bytes[i+6]&15)|64]);
        view.setUint16(16,pairs[bytes[i+7]]);
        view.setUint16(19,pairs[(bytes[i+8]&63)|128]);
        view.setUint16(21,pairs[bytes[i+9]]);
        view.setUint16(24,pairs[bytes[i+10]]);
        view.setUint16(26,pairs[bytes[i+11]]);
        view.setUint16(28,pairs[bytes[i+12]]);
        view.setUint16(30,pairs[bytes[i+13]]);
        view.setUint16(32,pairs[bytes[i+14]]);
        view.setUint16(34,pairs[bytes[i+15]]);
        // Fixed arguments avoid a per-ID iterable/array allocation. Constructing
        // from numeric code units cannot retain a larger parent string or rope.
        return String.fromCharCode(
            ascii[0],ascii[1],ascii[2],ascii[3],ascii[4],ascii[5],ascii[6],ascii[7],ascii[8],
            ascii[9],ascii[10],ascii[11],ascii[12],ascii[13],ascii[14],ascii[15],ascii[16],ascii[17],
            ascii[18],ascii[19],ascii[20],ascii[21],ascii[22],ascii[23],ascii[24],ascii[25],ascii[26],
            ascii[27],ascii[28],ascii[29],ascii[30],ascii[31],ascii[32],ascii[33],ascii[34],ascii[35]
        );
    };
}

// Capture native getters: public .buffer/.byteLength properties can be shadowed
// without changing which storage structured clone copies or transfers.
nativeGetter(Object.getPrototypeOf(Uint8Array.prototype), 'buffer');
nativeGetter(DataView.prototype, 'buffer');
nativeGetter(ArrayBuffer.prototype, 'byteLength');
const sharedConstructor = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : null;
sharedConstructor ? nativeGetter(sharedConstructor.prototype, 'byteLength') : null;

function nativeGetter(prototype, name) {
    const getter=Object.getOwnPropertyDescriptor(prototype,name)?.get;
    if(!getter)throw new TypeError('Required native buffer accessor is unavailable');
    return getter;
}

/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */


// Node and Bun already have fast native UUID backends. Browsers amortize the
// Web Crypto call while retaining fresh random bytes and the UUID v4 format.
const NATIVE_UUID_BACKEND = typeof process !== 'undefined' && typeof process.versions?.node === 'string';
const browserUuid = createUuidPool(bytes => { crypto.getRandomValues(bytes); });

/**
 * Generates a UUID v4.
 * Uses native cached UUIDs on Node/Bun and pooled Web Crypto bytes in browsers.
 * Retains manual generation only when neither Web Crypto primitive is present.
 *
 * @returns {string} UUID v4 string.
 */
function uuid() {
    if (typeof crypto !== 'undefined') {
        if (NATIVE_UUID_BACKEND && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        if (typeof crypto.getRandomValues === 'function') return browserUuid();
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * @fileoverview Message Batching plugin for CrossBus.
 * Collects messages and sends them in batches to reduce postMessage overhead.
 * @module plugins/batch
 */

/**
 * @typedef {Object} BatchOptions
 * @property {number} [windowMs=16] - Time window for batching (default: 1 frame @ 60fps)
 * @property {number} [maxBatchSize=100] - Maximum messages per batch
 * @property {boolean} [useRaf=true] - Use requestAnimationFrame for timing
 */

/**
 * Message Batcher for high-frequency messaging scenarios.
 *
 * Instead of sending each message immediately, this plugin:
 * 1. Queues messages for a short time window (default: 16ms / 1 frame)
 * 2. Sends all messages as a single batch
 * 3. Automatically unbatches on the receiving side
 *
 * Batching trades additional latency for fewer transport calls.
 * Measure the actual application workload before enabling it.
 *
 * @example
 * import { CrossBus } from 'crossbus';
 * import { withBatching } from 'crossbus/plugins/batch';
 *
 * const bus = new CrossBus({ peerId: 'sender' });
 * withBatching(bus, { windowMs: 16 });
 *
 * // These signals are grouped by the configured time window and maximum size
 * for (let i = 0; i < 100; i++) {
 *   bus.signal('telemetry', { value: i });
 * }
 */
class MessageBatcher {
    /** @type {number} */
    #windowMs;

    /** @type {number} */
    #maxBatchSize;

    /** @type {boolean} */
    #useRaf;

    /** @type {Map<string, Object[]>} Batches per peer */
    #batches = new Map();

    /** @type {ReturnType<typeof setTimeout>|number|null} */
    #flushTimer = null;

    /** @type {boolean} */
    #flushScheduled = false;

    /** @type {((batch: Object[]) => void)|null} */
    #sendFn = null;

    /** @type {number} */
    #batchesSent = 0;

    /** @type {number} */
    #messagesBatched = 0;

    /**
     * Creates a new MessageBatcher.
     *
     * @param {BatchOptions} [options={}]
     */
    constructor(options = {}) {
        this.#windowMs = options.windowMs ?? 16;
        this.#maxBatchSize = options.maxBatchSize ?? 100;
        this.#useRaf = options.useRaf ?? (typeof requestAnimationFrame !== 'undefined');
        if (!Number.isSafeInteger(this.#maxBatchSize) || this.#maxBatchSize <= 0 ||
            !Number.isFinite(this.#windowMs) || this.#windowMs < 0) throw new RangeError('Invalid batch limits');
    }

    /**
     * Queues a message for batching.
     *
     * @param {Object} message - Message to queue
     * @returns {boolean} True if message was queued
     */
    queue(message) {
        const key = 'default';  // Could be per-peer in future

        if (!this.#batches.has(key)) {
            this.#batches.set(key, []);
        }

        const batch = this.#batches.get(key);
        if (batch) {
            batch.push(message);
            this.#messagesBatched++;

            // Flush if batch is full
            if (batch.length >= this.#maxBatchSize) {
                this.#flushBatch(key);
            } else if (!this.#flushScheduled) {
                this.#scheduleFlush();
            }
        }

        return true;
    }

    /**
     * Sets the function to call when flushing batches.
     *
     * @param {(batch: Object[]) => void} fn
     */
    onFlush(fn) {
        this.#sendFn = fn;
    }

    /**
     * Manually flushes all pending batches.
     */
    flush() {
        for (const key of this.#batches.keys()) {
            this.#flushBatch(key);
        }
    }

    /**
     * Gets statistics.
     */
    get stats() {
        return {
            batchesSent: this.#batchesSent,
            messagesBatched: this.#messagesBatched,
            pendingMessages: this.#getPendingCount(),
            avgBatchSize: this.#batchesSent > 0
                ? Math.round(this.#messagesBatched / this.#batchesSent)
                : 0
        };
    }

    /**
     * Resets statistics.
     */
    resetStats() {
        this.#batchesSent = 0;
        this.#messagesBatched = 0;
    }

    /**
     * Destroys the batcher.
     */
    destroy() {
        if (this.#flushTimer !== null) {
            if (this.#useRaf && typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(/** @type {number} */(this.#flushTimer));
            } else {
                clearTimeout(/** @type {ReturnType<typeof setTimeout>} */(this.#flushTimer));
            }
        }
        this.#batches.clear();
        this.#sendFn = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    #scheduleFlush() {
        this.#flushScheduled = true;

        if (this.#useRaf && typeof requestAnimationFrame !== 'undefined') {
            this.#flushTimer = requestAnimationFrame(() => {
                this.#flushScheduled = false;
                this.flush();
            });
        } else {
            this.#flushTimer = setTimeout(() => {
                this.#flushScheduled = false;
                this.flush();
            }, this.#windowMs);
        }
    }

    #flushBatch(key) {
        const batch = this.#batches.get(key);
        if (!batch || batch.length === 0) return;

        if (this.#sendFn) {
            this.#sendFn(batch);
            this.#batchesSent++;
        }

        this.#batches.set(key, []);
    }

    #getPendingCount() {
        let count = 0;
        for (const batch of this.#batches.values()) {
            count += batch.length;
        }
        return count;
    }
}

/**
 * Batch envelope type marker.
 */
const BATCH_TYPE = '__crossbus_batch__';

/**
 * Wraps a CrossBus to batch outgoing signals.
 *
 * @param {import('../core/cross-bus.js').CrossBus} bus - CrossBus instance
 * @param {BatchOptions} [options={}]
 * @returns {import('../core/cross-bus.js').CrossBus} Same bus with batching installed
 *
 * @example
 * const bus = new CrossBus({ peerId: 'high-freq-sender' });
 * withBatching(bus, { windowMs: 16 });
 *
 * // Rapid signals are now batched
 * for (let i = 0; i < 1000; i++) {
 *   bus.signal('data', { n: i });
 * }
 */
function withBatching(bus, options = {}) {
    const batcher = new MessageBatcher(options);
    const originalSignal = bus.signal;
    const pending = new Set();
    batcher.onFlush(batch => {
        const items = batch.map(item => ({ event: item.event, data: item.data }));
        Promise.resolve().then(() => originalSignal.call(bus, BATCH_TYPE, { messages: items }))
            .then(result => { for (const item of batch) { pending.delete(item); item.resolve(result); } },
                error => { for (const item of batch) { pending.delete(item); item.reject(error); } });
    });
    const signal = (event, data, signalOptions = {}) => {
        if (bus.isDestroyed) return Promise.reject(new Error('Bus destroyed'));
        // Preserve per-call targeting and exclusions by sending these immediately.
        if (Object.keys(signalOptions).length || event === BATCH_TYPE) return originalSignal.call(bus, event, data, signalOptions);
        return new Promise((resolve, reject) => {
            const item = { event, data, resolve, reject };
            pending.add(item);
            batcher.queue(item);
        });
    };
    bus.signal = signal;
    const subscription = bus.on(BATCH_TYPE, async event => {
        const messages = event.data.payload?.messages;
        if (!Array.isArray(messages) || messages.length > (options.maxBatchSize ?? 100) ||
            messages.some(item => !item || typeof item.event !== 'string' || item.event === BATCH_TYPE)) {
            throw new Error('Invalid CrossBus batch');
        }
        for (const item of messages) {
            // Re-enter the normal inbound pipeline for each logical signal.
            await bus.handleMessage({ _cb: 1, id: uuid(), type: 'sig',
                payload: { name: item.event, data: item.data } }, event.source.origin, event.data.source);
        }
    }, { mode: 'sync' });
    bus.addCleanup(() => {
        batcher.destroy();
        subscription.unsubscribe();
        if (bus.signal === signal) bus.signal = originalSignal;
        for (const item of pending) item.reject(new Error('Bus destroyed'));
        pending.clear();
    });
    // @ts-ignore - public access to batch statistics/control
    bus._batcher = batcher;
    return bus;
}

/**
 * Creates a standalone batcher for custom use cases.
 *
 * @param {BatchOptions} options
 * @returns {MessageBatcher}
 */
function createBatcher(options = {}) {
    return new MessageBatcher(options);
}

export { BATCH_TYPE, MessageBatcher, createBatcher, withBatching };
//# sourceMappingURL=batch.js.map
