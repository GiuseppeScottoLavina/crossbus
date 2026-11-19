/**
 * @fileoverview Protocol message schemas for CrossBus.
 * All message types are frozen for immutability.
 * @module core/message-types
 */
import { MessageType } from '../common/types.js';
export { MessageType };
export type DeliveryStatus = string;
/**
 * Delivery status constants.
 * @typedef {string} DeliveryStatus
 */
/**
 * Delivery status constants.
 * @readonly
 */
export declare const DeliveryStatus: Readonly<{
    /** Delivered to local listeners only */
    LOCAL: "local";
    /** Sent to remote peer */
    REMOTE: "remote";
    /** Queued for offline peer */
    QUEUED: "queued";
    /** Delivery failed */
    FAILED: "failed";
}>;
export type PeerStatus = string;
/**
 * Peer connection status constants.
 * @typedef {string} PeerStatus
 */
/**
 * Peer connection status constants.
 * @readonly
 */
export declare const PeerStatus: Readonly<{
    /** Connection in progress */
    CONNECTING: "connecting";
    /** Successfully connected */
    CONNECTED: "connected";
    /** Disconnected */
    DISCONNECTED: "disconnected";
    /** Connection failed */
    FAILED: "failed";
}>;
export type PeerType = string;
/**
 * Peer type constants.
 * @typedef {string} PeerType
 */
/**
 * Peer type constants.
 * @readonly
 */
export declare const PeerType: Readonly<{
    /** iframe element */
    IFRAME: "iframe";
    /** Web Worker */
    WORKER: "worker";
    /** Service Worker */
    SERVICE_WORKER: "service-worker";
    /** Window (popup, tab) */
    WINDOW: "window";
    /** MessagePort direct connection */
    PORT: "port";
    /** Local (self) */
    LOCAL: "local";
}>;
export type ProtocolMessage = {
    /**
     * - Protocol marker version (compact wire format).
     */
    _cb: number;
    /**
     * - Protocol version.
     */
    version: number;
    /**
     * - Opaque message identifier; not an authentication token.
     */
    id: string;
    /**
     * - Message type.
     */
    type: MessageType;
    /**
     * - Unix timestamp (ms).
     */
    timestamp: number;
    /**
     * - Message payload.
     */
    payload: any;
    /**
     * - Additional metadata.
     */
    meta: any;
};
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
 * @property {string} id - Opaque message identifier; not an authentication token.
 * @property {MessageType} type - Message type.
 * @property {number} timestamp - Unix timestamp (ms).
 * @property {Object} payload - Message payload.
 * @property {Object} meta - Additional metadata.
 */
export declare function createMessage(type: MessageType, payload: any, meta?: any, id?: string | null): ProtocolMessage;
/**
 * Creates a signal message.
 *
 * @param {string} name - Signal name.
 * @param {*} data - Signal data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {string|null} [destPeerId] - Destination peer ID.
 * @returns {ProtocolMessage} Signal message.
 */
export declare function createSignalMessage(name: string, data: any, sourcePeerId: string, destPeerId?: string | null): ProtocolMessage;
/**
 * Creates a broadcast message.
 *
 * @param {string} name - Signal name.
 * @param {*} data - Signal data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {Object} [options={}] - Broadcast options.
 * @returns {ProtocolMessage} Broadcast message.
 */
export declare function createBroadcastMessage(name: string, data: any, sourcePeerId: string, options?: any): ProtocolMessage;
/**
 * Creates a handshake init message.
 *
 * @param {string} peerId - Initiating peer ID.
 * @param {string} origin - Initiating peer origin.
 * @param {string} challenge - Random challenge string.
 * @returns {ProtocolMessage} Handshake init message.
 */
export declare function createHandshakeInit(peerId: string, origin: string, challenge: string): ProtocolMessage;
/**
 * Creates a handshake acknowledgment message.
 *
 * @param {string} peerId - Responding peer ID.
 * @param {string} origin - Responding peer origin.
 * @param {string} challenge - Original challenge.
 * @param {string} response - Challenge response.
 * @returns {ProtocolMessage} Handshake ack message.
 */
export declare function createHandshakeAck(peerId: string, origin: string, challenge: string, response: string): ProtocolMessage;
/**
 * Creates a handshake complete message.
 *
 * @param {string} peerId - Confirming peer ID.
 * @param {boolean} success - Whether handshake succeeded.
 * @returns {ProtocolMessage} Handshake complete message.
 */
export declare function createHandshakeComplete(peerId: string, success: boolean): ProtocolMessage;
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
export declare function createRequestMessage(name: string, data: any, sourcePeerId: string, destPeerId: string, id?: string | null): ProtocolMessage;
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
export declare function createResponseMessage(requestId: string, data: any, sourcePeerId: string, success?: boolean, error?: any | null): ProtocolMessage;
/**
 * Validates if an object is a valid CrossBus protocol message.
 *
 * @param {*} obj - Object to validate.
 * @returns {boolean} True if valid protocol message.
 */
export declare function isProtocolMessage(obj: any): boolean;
/**
 * Validates protocol version compatibility.
 *
 * @param {ProtocolMessage} message - Message to check.
 * @returns {boolean} True if version is compatible.
 */
export declare function isCompatibleVersion(message: ProtocolMessage): boolean;
