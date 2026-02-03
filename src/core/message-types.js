/**
 * @fileoverview Protocol message schemas for CrossBus.
 * All message types are frozen for immutability.
 * @module core/message-types
 */

// Import MessageType from common/types to ensure consistent type codes
import { MessageType, PROTOCOL_MARKER as PROTOCOL_PREFIX, PROTOCOL_VERSION } from '../common/types.js';

// Re-export for convenience
export { MessageType };

/**
 * Delivery status constants.
 * @readonly
 * @enum {string}
 */
export const DeliveryStatus = Object.freeze({
  /** Delivered to local listeners only */
  LOCAL: 'local',
  /** Sent to remote peer */
  REMOTE: 'remote',
  /** Queued for offline peer */
  QUEUED: 'queued',
  /** Delivery failed */
  FAILED: 'failed'
});

/**
 * Peer connection status constants.
 * @readonly
 * @enum {string}
 */
export const PeerStatus = Object.freeze({
  /** Connection in progress */
  CONNECTING: 'connecting',
  /** Successfully connected */
  CONNECTED: 'connected',
  /** Disconnected */
  DISCONNECTED: 'disconnected',
  /** Connection failed */
  FAILED: 'failed'
});

/**
 * Peer type constants.
 * @readonly
 * @enum {string}
 */
export const PeerType = Object.freeze({
  /** iframe element */
  IFRAME: 'iframe',
  /** Web Worker */
  WORKER: 'worker',
  /** Service Worker */
  SERVICE_WORKER: 'service-worker',
  /** Window (popup, tab) */
  WINDOW: 'window',
  /** MessagePort direct connection */
  PORT: 'port',
  /** Local (self) */
  LOCAL: 'local'
});

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
export function createMessage(type, payload, meta = {}, id = null) {
  return Object.freeze({
    [PROTOCOL_PREFIX]: PROTOCOL_VERSION,
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
export function createSignalMessage(name, data, sourcePeerId, destPeerId = null) {
  return createMessage(MessageType.SIGNAL, {
    name,
    data,
    source: sourcePeerId,
    dest: destPeerId
  });
}

/**
 * Creates a broadcast message.
 * 
 * @param {string} name - Signal name.
 * @param {*} data - Signal data.
 * @param {string} sourcePeerId - Source peer ID.
 * @param {Object} [options={}] - Broadcast options.
 * @returns {ProtocolMessage} Broadcast message.
 */
export function createBroadcastMessage(name, data, sourcePeerId, options = {}) {
  return createMessage(MessageType.BROADCAST, {
    name,
    data,
    source: sourcePeerId,
    options
  });
}

/**
 * Creates a handshake init message.
 * 
 * @param {string} peerId - Initiating peer ID.
 * @param {string} origin - Initiating peer origin.
 * @param {string} challenge - Random challenge string.
 * @returns {ProtocolMessage} Handshake init message.
 */
export function createHandshakeInit(peerId, origin, challenge) {
  return createMessage(MessageType.HANDSHAKE_INIT, {
    peerId,
    origin,
    challenge
  });
}

/**
 * Creates a handshake acknowledgment message.
 * 
 * @param {string} peerId - Responding peer ID.
 * @param {string} origin - Responding peer origin.
 * @param {string} challenge - Original challenge.
 * @param {string} response - Challenge response.
 * @returns {ProtocolMessage} Handshake ack message.
 */
export function createHandshakeAck(peerId, origin, challenge, response) {
  return createMessage(MessageType.HANDSHAKE_ACK, {
    peerId,
    origin,
    challenge,
    response
  });
}

/**
 * Creates a handshake complete message.
 * 
 * @param {string} peerId - Confirming peer ID.
 * @param {boolean} success - Whether handshake succeeded.
 * @returns {ProtocolMessage} Handshake complete message.
 */
export function createHandshakeComplete(peerId, success) {
  return createMessage(MessageType.HANDSHAKE_COMPLETE, {
    peerId,
    success
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
export function createRequestMessage(name, data, sourcePeerId, destPeerId, id = null) {
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
export function createResponseMessage(requestId, data, sourcePeerId, success = true, error = null) {
  return createMessage(MessageType.RESPONSE, {
    requestId,
    data,
    source: sourcePeerId,
    success,
    error
  });
}

/**
 * Validates if an object is a valid CrossBus protocol message.
 * 
 * @param {*} obj - Object to validate.
 * @returns {boolean} True if valid protocol message.
 */
export function isProtocolMessage(obj) {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    obj[PROTOCOL_PREFIX] === PROTOCOL_VERSION &&
    typeof obj.version === 'number' &&
    typeof obj.id === 'string' &&
    (typeof obj.type === 'string' || typeof obj.t === 'string') &&
    typeof obj.timestamp === 'number' &&
    obj.payload !== undefined
  );
}

/**
 * Validates protocol version compatibility.
 * 
 * @param {ProtocolMessage} message - Message to check.
 * @returns {boolean} True if version is compatible.
 */
export function isCompatibleVersion(message) {
  return message.version === PROTOCOL_VERSION;
}
