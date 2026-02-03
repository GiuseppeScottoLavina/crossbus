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
    addPeer(peerId: string, sendFn: EventListener, options?: {
        meta?: any;
        origin?: string | undefined;
    }): void;
    /**
     * Removes a peer from the routing table.
     *
     * @param {string} peerId - Peer to remove.
     * @returns {boolean} True if peer was removed.
     */
    removePeer(peerId: string): boolean;
    /**
     * Gets a peer by ID.
     *
     * @param {string} peerId
     * @returns {RoutingEntry|undefined}
     */
    getPeer(peerId: string): RoutingEntry | undefined;
    /**
     * Gets all connected peer IDs.
     *
     * @returns {string[]}
     */
    getPeerIds(): string[];
    /**
     * Gets count of connected peers.
     *
     * @returns {number}
     */
    get peerCount(): number;
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
    route(message: {
        target?: string | undefined;
        payload: any;
    }, options?: {
        exclude?: string[] | undefined;
    }): RouteResult;
    /**
     * Broadcasts a message to all peers.
     *
     * @param {Object} payload - Message payload.
     * @param {Object} [options={}] - Broadcast options.
     * @param {string[]} [options.exclude] - Peers to exclude.
     * @param {string[]} [options.include] - Only include these peers.
     * @returns {RouteResult}
     */
    broadcast(payload: any, options?: {
        exclude?: string[] | undefined;
        include?: string[] | undefined;
    }): RouteResult;
    /**
     * Gets the next sequence number for a peer.
     * Used for causal ordering in SignalStore.
     *
     * @param {string} peerId
     * @returns {number}
     */
    getSequence(peerId: string): number;
    /**
     * Updates peer status.
     *
     * @param {string} peerId
     * @param {PeerStatus} status
     */
    setPeerStatus(peerId: string, status: PeerStatus): void;
    /**
     * Clears all peers.
     */
    clearPeers(): void;
    #private;
}
export type RoutingEntry = {
    /**
     * - Peer identifier.
     */
    peerId: string;
    /**
     * - Function to send to this peer.
     */
    sendFn: Function;
    /**
     * - Peer metadata.
     */
    meta: any;
    /**
     * - Peer origin.
     */
    origin: string;
    /**
     * - Connection status.
     */
    status: PeerStatus;
    /**
     * - Connection timestamp.
     */
    connectedAt: number;
};
export type RouteResult = {
    /**
     * - Whether routing succeeded.
     */
    success: boolean;
    /**
     * - Number of peers message was delivered to.
     */
    delivered: number;
    /**
     * - Peer IDs that failed delivery.
     */
    failed: string[];
};
import { EventEmitter } from '../core/event-emitter.js';
import { PeerStatus } from '../common/types.js';
