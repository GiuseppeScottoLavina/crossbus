/**
 * @typedef {Object} PeerInfo
 * @property {string} id - Unique peer ID.
 * @property {PeerType} type - Type of peer (iframe, worker, etc).
 * @property {string} origin - Peer's origin URL.
 * @property {PeerStatus} status - Current connection status.
 * @property {number} connectedAt - Connection timestamp.
 * @property {number|null} [lastSeen] - Last message received timestamp.
 * @property {*} target - Reference to the peer target (iframe, worker, etc).
 * @property {MessagePort|null} [port] - MessagePort for direct communication.
 */
/**
 * @typedef {Object} QueuedMessage
 * @property {Object} message - The protocol message.
 * @property {number} timestamp - When the message was queued.
 * @property {number} retries - Number of retry attempts.
 */
/**
 * @typedef {Object} PeerRegistryConfig
 * @property {number} [maxQueueSize=100] - Max queued messages per peer.
 * @property {number} [maxRetries=3] - Max retry attempts for queued messages.
 * @property {number} [staleTimeout=30000] - Time (ms) before peer is considered stale.
 */
/**
 * Registry for managing connected peers.
 *
 * @example
 * const registry = new PeerRegistry({ maxQueueSize: 50 });
 *
 * // Add a peer
 * registry.add({
 *   id: 'widget-iframe',
 *   type: 'iframe',
 *   origin: 'https://widget.example.com',
 *   target: iframeElement.contentWindow
 * });
 *
 * // Get peer
 * const peer = registry.get('widget-iframe');
 *
 * // Update status
 * registry.updateStatus('widget-iframe', 'connected');
 */
export class PeerRegistry {
    /**
     * Creates a new PeerRegistry.
     *
     * @param {PeerRegistryConfig} [config={}] - Configuration options.
     */
    constructor(config?: PeerRegistryConfig);
    /**
     * Adds a new peer to the registry.
     *
     * @param {Object} options - Peer options.
     * @param {string} options.id - Unique peer ID.
     * @param {PeerType} options.type - Peer type.
     * @param {string} options.origin - Peer origin.
     * @param {*} options.target - Peer target reference.
     * @param {MessagePort|null} [options.port] - Optional MessagePort.
     * @returns {PeerInfo} The added peer info.
     * @throws {Error} If peer with same ID already exists.
     *
     * @example
     * const peer = registry.add({
     *   id: 'my-worker',
     *   type: 'worker',
     *   origin: location.origin,
     *   target: new Worker('worker.js')
     * });
     */
    add({ id, type, origin, target, port }: {
        id: string;
        type: PeerType;
        origin: string;
        target: any;
        port?: MessagePort | null | undefined;
    }): PeerInfo;
    /**
     * Gets a peer by ID.
     *
     * @param {string} id - Peer ID.
     * @returns {PeerInfo|undefined} Peer info or undefined if not found.
     */
    get(id: string): PeerInfo | undefined;
    /**
     * Checks if a peer exists.
     *
     * @param {string} id - Peer ID.
     * @returns {boolean} True if peer exists.
     */
    has(id: string): boolean;
    /**
     * Removes a peer from the registry.
     *
     * @param {string} id - Peer ID.
     * @returns {boolean} True if peer was removed.
     */
    remove(id: string): boolean;
    /**
     * Updates a peer's connection status.
     *
     * @param {string} id - Peer ID.
     * @param {PeerStatus} status - New status.
     * @returns {boolean} True if updated.
     */
    updateStatus(id: string, status: PeerStatus): boolean;
    /**
     * Updates a peer's last seen timestamp.
     *
     * @param {string} id - Peer ID.
     * @returns {boolean} True if updated.
     */
    touch(id: string): boolean;
    /**
     * Gets all connected peers.
     *
     * @returns {PeerInfo[]} Array of connected peers.
     */
    getConnected(): PeerInfo[];
    /**
     * Gets all peers.
     *
     * @returns {PeerInfo[]} Array of all peers.
     */
    getAll(): PeerInfo[];
    /**
     * Gets peer IDs.
     *
     * @returns {string[]} Array of peer IDs.
     */
    getIds(): string[];
    /**
     * Gets the count of peers by status.
     *
     * @returns {Object} Counts by status.
     */
    getCounts(): any;
    /**
     * Queues a message for an offline peer.
     *
     * @param {string} peerId - Target peer ID.
     * @param {Object} message - Message to queue.
     * @returns {boolean} True if queued, false if queue is full.
     */
    queueMessage(peerId: string, message: any): boolean;
    /**
     * Gets queued messages for a peer.
     *
     * @param {string} peerId - Peer ID.
     * @returns {QueuedMessage[]} Queued messages.
     */
    getQueuedMessages(peerId: string): QueuedMessage[];
    /**
     * Clears queued messages for a peer.
     *
     * @param {string} peerId - Peer ID.
     * @returns {number} Number of cleared messages.
     */
    clearQueue(peerId: string): number;
    /**
     * Drains the message queue for a peer (returns and clears).
     *
     * @param {string} peerId - Peer ID.
     * @returns {QueuedMessage[]} Drained messages.
     */
    drainQueue(peerId: string): QueuedMessage[];
    /**
     * Registers an event handler.
     *
     * @param {'add'|'remove'|'statusChange'} event - Event name.
     * @param {EventListener} handler - Event handler.
     * @returns {Function} Unsubscribe function.
     */
    on(event: "add" | "remove" | "statusChange", handler: EventListener): Function;
    /**
     * Finds stale peers (no activity for staleTimeout).
     *
     * @returns {PeerInfo[]} Array of stale peers.
     */
    findStale(): PeerInfo[];
    /**
     * Clears all peers and queues.
     */
    clear(): void;
    #private;
}
export type PeerInfo = {
    /**
     * - Unique peer ID.
     */
    id: string;
    /**
     * - Type of peer (iframe, worker, etc).
     */
    type: PeerType;
    /**
     * - Peer's origin URL.
     */
    origin: string;
    /**
     * - Current connection status.
     */
    status: PeerStatus;
    /**
     * - Connection timestamp.
     */
    connectedAt: number;
    /**
     * - Last message received timestamp.
     */
    lastSeen?: number | null | undefined;
    /**
     * - Reference to the peer target (iframe, worker, etc).
     */
    target: any;
    /**
     * - MessagePort for direct communication.
     */
    port?: MessagePort | null | undefined;
};
export type QueuedMessage = {
    /**
     * - The protocol message.
     */
    message: any;
    /**
     * - When the message was queued.
     */
    timestamp: number;
    /**
     * - Number of retry attempts.
     */
    retries: number;
};
export type PeerRegistryConfig = {
    /**
     * - Max queued messages per peer.
     */
    maxQueueSize?: number | undefined;
    /**
     * - Max retry attempts for queued messages.
     */
    maxRetries?: number | undefined;
    /**
     * - Time (ms) before peer is considered stale.
     */
    staleTimeout?: number | undefined;
};
import { PeerType } from './message-types.js';
import { PeerStatus } from './message-types.js';
