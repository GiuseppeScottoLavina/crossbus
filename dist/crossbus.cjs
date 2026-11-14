/*! CrossBus v0.1.5 | Apache-2.0 */
'use strict';

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
 * Checks if an error is a CrossBusError.
 *
 * @param {*} err - Value to check.
 * @returns {boolean}
 */
function isCrossBusError(err) {
    return err instanceof CrossBusError;
}

/**
 * Checks if an error is retryable.
 *
 * @param {Error} err - Error to check.
 * @returns {boolean}
 */
function isRetryable(err) {
    if (err instanceof CrossBusError) {
        return err.retryable;
    }
    return false;
}

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
const typedBuffer = nativeGetter(Object.getPrototypeOf(Uint8Array.prototype), 'buffer');
const dataBuffer = nativeGetter(DataView.prototype, 'buffer');
const arrayLength = nativeGetter(ArrayBuffer.prototype, 'byteLength');
const sharedConstructor = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : null;
const sharedLength = sharedConstructor ? nativeGetter(sharedConstructor.prototype, 'byteLength') : null;

function nativeGetter(prototype, name) {
    const getter=Object.getOwnPropertyDescriptor(prototype,name)?.get;
    if(!getter)throw new TypeError('Required native buffer accessor is unavailable');
    return getter;
}

/** @param {ArrayBufferView<ArrayBufferLike>} view @returns {ArrayBufferLike} */
function viewStorage(view) {
    if (view instanceof DataView) return dataBuffer.call(view);
    try { return typedBuffer.call(view); }
    catch { return dataBuffer.call(view); } // Cross-realm DataView.
}

/** @param {ArrayBufferLike} buffer @returns {number} Actual in-memory storage. */
function storageLength(buffer) {
    if (sharedConstructor && sharedLength && buffer instanceof sharedConstructor) return sharedLength.call(buffer);
    try { return arrayLength.call(buffer); }
    catch (error) {
        if (sharedLength) return sharedLength.call(buffer); // Cross-realm shared storage.
        throw error;
    }
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
 * Checks if data can be structured cloned.
 *
 * @param {*} data - Data to check.
 * @returns {boolean} True if cloneable.
 */
function isCloneable(data) {
    if (data === null || data === undefined) return true;

    const type = typeof data;

    // Primitives are always cloneable
    if (type === 'boolean' || type === 'number' || type === 'string') {
        return true;
    }

    // Functions and symbols are not cloneable
    if (type === 'function' || type === 'symbol') {
        return false;
    }

    // Check for DOM nodes
    if (typeof Node !== 'undefined' && data instanceof Node) {
        return false;
    }

    // Check for WeakMap/WeakSet
    if (data instanceof WeakMap || data instanceof WeakSet) {
        return false;
    }

    // For objects/arrays, we'd need to recursively check
    // For performance, we assume they're cloneable and let postMessage fail
    return true;
}

/**
 * Creates a deferred promise (Promise.withResolvers polyfill).
 * Uses native Promise.withResolvers() when available (ES2024+).
 *
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void}}
 */
function deferred() {
    // Use native Promise.withResolvers if available when supported
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
 * Creates a promise that resolves after a timeout.
 *
 * @param {number} ms - Timeout in milliseconds.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error('Aborted'));
            return;
        }

        const timeoutId = setTimeout(resolve, ms);

        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(signal.reason ?? new Error('Aborted'));
            }, { once: true });
        }
    });
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
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
}



/**
 * Detects the type of a peer target.
 *
 * @param {*} target - Target to check.
 * @returns {'iframe'|'worker'|'sw'|'window'|'port'|'unknown'}
 */
function detectPeerType(target) {
    // MessagePort
    if (target instanceof MessagePort) {
        return 'port';
    }

    // Worker
    if (typeof Worker !== 'undefined' && target instanceof Worker) {
        return 'worker';
    }

    // ServiceWorker
    if (typeof ServiceWorker !== 'undefined' && target instanceof ServiceWorker) {
        return 'sw';
    }

    // Window (iframe or popup)
    if (typeof Window !== 'undefined' && target instanceof Window) {
        return 'window';
    }

    // HTMLIFrameElement
    if (typeof HTMLIFrameElement !== 'undefined' && target instanceof HTMLIFrameElement) {
        return 'iframe';
    }

    // DedicatedWorkerGlobalScope (inside worker)
    if (typeof DedicatedWorkerGlobalScope !== 'undefined' &&
        target instanceof DedicatedWorkerGlobalScope) {
        return 'worker';
    }

    return 'unknown';
}



/**
 * Creates a frozen timestamp object.
 *
 * @returns {{timestamp: number, iso: string}}
 */
function timestamp() {
    const ts = Date.now();
    return Object.freeze({
        timestamp: ts,
        iso: new Date(ts).toISOString()
    });
}



/**
 * Conservative in-memory payload budget, not serialized wire size. Strings use
 * two bytes per UTF-16 code unit; each value/reference costs at least 8 bytes.
 * Supports cycles, binary views, Maps and Sets without JSON serialization.
 * @param {*} payload
 * @param {number} limit - Zero disables the budget.
 */
