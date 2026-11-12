/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */

import { CrossBusError, ErrorCode } from './errors.js';

/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID() when available, falls back to manual generation.
 *
 * @returns {string} UUID v4 string.
 */
export function uuid() {
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
 * Checks if data can be structured cloned.
 *
 * @param {*} data - Data to check.
 * @returns {boolean} True if cloneable.
 */
export function isCloneable(data) {
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
export function deferred() {
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
export function sleep(ms, signal) {
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
export function withTimeout(promise, ms, message = 'Operation timed out') {
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
export function detectPeerType(target) {
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
export function timestamp() {
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
export function assertPayloadSize(payload, limit) {
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
        if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) bytes += value.byteLength;
        else if (ArrayBuffer.isView(value)) bytes += value.buffer.byteLength;
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
