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
    /**
     * Creates a new Handshake handler.
     *
     * @param {HandshakeConfig} [config={}]
     */
    constructor(config?: HandshakeConfig);
    /**
     * Gets the local peer ID.
     * @returns {string}
     */
    get peerId(): string;
    /**
     * Creates a handshake initiation message.
     *
     * @returns {Object} Handshake init message.
     */
    createInitMessage(): any;
    /**
     * Creates a handshake acknowledgment message.
     *
     * @param {Object} initMessage - The received init message.
     * @param {boolean} accept - Whether to accept the connection.
     * @param {string} [reason] - Rejection reason if not accepted.
     * @returns {Object} Handshake ack message.
     */
    createAckMessage(initMessage: any, accept: boolean, reason?: string): any;
    /**
     * Creates a handshake completion message.
     *
     * @param {string} handshakeId - The handshake ID.
     * @returns {Object} Handshake complete message.
     */
    createCompleteMessage(handshakeId: string): any;
    /**
     * Initiates a handshake with a peer.
     *
     * @param {EventListener} sendFn - Function to send messages to peer.
     * @returns {Promise<HandshakeResult>} Result of handshake attempt.
     */
    initiate(sendFn: EventListener): Promise<HandshakeResult>;
    /**
     * Handles a received handshake message.
     *
     * @param {Object} message - Received handshake message.
     * @param {string} origin - Origin of the message.
     * @param {EventListener} sendFn - Function to send response.
     * @param {EventListener} [validateFn] - Optional validation function.
     * @returns {PeerInfo|null} Peer info if handshake completes, null otherwise.
     */
    handleMessage(message: any, origin: string, sendFn: EventListener, validateFn?: EventListener): PeerInfo | null;
    /**
     * Checks if a handshake is pending.
     *
     * @param {string} handshakeId
     * @returns {boolean}
     */
    hasPending(handshakeId: string): boolean;
    /**
     * Cancels a pending handshake.
     *
     * @param {string} handshakeId
     */
    cancel(handshakeId: string): void;
    /**
     * Cancels all pending handshakes.
     */
    cancelAll(): void;
    #private;
}
export type HandshakeConfig = {
    /**
     * - Our peer ID (auto-generated if not specified).
     */
    peerId?: string | undefined;
    /**
     * - Handshake timeout in ms.
     */
    timeout?: number | undefined;
    /**
     * - Metadata to share with peer.
     */
    meta?: any;
    /**
     * - Supported capabilities.
     */
    capabilities?: string[] | undefined;
};
export type PeerInfo = {
    /**
     * - Remote peer's ID.
     */
    peerId: string;
    /**
     * - Remote peer's origin.
     */
    origin: string;
    /**
     * - Remote peer's type (iframe, worker, etc).
     */
    type: string;
    /**
     * - Remote peer's metadata.
     */
    meta: any;
    /**
     * - Remote peer's capabilities.
     */
    capabilities: string[];
    /**
     * - Connection timestamp.
     */
    connectedAt: number;
};
export type HandshakeResult = {
    /**
     * - Whether handshake succeeded.
     */
    success: boolean;
    /**
     * - Peer info if successful.
     */
    peer?: PeerInfo | undefined;
    /**
     * - Error code if failed.
     */
    error?: string | undefined;
    /**
     * - Error reason if failed.
     */
    reason?: string | undefined;
};
