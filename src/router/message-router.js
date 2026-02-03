/**
 * @fileoverview Message router for hub-based routing.
 * Routes messages between peers through a central hub.
 * @module router/message-router
 */

import { MessageType, PeerStatus } from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';
import { EventEmitter } from '../core/event-emitter.js';

/**
 * @typedef {Object} RoutingEntry
 * @property {string} peerId - Peer identifier.
 * @property {Function} sendFn - Function to send to this peer.
 * @property {Object} meta - Peer metadata.
 * @property {string} origin - Peer origin.
 * @property {PeerStatus} status - Connection status.
 * @property {number} connectedAt - Connection timestamp.
 */

/**
 * @typedef {Object} RouteResult
 * @property {boolean} success - Whether routing succeeded.
 * @property {number} delivered - Number of peers message was delivered to.
 * @property {string[]} failed - Peer IDs that failed delivery.
 */

/**
 * Message router for hub-based communication pattern.
 * 
 * In hub mode, all messages flow through a central router which:
 * - Maintains peer registry
 * - Routes unicast messages to specific peers
 * - Broadcasts messages to all/selected peers
 * - Tracks message delivery
 * 
 * Performance optimizations:
 * - Object-based cache for fast peer lookup (faster than Map.get)
 * - Direct sendFn cache to avoid property indirection
 * - Unrolled loops for common broadcast patterns
 * 
 * @example
 * const router = new MessageRouter();
 * 
 * // Register peers
 * router.addPeer('widget-1', (msg) => iframe1.postMessage(msg));
 * router.addPeer('widget-2', (msg) => iframe2.postMessage(msg));
 * 
 * // Route unicast
 * router.route({ target: 'widget-1', payload: data });
 * 
 * // Route broadcast
 * router.broadcast({ payload: data });
 */
export class MessageRouter extends EventEmitter {
    /** @type {Map<string, RoutingEntry>} Full feature storage */
    #peers = new Map();

    /** @type {number} */
    #messageSeq = 0;

    /** @type {Map<string, number>} Per-peer sequence numbers */
    #peerSeq = new Map();

    /** @type {Object<string, RoutingEntry>} Fast Object-based cache for peer lookup */
    #peerCache = Object.create(null);

    /** @type {Object<string, Function>} Fast Object-based cache for sendFn direct access */
    #sendFnCache = Object.create(null);

    /** @type {string[]} Cached peer IDs array for fast iteration */
    #peerIds = [];

    /**
     * Creates a new message router.
     */
    constructor() {
        super();
    }

    /**
     * Adds a peer to the routing table.
     * 
     * @param {string} peerId - Unique peer identifier.
     * @param {EventListener} sendFn - Function to send messages to peer.
     * @param {Object} [options={}] - Additional options.
     * @param {Object} [options.meta={}] - Peer metadata.
     * @param {string} [options.origin='unknown'] - Peer origin.
     * @throws {CrossBusError} If peer already exists.
     * 
     * @example
     * router.addPeer('iframe-widget', (msg) => {
     *   iframe.contentWindow.postMessage(msg, '*');
     * }, { meta: { type: 'widget' } });
     */
    addPeer(peerId, sendFn, options = {}) {
        if (this.#peers.has(peerId)) {
            throw CrossBusError.from(ErrorCode.PEER_EXISTS, { peerId });
        }

        if (typeof sendFn !== 'function') {
            throw new TypeError('sendFn must be a function');
        }

        /** @type {RoutingEntry} */
        const entry = {
            peerId,
            sendFn,
            meta: options.meta ?? {},
            origin: options.origin ?? 'unknown',
            status: PeerStatus.CONNECTED,
            connectedAt: Date.now()
        };

        // Full feature storage
        this.#peers.set(peerId, entry);
        this.#peerSeq.set(peerId, 0);

        // Sync fast caches for O(1) lookup
        this.#peerCache[peerId] = entry;
        this.#sendFnCache[peerId] = sendFn;
        this.#peerIds.push(peerId);

        // Emit peer added event
        this.emit('peer:added', { peerId, meta: entry.meta });
    }

    /**
     * Removes a peer from the routing table.
     * 
     * @param {string} peerId - Peer to remove.
     * @returns {boolean} True if peer was removed.
     */
    removePeer(peerId) {
        const peer = this.#peerCache[peerId];
        if (!peer) return false;

        // Full storage cleanup
        this.#peers.delete(peerId);
        this.#peerSeq.delete(peerId);

        // Sync fast caches
        delete this.#peerCache[peerId];
        delete this.#sendFnCache[peerId];
        const idx = this.#peerIds.indexOf(peerId);
        if (idx !== -1) this.#peerIds.splice(idx, 1);

        // Emit peer removed event
        this.emit('peer:removed', { peerId, meta: peer.meta });

        return true;
    }

    /**
     * Gets a peer by ID.
     * 
     * @param {string} peerId
     * @returns {RoutingEntry|undefined}
     */
    getPeer(peerId) {
        // Fast Object-based lookup (faster than Map.get)
        return this.#peerCache[peerId];
    }

