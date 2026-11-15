/**
 * @fileoverview Common types and constants shared across all modules.
 * This module is included in the common bundle to avoid duplication.
 * @module common/types
 */

import {viewStorage} from './buffer-storage.js';

/**
 * Protocol marker for CrossBus messages.
 * @constant {string}
 */
export const PROTOCOL_MARKER = '_cb';

/**
 * Current protocol version.
 * @constant {number}
 */
export const PROTOCOL_VERSION = 1;

/**
 * Message type codes (compact for wire efficiency).
 * @readonly
 * @enum {string}
 */
export const MessageType = Object.freeze({
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
export const HandshakePhase = Object.freeze({
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
export const PeerStatus = Object.freeze({
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
export const PeerType = Object.freeze({
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
export const DeliveryStatus = Object.freeze({
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
 * Default configuration values.
 * @readonly
 * @type {Object}
 */
export const Defaults = Object.freeze({
    ACK_TIMEOUT: 5000,
    REQUEST_TIMEOUT: 30000,
    HANDSHAKE_TIMEOUT: 10000,
    HEARTBEAT_INTERVAL: 15000,
    HEARTBEAT_TIMEOUT: 5000,
    RECONNECT_INTERVAL: 3000,
    MAX_RECONNECT_ATTEMPTS: 5,
    MAX_PEERS: 100,
    MAX_PENDING_REQUESTS: 1000,
    MAX_QUEUE_SIZE: 100,
    MAX_MESSAGE_SIZE: 1048576, // 1MB
    TTL: 5
});

/**
 * Checks if an object is a valid CrossBus message.
 *
 * @param {*} obj - Object to check.
 * @returns {boolean} True if valid protocol message.
 */
export function isProtocolMessage(obj) {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        obj[PROTOCOL_MARKER] === PROTOCOL_VERSION &&
        typeof obj.id === 'string' &&
        (typeof obj.type === 'string' || typeof obj.t === 'string')
    );
}

/**
 * List of transferable types for auto-detection.
 * @constant {Function[]}
 */
export const TransferableTypes = [
    ArrayBuffer,
    MessagePort,
    // ImageBitmap and OffscreenCanvas are checked dynamically
    // as they may not exist in all contexts
];

/**
 * Checks if a value is transferable.
 *
 * @param {*} value - Value to check.
 * @returns {boolean} True if transferable.
 */
export function isTransferable(value) {
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
export function findTransferables(value, found = new Set(), seen = new Set()) {
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
export const EMPTY_MESSAGE_META = Object.freeze({});
