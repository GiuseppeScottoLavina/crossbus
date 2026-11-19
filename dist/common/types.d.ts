/**
 * @fileoverview Common types and constants shared across all modules.
 * This module is included in the common bundle to avoid duplication.
 * @module common/types
 */
/**
 * Protocol marker for CrossBus messages.
 * @constant {string}
 */
export declare const PROTOCOL_MARKER = "_cb";
/**
 * Current protocol version.
 * @constant {number}
 */
export declare const PROTOCOL_VERSION = 1;
export type MessageType = string;
/**
 * Message type codes (compact for wire efficiency).
 * @typedef {string} MessageType
 */
/**
 * Message type codes (compact for wire efficiency).
 * @readonly
 */
export declare const MessageType: Readonly<{
    /** Signal - one-way message */
    SIGNAL: "sig";
    /** Request - expects response */
    REQUEST: "req";
    /** Response - reply to request */
    RESPONSE: "res";
    /** Acknowledge - delivery confirmation */
    ACK: "ack";
    /** Handshake - connection negotiation */
    HANDSHAKE: "hsk";
    HANDSHAKE_INIT: "hsk_init";
    HANDSHAKE_ACK: "hsk_ack";
    HANDSHAKE_COMPLETE: "hsk_done";
    /** Ping - heartbeat */
    PING: "png";
    /** Pong - heartbeat response */
    PONG: "pog";
    /** Goodbye - graceful disconnect */
    BYE: "bye";
    /** Broadcast - message for all peers */
    BROADCAST: "bc";
}>;
export type HandshakePhase = string;
/**
 * Handshake phase codes.
 * @typedef {string} HandshakePhase
 */
/**
 * Handshake phase codes.
 * @readonly
 */
export declare const HandshakePhase: Readonly<{
    INIT: "init";
    INIT_SENT: "init_sent";
    ACK: "ack";
    ACK_SENT: "ack_sent";
    DONE: "done";
}>;
export type PeerStatus = string;
/**
 * Peer connection status.
 * @typedef {string} PeerStatus
 */
/**
 * Peer connection status.
 * @readonly
 */
export declare const PeerStatus: Readonly<{
    CONNECTING: "connecting";
    CONNECTED: "connected";
    DISCONNECTED: "disconnected";
    RECONNECTING: "reconnecting";
    FAILED: "failed";
}>;
export type PeerType = string;
/**
 * Peer type (transport mechanism).
 * @typedef {string} PeerType
 */
/**
 * Peer type (transport mechanism).
 * @readonly
 */
export declare const PeerType: Readonly<{
    IFRAME: "iframe";
    WORKER: "worker";
    SERVICE_WORKER: "sw";
    WINDOW: "window";
    PORT: "port";
}>;
export type DeliveryStatus = string;
/**
 * Delivery status for emit results.
 * @typedef {string} DeliveryStatus
 */
/**
 * Delivery status for emit results.
 * @readonly
 */
export declare const DeliveryStatus: Readonly<{
    /** Delivered to local listeners only */
    LOCAL: "local";
    /** Sent to peer (no ACK requested) */
    SENT: "sent";
    /** Sent and ACK received */
    ACKED: "acked";
    /** Queued for offline peer */
    QUEUED: "queued";
    /** ACK timeout */
    TIMEOUT: "timeout";
    /** Delivery failed */
    FAILED: "failed";
}>;
/**
 * Default configuration values.
 * @readonly
 * @type {Object}
 */
export declare const Defaults: any;
/**
 * Checks if an object is a valid CrossBus message.
 *
 * @param {*} obj - Object to check.
 * @returns {boolean} True if valid protocol message.
 */
export declare function isProtocolMessage(obj: any): boolean;
/**
 * List of transferable types for auto-detection.
 * @constant {Function[]}
 */
export declare const TransferableTypes: (ArrayBufferConstructor | {
    new (): MessagePort;
    prototype: MessagePort;
})[];
/**
 * Checks if a value is transferable.
 *
 * @param {*} value - Value to check.
 * @returns {boolean} True if transferable.
 */
export declare function isTransferable(value: any): boolean;
/**
 * Finds transferable objects without recursive calls or per-value result arrays.
 * Typed views transfer their actual same-realm backing ArrayBuffer. Node Buffers
 * keep copy semantics because their backing storage may belong to a shared slab.
 *
 * @param {*} value - Value to search.
 * @param {Set<Transferable>} [found] - Set to collect transferables.
 * @returns {Transferable[]} Array of transferables found.
 */
export declare function findTransferables(value: any, found?: Set<Transferable>, seen?: Set<any>): Transferable[];
/** Shared immutable empty metadata for internally constructed envelopes. */
export declare const EMPTY_MESSAGE_META: Readonly<{}>;
/**
 * Marks a signal re-dispatched locally from an already-processed batch.
 * Symbol-keyed properties are dropped by structured clone and JSON, so a
 * remote peer cannot set it. The registry key keeps separate bundles in sync.
 */
export declare const BATCHED_SIGNAL: unique symbol;
