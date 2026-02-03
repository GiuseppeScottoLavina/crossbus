/**
 * Creates a presence manager integrated with CrossBus.
 *
 * @param {import('./cross-bus.js').CrossBus} bus - CrossBus instance.
 * @param {PresenceOptions} [options] - Options.
 * @returns {PresenceManager}
 *
 * @example
 * const bus = new CrossBus({ peerId: 'my-peer' });
 * const presence = createPresence(bus);
 *
 * presence.on('join', (peerId) => console.log(`${peerId} joined`));
 */
export function createPresence(bus: import("./cross-bus.js").CrossBus, options?: PresenceOptions): PresenceManager;
/**
 * @typedef {Object} PresenceOptions
 * @property {number} [heartbeatInterval=15000] - How often to send heartbeat (ms).
 * @property {number} [timeout=45000] - Time before peer considered offline (ms).
 * @property {boolean} [autoStart=true] - Start heartbeat automatically.
 */
/**
 * @typedef {Object} PeerPresence
 * @property {string} peerId - Peer identifier.
 * @property {'online' | 'away' | 'offline'} status - Current status.
 * @property {number} lastSeen - Timestamp of last activity.
 * @property {Object} [meta] - Optional metadata (user info, etc).
 */
/**
 * @typedef {'join' | 'leave' | 'update' | 'heartbeat'} PresenceEvent
 */
/**
 * Presence manager for tracking online peers.
 *
 * Emits events:
 * - 'join' - Peer came online
 * - 'leave' - Peer went offline
 * - 'update' - Peer presence updated
 *
 * @example
 * const presence = new PresenceManager(sendFn, { peerId: 'my-peer' });
 *
 * presence.on('join', (peerId, meta) => console.log(`${peerId} is online`));
 * presence.on('leave', (peerId) => console.log(`${peerId} went offline`));
 *
 * // Get all online peers
 * const online = presence.getOnlinePeers();
 *
 * // Update own status
 * presence.setStatus('away');
 *
 * // Cleanup
 * presence.destroy();
 */
export class PresenceManager extends EventEmitter {
    /**
     * Creates a PresenceManager.
     *
     * @param {Function} sendFn - Function to broadcast messages: (message) => Promise.
     * @param {{ peerId: string } & PresenceOptions} options - Options.
     */
    constructor(sendFn: Function, options: {
        peerId: string;
    } & PresenceOptions);
    /**
     * Gets own peer ID.
     * @returns {string}
     */
    get peerId(): string;
    /**
     * Gets own status.
     * @returns {'online' | 'away' | 'offline'}
     */
    get status(): "online" | "away" | "offline";
    /**
     * Gets count of online peers.
     * @returns {number}
     */
    get onlineCount(): number;
    /**
     * Starts the presence system.
     */
    start(): void;
    /**
     * Stops the presence system.
     */
    stop(): void;
    /**
     * Sets own presence status.
     *
     * @param {'online' | 'away' | 'offline'} status - New status.
     * @param {Object} [meta] - Optional metadata update.
     */
    setStatus(status: "online" | "away" | "offline", meta?: any): void;
    /**
     * Sets own metadata.
     *
     * @param {Object} meta - Metadata to merge.
     */
    setMeta(meta: any): void;
    /**
     * Gets all online peer IDs.
     *
     * @returns {string[]}
     */
    getOnlinePeers(): string[];
    /**
     * Gets all peer presences.
     *
     * @returns {PeerPresence[]}
     */
    getAllPeers(): PeerPresence[];
    /**
     * Gets a specific peer's presence.
     *
     * @param {string} peerId - Peer ID.
     * @returns {PeerPresence | undefined}
     */
    getPeer(peerId: string): PeerPresence | undefined;
    /**
     * Checks if a peer is online.
     *
     * @param {string} peerId - Peer ID to check.
     * @returns {boolean}
     */
    isOnline(peerId: string): boolean;
    /**
     * Handles incoming presence message.
     * Call this from CrossBus message handler.
     *
     * @param {Object} message - Presence message.
     * @param {string} fromPeerId - Source peer ID.
     */
    handleMessage(message: any, fromPeerId: string): void;
    /**
     * Destroys the presence manager.
     */
    destroy(): void;
    /**
     * Gets whether manager is destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    #private;
}
export type PresenceOptions = {
    /**
     * - How often to send heartbeat (ms).
     */
    heartbeatInterval?: number | undefined;
    /**
     * - Time before peer considered offline (ms).
     */
    timeout?: number | undefined;
    /**
     * - Start heartbeat automatically.
     */
    autoStart?: boolean | undefined;
};
export type PeerPresence = {
    /**
     * - Peer identifier.
     */
    peerId: string;
    /**
     * - Current status.
     */
    status: "online" | "away" | "offline";
    /**
     * - Timestamp of last activity.
     */
    lastSeen: number;
    /**
     * - Optional metadata (user info, etc).
     */
    meta?: any;
};
export type PresenceEvent = "join" | "leave" | "update" | "heartbeat";
import { EventEmitter } from './event-emitter.js';
