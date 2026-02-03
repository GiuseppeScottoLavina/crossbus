/**
 * @fileoverview Secure handshake protocol for peer negotiation.
 * Handles connection establishment, authentication, and capability exchange.
 * @module security/handshake
 */

import { MessageType, HandshakePhase } from '../common/types.js';
import { ErrorCode } from '../common/errors.js';
import { uuid, deferred, withTimeout } from '../common/utils.js';

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
export class Handshake {
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
