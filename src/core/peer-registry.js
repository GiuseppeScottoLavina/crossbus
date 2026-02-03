/**
 * @fileoverview Peer registry for managing connected peers.
 * Tracks connection status, handles reconnection, and manages message queues.
 * @module core/peer-registry
 */

import { PeerStatus, PeerType } from './message-types.js';

/** @type {symbol} Private storage for peers map */
const PEERS = Symbol('peers');

/** @type {symbol} Private storage for message queues */
const QUEUES = Symbol('queues');

/** @type {symbol} Private storage for event handlers */
const HANDLERS = Symbol('handlers');

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
    /** @type {PeerRegistryConfig} */
    #config;

    /**
     * Creates a new PeerRegistry.
     * 
     * @param {PeerRegistryConfig} [config={}] - Configuration options.
     */
    constructor(config = {}) {
        this.#config = {
            maxQueueSize: 100,
            maxRetries: 3,
            staleTimeout: 30000,
            ...config
        };

        /** @type {Map<string, PeerInfo>} */
        this[PEERS] = new Map();

        /** @type {Map<string, QueuedMessage[]>} */
        this[QUEUES] = new Map();

        /** @type {Map<string, Set<Function>>} */
        this[HANDLERS] = new Map();
    }

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
    add({ id, type, origin, target, port = /** @type {MessagePort|null} */(null) }) {
        if (this[PEERS].has(id)) {
            throw new Error(`Peer with ID "${id}" already exists`);
        }

        /** @type {PeerInfo} */
        const peer = {
            id,
            type,
            origin,
            status: PeerStatus.CONNECTING,
            connectedAt: Date.now(),
            lastSeen: null,
            target,
            port
        };

        this[PEERS].set(id, peer);
        this[QUEUES].set(id, []);

        this.#emit('add', peer);

        return peer;
    }

    /**
     * Gets a peer by ID.
     * 
     * @param {string} id - Peer ID.
     * @returns {PeerInfo|undefined} Peer info or undefined if not found.
     */
    get(id) {
        return this[PEERS].get(id);
    }

    /**
     * Checks if a peer exists.
     * 
     * @param {string} id - Peer ID.
     * @returns {boolean} True if peer exists.
     */
    has(id) {
        return this[PEERS].has(id);
    }

    /**
     * Removes a peer from the registry.
     * 
     * @param {string} id - Peer ID.
     * @returns {boolean} True if peer was removed.
     */
    remove(id) {
        const peer = this[PEERS].get(id);
        if (!peer) return false;

        this[PEERS].delete(id);
        this[QUEUES].delete(id);

        this.#emit('remove', peer);

        return true;
    }

    /**
     * Updates a peer's connection status.
     * 
     * @param {string} id - Peer ID.
     * @param {PeerStatus} status - New status.
     * @returns {boolean} True if updated.
     */
    updateStatus(id, status) {
        const peer = this[PEERS].get(id);
        if (!peer) return false;

        const oldStatus = peer.status;
        peer.status = status;

        if (status === PeerStatus.CONNECTED) {
            peer.lastSeen = Date.now();
        }

        this.#emit('statusChange', { peer, oldStatus, newStatus: status });

        return true;
    }

    /**
     * Updates a peer's last seen timestamp.
     * 
     * @param {string} id - Peer ID.
     * @returns {boolean} True if updated.
     */
    touch(id) {
        const peer = this[PEERS].get(id);
        if (!peer) return false;

        peer.lastSeen = Date.now();
        return true;
    }

    /**
     * Gets all connected peers.
     * 
     * @returns {PeerInfo[]} Array of connected peers.
     */
    getConnected() {
        return Array.from(this[PEERS].values())
            .filter(peer => peer.status === PeerStatus.CONNECTED);
    }

    /**
     * Gets all peers.
     * 
     * @returns {PeerInfo[]} Array of all peers.
     */
    getAll() {
        return Array.from(this[PEERS].values());
    }

    /**
     * Gets peer IDs.
     * 
     * @returns {string[]} Array of peer IDs.
     */
    getIds() {
        return Array.from(this[PEERS].keys());
    }

    /**
     * Gets the count of peers by status.
     * 
     * @returns {Object} Counts by status.
     */
    getCounts() {
        const counts = {
            total: 0,
            connected: 0,
            connecting: 0,
            disconnected: 0,
            failed: 0
        };

        for (const peer of this[PEERS].values()) {
            counts.total++;
            counts[peer.status]++;
        }

        return counts;
    }

    // ========== Message Queue Methods ==========

    /**
     * Queues a message for an offline peer.
     * 
     * @param {string} peerId - Target peer ID.
     * @param {Object} message - Message to queue.
     * @returns {boolean} True if queued, false if queue is full.
     */
    queueMessage(peerId, message) {
        const queue = this[QUEUES].get(peerId);
        if (!queue) return false;

        if (queue.length >= (this.#config?.maxQueueSize ?? 100)) {
            // Remove oldest message to make room
            queue.shift();
        }

        queue.push({
            message,
            timestamp: Date.now(),
            retries: 0
        });

        return true;
    }

    /**
     * Gets queued messages for a peer.
     * 
     * @param {string} peerId - Peer ID.
     * @returns {QueuedMessage[]} Queued messages.
     */
    getQueuedMessages(peerId) {
        return this[QUEUES].get(peerId) ?? [];
    }

    /**
     * Clears queued messages for a peer.
     * 
     * @param {string} peerId - Peer ID.
     * @returns {number} Number of cleared messages.
     */
    clearQueue(peerId) {
        const queue = this[QUEUES].get(peerId);
        if (!queue) return 0;

        const count = queue.length;
        queue.length = 0;
        return count;
    }

    /**
     * Drains the message queue for a peer (returns and clears).
     * 
     * @param {string} peerId - Peer ID.
     * @returns {QueuedMessage[]} Drained messages.
     */
    drainQueue(peerId) {
        const queue = this[QUEUES].get(peerId);
        if (!queue) return [];

        const messages = [...queue];
        queue.length = 0;
        return messages;
    }

    // ========== Event Methods ==========

    /**
     * Registers an event handler.
     * 
     * @param {'add'|'remove'|'statusChange'} event - Event name.
     * @param {EventListener} handler - Event handler.
     * @returns {Function} Unsubscribe function.
     */
    on(event, handler) {
        if (!this[HANDLERS].has(event)) {
            this[HANDLERS].set(event, new Set());
        }
        this[HANDLERS].get(event).add(handler);

        return () => this[HANDLERS].get(event)?.delete(handler);
    }

    /**
     * Emits an event.
     * 
     * 
     * @param {string} event - Event name.
     * @param {*} data - Event data.
     */
    #emit(event, data) {
        const handlers = this[HANDLERS].get(event);
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                handler(data);
            } catch (error) {
                console.error(`[PeerRegistry] Handler error for "${event}":`, error);
            }
        }
    }

    /**
     * Finds stale peers (no activity for staleTimeout).
     * 
     * @returns {PeerInfo[]} Array of stale peers.
     */
    findStale() {
        const now = Date.now();
        const threshold = now - (this.#config?.staleTimeout ?? 30000);

        return Array.from(this[PEERS].values()).filter(peer => {
            if (peer.status !== PeerStatus.CONNECTED) return false;
            return peer.lastSeen !== null && peer.lastSeen < threshold;
        });
    }

    /**
     * Clears all peers and queues.
     */
    clear() {
        this[PEERS].clear();
        this[QUEUES].clear();
    }
}