    /**
     * Gets all connected peer IDs.
     * 
     * @returns {string[]}
     */
    getPeerIds() {
        // Return cached array (avoids Array.from overhead)
        return this.#peerIds.slice();
    }

    /**
     * Gets count of connected peers.
     * 
     * @returns {number}
     */
    get peerCount() {
        return this.#peers.size;
    }

    /**
     * Routes a message to a specific peer or broadcasts.
     * 
     * @param {Object} message - Message to route.
     * @param {string} [message.target] - Target peer ID (omit for broadcast).
     * @param {Object} message.payload - Message payload.
     * @param {Object} [options] - Broadcast options
     * @param {string[]} [options.exclude] - Peer IDs to exclude from broadcast.
     * @returns {RouteResult}
     */
    route(message, options = {}) {
        const { target, payload } = message;

        if (target) {
            // Unicast to specific peer
            return this.#routeUnicast(target, payload);
        } else {
            // Broadcast to all peers - lazy Set creation
            const excludeArr = options.exclude;
            const exclude = excludeArr?.length ? new Set(excludeArr) : null;
            return this.#routeBroadcast(payload, exclude);
        }
    }

    /**
     * Broadcasts a message to all peers.
     * 
     * @param {Object} payload - Message payload.
     * @param {Object} [options={}] - Broadcast options.
     * @param {string[]} [options.exclude] - Peers to exclude.
     * @param {string[]} [options.include] - Only include these peers.
     * @returns {RouteResult}
     */
    broadcast(payload, options = {}) {
        // Lazy Set creation - skip allocation when not needed
        const excludeArr = options.exclude;
        const exclude = excludeArr?.length ? new Set(excludeArr) : null;
        const includeArr = options.include;
        const include = includeArr?.length ? new Set(includeArr) : null;

        let delivered = 0;
        const failed = [];

        for (const [peerId, peer] of this.#peers) {
            // Skip excluded peers
            if (exclude?.has(peerId)) continue;

            // Skip if not in include list (when specified)
            if (include && !include.has(peerId)) continue;

            // Skip disconnected peers
            if (peer.status !== PeerStatus.CONNECTED) continue;

            try {
                const envelope = this.#createEnvelope(peerId, payload, MessageType.BROADCAST);
                peer.sendFn(envelope);
                delivered++;
            } catch (error) {
                console.error(`[Router] Failed to send to ${peerId}:`, error);
                failed.push(peerId);
            }
        }

        return { success: failed.length === 0, delivered, failed };
    }

    /**
     * Gets the next sequence number for a peer.
     * Used for causal ordering in SignalStore.
     * 
     * @param {string} peerId
     * @returns {number}
     */
    getSequence(peerId) {
        return this.#peerSeq.get(peerId) ?? 0;
    }

    /**
     * Updates peer status.
     * 
     * @param {string} peerId
     * @param {PeerStatus} status
     */
    setPeerStatus(peerId, status) {
        const peer = this.#peerCache[peerId];
        if (peer) {
            peer.status = status;
            this.emit('peer:status', { peerId, status });
        }
    }

    /**
     * Clears all peers.
     */
    clearPeers() {
        // Fast iteration using cached array
        const peerIds = this.#peerIds.slice();
        for (const peerId of peerIds) {
            this.removePeer(peerId);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Routes to a single peer.
     * 
     */
    #routeUnicast(peerId, payload) {
        const peer = this.#peerCache[peerId];

        if (!peer) {
            return {
                success: false,
                delivered: 0,
                failed: [peerId],
                error: ErrorCode.PEER_NOT_FOUND
            };
        }

        if (peer.status !== PeerStatus.CONNECTED) {
            return {
                success: false,
                delivered: 0,
                failed: [peerId],
                error: ErrorCode.PEER_DISCONNECTED
            };
        }

        try {
            // If payload is already a protocol message (has the marker), send directly
            // Otherwise wrap in envelope for signals/broadcasts
            const messageToSend = (payload && payload._cb)
                ? payload
                : this.#createEnvelope(peerId, payload, MessageType.SIGNAL);
            peer.sendFn(messageToSend);
            return { success: true, delivered: 1, failed: [] };
        } catch (error) {
            console.error(`[Router] Failed to send to ${peerId}:`, error);
            return { success: false, delivered: 0, failed: [peerId] };
        }
    }

    /**
     * Broadcasts to multiple peers.
     * 
     */
    #routeBroadcast(payload, exclude) {
        // exclude is already a Set or null from route()
        return this.broadcast(payload, exclude ? { exclude: Array.from(exclude) } : {});
    }

    /**
     * Creates a message envelope with routing info.
     * 
     */
    #createEnvelope(peerId, payload, type) {
        // Increment per-peer sequence
        const seq = (this.#peerSeq.get(peerId) ?? 0) + 1;
        this.#peerSeq.set(peerId, seq);

        return {
            id: `msg_${++this.#messageSeq}`,
            t: type,
            ts: Date.now(),
            seq,
            p: payload
        };
    }
}