function assertPayloadSize(payload, limit) {
    if (limit === 0) return;
    // Scalar messages need no graph tracking or callback allocation.
    if (payload === null || typeof payload !== 'object') {
        const size = 8 + (typeof payload === 'string' ? payload.length * 2 : 0);
        if (size > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
        return;
    }
    measurePayload(payload, limit);
}

/**
 * Iterative graph traversal. Flat objects need neither a work list nor a seen
 * set; nested graphs allocate them lazily and cannot exhaust the JS call stack.
 * Every reference is charged, while each object's contents are charged once.
 * Binary views account for their complete backing storage, as structured clone
 * copies that storage even when the view covers only a small slice.
 * @param {object} root
 * @param {number} limit
 */
function measurePayload(root, limit) {
    let bytes = 8;
    let value = root;
    /** @type {Set<object>|null} */
    let seen = null;
    /** @type {object[]|null} */
    let pending = null;
    while (true) {
        if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) bytes += storageLength(value);
        else if (ArrayBuffer.isView(value)) bytes += storageLength(viewStorage(value));
        else if (typeof Blob !== 'undefined' && value instanceof Blob) bytes += value.size;
        else if (value instanceof Map) {
            for (const entry of value) for (const item of entry) {
                bytes += 8 + (typeof item === 'string' ? item.length * 2 : 0);
                if (bytes > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
                if (item !== null && typeof item === 'object') {
                    if (!seen || !pending) { seen = new Set([root]); pending = []; }
                    if (!seen.has(item)) { seen.add(item); pending.push(item); }
                }
            }
        } else if (value instanceof Set) {
            for (const item of value) {
                bytes += 8 + (typeof item === 'string' ? item.length * 2 : 0);
                if (bytes > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
                if (item !== null && typeof item === 'object') {
                    if (!seen || !pending) { seen = new Set([root]); pending = []; }
                    if (!seen.has(item)) { seen.add(item); pending.push(item); }
                }
            }
        } else for (const key in value) if (Object.hasOwn(value, key)) {
            bytes += 8 + key.length * 2;
            if (bytes > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
            const item = value[key];
            bytes += 8 + (typeof item === 'string' ? item.length * 2 : 0);
            if (bytes > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
            if (item !== null && typeof item === 'object') {
                if (!seen || !pending) { seen = new Set([root]); pending = []; }
                if (!seen.has(item)) { seen.add(item); pending.push(item); }
            }
        }
        if (bytes > limit) throw CrossBusError.from(ErrorCode.PAYLOAD_TOO_LARGE, { limit });
        if (!pending?.length) return;
        value = pending.pop();
    }
}

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
const FAST_ONLY = Symbol('fastOnly');

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
 * @property {Function} syncHandler - Raw payload callback for emitSync.
 * @property {Function|null} dispose - Subscription cleanup.
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
        this[FAST_ONLY] = Object.create(null);
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
            signal: options.signal ?? null,
            syncHandler: options.once ? data => {
                if (!subscription.active) return;
                this.#removeListener(name, id);
                return handler(data);
            } : handler,
            dispose: null
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
        this.#rebuildCache(name);

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

        const abortHandler = () => subscription.unsubscribe();
        entry.dispose = () => {
            active = false;
            entry.signal?.removeEventListener('abort', abortHandler);
        };
        // Handle AbortSignal
        if (entry.signal) {
            if (entry.signal.aborted) {
                // Already aborted, remove immediately
                this.#removeListener(name, id);
                active = false;
            } else {
                entry.signal.addEventListener('abort', abortHandler, { once: true });
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
     * @param {(data: any) => void} handler - Callback function.
     * @returns {Function} Unbind function (call to remove listener).
     *
     * @example
     * const off = emitter.onFast('tick', (data) => console.log(data));
     * off(); // Remove listener
     */
    onFast(name, handler) {
        const fast = (this[FAST_ONLY][name] ||= []);
        fast.push(handler);
        const cached = this[FAST_CACHE][name];
        if (!cached) this[FAST_CACHE][name] = fast;
        else if (cached !== fast) cached.push(handler);
        return () => this.offFast(name, handler);
    }

    /**
     * Ultra-fast listener removal for performance-critical paths.
     *
     * @param {string} name - Signal name.
     * @param {(data: any) => void} handler - Handler to remove.
     */
    offFast(name, handler) {
        const listeners = this[LISTENERS].get(name);
        if (listeners?.some(entry => entry.handler === handler)) {
            this.off(name, handler);
            return;
        }
        const fast = this[FAST_ONLY][name];
        if (!fast) return;
        const remaining = fast.filter(callback => callback !== handler);
        // Keep the empty array for reuse, as in the nano emitter. off(name)
        // and clear() remove the event key when the application retires it.
        this[FAST_ONLY][name] = remaining;
        if (listeners?.length) this.#rebuildCache(name);
        else this[FAST_CACHE][name] = remaining;
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

        const listeners = this[LISTENERS].get(name) ?? [];
        const fast = this[FAST_ONLY][name] ?? [];
        const removed = listeners.filter(entry => handler === undefined || entry.handler === handler);
        for (const entry of removed) entry.dispose?.();
        const remaining = listeners.filter(entry => !removed.includes(entry));
        const remainingFast = handler === undefined ? [] : fast.filter(fn => fn !== handler);
        if (remaining.length) this[LISTENERS].set(name, remaining);
        else this[LISTENERS].delete(name);
        if (remainingFast.length) this[FAST_ONLY][name] = remainingFast;
        else delete this[FAST_ONLY][name];
        this.#rebuildCache(name);
        const removedCount = removed.length + fast.length - remainingFast.length;
        return { success: removedCount > 0, removedCount, remainingCount: remaining.length + remainingFast.length };
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
     * emitter.emitSync('tick', { x: 100, y: 200 });
     */
    emitSync(name, data) {
        // Ultra-fast path: use Object-based cache
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
        const colon = name.indexOf(':');
        const hasWildcard = this[LISTENERS].has('*') ||
            (colon > 0 && this[LISTENERS].has(name.slice(0, colon + 1) + '*'));

        if (!exactListeners?.length && !hasWildcard) return 0;
        if (exactListeners?.length === 1 && !hasWildcard && !source) {
            const entry = exactListeners[0];
            const event = {
                name,
                data,
                messageId: uuid(),
                timestamp: Date.now(),
                source: DEFAULT_SOURCE
            };

            if (entry.once) this.#removeListener(name, entry.id);
            try {
                if (entry.mode === 'sync') {
                    await entry.handler(event);
                } else {
                    Promise.resolve().then(() => entry.handler(event))
                        .catch(error => console.error(`[CrossBus] Handler error for "${name}":`, error));
                }
            } catch (error) {
                console.error(`[CrossBus] Handler error for "${name}":`, error);
            }

            return 1;
        }

        // Full path: multiple listeners or wildcards
        const event = {
            name,
            data,
            messageId: uuid(),
            timestamp: Date.now(),
            source: source ? { ...DEFAULT_SOURCE, ...source } : DEFAULT_SOURCE
        };

        // Collect matching listeners
        const matchingEntries = this.#getMatchingListeners(name);

        for (const { signalName, entry } of matchingEntries) {
            if (entry.once) this.#removeListener(signalName, entry.id);
        }

        // Invoke handlers
        for (const { entry } of matchingEntries) {
            try {
                if (entry.mode === 'sync') {
                    await entry.handler(event);
                } else {
                    // Fire async without blocking
                    Promise.resolve().then(() => entry.handler(event))
                        .catch(error => console.error(`[CrossBus] Handler error for "${name}":`, error));
                }
            } catch (error) {
                // Log but don't throw - other listeners should still run
                console.error(`[CrossBus] Handler error for "${name}":`, error);
            }

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
        return (listeners?.length ?? 0) + (this[FAST_ONLY][name]?.length ?? 0) > 0;
    }

    /**
     * Gets the count of listeners for a signal.
     *
     * @param {string} name - Signal name (exact match only).
     * @returns {number} Number of listeners.
     */
    listenerCount(name) {
        return (this[LISTENERS].get(name)?.length ?? 0) + (this[FAST_ONLY][name]?.length ?? 0);
    }

    /**
     * Gets all registered signal names.
     *
     * @returns {string[]} Array of signal names.
     */
    getSignalNames() {
        return [...new Set([...this[LISTENERS].keys(), ...Object.keys(this[FAST_ONLY]).filter(name => this[FAST_ONLY][name].length)])];
    }

    /**
     * Removes all listeners.
     */
    clear() {
        for (const listeners of this[LISTENERS].values()) for (const entry of listeners) entry.dispose?.();
        this[LISTENERS].clear();
        this[FAST_ONLY] = Object.create(null);
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
        ].filter(Boolean).filter((source, index, all) =>
            all.findIndex(candidate => candidate.signalName === source.signalName) === index);

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

        const entry = listeners.find(entry => entry.id === id);
        entry?.dispose?.();
        const filtered = listeners.filter(entry => entry.id !== id);
        if (filtered.length) this[LISTENERS].set(name, filtered);
        else this[LISTENERS].delete(name);
        this.#rebuildCache(name);
    }

    /** @param {string} name */
    #rebuildCache(name) {
        const listeners = this[LISTENERS].get(name) ?? [];
        const fast = this[FAST_ONLY][name] ?? [];
        const callbacks = [...listeners.map(entry => entry.syncHandler), ...fast];
        if (callbacks.length) this[FAST_CACHE][name] = callbacks;
        else delete this[FAST_CACHE][name];
    }

}

/**
 * Creates a minimal synchronous plain object emitter.
 *
 * Unlike EventEmitter class, this is a minimal plain object with:
 * - No class overhead
 * - No Symbol lookups
 * - No validation
 * - Direct property access
 *
 * @returns {Object} Fast emitter with on(), emit() methods
 *
 * @example
 * const emitter = createFastEmitter();
 * const off = emitter.on('event', (data) => console.log(data));
 * emitter.emit('event', { value: 42 });
 * off(); // Remove listener
 */
const createFastEmitter = () => ({
    events: Object.create(null),

    /**
     * Subscribe to an event. Returns unbind function.
     * @param {string} event - Event name
     * @param {(data: any) => void} cb - Callback function
     * @returns {Function} Unbind function
     */
    on(event, cb) {
        (this.events[event] ||= []).push(cb);
        return () => {
            this.events[event] = this.events[event]?.filter(i => cb !== i);
        };
    },

    /**
     * Emit an event to all listeners.
     * @param {string} event - Event name
     * @param {*} data - Data to pass to listeners
     */
    emit(event, data) {
        const c = this.events[event];
        if (!c) return;
        const len = c.length;
        // Unrolled for 1-4 (most common)
        if (len === 1) { c[0](data); return; }
        if (len === 2) { c[0](data); c[1](data); return; }
        if (len === 3) { c[0](data); c[1](data); c[2](data); return; }
        if (len === 4) { c[0](data); c[1](data); c[2](data); c[3](data); return; }
        // Loop for 5+
        for (let i = 0; i < len; i++) c[i](data);
    },

    /**
     * Remove all listeners for an event or all events.
     * @param {string} [event] - Event name (omit to clear all)
     */
    off(event) {
        if (event !== undefined) {
            delete this.events[event];
        } else {
            this.events = Object.create(null);
        }
    }
});

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
 * Peer type (transport mechanism).
 * @readonly
 * @enum {string}
 */
const PeerType = Object.freeze({
    IFRAME: 'iframe',
    WORKER: 'worker',
    SERVICE_WORKER: 'sw',
    WINDOW: 'window',
    PORT: 'port'
});

/**
 * Delivery status for emit results.
 * @readonly
 * @enum {string}
 */
const DeliveryStatus = Object.freeze({
    /** Delivered to local listeners only */
    LOCAL: 'local',
    /** Sent to peer (no ACK requested) */
    SENT: 'sent',
    /** Sent and ACK received */
    ACKED: 'acked',
    /** Queued for offline peer */
    QUEUED: 'queued',
    /** ACK timeout */
    TIMEOUT: 'timeout',
    /** Delivery failed */
    FAILED: 'failed'
});

/**
 * Checks if an object is a valid CrossBus message.
 *
 * @param {*} obj - Object to check.
 * @returns {boolean} True if valid protocol message.
 */
function isProtocolMessage(obj) {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        obj[PROTOCOL_MARKER] === PROTOCOL_VERSION &&
        typeof obj.id === 'string' &&
        (typeof obj.type === 'string' || typeof obj.t === 'string')
    );
}

/**
 * Checks if a value is transferable.
 *
 * @param {*} value - Value to check.
 * @returns {boolean} True if transferable.
 */
function isTransferable(value) {
    if (value instanceof ArrayBuffer) return true;
    if (value instanceof MessagePort) return true;
    if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return true;
    if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) return true;
    if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return true;
    if (typeof WritableStream !== 'undefined' && value instanceof WritableStream) return true;
    if (typeof TransformStream !== 'undefined' && value instanceof TransformStream) return true;
    return false;
}

/**
 * Finds transferable objects without recursive calls or per-value result arrays.
 * Typed views transfer their actual same-realm backing ArrayBuffer. Node Buffers
 * keep copy semantics because their backing storage may belong to a shared slab.
 *
 * @param {*} value - Value to search.
 * @param {Set<Transferable>} [found] - Set to collect transferables.
 * @returns {Transferable[]} Array of transferables found.
 */
function findTransferables(value, found = new Set(), seen = new Set()) {
    const pending = [[value].values()];
    while(pending.length) {
        const entry = pending[pending.length-1].next();
        if(entry.done){pending.pop();continue;}
        const current = entry.value;
        if(current === null || typeof current !== 'object')continue;
        if(isTransferable(current)){found.add(current);continue;}
        if(seen.has(current))continue;
        seen.add(current);
        if(ArrayBuffer.isView(current)) {
            if(!(typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(current))) {
                const buffer = viewStorage(current);
                if(buffer instanceof ArrayBuffer)found.add(buffer);
            }
            // Structured clone ignores custom typed-view properties. Enumerating
            // indices is unnecessary and can detach data that is never sent.
            continue;
        }
        const values = current instanceof Map ? [...current.keys(), ...current.values()].values()
            : current instanceof Set ? current.values() : Object.values(current).values();
        pending.push(values);
    }
    return Array.from(found);
}

/** Shared immutable empty metadata for internally constructed envelopes. */
const EMPTY_MESSAGE_META = Object.freeze({});

const EMPTY_META = EMPTY_MESSAGE_META;
/**
 * Builds an envelope from a payload owned by the caller. Public createMessage
 * still copies caller-owned payload/meta objects before freezing them.
 * @param {MessageType} type
 * @param {Object} payload
 * @param {Object} meta
 * @param {string|null} id
 * @returns {ProtocolMessage}
 */
function envelope(type, payload, meta, id) {
  const message = Object.freeze({
    [PROTOCOL_MARKER]: PROTOCOL_VERSION,
    version: PROTOCOL_VERSION,
    id: id || uuid(),
    type,
    timestamp: Date.now(),
    payload: Object.freeze(payload),
    meta
  });
  return message;
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
  return envelope(MessageType.SIGNAL, {
    name,
    data,
    source: sourcePeerId,
    dest: destPeerId
  }, EMPTY_META, null);
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
  return envelope(MessageType.REQUEST, {
    name,
    data,
    source: sourcePeerId,
    dest: destPeerId
  }, EMPTY_META, id);
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
  return envelope(MessageType.RESPONSE, {
    requestId,
    data,
    source: sourcePeerId,
    success,
    error
  }, EMPTY_META, null);
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
 * - Object-based cache for fast peer lookup
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
     * @param {(message: any) => void} sendFn - Function to send messages to peer.
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
        // Fast Object-based lookup
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

        if (target !== undefined && target !== null) {
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
                // Standard protocol envelopes already carry identity and metadata.
                // Avoid nesting and allocating another envelope for every peer.
                const envelope = payload?._cb === 1 ? payload : this.#createEnvelope(peerId, payload, MessageType.BROADCAST);
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
 * @property {ReturnType<typeof setTimeout>} timer - Timer at registration; pooled handles are scheduler-owned. Use tracker cancellation methods.
 * @property {Function} resolve - Promise resolve function.
 * @property {Function} reject - Promise reject function.
 * @property {*} [defaultValue] - Value to return on timeout.
 * @property {boolean} pooled - Whether the default deadline scheduler owns this request.
 * @property {number} deadline - Monotonic expiration time for a pooled request.
 * @property {PendingRequest|null} previous - Previous pooled request.
 * @property {PendingRequest|null} next - Next pooled request.
 * @property {RequestOptions} options - Original timeout options.
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
    /** @type {Map<string, PendingRequest>} Authoritative request storage */
    #pending = new Map();

    /** @type {number} */
    #requestCounter = 0;

    /** @type {number} Default timeout */
    #defaultTimeout;

    /** @type {number} Maximum pending requests */
    #maxPending;

    #coalesceTimeouts;
    /** @type {PendingRequest|null} */
    #head = null;
    /** @type {PendingRequest|null} */
    #tail = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #deadlineTimer = null;
    #expireDeadlines = () => {
        this.#deadlineTimer = null;
        try {
            const now = performance.now();
            while (this.#head && this.#head.deadline <= now) {
                const pending = this.#head;
                this.#pending.delete(pending.id);
                this.#release(pending);
                this.#expire(pending);
            }
        } finally {
            if (this.#head && this.#deadlineTimer === null) {
                this.#deadlineTimer = setTimeout(
                    this.#expireDeadlines,
                    Math.max(1, Math.ceil(this.#head.deadline - performance.now()))
                );
            }
        }
    };

    /**
     * Creates a new pending requests tracker.
     *
     * @param {Object} [options={}]
     * @param {number} [options.defaultTimeout=30000] - Default timeout in ms.
     * @param {number} [options.maxPending=1000] - Maximum pending requests (0 = unlimited).
     * @param {boolean} [options.coalesceTimeouts=false] - Share a timer for equal default deadlines; custom deadlines remain independent.
     */
    constructor(options = {}) {
        this.#defaultTimeout = options.defaultTimeout ?? 30000;
        this.#maxPending = options.maxPending ?? 1000;
        this.#coalesceTimeouts = options.coalesceTimeouts ?? false;
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
            timer: /** @type {ReturnType<typeof setTimeout>} */ (/** @type {unknown} */ (null)),
            resolve,
            reject,
            defaultValue: options.defaultValue,
            pooled:
                this.#coalesceTimeouts &&
                timeout === this.#defaultTimeout &&
                Number.isFinite(timeout) &&
                timeout >= 1 &&
                timeout <= 2147483647,
            deadline: 0,
            previous: null,
            next: null,
            options
        };
        if (pending.pooled) {
            pending.deadline = performance.now() + timeout;
            pending.previous = this.#tail;
            if (this.#tail) this.#tail.next = pending;
            else this.#head = pending;
            this.#tail = pending;
            if (this.#deadlineTimer === null)
                this.#deadlineTimer = setTimeout(
                    this.#expireDeadlines,
                    this.#head === pending
                        ? timeout
                        : Math.max(
                              1,
                              Math.ceil(
                                  (this.#head?.deadline ?? pending.deadline) - performance.now()
                              )
                          )
                );
            pending.timer = this.#deadlineTimer;
        } else {
            pending.timer = setTimeout(() => {
                if (this.#pending.delete(requestId)) this.#expire(pending);
            }, timeout);
        }
        this.#pending.set(requestId, pending);
        return { requestId, promise };
    }

    /** Release timer/list ownership in O(1), without retaining settled requests. */
    #release(pending) {
        if (!pending.pooled) {
            clearTimeout(pending.timer);
            return;
        }
        if (pending.previous) pending.previous.next = pending.next;
        else this.#head = pending.next;
        if (pending.next) pending.next.previous = pending.previous;
        else this.#tail = pending.previous;
        pending.previous = pending.next = null;
        if (!this.#head && this.#deadlineTimer !== null) {
            clearTimeout(this.#deadlineTimer);
            this.#deadlineTimer = null;
        }
    }

    #expire(pending) {
        try {
            if ('defaultValue' in pending.options) pending.resolve(pending.options.defaultValue);
            else
                pending.reject(
                    CrossBusError.from(ErrorCode.RESPONSE_TIMEOUT, {
                        requestId: pending.id,
                        targetPeer: pending.targetPeer,
                        handlerName: pending.handlerName,
                        timeout: pending.timeout
                    })
                );
        } catch (error) {
            pending.reject(error);
        }
    }

    /**
     * Resolves a pending request with response data.
     *
     * @param {string} requestId - Request ID to resolve.
     * @param {ResponseData} response - Response data.
     * @param {string} [targetPeer] - If supplied, require the response's bound peer.
     * @returns {boolean} True if request was found and resolved.
     */
    resolve(requestId, response, targetPeer) {
        const pending = this.#pending.get(requestId);
        if (!pending || (targetPeer !== undefined && pending.targetPeer !== targetPeer))
            return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);

        if (response.success) {
            pending.resolve(response.data);
        } else {
            const error = CrossBusError.from(response.error?.code ?? ErrorCode.HANDLER_ERROR, {
                requestId,
                targetPeer: pending.targetPeer,
                handlerName: pending.handlerName,
                originalError: response.error
            });
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
        const pending = this.#pending.get(requestId);
        if (!pending) return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);

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
        const pending = this.#pending.get(requestId);
        if (!pending) return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);
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
                this.#release(pending);
                this.#pending.delete(requestId);
                pending.reject(
                    CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                        peerId,
                        requestId
                    })
                );
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

        for (const pending of this.#pending.values()) {
            this.#release(pending);
            pending.reject(new Error('All requests cancelled'));
        }

        this.#pending.clear();
        return count;
    }

    /**
     * Checks if a request is pending.
     *
     * @param {string} requestId
     * @returns {boolean}
     */
    has(requestId) {
        // Query the authoritative request table
        return this.#pending.has(requestId);
    }

    /**
     * Gets a pending request.
     *
     * @param {string} requestId
     * @returns {PendingRequest|undefined}
     */
    get(requestId) {
        // Query the authoritative request table
        return this.#pending.get(requestId);
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
        for (const [_id, pending] of this.#pendingHandshakes) {
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
            return typeof this.#selfOrigin === 'string' && origin === this.#selfOrigin;
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
        this.#allowAll = false;
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
 * Creates an origin validator with common configurations.
 */
const OriginValidatorPresets = {
    /**
     * Same-origin only (most secure).
     * @returns {OriginValidator}
     */
    sameOrigin() {
        return new OriginValidator();
    },

    /**
     * Allow all origins (use with caution!).
     * @returns {OriginValidator}
     */
    allowAll() {
        return new OriginValidator({ allowAll: true });
    },

    /**
     * Allow specific domains.
     * @param {string[]} origins
     * @returns {OriginValidator}
     */
    fromList(origins) {
        return new OriginValidator({ allowed: origins });
    }
};

/**
 * @fileoverview CrossBus - Main facade for cross-context messaging.
 * Provides a unified API for inter-context communication.
 * @module core/cross-bus
 */


// A completed dispatch has no asynchronous work or per-message rejection chain.
const MESSAGE_HANDLED = Promise.resolve();

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
 * CrossBus coordinates channel-bound peers, signals and request/response.
 * Configure transport origin/source validation and an explicit bus allowlist.
 * addTransport() wires an existing endpoint; it does not negotiate a connection
 * or automatically forward requests to other peers. signal() sends remotely;
 * inherited emit() dispatches locally.
 *
 * @example
 * const bus = CrossBus.createSecure({
 *   peerId: 'app', allowedOrigins: ['https://widget.example.com']
 * });
 * bus.handle('getData', ({ id }) => ({ id, status: 'ready' }));
 * // Attach an initialized transport with bus.addTransport(...).
 * const result = await bus.request('widget', 'getStatus');
 * bus.destroy();
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

    /** @type {Map<string, Function>} Owns each handler registration cleanup. */
    #handlerUnregister = new Map();

    /** @type {boolean} */
    #debug = false;

    /** @type {string} */
    #debugPrefix = '[CrossBus]';

    /** @type {number} */
    #createdAt;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {Set<Function>} */
    #cleanups = new Set();

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
        this.#capabilities = [...(options.capabilities ?? [])];
        this.#requestTimeout = options.requestTimeout ?? 30000;

        if (options.strictMode && options.allowedOrigins?.some(origin => origin.includes('*'))) {
            throw new Error('strictMode: wildcard origins are not allowed');
        }
        for (const limit of [options.maxPayloadSize, options.maxPendingRequests]) {
            if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) throw new RangeError('Resource limits must be nonnegative safe integers');
        }
        // Initialize components
        this.#router = new MessageRouter();
        this.#pendingRequests = new PendingRequests({
            defaultTimeout: this.#requestTimeout,
            maxPending: options.maxPendingRequests ?? 100,
            coalesceTimeouts: true
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
        const transformedPayload = this.#outboundHooks.length
            ? await this.#runHooks(this.#outboundHooks, payload, { type: 'signal', direction: 'outbound' })
            : this.#checkedPayload(payload);

        const message = createSignalMessage(
            signalName,
            transformedPayload,
            this.#peerId
        );

        const result = this.#router.broadcast(message, options);

        if (this.#debug) this.#log('out', `SIGNAL "${signalName}" to ${result.delivered} peers`);

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
    request(peerId, handlerName, payload, options = {}) {
        try {
            this.#assertNotDestroyed();
            if (this.#debug) this.#log('out', `REQUEST "${handlerName}" to ${peerId}`);
            if (!this.#router.getPeer(peerId)) {
                throw CrossBusError.from(ErrorCode.PEER_NOT_FOUND, { peerId });
            }
            // Return the owned pending promise directly on the common path.
            // Asynchronous hooks retain their ordering and rejection semantics.
            if (this.#outboundHooks.length) {
                return this.#runHooks(this.#outboundHooks, payload,
                    { type: 'request', peerId, handlerName, direction: 'outbound' })
                    .then(transformed => this.#sendRequest(peerId, handlerName, transformed, options));
            }
            return this.#sendRequest(peerId, handlerName, this.#checkedPayload(payload), options);
        } catch (error) {
            // The public API always returns a Promise, including validation,
            // lifecycle and missing-peer failures.
            return Promise.reject(error);
        }
    }

    /**
     * Starts tracking only after outbound validation/hooks have succeeded.
     * @param {string} peerId
     * @param {string} handlerName
     * @param {*} transformedPayload
     * @param {RequestOptions} options
     * @returns {Promise<*>}
     */
    #sendRequest(peerId, handlerName, transformedPayload, options) {
        this.#assertNotDestroyed();
        const { requestId, promise } = this.#pendingRequests.create(
            peerId, handlerName, { timeout: options.timeout ?? this.#requestTimeout }
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
            this.#pendingRequests.reject(requestId, CrossBusError.from(ErrorCode.SEND_FAILED, { peerId }));
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
        this.#assertNotDestroyed();
        if (typeof handlerName !== 'string' || typeof handler !== 'function') throw new TypeError('Handler name and function required');
        if (this.#handlers.has(handlerName)) {
            throw CrossBusError.from(ErrorCode.HANDLER_EXISTS, { handlerName });
        }

        // Store handler options for security checks
        if (options.allowedPeers || options.rateLimit || options.validatePayload) {
            this.#handlerOptions.set(handlerName, options);
        }

        this.#handlers.set(handlerName, handler);

        const unregister = () => this.#handlerUnregister.get(handlerName) === unregister
            ? this.unhandle(handlerName) : false;
        this.#handlerUnregister.set(handlerName, unregister);
        return unregister;
    }

    /**
     * Removes a handler.
     *
     * @param {string} handlerName
     * @returns {boolean} True if handler was removed.
     */
    unhandle(handlerName) {
        this.#handlerUnregister.delete(handlerName);
        this.#handlerOptions.delete(handlerName);
        for (const key of this.#rateLimitCounters.keys()) {
            if (JSON.parse(key)[0] === handlerName) this.#rateLimitCounters.delete(key);
        }
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
     * @param {(message: any) => void} sendFn - Function to send messages.
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

        const peerId = options.peerId ?? transport.peerId ?? `transport-${uuid()}`;
        const origin = options.origin ?? '*';

        this.addPeer(peerId, (message) => transport.send(message), options);
        if (typeof transport.onMessage === 'function') {
            transport.onMessage((message, source) => {
                // Window transports provide the actual event origin. Explicit
                // origin is the trust label for originless channels/native hosts.
                const actualOrigin = source?.origin || origin;
                const pending = this.handleMessage(message, actualOrigin, peerId);
                if (pending !== MESSAGE_HANDLED) pending.catch(error => console.error('[CrossBus] Incoming message rejected:', error));
            });
        }
        const cleanup = () => {
            if (!this.#cleanups.delete(cleanup)) return;
            transport.offMessage?.();
            this.removePeer(peerId);
            transport.destroy?.();
        };
        this.#cleanups.add(cleanup);
        return cleanup;
    }

    /**
     * Registers synchronous resource cleanup for bus destruction.
     * @param {Function} cleanup
     * @returns {() => boolean} Removes the registration without running it.
     */
    addCleanup(cleanup) {
        this.#assertNotDestroyed();
        if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function');
        this.#cleanups.add(cleanup);
        return () => this.#cleanups.delete(cleanup);
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
    handleMessage(message, origin, peerId, replyFn) {
        try { return this.#receiveMessage(message, origin, peerId, replyFn); }
        catch (error) { return Promise.reject(error); }
    }

    #receiveMessage(message, origin, peerId, replyFn) {
        if (this.#destroyed) return MESSAGE_HANDLED;

        // Validate origin
        if (!this.#originValidator.isAllowed(origin)) {
            console.warn(`[CrossBus] Blocked message from unauthorized origin: ${origin}`);
            return MESSAGE_HANDLED;
        }

        if (!message || typeof message !== 'object') return MESSAGE_HANDLED;
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

        if (this.#inboundHooks.length) {
            return this.#runHooks(this.#inboundHooks, dataContent, {
                type: msgType === MessageType.SIGNAL || msgType === MessageType.BROADCAST ? 'signal' :
                    msgType === MessageType.REQUEST ? 'request' : 'response',
                peerId, handlerName: handlerOrName, direction: 'inbound'
            }).then(
                data => this.#dispatchMessage(message, msgType, handlerOrName, data, origin, peerId, replyFn),
                error => this.#rejectInbound(message, msgType, error, peerId, replyFn)
            );
        }
        try { dataContent = this.#checkedPayload(dataContent); }
        catch (error) { return this.#rejectInbound(message, msgType, error, peerId, replyFn); }
        return this.#dispatchMessage(message, msgType, handlerOrName, dataContent, origin, peerId, replyFn);
    }

    #rejectInbound(message, msgType, error, peerId, replyFn) {
        if (msgType !== MessageType.REQUEST) return Promise.reject(error);
        const response = createResponseMessage(message.id, null, this.#peerId, false, {
            code: error.code ?? ErrorCode.INVALID_PAYLOAD,
            message: error.message ?? 'Inbound hook rejected request'
        });
        if (replyFn) replyFn(response);
        else if (peerId !== undefined && peerId !== null) this.#router.route({ target: peerId, payload: response });
        return MESSAGE_HANDLED;
    }

    #dispatchMessage(message, msgType, handlerOrName, dataContent, origin, peerId, replyFn) {
        if (this.#destroyed) return MESSAGE_HANDLED;
        switch (msgType) {
            case MessageType.BROADCAST:  // Broadcast has same structure as signal
            case MessageType.SIGNAL:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid signal name type');
                    return MESSAGE_HANDLED;
                }
                return this.#handleSignal(handlerOrName, dataContent, peerId, origin);

            case MessageType.REQUEST:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid handler name type');
                    return MESSAGE_HANDLED;
                }
                // Pass normalized ID
                // const reqId = message.id ?? (message.payload ? message.payload.id : undefined);
                // Wait, 'id' is top level in ProtocolMessage AND legacy.

                return this.#handleRequest(message.id, handlerOrName, dataContent, peerId, replyFn);

            case MessageType.RESPONSE: {
                let success = message.success;
                let error = message.error;

                // Extract from ProtocolMessage payload if needed
                if (message.payload && message.payload.success !== undefined) {
                    success = message.payload.success;
                    error = message.payload.error;
                }

                // If legacy response structure inside payload?
                this.#handleResponse(message.payload?.requestId ?? message.id, success, dataContent, error, peerId);
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
        return MESSAGE_HANDLED;
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

        for (const cleanup of this.#cleanups) {
            try { cleanup(); } catch (error) { console.error('[CrossBus] Cleanup failed:', error); }
        }
        this.#cleanups.clear();
        this.#inboundHooks = [];
        this.#outboundHooks = [];
        this.#handlerOptions.clear();
        this.#handlerUnregister.clear();
        this.#rateLimitCounters.clear();
        // Cancel all pending requests
        this.#pendingRequests.cancelAll();

        // Clear handlers
        this.#handlers.clear();

        // Clear peers
        this.#router.clearPeers();

        // Select destruction listeners before retiring their subscriptions.
        this.emit('destroyed', {});
        this.clear();
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
    async #handleSignal(name, data, peerId, origin) {
        await this.emit(name, {
            payload: data,
            source: peerId
        }, { peerId, origin });
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
            if (securityCheck && !securityCheck.allowed) {
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
                    const transformedResult = this.#outboundHooks.length
                        ? await this.#runHooks(this.#outboundHooks, result, { type: 'response', peerId, handlerName, direction: 'outbound' })
                        : this.#checkedPayload(result);

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
        } else if (peerId !== undefined && peerId !== null) {
            this.#router.route({ target: peerId, payload: response });
        }
    }

    /**
     * Handles incoming response.
     *
     */
    #handleResponse(requestId, success, data, error, peerId) {
        if (peerId === undefined) return;
        this.#pendingRequests.resolve(requestId, {
            requestId,
            success,
            data,
            error
        }, peerId);
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
    /** @param {*} payload */
    #checkedPayload(payload) {
        assertPayloadSize(payload, this.#maxPayloadSize);
        return payload;
    }

    async #runHooks(hooks, payload, context) {
        let current = payload;
        if (hooks.length) assertPayloadSize(current, this.#maxPayloadSize);
        for (const { fn } of hooks) {
            current = await fn(current, context);
        }
        assertPayloadSize(current, this.#maxPayloadSize);
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
                'Browser messages default to the same origin; other transports need explicit origin labels.\n' +
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
     * @returns {{ allowed: boolean, error?: CrossBusError } | null}
     */
    #checkHandlerSecurity(handlerName, peerId, payload) {
        const options = this.#handlerOptions.get(handlerName);
        if (!options) {
            return null;
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
            const limitKey = JSON.stringify([handlerName, peerId]);
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

        if (options.allowedOrigins.some(origin => origin.includes('*'))) {
            throw new Error(
                'createSecure() does not allow wildcard origins. ' +
                'Specify exact origins: allowedOrigins: ["https://example.com"]'
            );
        }

        return new CrossBus({
            maxPayloadSize: 1024 * 1024,
            maxPendingRequests: 100,
            requestTimeout: 30000,
            ...options,
            strictMode: true
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

// Internal flow-control state. Credits acknowledge chunks pulled by the reader.
const FLOW_VERSION = 1;

function streamFailure(message, code = 'ERR_STREAM_CANCELLED') {
    return Object.assign(new Error(message), { code });
}

function positiveInteger(value, name, allowZero = false) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
        throw new RangeError(
            `${name} must be a ${allowZero ? 'nonnegative' : 'positive'} safe integer`
        );
    return value;
}

/** A single waiter/timer per writer, with cumulative acknowledgements. */
class StreamWindow {
    #ready = false;
    #started = false;
    #closing = false;
    #remoteEnded = false;
    #sent = 0;
    #acked = 0;
    #window;
    #timeout;
    /** @type {Error|null} */
    #error = null;
    /** @type {{resolve:Function,reject:Function,timer:ReturnType<typeof setTimeout>|null}|null} */
    #waiter = null;

    constructor(windowSize, timeout) {
        this.#window = positiveInteger(windowSize, 'windowSize');
        this.#timeout = positiveInteger(timeout, 'ackTimeout', true);
    }

    start() {
        this.#started = true;
    }
    close() {
        this.#closing = true;
    }
    sent() {
        this.#sent++;
    }
    get hasCredit() {
        return !this.#error && this.#ready && this.#sent - this.#acked < this.#window;
    }

    acknowledge(message) {
        if (
            !this.#started ||
            this.#error ||
            message.flow !== FLOW_VERSION ||
            !Number.isSafeInteger(message.seq) ||
            message.seq < 0 ||
            message.seq > this.#sent
        )
            return;
        let progress = false;
        if (message.ready === true && message.seq === 0 && !this.#ready) {
            this.#ready = true;
            progress = true;
        }
        if (!this.#ready) return;
        if (message.seq > this.#acked) {
            this.#acked = message.seq;
            progress = true;
        }
        if (
            message.ended === true &&
            this.#closing &&
            message.seq === this.#sent &&
            !this.#remoteEnded
        ) {
            this.#remoteEnded = true;
            progress = true;
        }
        if (progress && this.#waiter) {
            const waiter = this.#waiter;
            this.#waiter = null;
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.resolve();
        }
    }

    fail(error) {
        if (this.#error) return;
        this.#error = error instanceof Error ? error : new Error(String(error));
        const waiter = this.#waiter;
        this.#waiter = null;
        if (waiter) {
            if (waiter.timer) clearTimeout(waiter.timer);
            waiter.reject(this.#error);
        }
    }

    async ready() {
        while (!this.#ready) await this.#wait();
        this.#check();
    }
    async credit() {
        this.#check();
        while (this.#sent - this.#acked >= this.#window) await this.#wait();
        this.#check();
    }
    async ended() {
        while (!this.#remoteEnded) await this.#wait();
        this.#check();
    }
    #check() {
        if (this.#error) throw this.#error;
    }

    #wait() {
        this.#check();
        return new Promise((resolve, reject) => {
            const waiter = {
                resolve,
                reject,
                timer: /** @type {ReturnType<typeof setTimeout>|null} */ (null)
            };
            this.#waiter = waiter;
            if (this.#timeout)
                waiter.timer = setTimeout(() => {
                    this.fail(
                        streamFailure('Stream acknowledgement timed out', 'ERR_STREAM_TIMEOUT')
                    );
                }, this.#timeout);
        });
    }
}

/** Chunked streams with optional consumption acknowledgements and bounded readers. */

// Optional standard APIs; older engines keep the canonical btoa/atob path.
const nativeBase64Encode = /** @type {Uint8Array & {toBase64?:()=>string}} */ (Uint8Array.prototype)
    .toBase64;
const nativeBase64Decode =
    /** @type {typeof Uint8Array & {fromBase64?:(value:string)=>Uint8Array}} */ (Uint8Array)
        .fromBase64;

/**
 * @typedef {Object} StreamOptions
 * @property {number} [chunkSize=64000] - Raw binary bytes or UTF-16 code units per chunk.
 * @property {Object} [meta]
 * @property {boolean} [flowControl=false] - Require a compatible manager to acknowledge consumption.
 * @property {number} [windowSize=16] - Maximum unconsumed chunks with flow control.
 * @property {number} [ackTimeout=30000] - Maximum wait without acknowledgement progress; zero disables.
 * @property {number} [timeout=0] - Total lifetime from opening, in milliseconds; zero disables.
 * @property {AbortSignal} [signal]
 * @property {'base64'|'native'} [binaryEncoding='base64'] - Native requires structured clone.
 * @property {(error:Error|null)=>void} [onClose]
 */
class WritableSignalStream {
    #streamId = uuid();
    #name;
    #sendFn;
    #options;
    #seq = 0;
    #opened = false;
    #ended = false;
    #endRequested = false;
    /** @type {Error|null} */
    #failure = null;
    #tail = Promise.resolve();
    #cancelled = deferred();
    /** @type {Promise<void>|null} */
    #endPromise = null;
    /** @type {StreamWindow|null} */
    #window = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #timer = null;
    #abortListener = () => {
        void this.abort('Stream aborted by signal').catch(() => {});
    };

    /** @param {Function} sendFn @param {string} name @param {StreamOptions} [options] */
    constructor(sendFn, name, options = {}) {
        if (typeof sendFn !== 'function') throw new TypeError('sendFn must be a function');
        if (typeof name !== 'string' || !name) throw new TypeError('Stream name is required');
        this.#name = name;
        this.#sendFn = sendFn;
        this.#cancelled.promise.catch(() => {});
        this.#options = {
            ...options,
            chunkSize: positiveInteger(options.chunkSize ?? 64000, 'chunkSize'),
            timeout: positiveInteger(options.timeout ?? 0, 'timeout', true),
            binaryEncoding: options.binaryEncoding ?? 'base64'
        };
        if (!['base64', 'native'].includes(this.#options.binaryEncoding))
            throw new TypeError('Unknown binaryEncoding');
        if (options.flowControl)
            this.#window = new StreamWindow(options.windowSize ?? 16, options.ackTimeout ?? 30000);
        if (options.signal?.aborted) throw streamFailure('Stream aborted by signal');
        options.signal?.addEventListener('abort', this.#abortListener, { once: true });
    }
    get streamId() {
        return this.#streamId;
    }
    get name() {
        return this.#name;
    }
    get ended() {
        return this.#ended;
    }
    /** @param {Object} [meta] @returns {Promise<void>} */
    open(meta) {
        return this.#schedule(() => this.#open(meta));
    }
    async #open(meta) {
        if (this.#opened) return;
        this.#opened = true;
        this.#window?.start();
        if (this.#options.timeout)
            this.#timer = setTimeout(() => {
                this.#fail(streamFailure('Stream lifetime timed out', 'ERR_STREAM_TIMEOUT'));
                void this.#notifyError('Stream lifetime timed out');
            }, this.#options.timeout);
        /** @type {Object} */
        const payload = {
            st: this.#window ? 'open-flow' : 'open',
            name: this.#name,
            meta: { ...this.#options.meta, ...meta }
        };
        if (this.#window) payload.flow = FLOW_VERSION;
        await this.#send(payload);
        if (this.#window) await this.#window.ready();
    }
    /** Input remains caller-owned until this resolves. @param {string|ArrayBuffer|Uint8Array|Object} data */
    write(data) {
        if (this.#endRequested || this.#ended)
            return Promise.reject(this.#failure ?? new Error('Stream already ended'));
        return this.#schedule(async () => {
            if (!this.#opened) await this.#open();
            const size = this.#options.chunkSize;
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                for (let offset = 0; offset < bytes.length || offset === 0; offset += size) {
                    const chunk = bytes.subarray(offset, offset + size);
                    // Exact owned storage avoids repeatedly cloning the entire
                    // source allocation and permits application transfer lists.
                    await this.#data(
                        this.#options.binaryEncoding === 'native'
                            ? chunk.slice()
                            : encodeBase64(chunk),
                        this.#options.binaryEncoding !== 'native'
                    );
                }
            } else if (typeof data === 'string') {
                for (let offset = 0; offset < data.length; offset += size)
                    await this.#data(data.slice(offset, offset + size), false);
            } else {
                const encoded = JSON.stringify(data);
                if (typeof encoded !== 'string')
                    throw new TypeError('Stream data must be serializable');
                await this.#data(encoded, false);
            }
        });
    }
    #data(data, b64) {
        if (this.#window && !this.#window.hasCredit)
            return this.#window.credit().then(() => this.#data(data, b64));
        if (this.#failure) return Promise.reject(this.#failure);
        const seq = this.#seq++;
        this.#window?.sent();
        return this.#send({ st: 'data', seq, d: data, b64 });
    }
    /** Flow-controlled end waits until every chunk is pulled. @param {Object} [meta] */
    end(meta) {
        if (this.#endPromise) return this.#endPromise;
        if (this.#ended) return this.#failure ? Promise.reject(this.#failure) : Promise.resolve();
        this.#endRequested = true;
        this.#endPromise = this.#schedule(async () => {
            if (!this.#opened) await this.#open();
            this.#window?.close();
            await this.#send({ st: 'end', seq: this.#seq, meta });
            if (this.#window) await this.#window.ended();
            this.#finish(null);
        });
        return this.#endPromise;
    }
    /** @param {string} [reason] */
    async abort(reason = 'Stream aborted') {
        if (this.#ended) return;
        this.#fail(streamFailure(reason));
        void this.#notifyError(reason);
    }
    /** Bind only to the authenticated receiver, or use StreamManager. @param {Object} message */
    handleMessage(message) {
        if (message.sid !== this.#streamId || message.t !== 'stream' || this.#ended) return;
        if (message.st === 'error')
            this.#fail(
                streamFailure(
                    typeof message.reason === 'string' ? message.reason : 'Remote stream failed'
                )
            );
        else if (message.st === 'ack') this.#window?.acknowledge(message);
    }
    #schedule(operation) {
        const result = this.#tail.then(async () => {
            if (this.#failure) throw this.#failure;
            if (this.#ended) throw new Error('Stream already ended');
            try {
                await Promise.race([operation(), this.#cancelled.promise]);
            } catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                this.#fail(failure);
                void this.#notifyError(failure.message);
                throw error;
            }
        });
        this.#tail = result.catch(() => {});
        return result;
    }
    #fail(error) {
        if (this.#ended) return;
        this.#failure = error;
        this.#cancelled.reject(error);
        this.#window?.fail(error);
        this.#finish(error);
    }
    #finish(error) {
        if (this.#ended) return;
        this.#ended = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#options.signal?.removeEventListener('abort', this.#abortListener);
        this.#options.onClose?.(error);
    }
    async #notifyError(reason) {
        try {
            await this.#send({ st: 'error', reason });
        } catch {
            /* Already terminal locally. */
        }
    }
    async #send(payload) {
        if (this.#failure && payload.st !== 'error') throw this.#failure;
        await this.#sendFn(streamFrame(this.#streamId, payload));
    }
}

/**
 * @typedef {Object} ReadableStreamOptions
 * @property {number} [maxBufferedChunks=1024]
 * @property {number} [maxBufferedBytes=8388608] - Queued and reordered backing storage / UTF-16 estimate.
 * @property {number} [maxOutOfOrderChunks=64]
 * @property {number} [idleTimeout=0] - No accepted data or consumption progress; zero disables.
 * @property {boolean} [flowControl=false]
 * @property {(message:Object)=>void} [acknowledge] - Authenticated-channel control callback.
 * @property {(error:Error|null)=>void} [onClose]
 */
class ReadableSignalStream {
    #streamId;
    #name;
    #meta;
    #options;
    /** @type {any[]} */
    #buffer = [];
    /** @type {number[]} */
    #bufferSizes = [];
    #readIndex = 0;
    #expected = 0;
    #consumed = 0;
    #bufferedBytes = 0;
    #bufferedChunks = 0;
    #pending = new Map();
    /** @type {number|null} */
    #finalCount = null;
    #ended = false;
    #reading = false;
    #closed = false;
    /** @type {Error|null} */
    #error = null;
    /** @type {Function|null} */
    #resolveNext = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #timer = null;
    /** @param {string} streamId @param {string} name @param {Object} [meta] @param {ReadableStreamOptions} [options] */
    constructor(streamId, name, meta = {}, options = {}) {
        this.#streamId = streamId;
        this.#name = name;
        this.#meta = meta;
        this.#options = {
            ...options,
            maxBufferedChunks: positiveInteger(
                options.maxBufferedChunks ?? 1024,
                'maxBufferedChunks'
            ),
            maxBufferedBytes: positiveInteger(
                options.maxBufferedBytes ?? 8388608,
                'maxBufferedBytes'
            ),
            maxOutOfOrderChunks: positiveInteger(
                options.maxOutOfOrderChunks ?? 64,
                'maxOutOfOrderChunks',
                true
            ),
            idleTimeout: positiveInteger(options.idleTimeout ?? 0, 'idleTimeout', true)
        };
        this.#refresh();
    }
    get streamId() {
        return this.#streamId;
    }
    get name() {
        return this.#name;
    }
    get meta() {
        return this.#meta;
    }
    get ended() {
        return this.#ended;
    }
    get bufferedBytes() {
        return this.#bufferedBytes;
    }
    get bufferedChunks() {
        return this.#bufferedChunks;
    }
    /** Invalid input terminates and throws to a direct caller. @param {Object} message */
    push(message) {
        if (this.#ended) return;
        try {
            const seq = message.seq ?? (this.#options.flowControl ? NaN : this.#expected);
            if (!Number.isSafeInteger(seq) || seq < 0 || seq >= Number.MAX_SAFE_INTEGER)
                throw streamFailure('Invalid stream sequence', 'ERR_STREAM_SEQUENCE');
            if (seq < this.#expected || this.#pending.has(seq)) return;
            if (this.#finalCount !== null && seq >= this.#finalCount)
                throw streamFailure('Data exceeds declared stream end', 'ERR_STREAM_SEQUENCE');
            if (seq - this.#expected > this.#options.maxOutOfOrderChunks)
                throw streamFailure('Stream reorder window exceeded', 'ERR_STREAM_SEQUENCE');
            if (this.#bufferedChunks >= this.#options.maxBufferedChunks)
                throw streamFailure('Stream chunk buffer exceeded', 'ERR_STREAM_OVERFLOW');
            let data = message.d;
            if (message.b64) {
                if (typeof data !== 'string') throw new TypeError('Invalid base64 stream chunk');
                if (
                    data.length >
                    Math.ceil((this.#options.maxBufferedBytes - this.#bufferedBytes) / 3) * 4 + 4
                )
                    throw streamFailure('Stream byte buffer exceeded', 'ERR_STREAM_OVERFLOW');
                data = decodeBase64(data);
            }
            if (typeof data !== 'string' && !(data instanceof Uint8Array))
                throw new TypeError('Expected a string or Uint8Array chunk');
            const bytes = chunkBytes(data);
            if (bytes + this.#bufferedBytes > this.#options.maxBufferedBytes)
                throw streamFailure('Stream byte buffer exceeded', 'ERR_STREAM_OVERFLOW');
            this.#bufferedBytes += bytes;
            this.#bufferedChunks++;
            if (seq === this.#expected) {
                this.#buffer.push(data);
                this.#bufferSizes.push(bytes);
                this.#expected++;
                while (this.#pending.has(this.#expected)) {
                    const pending = this.#pending.get(this.#expected);
                    this.#buffer.push(pending.data);
                    this.#bufferSizes.push(pending.bytes);
                    this.#pending.delete(this.#expected++);
                }
            } else this.#pending.set(seq, { data, bytes });
            this.#refresh();
            this.#maybeEnd();
            this.#wake();
        } catch (error) {
            this.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
    /** @param {Object} [meta] @param {number} [finalCount] */
    end(meta, finalCount) {
        if (this.#ended) return;
        const count = finalCount ?? this.#expected;
        if (
            !Number.isSafeInteger(count) ||
            count < this.#expected ||
            (this.#pending.size && finalCount === undefined) ||
            [...this.#pending.keys()].some((seq) => seq >= count) ||
            (this.#finalCount !== null && this.#finalCount !== count)
        ) {
            this.error(streamFailure('Invalid final stream sequence', 'ERR_STREAM_SEQUENCE'));
            return;
        }
        this.#finalCount = count;
        if (meta) this.#meta = { ...this.#meta, ...meta };
        this.#maybeEnd();
        this.#wake();
    }
    /** @param {string|Error} reason */
    error(reason) {
        if (this.#error || (this.#closed && !this.#bufferedChunks)) return;
        this.#error = reason instanceof Error ? reason : new Error(reason);
        this.#ended = true;
        this.#buffer = [];
        this.#bufferSizes = [];
        this.#pending.clear();
        this.#readIndex = 0;
        this.#bufferedBytes = this.#bufferedChunks = 0;
        this.#wake();
        this.#close(this.#error);
    }
    /** @param {string} [reason] */
    cancel(reason = 'Stream reader cancelled') {
        this.error(streamFailure(reason));
    }
    /** Credit means pulled, not application processing completed. @returns {AsyncIterableIterator<any>} */
    async *[Symbol.asyncIterator]() {
        if (this.#reading) throw new Error('Stream already has a reader');
        this.#reading = true;
        try {
            while (true) {
                if (this.#error) throw this.#error;
                while (this.#readIndex < this.#buffer.length) {
                    if (this.#error) throw this.#error;
                    const chunk = this.#buffer[this.#readIndex],
                        bytes = this.#bufferSizes[this.#readIndex];
                    this.#buffer[this.#readIndex] = undefined;
                    this.#bufferSizes[this.#readIndex++] = 0;
                    this.#bufferedBytes -= bytes;
                    this.#bufferedChunks--;
                    this.#consumed++;
                    if (this.#readIndex >= 1024 && this.#readIndex * 2 >= this.#buffer.length) {
                        this.#buffer = this.#buffer.slice(this.#readIndex);
                        this.#bufferSizes = this.#bufferSizes.slice(this.#readIndex);
                        this.#readIndex = 0;
                    }
                    this.#refresh();
                    this.#acknowledge();
                    yield chunk;
                }
                this.#buffer.length = 0;
                this.#bufferSizes.length = 0;
                this.#readIndex = 0;
                if (this.#ended) {
                    if (this.#error) throw this.#error;
                    return;
                }
                await new Promise((resolve) => {
                    this.#resolveNext = resolve;
                });
            }
        } finally {
            this.#reading = false;
            if (!this.#ended || this.#bufferedChunks || this.#pending.size)
                this.cancel('Stream reader stopped before completion');
        }
    }
    /** Collection allocates the complete result; iterate for bounded processing. @returns {Promise<Uint8Array|string>} */
    async collect() {
        const chunks = [];
        let binary;
        for await (const chunk of this) {
            const kind = chunk instanceof Uint8Array;
            if (binary !== undefined && binary !== kind)
                throw new TypeError('Cannot collect mixed binary and text chunks');
            binary = kind;
            chunks.push(chunk);
        }
        if (!binary) return chunks.join('');
        const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
    #maybeEnd() {
        if (this.#finalCount !== null && this.#expected === this.#finalCount) {
            this.#ended = true;
            if (!this.#options.flowControl) this.#close(null);
            else this.#acknowledge();
        }
    }
    #acknowledge() {
        if (!this.#options.flowControl || this.#error) return;
        const complete = this.#ended && this.#consumed === this.#finalCount;
        this.#options.acknowledge?.({
            st: 'ack',
            seq: this.#consumed,
            ...(complete ? { ended: true } : {})
        });
        if (complete) this.#close(null);
    }
    #wake() {
        const resolve = this.#resolveNext;
        this.#resolveNext = null;
        resolve?.();
    }
    #close(error) {
        if (this.#closed) return;
        this.#closed = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#options.onClose?.(error);
    }
    #refresh() {
        if (this.#closed || !this.#options.idleTimeout) return;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(
            () => this.error(streamFailure('Stream idle timeout', 'ERR_STREAM_TIMEOUT')),
            this.#options.idleTimeout
        );
    }
}
function chunkBytes(data) {
    return typeof data === 'string' ? data.length * 2 : storageLength(viewStorage(data));
}
function encodeBase64(bytes) {
    if (typeof nativeBase64Encode === 'function') return nativeBase64Encode.call(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function decodeBase64(value) {
    if (typeof nativeBase64Decode === 'function') return nativeBase64Decode.call(Uint8Array, value);
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
function streamFrame(sid, payload) {
    return {
        [PROTOCOL_MARKER]: PROTOCOL_VERSION,
        id: `${sid}:${payload.st}:${payload.seq ?? 'control'}`,
        t: 'stream',
        sid,
        ...payload
    };
}

/** @typedef {Pick<ReadableStreamOptions,'maxBufferedChunks'|'maxBufferedBytes'|'maxOutOfOrderChunks'|'idleTimeout'> & {maxIncomingStreams?:number,maxOutgoingStreams?:number,maxControlBytes?:number}} StreamManagerOptions */
class StreamManager {
    #activeStreams = new Map();
    #outgoingStreams = new Map();
    #streamHandlers = new Map();
    #destroyed = false;
    #sendFn;
    #options;
    /** @param {Function} sendFn - (peerId,message)=>Promise on an authenticated channel. @param {StreamManagerOptions} [options] */
    constructor(sendFn, options = {}) {
        if (typeof sendFn !== 'function') throw new TypeError('sendFn must be a function');
        this.#sendFn = sendFn;
        this.#options = {
            maxIncomingStreams: positiveInteger(
                options.maxIncomingStreams ?? 100,
                'maxIncomingStreams'
            ),
            maxOutgoingStreams: positiveInteger(
                options.maxOutgoingStreams ?? 100,
                'maxOutgoingStreams'
            ),
            maxControlBytes: positiveInteger(options.maxControlBytes ?? 65536, 'maxControlBytes'),
            maxBufferedChunks: positiveInteger(
                options.maxBufferedChunks ?? 1024,
                'maxBufferedChunks'
            ),
            maxBufferedBytes: positiveInteger(
                options.maxBufferedBytes ?? 8388608,
                'maxBufferedBytes'
            ),
            maxOutOfOrderChunks: positiveInteger(
                options.maxOutOfOrderChunks ?? 64,
                'maxOutOfOrderChunks',
                true
            ),
            idleTimeout:
                options.idleTimeout === undefined
                    ? undefined
                    : positiveInteger(options.idleTimeout, 'idleTimeout', true)
        };
    }
    /** @param {string} name @param {string} peerId @param {StreamOptions} [options] */
    createStream(name, peerId, options = {}) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        if (typeof peerId !== 'string' || !peerId)
            throw new TypeError('Target peer ID is required');
        if (this.#outgoingStreams.size >= this.#options.maxOutgoingStreams)
            throw streamFailure('Outgoing stream limit exceeded', 'ERR_STREAM_OVERFLOW');
        const stream = new WritableSignalStream((message) => this.#send(peerId, message), name, {
            ...options,
            onClose: (error) => {
                this.#outgoingStreams.delete(stream.streamId);
                options.onClose?.(error);
            }
        });
        this.#outgoingStreams.set(stream.streamId, { peerId, stream });
        return stream;
    }
    /** @param {string} name @param {(stream:ReadableSignalStream)=>Promise<void>|void} handler */
    onStream(name, handler) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        if (typeof handler !== 'function') throw new TypeError('Stream handler must be a function');
        const registration = { handler };
        this.#streamHandlers.set(name, registration);
        return () =>
            this.#streamHandlers.get(name) === registration && this.#streamHandlers.delete(name);
    }
    /** peerId is the authenticated channel identity, never a payload field. @param {Object} message @param {string} peerId */
    handleMessage(message, peerId) {
        if (
            this.#destroyed ||
            !message ||
            message.t !== 'stream' ||
            typeof message.sid !== 'string' ||
            typeof peerId !== 'string'
        )
            return;
        const sid = message.sid;
        if (sid.length > 256) return;
        const outgoing = this.#outgoingStreams.get(sid);
        const active = this.#activeStreams.get(sid);
        if (message.st !== 'data') {
            try {
                assertPayloadSize(message, this.#options.maxControlBytes);
            } catch {
                const reason = 'Stream control payload exceeds budget';
                if (outgoing?.peerId === peerId)
                    outgoing.stream.handleMessage({ t: 'stream', sid, st: 'error', reason });
                if (active?.peerId === peerId) {
                    this.#activeStreams.delete(sid);
                    active.stream.error(reason);
                }
                // Never reflect malformed errors/ACKs and create a control loop.
                if (message.st !== 'error' && message.st !== 'ack')
                    this.#reject(peerId, sid, reason);
                return;
            }
        }
        if ((message.st === 'ack' || message.st === 'error') && outgoing?.peerId === peerId) {
            outgoing.stream.handleMessage(message);
            return;
        }
        if (message.st === 'open' || message.st === 'open-flow') {
            if (active || outgoing || typeof message.name !== 'string') return;
            if (this.#activeStreams.size >= this.#options.maxIncomingStreams) {
                this.#reject(peerId, sid, 'Incoming stream limit exceeded');
                return;
            }
            const handler = this.#streamHandlers.get(message.name)?.handler;
            if (!handler) {
                this.#reject(peerId, sid, 'No handler for stream');
                return;
            }
            const flow = message.st === 'open-flow';
            if (flow ? message.flow !== FLOW_VERSION : message.flow !== undefined) {
                this.#reject(peerId, sid, 'Unsupported stream flow version');
                return;
            }
            const stream = new ReadableSignalStream(sid, message.name, message.meta, {
                ...this.#options,
                flowControl: flow,
                idleTimeout: this.#options.idleTimeout ?? (flow ? 30000 : 0),
                acknowledge: (ack) => {
                    void this.#send(peerId, {
                        _cb: 1,
                        t: 'stream',
                        sid,
                        flow: FLOW_VERSION,
                        ...ack
                    }).catch((error) => stream.error(error));
                },
                onClose: (error) => {
                    if (this.#activeStreams.get(sid)?.stream !== stream) return;
                    this.#activeStreams.delete(sid);
                    if (error) this.#reject(peerId, sid, error.message);
                }
            });
            this.#activeStreams.set(sid, { peerId, stream });
            if (flow)
                void this.#send(peerId, {
                    _cb: 1,
                    t: 'stream',
                    sid,
                    flow: FLOW_VERSION,
                    st: 'ack',
                    seq: 0,
                    ready: true
                }).catch((error) => stream.error(error));
            try {
                Promise.resolve(handler(stream)).catch((error) =>
                    stream.error(error instanceof Error ? error : new Error(String(error)))
                );
            } catch (error) {
                stream.error(error instanceof Error ? error : new Error(String(error)));
            }
            return;
        }
        if (!active || active.peerId !== peerId) return;
        if (message.st === 'data') {
            try {
                active.stream.push(message);
            } catch {
                /* push already terminates and reports. */
            }
        } else if (message.st === 'end') active.stream.end(message.meta, message.seq);
        else if (message.st === 'error') {
            this.#activeStreams.delete(sid);
            active.stream.error(
                typeof message.reason === 'string' ? message.reason : 'Remote stream failed'
            );
        }
    }
    #reject(peerId, sid, reason) {
        void this.#send(peerId, { _cb: 1, t: 'stream', sid, st: 'error', reason }).catch(() => {});
    }
    async #send(peerId, message) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        await this.#sendFn(peerId, message.id ? message : streamFrame(message.sid, message));
    }
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        for (const { stream } of this.#activeStreams.values())
            stream.error('Stream manager destroyed');
        for (const { stream } of this.#outgoingStreams.values())
            void stream.abort('Stream manager destroyed').catch(() => {});
        this.#activeStreams.clear();
        this.#outgoingStreams.clear();
        this.#streamHandlers.clear();
    }
    get activeStreamCount() {
        return this.#activeStreams.size;
    }
    get outgoingStreamCount() {
        return this.#outgoingStreams.size;
    }
}

/**
 * @fileoverview Presence system for CrossBus.
 * Tracks online peers with heartbeat-based detection.
 * @module core/presence
 */


/**
 * @typedef {Object} PresenceOptions
 * @property {number} [heartbeatInterval=15000] - How often to send heartbeat (ms).
 * @property {number} [timeout=45000] - Time before peer considered offline (ms).
 * @property {boolean} [autoStart=true] - Start heartbeat automatically.
 */

/**
 * @typedef {Object} PeerPresence
 * @property {string} peerId - Peer identifier.
 * @property {'online' | 'away' | 'offline'} status - Current status.
 * @property {number} lastSeen - Timestamp of last activity.
 * @property {Object} [meta] - Optional metadata (user info, etc).
 */

/**
 * @typedef {'join' | 'leave' | 'update' | 'heartbeat'} PresenceEvent
 */

/**
 * Presence manager for tracking online peers.
 *
 * Emits events:
 * - 'join' - Peer came online
 * - 'leave' - Peer went offline
 * - 'update' - Peer presence updated
 *
 * @example
 * const presence = new PresenceManager(sendFn, { peerId: 'my-peer' });
 *
 * presence.on('join', (peerId, meta) => console.log(`${peerId} is online`));
 * presence.on('leave', (peerId) => console.log(`${peerId} went offline`));
 *
 * // Get all online peers
 * const online = presence.getOnlinePeers();
 *
 * // Update own status
 * presence.setStatus('away');
 *
 * // Cleanup
 * presence.destroy();
 */
class PresenceManager extends EventEmitter {
    /** @type {string} */
    #peerId;

    /** @type {Function} */
    #sendFn;

    /** @type {Map<string, PeerPresence>} */
    #peers = new Map();

    /** @type {number} */
    #heartbeatInterval;

    /** @type {number} */
    #timeout;

    /** @type {ReturnType<typeof setInterval>|null} */
    #heartbeatTimer = null;

    /** @type {ReturnType<typeof setInterval>|null} */
    #cleanupTimer = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {'online' | 'away' | 'offline'} */
    #status = 'online';

    /** @type {Object} */
    #meta = {};

    /**
     * Creates a PresenceManager.
     *
     * @param {Function} sendFn - Function to broadcast messages: (message) => Promise.
     * @param {{ peerId: string } & PresenceOptions} options - Options.
     */
    constructor(sendFn, options) {
        super();

        if (!options.peerId) {
            throw new Error('peerId is required');
        }

        this.#peerId = options.peerId;
        this.#sendFn = sendFn;
        this.#heartbeatInterval = options.heartbeatInterval ?? 15000;
        this.#timeout = options.timeout ?? 45000;

        if (options.autoStart !== false) {
            this.start();
        }
    }

    /**
     * Gets own peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#peerId;
    }

    /**
     * Gets own status.
     * @returns {'online' | 'away' | 'offline'}
     */
    get status() {
        return this.#status;
    }

    /**
     * Gets count of online peers.
     * @returns {number}
     */
    get onlineCount() {
        let count = 0;
        for (const peer of this.#peers.values()) {
            if (peer.status !== 'offline') count++;
        }
        return count;
    }

    /**
     * Starts the presence system.
     */
    start() {
        if (this.#destroyed) throw new Error('Presence manager destroyed');
        if (this.#heartbeatTimer) return;

        // Send initial presence
        this.#sendPresence('join');

        // Start heartbeat
        this.#heartbeatTimer = setInterval(() => {
            this.#sendPresence('heartbeat');
        }, this.#heartbeatInterval);

        // Start cleanup timer
        this.#cleanupTimer = setInterval(() => {
            this.#cleanupOfflinePeers();
        }, this.#heartbeatInterval);
    }

    /**
     * Stops the presence system.
     */
    stop() {
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;
        }

        if (this.#cleanupTimer) {
            clearInterval(this.#cleanupTimer);
            this.#cleanupTimer = null;
        }

        // Announce leaving
        this.#sendPresence('leave');
    }

    /**
     * Sets own presence status.
     *
     * @param {'online' | 'away' | 'offline'} status - New status.
     * @param {Object} [meta] - Optional metadata update.
     */
    setStatus(status, meta) {
        this.#status = status;
        if (meta) {
            this.#meta = { ...this.#meta, ...meta };
        }
        this.#sendPresence('update');
    }

    /**
     * Sets own metadata.
     *
     * @param {Object} meta - Metadata to merge.
     */
    setMeta(meta) {
        this.#meta = { ...this.#meta, ...meta };
        this.#sendPresence('update');
    }

    /**
     * Gets all online peer IDs.
     *
     * @returns {string[]}
     */
    getOnlinePeers() {
        const result = [];
        for (const [peerId, peer] of this.#peers) {
            if (peer.status !== 'offline') {
                result.push(peerId);
            }
        }
        return result;
    }

    /**
     * Gets all peer presences.
     *
     * @returns {PeerPresence[]}
     */
    getAllPeers() {
        return Array.from(this.#peers.values());
    }

    /**
     * Gets a specific peer's presence.
     *
     * @param {string} peerId - Peer ID.
     * @returns {PeerPresence | undefined}
     */
    getPeer(peerId) {
        return this.#peers.get(peerId);
    }

    /**
     * Checks if a peer is online.
     *
     * @param {string} peerId - Peer ID to check.
     * @returns {boolean}
     */
    isOnline(peerId) {
        const peer = this.#peers.get(peerId);
        return peer ? peer.status !== 'offline' : false;
    }

    /**
     * Handles incoming presence message.
     * Call this from CrossBus message handler.
     *
     * @param {Object} message - Presence message.
     * @param {string} fromPeerId - Source peer ID.
     */
    handleMessage(message, fromPeerId) {
        if (this.#destroyed || message.t !== 'presence') return;
        if (fromPeerId === this.#peerId) return; // Ignore own messages

        const { pt: presenceType, status, meta } = message;
        const now = Date.now();

        switch (presenceType) {
            case 'join':
                this.#handleJoin(fromPeerId, status, meta, now);
                // Respond with own presence so they know we're here
                this.#sendPresence('heartbeat');
                break;

            case 'leave':
                this.#handleLeave(fromPeerId);
                break;

            case 'heartbeat':
            case 'update':
                this.#handleUpdate(fromPeerId, status, meta, now);
                break;
        }
    }

    /**
     * Handles peer join.
     */
    #handleJoin(peerId, status, meta, now) {
        const isNew = !this.#peers.has(peerId);

        this.#peers.set(peerId, {
            peerId,
            status: status ?? 'online',
            lastSeen: now,
            meta: meta ?? {}
        });

        if (isNew) {
            this.emitSync('join', { peerId, meta });
        }
    }

    /**
     * Handles peer leave.
     */
    #handleLeave(peerId) {
        const peer = this.#peers.get(peerId);
        if (!peer) return;

        peer.status = 'offline';
        this.#peers.delete(peerId);
        this.emitSync('leave', { peerId });
    }

    /**
     * Handles presence update/heartbeat.
     */
    #handleUpdate(peerId, status, meta, now) {
        let peer = this.#peers.get(peerId);
        const wasOffline = !peer || peer.status === 'offline';

        if (!peer) {
            peer = {
                peerId,
                status: status ?? 'online',
                lastSeen: now,
                meta: meta ?? {}
            };
            this.#peers.set(peerId, peer);
        } else {
            peer.lastSeen = now;
            if (status) peer.status = status;
            if (meta) peer.meta = { ...peer.meta, ...meta };
        }

        if (wasOffline && peer.status !== 'offline') {
            this.emitSync('join', { peerId, meta: peer.meta });
        } else {
            this.emitSync('update', { peerId, peer });
        }
    }

    /**
     * Cleans up peers that haven't sent heartbeat.
     */
    #cleanupOfflinePeers() {
        const now = Date.now();
        const threshold = now - this.#timeout;

        for (const [peerId, peer] of this.#peers) {
            if (peer.lastSeen < threshold && peer.status !== 'offline') {
                peer.status = 'offline';
                this.#peers.delete(peerId);
                this.emitSync('leave', { peerId });
            }
        }
    }

    /**
     * Sends presence message.
     */
    async #sendPresence(type) {
        if (this.#destroyed) return;

        const message = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            t: 'presence',
            pt: type,
            peerId: this.#peerId,
            status: this.#status,
            meta: this.#meta,
            ts: Date.now()
        };

        try {
            await this.#sendFn(message);
        } catch (e) {
            console.error('[CrossBus] Failed to send presence:', e);
        }
    }

    /**
     * Destroys the presence manager.
     */
    destroy() {
        if (this.#destroyed) return;

        this.stop();
        this.#destroyed = true;
        this.#peers.clear();
        this.clear();
    }

    /**
     * Gets whether manager is destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }
}

/**
 * Creates a presence manager integrated with CrossBus.
 *
 * @param {import('./cross-bus.js').CrossBus} bus - CrossBus instance.
 * @param {PresenceOptions} [options] - Options.
 * @returns {PresenceManager}
 *
 * @example
 * const bus = new CrossBus({ peerId: 'my-peer' });
 * const presence = createPresence(bus);
 *
 * presence.on('join', (peerId) => console.log(`${peerId} joined`));
 */
function createPresence(bus, options = {}) {
    const sendFn = async (message) => {
        // Broadcast to all peers
        if (!bus.isDestroyed) await bus.signal('__presence__', message);
    };

    const presence = new PresenceManager(sendFn, {
        peerId: bus.peerId,
        ...options
    });

    // Register handler for presence messages
    const subscription = bus.on('__presence__', event => {
        presence.handleMessage(event.data.payload, event.data.source);
    }, { mode: 'sync' });
    const originalDestroy = presence.destroy.bind(presence);
    const unregister = bus.addCleanup(() => presence.destroy());
    presence.destroy = () => {
        subscription.unsubscribe();
        unregister();
        originalDestroy();
    };
    return presence;
}

/**
 * @fileoverview Serialization abstraction layer for CrossBus.
 * Uses JSON serialization for maximum compatibility.
 * @module common/serialization
 */

/**
 * @typedef {Object} Serializer
 * @property {string} contentType - MIME type of the serialization format.
 * @property {function(*): string} serialize - Encodes data.
 * @property {function(string): *} deserialize - Decodes data.
 */

/**
 * Standard JSON Serializer (Default).
 * Compatible with all browsers, native bridges (iOS/Android), and standard tooling.
 * @type {Serializer}
 */
const JSONSerializer = {
    contentType: 'application/json',
    serialize: (data) => JSON.stringify(data),
    deserialize: (data) => JSON.parse(/** @type {string} */(data))
};

/**
 * Registry of available serializers.
 * Extensible for future formats if needed.
 */
const serializers = new Map();
serializers.set(JSONSerializer.contentType, JSONSerializer);

/**
 * Gets a serializer by content type.
 * Defaults to JSON if not found.
 *
 * @param {string} contentType 
 * @returns {Serializer}
 */
function getSerializer(contentType) {
    return serializers.get(contentType) || JSONSerializer;
}

/**
 * @fileoverview PostMessage transport for iframes, popups, and workers.
 * Handles message serialization, origin validation, and bidirectional communication.
 * @module transports/postmessage
 */


/**
 * @typedef {Window|Worker|ServiceWorker|MessagePort} PostMessageTarget
 * Target that supports postMessage API.
 */

/**
 * @typedef {Object} PostMessageTransportOptions
 * @property {string} [targetOrigin='*'] - Expected origin for outgoing messages.
 * @property {string[]} [allowedOrigins=[]] - Allowed origins for incoming messages.
 *                                            Empty = same origin only.
 * @property {boolean} [autoTransfer=false] - Auto-detect and transfer transferable objects.
 * @property {string} [contentType='application/json'] - Serialization format.
 */

/**
 * @typedef {Object} MessageSource
 * @property {string} origin - Origin of the message.
 * @property {PostMessageTarget} source - The window/worker that sent the message.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageSource} source - Info about the message source.
 */

/**
 * PostMessage-based transport for cross-context communication.
 *
 * Supports:
 * - Window to Window (iframe, popup)
 * - Main thread to Worker
 * - Main thread to ServiceWorker
 *
 * @example
 * // Connect to iframe
 * const iframe = document.getElementById('widget');
 * const transport = new PostMessageTransport(iframe.contentWindow, {
 *   targetOrigin: 'https://widget.example.com',
 *   allowedOrigins: ['https://widget.example.com']
 * });
 *
 * transport.onMessage((msg, source) => {
 *   console.log('Received:', msg, 'from:', source.origin);
 * });
 *
 * transport.send({ type: 'greeting', payload: { hello: 'world' } });
 *
 * // Cleanup
 * transport.destroy();
 */
class PostMessageTransport {
    /** @type {PostMessageTarget|null} */
    #target = null;

    /** @type {string} */
    #targetOrigin;

    /** @type {Set<string>} */
    #allowedOrigins;

    /** @type {boolean} */
    #autoTransfer;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {Function|null} */
    #boundListener = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if PostMessage API is available.
     *
     * @returns {boolean} True if postMessage is supported.
     */
    static isSupported() {
        return typeof globalThis.postMessage === 'function' ||
            typeof Window !== 'undefined';
    }

    /**
     * Creates a new PostMessage transport.
     *
     * @param {PostMessageTarget} target - The window/worker to communicate with.
     * @param {PostMessageTransportOptions} [options={}] - Configuration options.
     * @throws {TypeError} If target is not a valid postMessage target.
     */
    constructor(target, options = {}) {
        if (!this.#isValidTarget(target)) {
            throw new TypeError('Target must support postMessage');
        }

        this.#target = target;
        this.#targetOrigin = options.targetOrigin ?? '*';
        this.#allowedOrigins = new Set(options.allowedOrigins ?? []);
        this.#autoTransfer = options.autoTransfer ?? false;
        this.#contentType = options.contentType ?? 'application/json';
        this.#serializer = getSerializer(this.#contentType);

        // Development security warning
        const isDev = typeof process !== 'undefined'
            ? process.env?.NODE_ENV !== 'production'
            : typeof window !== 'undefined' && window.location?.hostname === 'localhost';

        if (isDev && this.#targetOrigin === '*') {
            console.warn(
                '[CrossBus Security] ⚠️ targetOrigin: "*" broadcasts to ANY window.\n' +
                'This is INSECURE in production. Use specific origin:\n' +
                '  targetOrigin: "https://iframe-domain.com"\n' +
                'Suppress this warning with NODE_ENV=production'
            );
        }

        // Set up message listener
        this.#boundListener = this.#handleMessage.bind(this);
        this.#getListenerTarget().addEventListener('message', /** @type {EventListener} */(this.#boundListener));
    }

    /**
     * Sends a message to the target.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects to pass.
     * @throws {CrossBusError} If transport is destroyed or target is closed.
     *
     * @example
     * // Simple send
     * transport.send({ t: 'sig', id: '123', p: { data: 'value' } });
     *
     * // With transferable
     * const buffer = new ArrayBuffer(1024);
     * transport.send({ t: 'sig', id: '456', p: buffer }, [buffer]);
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'PostMessageTransport.send'
            });
        }

        // Check if window is closed
        if (this.#isWindowClosed()) {
            throw CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                reason: 'Target window is closed'
            });
        }

        // Ensure message has protocol marker
        // Protocol builders already supply the marker. These transports clone
        // synchronously, so an extra top-level object copy is unnecessary.
        const envelope = message[PROTOCOL_MARKER] === PROTOCOL_VERSION ? message : {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        // Serialize if needed
        // Note: PostMessage can handle objects natively. 
        // We only serialize if strictly requested (e.g. for consistency or size optimization)
        // OR if the serializer is NOT JSON.
        let dataToSend = envelope;
        if (this.#contentType !== 'application/json') {
            if (transfer?.length) throw new TypeError('Transfer lists require structured-clone PostMessage encoding');
            dataToSend = this.#serializer.serialize(envelope);
        }

        // Auto-detect transferables if enabled
        let transferables = transfer;
        if (this.#autoTransfer && !transfer && this.#contentType === 'application/json') {
            transferables = findTransferables(message);
            if (transferables.length === 0) {
                transferables = undefined;
            }
        }

        // Send based on target type
        if (this.#isWorker()) {
            // Workers don't need origin
            /** @type {Worker} */(this.#target).postMessage(dataToSend, /** @type {any} */(transferables));
        } else {
            // Windows need origin
            /** @type {Window} */(this.#target).postMessage(dataToSend, this.#targetOrigin, transferables);
        }
    }

    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     *
     * @example
     * transport.onMessage((msg, source) => {
     *   if (msg.t === 'req') {
     *     // Handle request
     *   }
     * });
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport, removing all listeners.
     * After destruction, send() will throw.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#boundListener) {
            this.#getListenerTarget().removeEventListener('message', /** @type {EventListener} */(this.#boundListener));
            this.#boundListener = null;
        }
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    /**
     * Gets the target origin.
     * @returns {string}
     */
    get targetOrigin() {
        return this.#targetOrigin;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming message events.
     *
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Get message data
        let data = event.data;

        if (typeof data === 'string') {
            // Authenticate the native event before spending work on JSON from
            // another context; payload fields never establish source/origin.
            if (event.origin && !this.#isOriginAllowed(event.origin)) return;
            if (this.#target && 'postMessage' in this.#target && !this.#isWorker() && event.source !== this.#target) return;
            try { data = this.#serializer.deserialize(data); }
            catch { return; }
        }

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Validate origin (skip for workers which don't have origin)
        if (event.origin && !this.#isOriginAllowed(event.origin)) {
            console.warn(`[CrossBus] Blocked message from unauthorized origin: ${event.origin}`);
            return;
        }

        // Validate source matches target (if target is a Window/MessagePort)
        // We can't strictly validate for Workers as event.source might be null or different in some contexts
        if (this.#target && 'postMessage' in this.#target && !this.#isWorker()) {
            if (event.source !== this.#target) return;
        }

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: event.origin ?? 'worker',
                source: /** @type {PostMessageTarget} */(/** @type {any} */(event.source ?? event.currentTarget))
            });
        } catch (error) {
            console.error('[CrossBus] Message handler error:', error);
        }
    }

    /**
     * Checks if an origin is allowed.
     *
     * @param {string} origin
     * @returns {boolean}
     */
    #isOriginAllowed(origin) {
        // If no origins specified, only allow same origin
        if (this.#allowedOrigins.size === 0) {
            return origin === globalThis.location?.origin;
        }

        // Check for wildcard
        if (this.#allowedOrigins.has('*')) {
            return true;
        }

        // Check exact match
        if (this.#allowedOrigins.has(origin)) {
            return true;
        }

        // Check wildcard pattern (e.g., https://*.example.com)
        for (const pattern of this.#allowedOrigins) {
            if (pattern.includes('*')) {
                // Use bounded quantifier to prevent ReDoS
                const regex = new RegExp('^' + pattern
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '[a-zA-Z0-9.-]{0,253}') + '$');
                if (regex.test(origin)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks if target is a valid postMessage target.
     *
     * @param {*} target
     * @returns {boolean}
     */
    #isValidTarget(target) {
        if (!target) return false;
        return typeof target.postMessage === 'function';
    }

    /**
     * Checks if target is a Worker or ServiceWorker.
     *
     * @returns {boolean}
     */
    #isWorker() {
        if (typeof Worker !== 'undefined' && this.#target instanceof Worker) {
            return true;
        }
        if (typeof ServiceWorker !== 'undefined' && this.#target instanceof ServiceWorker) {
            return true;
        }
        if (typeof MessagePort !== 'undefined' && this.#target instanceof MessagePort) {
            return true;
        }
        return false;
    }

    /**
     * Checks if the target window is closed.
     *
     * @returns {boolean}
     */
    #isWindowClosed() {
        if (this.#isWorker()) return false;
        return /** @type {Window} */(this.#target).closed === true;
    }

    /**
     * Gets the object to attach message listener to.
     * For workers, we listen on the worker itself.
     * For windows, we listen on the current window.
     *
     * @returns {EventTarget}
     */
    #getListenerTarget() {
        // If inside worker, listen on self
        if (typeof DedicatedWorkerGlobalScope !== 'undefined' &&
            globalThis instanceof DedicatedWorkerGlobalScope) {
            return globalThis;
        }

        // Main thread listening to worker - listen on worker
        if (this.#isWorker()) {
            return /** @type {EventTarget} */(/** @type {any} */(this.#target));
        }

        // Window communication - listen on current window
        if (typeof window !== 'undefined') {
            return window;
        }

        return globalThis;
    }
}

/**
 * @fileoverview BroadcastChannel transport for same-origin tab communication.
 * Uses the BroadcastChannel API for efficient pub/sub across browser contexts.
 * @module transports/broadcast-channel
 */


/**
 * @typedef {Object} BroadcastChannelTransportOptions
 * @property {string} [channelName='crossbus:default'] - Name of the broadcast channel.
 * @property {string} [contentType='application/json'] - Serialization format.
 */

/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'broadcast' for this transport.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */

/**
 * BroadcastChannel-based transport for same-origin communication.
 *
 * Perfect for:
 * - Multiple tabs of the same app
 * - Communication without opening connections
 * - Pub/sub pattern across contexts
 *
 * Limitations:
 * - Same-origin only (no cross-origin)
 * - No guaranteed delivery order
 * - No acknowledgments (fire-and-forget)
 *
 * @example
 * // Create transport
 * const transport = new BroadcastChannelTransport({
 *   channelName: 'myapp:events'
 * });
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received:', msg);
 * });
 *
 * // Send message (to all other tabs)
 * transport.send({ type: 'notification', payload: { text: 'Hello!' } });
 *
 * // Cleanup
 * transport.destroy();
 */
class BroadcastChannelTransport {
    /** @type {BroadcastChannel} */
    #channel;

    /** @type {string} */
    #channelName;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if BroadcastChannel API is available.
     *
     * @returns {boolean} True if BroadcastChannel is supported.
     */
    static isSupported() {
        return typeof BroadcastChannel !== 'undefined';
    }

    /**
     * Creates a new BroadcastChannel transport.
     *
     * @param {BroadcastChannelTransportOptions|string} [options={}] - Configuration.
     * @throws {CrossBusError} If BroadcastChannel is not supported.
     */
    constructor(options = {}) {
        if (typeof options === 'string') options = { channelName: options };
        if (!BroadcastChannelTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'BroadcastChannel'
            });
        }

        this.#channelName = options.channelName ?? 'crossbus:default';
        this.#channel = new BroadcastChannel(this.#channelName);
        this.#contentType = options.contentType ?? 'application/json';
        this.#serializer = getSerializer(this.#contentType);

        // Set up message handler
        this.#channel.onmessage = this.#handleMessage.bind(this);
        this.#channel.onmessageerror = this.#handleError.bind(this);
    }

    /**
     * Sends a message to all other tabs/windows.
     *
     * @param {Object} message - Protocol message to send.
     * @throws {CrossBusError} If transport is destroyed.
     *
     * @example
     * transport.send({
     *   t: 'broadcast',
     *   id: 'abc123',
     *   p: { event: 'user:login' }
     * });
     */
    send(message) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'BroadcastChannelTransport.send'
            });
        }

        // Ensure message has protocol marker
        // Protocol builders already supply the marker. These transports clone
        // synchronously, so an extra top-level object copy is unnecessary.
        const envelope = message[PROTOCOL_MARKER] === PROTOCOL_VERSION ? message : {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        let dataToSend = envelope;
        if (this.#contentType !== 'application/json') {
            dataToSend = this.#serializer.serialize(envelope);
        }

        this.#channel.postMessage(dataToSend);
    }

    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport, closing the channel.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#channel) {
            this.#channel.close();
            this.#channel = /** @type {any} */(null);
        }
    }

    /**
     * Gets the channel name.
     * @returns {string}
     */
    get channelName() {
        return this.#channelName;
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming message events.
     *
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Deserialize if binary (convert to string first)
        let data = event.data;
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            try {
                const text = new TextDecoder().decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
                data = JSONSerializer.deserialize(text);
            } catch (e) {
                console.warn('[CrossBus] Failed to deserialize binary message', e);
                return;
            }
        }

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: 'broadcast'
            });
        } catch (error) {
            console.error('[CrossBus] BroadcastChannel handler error:', error);
        }
    }

    /**
     * Handles message errors (e.g., deserialization failures).
     *
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] BroadcastChannel message error:', event);
    }
}

/** Optional MessageChannel encoding; public bus messages retain protocol v1 objects. */
const TAG = 'crossbus:compact:1';
// This tag specifically carries protocol v1, independently of future defaults.
const WIRE_PROTOCOL_VERSION = 1;
const ENVELOPE = ['_cb','version','id','type','timestamp','payload','meta'];
const CALL = ['name','data','source','dest'];
const REPLY = ['requestId','data','source','success','error'];
function exactFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== names.length) return false;
    for (const key of keys) if (!names.includes(key)) return false;
    return true;
}
/**
 * Encode only the standard envelope shapes. Extension fields, custom metadata,
 * other versions/types and nonstandard messages retain their original object.
 * @param {any} message
 * @returns {any}
 */
function encodeCompact(message) {
    if (!exactFields(message, ENVELOPE)) return message;
    const { _cb, version, id, type, timestamp, payload:p, meta } = message;
    if (_cb !== WIRE_PROTOCOL_VERSION || version !== WIRE_PROTOCOL_VERSION || typeof id !== 'string' || typeof timestamp !== 'number') return message;
    if (meta !== EMPTY_MESSAGE_META) {
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return message;
        const prototype = Object.getPrototypeOf(meta);
        if ((prototype !== null && prototype !== Object.prototype) || Object.keys(meta).length !== 0) return message;
    }
    if (type === MessageType.REQUEST || type === MessageType.SIGNAL) {
        if (!exactFields(p,CALL)) return message;
        const { name, data, source, dest } = p;
        if (typeof name !== 'string' || typeof source !== 'string' || (dest !== null && typeof dest !== 'string')) return message;
        return [TAG,type,id,timestamp,name,data,source,dest];
    }
    if (type === MessageType.RESPONSE) {
        if (!exactFields(p,REPLY)) return message;
        const { requestId, data, source, success, error } = p;
        if (typeof requestId !== 'string' || typeof source !== 'string' || typeof success !== 'boolean') return message;
        return [TAG,type,id,timestamp,requestId,data,source,success,error];
    }
    return message;
}
/** @param {any} packet @returns {any} Null means a malformed compact packet. */
function decodeCompact(packet) {
    if (!Array.isArray(packet) || packet[0] !== TAG) return packet;
    const [,type,id,timestamp,key,data,source] = packet;
    if (typeof id !== 'string' || typeof timestamp !== 'number' || typeof key !== 'string' || typeof source !== 'string') return null;
    let payload;
    if ((type === MessageType.REQUEST || type === MessageType.SIGNAL) && packet.length === 8) {
        if (packet[7] !== null && typeof packet[7] !== 'string') return null;
        payload = { name:key, data, source, dest:packet[7] };
    } else if (type === MessageType.RESPONSE && packet.length === 9 && typeof packet[7] === 'boolean') {
        payload = { requestId:key, data, source, success:packet[7], error:packet[8] };
    } else return null;
    return { _cb:WIRE_PROTOCOL_VERSION, version:WIRE_PROTOCOL_VERSION, id, type, timestamp, payload, meta:{} };
}

/**
 * @fileoverview MessageChannel transport for direct 1:1 peer communication.
 * Uses the MessageChannel API for efficient, low-latency communication.
 * @module transports/message-channel
 */


/**
 * @typedef {Object} MessageChannelTransportOptions
 * @property {boolean} [autoTransfer=false] - Auto-detect and transfer transferable objects.
 * @property {string} [contentType='application/json'] - Serialization format.
 * @property {'standard'|'compact'} [wireFormat='standard'] - Compact encoding requires a receiver supporting it (CrossBus 0.1.3+).
 */

/**
 * @typedef {Object} ChannelPair
 * @property {MessagePort} local - Local port (we listen on this).
 * @property {MessagePort} remote - Remote port (send this to other context).
 */

/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'channel' for this transport.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */

/**
 * MessageChannel-based transport for direct peer-to-peer communication.
 *
 * This transport creates a direct communication channel that bypasses
 * the hub routing, providing lower latency for high-frequency peer pairs.
 *
 * Use cases:
 * - Direct iframe ↔ worker communication
 * - High-frequency data streams
 * - Bypassing hub for performance
 *
 * @example
 * // On hub side: create channel and send to peer
 * const transport = new MessageChannelTransport();
 * iframe.contentWindow.postMessage(
 *   { type: 'channel', port: transport.remotePort },
 *   '*',
 *   [transport.remotePort]
 * );
 *
 * // On peer side: wrap received port
 * window.addEventListener('message', (e) => {
 *   if (e.data.type === 'channel') {
 *     const transport = MessageChannelTransport.fromPort(e.data.port);
 *     transport.onMessage((msg) => console.log('Received:', msg));
 *   }
 * });
 */
class MessageChannelTransport {
    /** @type {MessagePort} */
    #localPort;

    /** @type {MessagePort|null} */
    #remotePort;

    /** @type {boolean} */
    #autoTransfer;

    /** @type {'standard'|'compact'} */
    #wireFormat;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {boolean} */
    #isInitiator;

    /**
     * Checks if MessageChannel API is available.
     *
     * @returns {boolean} True if MessageChannel is supported.
     */
    static isSupported() {
        return typeof MessageChannel !== 'undefined';
    }

    /**
     * Creates a MessageChannelTransport from an existing port.
     * Use this when receiving a port from another context.
     *
     * @param {MessagePort} port - The received port.
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @returns {MessageChannelTransport}
     */
    static fromPort(port, options = {}) {
        if (!(port instanceof MessagePort)) {
            throw new TypeError('Port must be a MessagePort');
        }

        return new MessageChannelTransport(options, port);
    }

    /**
     * Creates a new MessageChannel transport (as initiator).
     * The remote port should be sent to the other context via postMessage.
     *
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @param {MessagePort|null} [port=null] - Internal existing-port construction. Prefer fromPort().
     * @throws {CrossBusError} If MessageChannel is not supported.
     */
    constructor(options = {}, port = null) {
        if (!MessageChannelTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'MessageChannel'
            });
        }

        this.#contentType = options.contentType ?? 'application/json';
        this.#wireFormat = options.wireFormat ?? 'standard';
        if (!['standard','compact'].includes(this.#wireFormat) || (this.#wireFormat === 'compact' && this.#contentType !== 'application/json')) {
            throw new TypeError('wireFormat must be standard, or compact with the default contentType');
        }

        const channel = port ? null : new MessageChannel();
        this.#localPort = port ?? /** @type {MessageChannel} */(channel).port1;
        this.#remotePort = channel?.port2 ?? null;
        this.#autoTransfer = options.autoTransfer ?? false;
        this.#serializer = getSerializer(this.#contentType);
        this.#isInitiator = port === null;

        // Set up message handler
        this.#localPort.onmessage = this.#handleMessage.bind(this);
        this.#localPort.onmessageerror = this.#handleError.bind(this);
    }

    /**
     * Gets the remote port to send to the other context.
     * This port can only be accessed once and becomes null after transfer.
     *
     * @returns {MessagePort|null} The remote port, or null if already transferred.
     */
    get remotePort() {
        return this.#remotePort;
    }

    /** Gets the selected outgoing wire encoding. Receivers accept both formats. */
    get wireFormat() { return this.#wireFormat; }

    /**
     * Marks the remote port as transferred (called automatically when used).
     */
    markRemoteTransferred() {
        this.#remotePort = null;
    }

    /**
     * Checks if this transport was created as the channel initiator.
     * @returns {boolean}
     */
    get isInitiator() {
        return this.#isInitiator;
    }

    /**
     * Sends a message to the connected peer.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects to pass.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'MessageChannelTransport.send'
            });
        }

        // Ensure message has protocol marker
        // Protocol builders already supply the marker. These transports clone
        // synchronously, so an extra top-level object copy is unnecessary.
        const envelope = message[PROTOCOL_MARKER] === PROTOCOL_VERSION ? message : {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        let dataToSend = this.#wireFormat === 'compact' ? encodeCompact(envelope) : envelope;
        if (this.#contentType !== 'application/json') {
            if (transfer?.length) throw new TypeError('Transfer lists require structured-clone MessageChannel encoding');
            dataToSend = this.#serializer.serialize(envelope);
        }

        // Auto-detect transferables if enabled
        let transferables = transfer;
        if (this.#autoTransfer && !transfer && this.#contentType === 'application/json') {
            transferables = findTransferables(message);
            if (transferables.length === 0) {
                transferables = undefined;
            }
        }

        this.#localPort.postMessage(dataToSend, /** @type {any} */(transferables));
    }

    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport, closing ports.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#localPort) {
            this.#localPort.close();
            this.#localPort = /** @type {any} */(null);
        }

        if (this.#remotePort) {
            this.#remotePort.close();
            this.#remotePort = null;
        }
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming message events.
     *
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Get message data
        let packet = event.data;
        // Non-default content types already use the JSON serializer fallback
        // when sending. Decode that wire representation before protocol checks.
        // Malformed/unrelated strings are not protocol messages.
        if (typeof packet === 'string') {
            try { packet = this.#serializer.deserialize(packet); }
            catch { return; }
        }
        const data = decodeCompact(packet);

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: 'channel'
            });
        } catch (error) {
            console.error('[CrossBus] MessageChannel handler error:', error);
        }
    }

    /**
     * Handles message errors.
     *
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] MessageChannel error:', event);
    }
}

/**
 * @fileoverview SharedWorker transport for tab communication via shared state.
 * Uses SharedWorker API for efficient cross-tab communication with shared context.
 * @module transports/shared-worker
 */


/**
 * @typedef {Object} SharedWorkerTransportOptions
 * @property {string} [workerUrl] - URL to the SharedWorker script.
 * @property {string} [name] - Optional name for the SharedWorker.
 */

/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'sharedworker' for this transport.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */

/**
 * SharedWorker-based transport for tab communication.
 *
 * A compatible shared worker can coordinate same-origin contexts while alive.
 * The application supplies its script, routing, storage and backend connection.
 * This transport does not guarantee persistence across navigation or restarts.
 *
 * @example
 * // Create transport
 * const transport = new SharedWorkerTransport({
 *   workerUrl: '/crossbus-worker.js'
 * });
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received:', msg);
 * });
 *
 * // Send message (goes through shared worker to all tabs)
 * transport.send({ t: 'sig', p: { event: 'user:action' } });
 *
 * // Cleanup
 * transport.destroy();
 */
class SharedWorkerTransport {
    /** @type {SharedWorker|null} */
    #worker = null;

    /** @type {MessagePort|null} */
    #port = null;

    /** @type {string} */
    #workerUrl;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if SharedWorker API is available.
     *
     * @returns {boolean} True if SharedWorker is supported.
     */
    static isSupported() {
        return typeof SharedWorker !== 'undefined';
    }

    /**
     * Creates a new SharedWorker transport.
     *
     * @param {SharedWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If SharedWorker is not supported.
     */
    constructor(options = {}) {
        if (!SharedWorkerTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'SharedWorker'
            });
        }

        this.#workerUrl = options.workerUrl ?? '/crossbus-shared-worker.js';

        // Create SharedWorker
        this.#worker = new SharedWorker(this.#workerUrl, options.name);
        this.#port = this.#worker.port;

        // Set up message handler on port
        this.#port.onmessage = this.#handleMessage.bind(this);
        this.#port.onmessageerror = this.#handleError.bind(this);

        // Handle worker errors
        this.#worker.onerror = this.#handleWorkerError.bind(this);

        // Start the port (required for SharedWorker)
        this.#port.start();
    }

    /**
     * Sends a message through the SharedWorker.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'SharedWorkerTransport.send'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        if (!this.#port) return;

        if (transfer && transfer.length > 0) {
            this.#port.postMessage(envelope, transfer);
        } else {
            this.#port.postMessage(envelope);
        }
    }

    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport, closing the port.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#port) {
            this.#port.close();
            this.#port = null;
        }

        this.#worker = null;
    }

    /**
     * Gets the worker URL.
     * @returns {string}
     */
    get workerUrl() {
        return this.#workerUrl;
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming messages from the SharedWorker.
     *
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Skip non-protocol messages
        if (!isProtocolMessage(event.data)) return;

        // Invoke handler
        try {
            this.#messageHandler(event.data, {
                origin: 'sharedworker'
            });
        } catch (error) {
            console.error('[CrossBus] SharedWorker handler error:', error);
        }
    }

    /**
     * Handles message errors.
     *
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] SharedWorker message error:', event);
    }

    /**
     * Handles worker-level errors.
     *
     * @param {ErrorEvent} event
     */
    #handleWorkerError(event) {
        console.error('[CrossBus] SharedWorker error:', event.message);
    }
}

/**
 * @fileoverview ServiceWorker transport for messaging an application-provided worker.
 * Storage, offline queues and background sync are application responsibilities.
 * @module transports/service-worker
 */


/**
 * @typedef {Object} ServiceWorkerTransportOptions
 * @property {number} [timeout=5000] - Timeout waiting for ready state.
 */

/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'serviceworker' for this transport.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */

/**
 * Message transport to the application's service worker.
 * Registration and message routing belong to the application. This transport
 * does not itself persist messages or implement offline/background delivery.
 *
 * @example
 * const transport = new ServiceWorkerTransport();
 *
 * // Wait for ServiceWorker to be ready
 * await transport.ready;
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received from SW:', msg);
 * });
 *
 * // Send message to ServiceWorker
 * transport.send({ t: 'sig', id: 'abc', p: { event: 'sync' } });
 *
 * // Cleanup
 * transport.destroy();
 */
class ServiceWorkerTransport {
    /** @type {ServiceWorker|null} */
    #controller = null;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {Promise<void>} */
    #readyPromise;

    /** @type {Function|null} */
    #boundMessageHandler = null;

    /**
     * Checks if ServiceWorker API is available.
     *
     * @returns {boolean} True if ServiceWorker is supported.
     */
    static isSupported() {
        return typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator;
    }

    /**
     * Creates a new ServiceWorker transport.
     *
     * @param {ServiceWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If ServiceWorker is not supported.
     */
    constructor(options = {}) {
        if (!ServiceWorkerTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'ServiceWorker'
            });
        }

        // Initialize ready promise
        this.#readyPromise = this.#initialize();
    }

    /**
     * Promise that resolves when transport is ready.
     * @returns {Promise<void>}
     */
    get ready() {
        return this.#readyPromise;
    }

    /**
     * Initializes the ServiceWorker connection.
     *
     */
    async #initialize() {
        // Wait for ServiceWorker to be ready
        const registration = await navigator.serviceWorker.ready;

        this.#controller = registration.active || navigator.serviceWorker.controller;

        // Set up message handler
        this.#boundMessageHandler = this.#handleMessage.bind(this);
        navigator.serviceWorker.addEventListener('message', /** @type {EventListener} */(this.#boundMessageHandler));
    }

    /**
     * Sends a message to the ServiceWorker.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
     * @throws {CrossBusError} If transport is destroyed or no controller.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'ServiceWorkerTransport.send'
            });
        }

        if (!this.#controller) {
            throw CrossBusError.from(ErrorCode.NOT_CONNECTED, {
                context: 'ServiceWorkerTransport.send',
                reason: 'No active ServiceWorker'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        if (transfer && transfer.length > 0) {
            this.#controller.postMessage(envelope, transfer);
        } else {
            this.#controller.postMessage(envelope);
        }
    }

    /**
     * Registers a message handler.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#boundMessageHandler) {
            navigator.serviceWorker.removeEventListener('message', /** @type {EventListener} */(this.#boundMessageHandler));
            this.#boundMessageHandler = null;
        }

        this.#controller = null;
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming messages from the ServiceWorker.
     *
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Skip non-protocol messages
        if (!isProtocolMessage(event.data)) return;

        // Invoke handler
        try {
            this.#messageHandler(event.data, {
                origin: 'serviceworker'
            });
        } catch (error) {
            console.error('[CrossBus] ServiceWorker handler error:', error);
        }
    }
}

/** WebView transport. Native adapters are shipped in native/. JSON payloads only. */

/**
 * @typedef {Object} NativeBridgeTransportOptions
 * @property {string} [androidInterface='CrossBus']
 * @property {string} [iosHandler='crossbus']
 * @property {string} [callbackName='__crossbus_receive__'] - Must match the native adapter.
 * @property {number} [initTimeout=5000]
 * @property {number} [heartbeatInterval=0] - Optional transport heartbeat.
 * @property {boolean} [queueWhileInit=true]
 * @property {number} [maxQueueSize=100]
 */
class NativeBridgeTransport {
    #options;
    #bridgeType = 'none';
    #destroyed = false;
    #ready = false;
    /** @type {Function|null} */
    #handler = null;
    /** @type {Object[]} */
    #queue = [];
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    #poll;
    /** @type {ReturnType<typeof setInterval>|undefined} */
    #heartbeat;
    /** @type {Function} */
    #receive;
    /** @type {Promise<void>} */
    #readyPromise;
    /** @type {Function} */
    #resolve = () => {};
    /** @type {Function} */
    #reject = () => {};
    /** @type {Error|undefined} */
    #failure;

    /** @param {NativeBridgeTransportOptions} [options] */
    static detectBridge(options = {}) {
        const android = globalThis[options.androidInterface ?? 'CrossBus'];
        if (typeof android?.postMessage === 'function') return 'android';
        if (!options.androidInterface && typeof globalThis.AndroidBridge?.postMessage === 'function') return 'android';
        if (typeof globalThis.webkit?.messageHandlers?.[options.iosHandler ?? 'crossbus']?.postMessage === 'function') return 'ios';
        return 'none';
    }

    /** @param {NativeBridgeTransportOptions} [options] */
    static isSupported(options = {}) {
        return this.detectBridge(options) !== 'none';
    }

    /** @param {NativeBridgeTransportOptions} [options] */
    constructor(options = {}) {
        this.#options = {
            androidInterface: options.androidInterface,
            iosHandler: options.iosHandler ?? 'crossbus',
            callbackName: options.callbackName ?? '__crossbus_receive__',
            initTimeout: options.initTimeout ?? 5000,
            heartbeatInterval: options.heartbeatInterval ?? 0,
            queueWhileInit: options.queueWhileInit ?? true,
            maxQueueSize: options.maxQueueSize ?? 100
        };
        for (const name of ['initTimeout', 'heartbeatInterval', 'maxQueueSize']) {
            const value = this.#options[name];
            if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
        }
        const callback = this.#options.callbackName;
        if (callback in globalThis) throw new Error(`Native callback already registered: ${callback}`);
        this.#readyPromise = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
        // A transport may be destroyed without the application awaiting ready.
        this.#readyPromise.catch(() => {});
        this.#receive = message => {
            if (this.#destroyed || !this.#handler) return;
            let data;
            try { data = typeof message === 'string' ? JSON.parse(message) : message; }
            catch { return; }
            if (isProtocolMessage(data)) this.#handler(data, { bridgeType: this.#bridgeType });
        };
        globalThis[callback] = this.#receive;
        const deadline = Date.now() + this.#options.initTimeout;
        const check = () => {
            if (this.#destroyed) return;
            this.#bridgeType = NativeBridgeTransport.detectBridge(options);
            if (this.#bridgeType !== 'none') {
                try {
                    // Detach once, then iterate: queue flushing is linear.
                    const queued = this.#queue;
                    this.#queue = [];
                    for (const message of queued) this.#send(message);
                    this.#ready = true;
                    this.#resolve();
                    if (this.#options.heartbeatInterval > 0) {
                        this.#heartbeat = setInterval(() => {
                            try { this.send({ id: `hb_${Date.now()}`, t: 'png', ts: Date.now() }); }
                            catch (error) { console.error('[CrossBus] Native heartbeat failed:', error); }
                        }, this.#options.heartbeatInterval);
                    }
                } catch (error) { this.#fail(error); }
            } else if (Date.now() >= deadline) {
                this.#fail(CrossBusError.from(ErrorCode.NOT_CONNECTED));
            } else this.#poll = setTimeout(check, Math.min(50, Math.max(1, deadline - Date.now())));
        };
        check();
    }

    /** @param {any} error */
    #fail(error) {
        this.#failure = error;
        this.#queue = [];
        this.#reject(error);
    }

    /** @param {Object} message */
    send(message) {
        if (this.#destroyed) throw CrossBusError.from(ErrorCode.DESTROYED);
        if (this.#failure) throw this.#failure;
        const envelope = { ...message, [PROTOCOL_MARKER]: PROTOCOL_VERSION };
        if (!this.#ready) {
            if (!this.#options.queueWhileInit) throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            if (this.#queue.length >= this.#options.maxQueueSize) throw CrossBusError.from(ErrorCode.QUEUE_FULL);
            this.#queue.push(envelope);
            return;
        }
        this.#send(envelope);
    }

    /** @param {Object} envelope */
    #send(envelope) {
        if (this.#bridgeType === 'android') {
            const bridge = this.#options.androidInterface
                ? globalThis[this.#options.androidInterface] : (typeof globalThis.CrossBus?.postMessage === 'function' ? globalThis.CrossBus : globalThis.AndroidBridge);
            if (typeof bridge?.postMessage !== 'function') throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            bridge.postMessage(JSON.stringify(envelope));
        } else {
            const handler = globalThis.webkit?.messageHandlers?.[this.#options.iosHandler];
            if (typeof handler?.postMessage !== 'function') throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            handler.postMessage(envelope);
        }
    }

    /** @param {Function} handler */
    onMessage(handler) {
        if (typeof handler !== 'function') throw new TypeError('Handler must be a function');
        if (this.#destroyed) throw CrossBusError.from(ErrorCode.DESTROYED);
        this.#handler = handler;
    }
    offMessage() { this.#handler = null; }
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        clearTimeout(this.#poll);
        clearInterval(this.#heartbeat);
        this.#queue = [];
        this.#handler = null;
        if (!this.#ready) this.#reject(CrossBusError.from(ErrorCode.DESTROYED));
        if (globalThis[this.#options.callbackName] === this.#receive) delete globalThis[this.#options.callbackName];
    }
    get isDestroyed() { return this.#destroyed; }
    get bridgeType() { return this.#bridgeType; }
    get isReady() { return this.#ready; }
    get ready() { return this.#readyPromise; }
}

/**
 * @fileoverview WebSocket transport for CrossBus.
 * Enables communication with a server via WebSocket.
 * @module transports/websocket
 */


/**
 * @typedef {Object} WebSocketTransportOptions
 * @property {string} url - WebSocket server URL (ws:// or wss://)
 * @property {string} [peerId] - Local peer ID
 * @property {boolean} [autoReconnect=true] - Auto-reconnect on disconnect
 * @property {number} [reconnectDelayMs=1000] - Base delay for reconnection
 * @property {number} [maxReconnectDelayMs=30000] - Max delay with exponential backoff
 * @property {number} [heartbeatIntervalMs=30000] - Heartbeat interval (0 to disable)
 * @property {string|string[]} [protocols] - WebSocket subprotocols
 * @property {number} [maxQueueSize=1000] - Maximum queued messages while disconnected; zero disables the cap.
 */

/**
 * WebSocket transport for server communication.
 *
 * @example
 * const transport = new WebSocketTransport({
 *   url: 'wss://api.example.com/crossbus',
 *   peerId: 'client-1'
 * });
 *
 * transport.onMessage((msg) => console.log('Received:', msg));
 * transport.onStateChange((state) => console.log('State:', state));
 *
 * await transport.connect();
 * transport.send({ type: 'hello', payload: { name: 'client' } });
 */
class WebSocketTransport {
    /** @type {string} */
    #url;

    /** @type {string} */
    #peerId;

    /** @type {WebSocket|null} */
    #socket = null;

    /** @type {boolean} */
    #autoReconnect;

    /** @type {number} */
    #reconnectDelayMs;

    /** @type {number} */
    #maxReconnectDelayMs;

    /** @type {number} */
    #currentReconnectDelay;

    /** @type {number} */
    #heartbeatIntervalMs;

    /** @type {ReturnType<typeof setInterval>|null} */
    #heartbeatTimer = null;

    /** @type {ReturnType<typeof setTimeout>|null} */
    #reconnectTimer = null;

    /** @type {((message: Object) => void)|null} */
    #messageHandler = null;

    /** @type {((state: 'connecting'|'connected'|'disconnected'|'error') => void)|null} */
    #stateHandler = null;

    /** @type {'connecting'|'connected'|'disconnected'|'error'} */
    #state = 'disconnected';

    /** @type {string[]} Already serialized snapshots, not mutable caller objects. */
    #messageQueue = [];

    #destroyed = false;
    /** @type {Promise<void>|null} */
    #connecting = null;
    /** @type {((error?: any) => void)|null} */
    #settleConnect = null;
    /** @type {string|string[]|undefined} */
    #protocols;
    #maxQueueSize;

    /** @type {boolean} */
    #intentionalClose = false;

    /**
     * Creates a new WebSocket transport.
     * @param {WebSocketTransportOptions} options
     */
    constructor(options) {
        this.#url = options.url;
        this.#protocols = options.protocols;
        this.#maxQueueSize = options.maxQueueSize ?? 1000;
        if (!Number.isSafeInteger(this.#maxQueueSize) || this.#maxQueueSize < 0) throw new RangeError('maxQueueSize must be a nonnegative safe integer');
        this.#peerId = options.peerId ?? uuid();
        this.#autoReconnect = options.autoReconnect ?? true;
        this.#reconnectDelayMs = options.reconnectDelayMs ?? 1000;
        this.#maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
        this.#currentReconnectDelay = this.#reconnectDelayMs;
        this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    }

    /** @returns {string} */
    get peerId() {
        return this.#peerId;
    }

    /** @returns {'connecting'|'connected'|'disconnected'|'error'} */
    get state() {
        return this.#state;
    }

    /** @returns {boolean} */
    get isConnected() {
        return this.#state === 'connected' && this.#socket?.readyState === WebSocket.OPEN;
    }

    /**
     * Connects to the WebSocket server.
     * @returns {Promise<void>}
     */
    connect() {
        if (this.#destroyed) return Promise.reject(new Error('WebSocket transport destroyed'));
        if (this.#connecting) return this.#connecting;
        if (this.#socket && this.#socket.readyState === WebSocket.OPEN) return Promise.resolve();
        this.#intentionalClose = false;
        /** @type {(error?: any) => void} */
        let settle = () => {};
        /** @type {Promise<void>} */
        const pending = new Promise((resolve, reject) => {
            let settled = false;
            settle = error => {
                if (settled) return;
                settled = true;
                this.#connecting = null;
                this.#settleConnect = null;
                if (error) reject(error); else resolve();
            };
        });
        this.#connecting = pending;
        this.#settleConnect = settle;
        try {
            this.#setState('connecting');
            const socket = this.#protocols === undefined ? new WebSocket(this.#url) : new WebSocket(this.#url, this.#protocols);
            this.#socket = socket;
            socket.onopen = () => {
                if (socket !== this.#socket || this.#destroyed || this.#intentionalClose) return;
                try {
                    this.#setState('connected');
                    this.#currentReconnectDelay = this.#reconnectDelayMs;
                    this.#flushQueue();
                    this.#startHeartbeat();
                    settle();
                } catch (error) { this.#setState('error'); settle(error); socket.close(); }
            };
            socket.onmessage = event => { if (socket === this.#socket && !this.#destroyed) this.#handleMessage(event); };
            socket.onclose = () => {
                if (socket !== this.#socket) return;
                this.#stopHeartbeat();
                this.#setState('disconnected');
                settle(new Error('WebSocket closed before connecting'));
                if (!this.#intentionalClose && !this.#destroyed && this.#autoReconnect) this.#scheduleReconnect();
            };
            socket.onerror = () => {
                if (socket !== this.#socket) return;
                this.#setState('error');
                settle(new Error('WebSocket connection failed'));
            };
        } catch (error) { this.#setState('error'); settle(error); }
        return pending;
    }

    /**
     * Disconnects from the server.
     */
    disconnect() {
        this.#intentionalClose = true;
        this.#settleConnect?.(new Error('WebSocket disconnected before connecting'));
        this.#stopHeartbeat();

        if (this.#reconnectTimer) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = null;
        }

        if (this.#socket) {
            const socket = this.#socket;
            this.#socket = null;
            socket.onopen = null; socket.onclose = null; socket.onerror = null; socket.onmessage = null;
            socket.close(1000, 'Client disconnect');
        }

        this.#setState('disconnected');
    }

    /**
     * Sends a message to the server.
     * @param {Object} message - Message to send
     * @returns {boolean} Whether the message was sent immediately
     */
    send(message) {
        if (this.#destroyed) throw new Error('WebSocket transport destroyed');
        const envelope = {
            _cb: PROTOCOL_VERSION,
            _m: PROTOCOL_MARKER,
            id: uuid(),
            from: this.#peerId,
            timestamp: Date.now(),
            ...message
        };

        const serialized = JSON.stringify(envelope);
        if (this.isConnected && this.#socket) {
            this.#socket.send(serialized);
            return true;
        } else {
            // Queue for later
            if (this.#maxQueueSize && this.#messageQueue.length >= this.#maxQueueSize) throw new Error('WebSocket queue limit reached');
            this.#messageQueue.push(serialized);
            return false;
        }
    }

    /**
     * Sets the message handler.
     * @param {(message: Object) => void} handler
     */
    onMessage(handler) {
        this.#messageHandler = handler;
    }

    /** Removes the current inbound observer. */
    offMessage() { this.#messageHandler = null; }

    /**
     * Sets the state change handler.
     * @param {(state: string) => void} handler
     */
    onStateChange(handler) {
        this.#stateHandler = handler;
    }

    /**
     * Handles incoming messages.
     */
    #handleMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle pong (heartbeat response)
            if (data.type === 'pong') {
                return;
            }

            if (this.#messageHandler) {
                this.#messageHandler(data);
            }
        } catch (e) {
            console.error('[WebSocketTransport] Failed to parse message:', e);
        }
    }

    /**
     * Flushes queued messages.
     */
    #flushQueue() {
        while (this.#messageQueue.length > 0 && this.isConnected && this.#socket) {
            const message = this.#messageQueue[0];
            if (message) {
                this.#socket.send(message);
            }
            this.#messageQueue.shift();
        }
    }

    /**
     * Updates and emits state.
     */
    #setState(state) {
        if (this.#state !== state) {
            this.#state = state;
            if (this.#stateHandler) {
                try { this.#stateHandler(state); }
                catch (error) { console.error('[WebSocketTransport] State observer error:', error); }
            }
        }
    }

    /**
     * Starts heartbeat timer.
     */
    #startHeartbeat() {
        this.#stopHeartbeat();
        if (this.#heartbeatIntervalMs <= 0) return;

        this.#heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.#socket) {
                this.#socket.send(JSON.stringify({ type: 'ping', from: this.#peerId }));
            }
        }, this.#heartbeatIntervalMs);
    }

    /**
     * Stops heartbeat timer.
     */
    #stopHeartbeat() {
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;
        }
    }

    /**
     * Schedules a reconnection attempt.
     */
    #scheduleReconnect() {
        if (this.#reconnectTimer || this.#intentionalClose || this.#destroyed) return;

        this.#reconnectTimer = setTimeout(async () => {
            this.#reconnectTimer = null;

            try {
                await this.connect();
            } catch {
                // Exponential backoff
                this.#currentReconnectDelay = Math.min(
                    this.#currentReconnectDelay * 2,
                    this.#maxReconnectDelayMs
                );

                if (this.#autoReconnect && !this.#intentionalClose) {
                    this.#scheduleReconnect();
                }
            }
        }, this.#currentReconnectDelay);
    }

    /**
     * Destroys the transport.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        this.disconnect();
        this.#messageHandler = null;
        this.#stateHandler = null;
        this.#messageQueue = [];
    }
}

/**
 * @fileoverview Vector Clock implementation for causal ordering.
 *
 * Vector clocks track logical time across distributed processes,
 * enabling detection of causal relationships between events.
 *
 * @module ordering/vector-clock
 */

/**
 * Vector Clock for tracking causal order in distributed systems.
 *
 * Each node maintains a counter for every known node. When sending
 * a message, the sender increments its own counter and includes
 * the entire clock. When receiving, the receiver updates its clock
 * by taking the max of each component.
 *
 * @example
 * const clock = new VectorClock('node-1');
 * clock.tick(); // Increment before sending
 * const message = { data, clock: clock.toJSON() };
 *
 * // On receive:
 * const remoteClock = VectorClock.fromJSON(message.clock);
 * if (localClock.canDeliver(remoteClock, senderId)) {
 *   localClock.update(remoteClock);
 *   deliver(message);
 * }
 */
class VectorClock {
    /** @type {string} */
    #ownId;

    /** @type {Map<string, number>} */
    #counters;

    /**
     * Creates a new vector clock.
     *
     * @param {string} ownId - This node's unique identifier
     * @param {Object<string, number>} [initial={}] - Initial counter values
     */
    constructor(ownId, initial = {}) {
        this.#ownId = ownId;
        this.#counters = new Map(Object.entries(initial));

        // Ensure own entry exists
        if (!this.#counters.has(ownId)) {
            this.#counters.set(ownId, 0);
        }
    }

    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId() {
        return this.#ownId;
    }

    /**
     * Gets the counter value for a node.
     *
     * @param {string} nodeId - Node identifier
     * @returns {number} Counter value (0 if unknown)
     */
    get(nodeId) {
        return this.#counters.get(nodeId) ?? 0;
    }

    /**
     * Increments this node's counter (call before sending).
     *
     * @returns {number} New counter value
     */
    tick() {
        const current = this.get(this.#ownId);
        const next = current + 1;
        this.#counters.set(this.#ownId, next);
        return next;
    }

    /**
     * Updates this clock with values from another clock.
     * Takes the max of each component (merge operation).
     *
     * @param {VectorClock} other - Clock to merge from
     */
    update(other) {
        for (const [nodeId, value] of other.#counters) {
            const current = this.get(nodeId);
            if (value > current) {
                this.#counters.set(nodeId, value);
            }
        }
    }

    /**
     * Checks if this clock happened-before another.
     * A happened-before B iff all(A[i] <= B[i]) and exists(A[j] < B[j])
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if this clock causally precedes other
     */
    happenedBefore(other) {
        let atLeastOneSmaller = false;
        const allNodeIds = new Set([...this.#counters.keys(), ...other.#counters.keys()]);

        for (const nodeId of allNodeIds) {
            const thisVal = this.get(nodeId);
            const otherVal = other.get(nodeId);

            if (thisVal > otherVal) {
                return false; // This has a greater component
            }
            if (thisVal < otherVal) {
                atLeastOneSmaller = true;
            }
        }

        return atLeastOneSmaller;
    }

    /**
     * Checks if this clock is concurrent with another.
     * Concurrent means neither happened-before the other.
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks are concurrent
     */
    isConcurrentWith(other) {
        return !this.happenedBefore(other) &&
            !other.happenedBefore(this) &&
            !this.equals(other);
    }

    /**
     * Checks if two clocks are identical.
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks have identical values
     */
    equals(other) {
        const allNodeIds = new Set([...this.#counters.keys(), ...other.#counters.keys()]);

        for (const nodeId of allNodeIds) {
            if (this.get(nodeId) !== other.get(nodeId)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Checks if a message with the given clock can be delivered.
     *
     * Delivery condition: For the sender's component, the message clock
     * should be exactly one more than our current knowledge. For all other
     * components, the message clock should be <= our current knowledge.
     *
     * @param {VectorClock} msgClock - Clock attached to incoming message
     * @param {string} senderId - ID of the message sender
     * @returns {boolean} True if message can be delivered without breaking causal order
     */
    canDeliver(msgClock, senderId) {
        const senderSeq = msgClock.get(senderId);
        const ourKnowledge = this.get(senderId);

        // Sender's sequence should be next in order (exactly +1)
        if (senderSeq !== ourKnowledge + 1) {
            return false;
        }

        // All other components should be <= what we know
        for (const [nodeId, value] of msgClock.#counters) {
            if (nodeId === senderId) continue;
            if (value > this.get(nodeId)) {
                return false; // We're missing messages from another node
            }
        }

        return true;
    }

    /**
     * Creates a copy of this clock.
     *
     * @returns {VectorClock} Cloned clock
     */
    clone() {
        const counters = Object.fromEntries(this.#counters);
        return new VectorClock(this.#ownId, counters);
    }

    /**
     * Serializes to JSON-compatible object.
     *
     * @returns {{ ownId: string, counters: Object<string, number> }}
     */
    toJSON() {
        return {
            ownId: this.#ownId,
            counters: Object.fromEntries(this.#counters)
        };
    }

    /**
     * Deserializes from JSON object.
     *
     * @param {{ ownId: string, counters: Object<string, number> }} json
     * @returns {VectorClock}
     */
    static fromJSON(json) {
        return new VectorClock(json.ownId, json.counters);
    }

    /**
     * Returns human-readable representation.
     * @returns {string}
     */
    toString() {
        const entries = [...this.#counters.entries()]
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');
        return `VectorClock(${this.#ownId}){${entries}}`;
    }
}

/**
 * @fileoverview Causal Orderer for message delivery with causal consistency.
 *
 * Buffers out-of-order messages and delivers them only when their
 * causal dependencies have been satisfied.
 *
 * @module ordering/causal-orderer
 */


/**
 * @typedef {Object} CausalOrdererOptions
 * @property {Function} [onDeliver] - Callback when message is delivered
 * @property {number} [maxBufferSize=1000] - Maximum buffered messages
 * @property {Function} [onBufferOverflow] - Called when buffer is full
 */

/**
 * @typedef {Object} BufferedMessage
 * @property {string} senderId - Message sender ID
 * @property {Object} message - Original message
 * @property {VectorClock} clock - Message's vector clock
 */

/**
 * Causal Orderer ensures messages are delivered in causal order.
 *
 * When a message arrives out of order (missing dependencies), it's
 * buffered until its dependencies are satisfied. This guarantees
 * that if message B was sent after seeing message A, then B will
 * be delivered after A at all receivers.
 *
 * @example
 * const orderer = new CausalOrderer('my-node', {
 *   onDeliver: (msg) => processMessage(msg)
 * });
 *
 * // When receiving a message:
 * orderer.receive(senderId, message);
 *
 * // When sending:
 * const clock = orderer.tick();
 * send({ ...data, clock: clock.toJSON() });
 */
class CausalOrderer {
    /** @type {string} */
    #ownId;

    /** @type {VectorClock} */
    #clock;

    /** @type {BufferedMessage[]} */
    #buffer;

    /** @type {Function} */
    #onDeliver;

    /** @type {number} */
    #maxBufferSize;

    /** @type {Function|null} */
    #onBufferOverflow;

    /**
     * Creates a new CausalOrderer.
     *
     * @param {string} ownId - This node's unique identifier
     * @param {CausalOrdererOptions} options - Configuration options
     */
    constructor(ownId, options = {}) {
        this.#ownId = ownId;
        this.#clock = new VectorClock(ownId);
        this.#buffer = [];
        this.#onDeliver = options.onDeliver || (() => { });
        this.#maxBufferSize = options.maxBufferSize ?? 1000;
        this.#onBufferOverflow = options.onBufferOverflow || null;
    }

    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId() {
        return this.#ownId;
    }

    /**
     * Gets the current buffer size.
     * @returns {number}
     */
    get bufferSize() {
        return this.#buffer.length;
    }

    /**
     * Receives a message and delivers it if deps are satisfied,
     * otherwise buffers it.
     *
     * @param {string} senderId - ID of the message sender
     * @param {Object} message - Message with clock property
     */
    receive(senderId, message) {
        const msgClock = VectorClock.fromJSON(message.clock);

        if (this.#clock.canDeliver(msgClock, senderId)) {
            this.#deliver(senderId, message, msgClock);
            this.#tryDeliverBuffered();
        } else {
            this.#bufferMessage(senderId, message, msgClock);
        }
    }

    /**
     * Delivers a message and updates local clock.
     *
     * @param {string} senderId
     * @param {Object} message
     * @param {VectorClock} msgClock
     */
    #deliver(senderId, message, msgClock) {
        // Update local clock with received clock
        this.#clock.update(msgClock);

        // Invoke delivery callback
        this.#onDeliver(message);
    }

    /**
     * Buffers a message for later delivery.
     *
     * @param {string} senderId
     * @param {Object} message
     * @param {VectorClock} clock
     */
    #bufferMessage(senderId, message, clock) {
        if (this.#buffer.length >= this.#maxBufferSize) {
            if (this.#onBufferOverflow) {
                this.#onBufferOverflow({
                    senderId,
                    message,
                    bufferSize: this.#buffer.length
                });
            }
            return; // Drop message if buffer full
        }

        this.#buffer.push({ senderId, message, clock });
    }

    /**
     * Tries to deliver buffered messages whose deps are now satisfied.
     * Repeats until no more messages can be delivered.
     */
    #tryDeliverBuffered() {
        let delivered = true;

        while (delivered) {
            delivered = false;

            for (let i = this.#buffer.length - 1; i >= 0; i--) {
                const { senderId, message, clock } = this.#buffer[i];

                if (this.#clock.canDeliver(clock, senderId)) {
                    // Remove from buffer
                    this.#buffer.splice(i, 1);
                    // Deliver
                    this.#deliver(senderId, message, clock);
                    delivered = true;
                }
            }
        }
    }

    /**
     * Increments local clock for sending a message.
     * Returns the clock to attach to outgoing message.
     *
     * @returns {VectorClock} Clock to include in message
     */
    tick() {
        this.#clock.tick();
        return this.#clock.clone();
    }

    /**
     * Gets a copy of the current vector clock.
     *
     * @returns {VectorClock}
     */
    getVectorClock() {
        return this.#clock.clone();
    }

    /**
     * Clears the buffer (e.g., on disconnect).
     */
    clear() {
        this.#buffer = [];
    }
}

exports.BroadcastChannelTransport = BroadcastChannelTransport;
exports.CausalOrderer = CausalOrderer;
exports.CrossBus = CrossBus;
exports.CrossBusError = CrossBusError;
exports.DeliveryStatus = DeliveryStatus;
exports.ErrorCode = ErrorCode;
exports.EventEmitter = EventEmitter;
exports.Handshake = Handshake;
exports.HandshakePhase = HandshakePhase;
exports.MessageChannelTransport = MessageChannelTransport;
exports.MessageRouter = MessageRouter;
exports.MessageType = MessageType;
exports.NativeBridgeTransport = NativeBridgeTransport;
exports.OriginValidator = OriginValidator;
exports.OriginValidatorPresets = OriginValidatorPresets;
exports.PROTOCOL_MARKER = PROTOCOL_MARKER;
exports.PROTOCOL_VERSION = PROTOCOL_VERSION;
exports.PeerStatus = PeerStatus;
exports.PeerType = PeerType;
exports.PendingRequests = PendingRequests;
exports.PostMessageTransport = PostMessageTransport;
exports.PresenceManager = PresenceManager;
exports.ReadableSignalStream = ReadableSignalStream;
exports.ServiceWorkerTransport = ServiceWorkerTransport;
exports.SharedWorkerTransport = SharedWorkerTransport;
exports.StreamManager = StreamManager;
exports.VectorClock = VectorClock;
exports.WebSocketTransport = WebSocketTransport;
exports.WritableSignalStream = WritableSignalStream;
exports.createFastEmitter = createFastEmitter;
exports.createPresence = createPresence;
exports.deferred = deferred;
exports.detectPeerType = detectPeerType;
exports.isCloneable = isCloneable;
exports.isCrossBusError = isCrossBusError;
exports.isRetryable = isRetryable;
exports.sleep = sleep;
exports.timestamp = timestamp;
exports.uuid = uuid;
exports.withTimeout = withTimeout;
//# sourceMappingURL=crossbus.cjs.map
