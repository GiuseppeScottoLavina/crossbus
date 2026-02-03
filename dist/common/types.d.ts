/**
 * Checks if an object is a valid CrossBus message.
 *
 * @param {*} obj - Object to check.
 * @returns {boolean} True if valid protocol message.
 */
export function isProtocolMessage(obj: any): boolean;
/**
 * Checks if a value is transferable.
 *
 * @param {*} value - Value to check.
 * @returns {boolean} True if transferable.
 */
export function isTransferable(value: any): boolean;
/**
 * Recursively finds all transferable objects in a value.
 *
 * @param {*} value - Value to search.
 * @param {Set<Transferable>} [found] - Set to collect transferables.
 * @returns {Transferable[]} Array of transferables found.
 */
export function findTransferables(value: any, found?: Set<Transferable>): Transferable[];
/**
 * @fileoverview Common types and constants shared across all modules.
 * This module is included in the common bundle to avoid duplication.
 * @module common/types
 */
/**
 * Protocol marker for CrossBus messages.
 * @constant {string}
 */
export const PROTOCOL_MARKER: "_cb";
/**
 * Current protocol version.
 * @constant {number}
 */
export const PROTOCOL_VERSION: 1;
/**
 * Message type codes (compact for wire efficiency).
 */
export type MessageType = string;
/**
 * Message type codes (compact for wire efficiency).
 * @readonly
 * @enum {string}
 */
export const MessageType: Readonly<{
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
/**
 * Handshake phase codes.
 */
export type HandshakePhase = string;
/**
 * Handshake phase codes.
 * @readonly
 * @enum {string}
 */
export const HandshakePhase: Readonly<{
    INIT: "init";
    INIT_SENT: "init_sent";
    ACK: "ack";
    ACK_SENT: "ack_sent";
    DONE: "done";
}>;
/**
 * Peer connection status.
 */
export type PeerStatus = string;
/**
 * Peer connection status.
 * @readonly
 * @enum {string}
 */
export const PeerStatus: Readonly<{
    CONNECTING: "connecting";
    CONNECTED: "connected";
    DISCONNECTED: "disconnected";
    RECONNECTING: "reconnecting";
    FAILED: "failed";
}>;
/**
 * Peer type (transport mechanism).
 */
export type PeerType = string;
/**
 * Peer type (transport mechanism).
 * @readonly
 * @enum {string}
 */
export const PeerType: Readonly<{
    IFRAME: "iframe";
    WORKER: "worker";
    SERVICE_WORKER: "sw";
    WINDOW: "window";
    PORT: "port";
}>;
/**
 * Delivery status for emit results.
 */
export type DeliveryStatus = string;
/**
 * Delivery status for emit results.
 * @readonly
 * @enum {string}
 */
export const DeliveryStatus: Readonly<{
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
export const Defaults: any;
/**
 * List of transferable types for auto-detection.
 * @constant {Function[]}
 */
export const TransferableTypes: (ArrayBufferConstructor | {
    new (): MessagePort;
    prototype: MessagePort;
})[];
