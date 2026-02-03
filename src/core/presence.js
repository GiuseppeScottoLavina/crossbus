/**
 * @fileoverview Presence system for CrossBus.
 * Tracks online peers with heartbeat-based detection.
 * @module core/presence
 */

import { EventEmitter } from './event-emitter.js';
import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../common/types.js';

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
    /** @type {string} */
    #peerId;

    /** @type {Function} */
    #sendFn;

    /** @type {Map<string, PeerPresence>} */
    #peers = new Map();

    /** @type {number} */
    #heartbeatInterval;

    /** @type {number} */
    #timeout;

    /** @type {ReturnType<typeof setInterval>|null} */
    #heartbeatTimer = null;

    /** @type {ReturnType<typeof setInterval>|null} */
    #cleanupTimer = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {'online' | 'away' | 'offline'} */
    #status = 'online';

    /** @type {Object} */
    #meta = {};

    /**
     * Creates a PresenceManager.
     * 
     * @param {Function} sendFn - Function to broadcast messages: (message) => Promise.
     * @param {{ peerId: string } & PresenceOptions} options - Options.
     */
    constructor(sendFn, options) {
        super();

        if (!options.peerId) {
            throw new Error('peerId is required');
        }

        this.#peerId = options.peerId;
        this.#sendFn = sendFn;
        this.#heartbeatInterval = options.heartbeatInterval ?? 15000;
        this.#timeout = options.timeout ?? 45000;

        if (options.autoStart !== false) {
            this.start();
        }
    }

    /**
     * Gets own peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#peerId;
    }

    /**
     * Gets own status.
     * @returns {'online' | 'away' | 'offline'}
     */
    get status() {
        return this.#status;
    }

    /**
     * Gets count of online peers.
     * @returns {number}
     */
    get onlineCount() {
        let count = 0;
        for (const peer of this.#peers.values()) {
            if (peer.status !== 'offline') count++;
        }
        return count;
    }

    /**
     * Starts the presence system.
     */
    start() {
        if (this.#heartbeatTimer) return;

        // Send initial presence
        this.#sendPresence('join');

        // Start heartbeat
        this.#heartbeatTimer = setInterval(() => {
            this.#sendPresence('heartbeat');
        }, this.#heartbeatInterval);

        // Start cleanup timer
        this.#cleanupTimer = setInterval(() => {
            this.#cleanupOfflinePeers();
        }, this.#heartbeatInterval);
    }

    /**
     * Stops the presence system.
     */
    stop() {
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;
        }

        if (this.#cleanupTimer) {
            clearInterval(this.#cleanupTimer);
            this.#cleanupTimer = null;
        }

        // Announce leaving
        this.#sendPresence('leave');
    }

    /**
     * Sets own presence status.
     * 
     * @param {'online' | 'away' | 'offline'} status - New status.
     * @param {Object} [meta] - Optional metadata update.
     */
    setStatus(status, meta) {
        this.#status = status;
        if (meta) {
            this.#meta = { ...this.#meta, ...meta };
        }
        this.#sendPresence('update');
    }

    /**
     * Sets own metadata.
     * 
     * @param {Object} meta - Metadata to merge.
     */
    setMeta(meta) {
        this.#meta = { ...this.#meta, ...meta };
        this.#sendPresence('update');
    }

    /**
     * Gets all online peer IDs.
     * 
     * @returns {string[]}
     */
    getOnlinePeers() {
        const result = [];
        for (const [peerId, peer] of this.#peers) {
            if (peer.status !== 'offline') {
                result.push(peerId);
            }
        }
        return result;
    }

    /**
     * Gets all peer presences.
     * 
     * @returns {PeerPresence[]}
     */
    getAllPeers() {
        return Array.from(this.#peers.values());
    }

    /**
     * Gets a specific peer's presence.
     * 
     * @param {string} peerId - Peer ID.
     * @returns {PeerPresence | undefined}
     */
    getPeer(peerId) {
        return this.#peers.get(peerId);
    }

    /**
     * Checks if a peer is online.
     * 
     * @param {string} peerId - Peer ID to check.
     * @returns {boolean}
     */
    isOnline(peerId) {
        const peer = this.#peers.get(peerId);
        return peer ? peer.status !== 'offline' : false;
    }

    /**
     * Handles incoming presence message.
     * Call this from CrossBus message handler.
     * 
     * @param {Object} message - Presence message.
     * @param {string} fromPeerId - Source peer ID.
     */
    handleMessage(message, fromPeerId) {
        if (message.t !== 'presence') return;
        if (fromPeerId === this.#peerId) return; // Ignore own messages

        const { pt: presenceType, status, meta } = message;
        const now = Date.now();

        switch (presenceType) {
            case 'join':
                this.#handleJoin(fromPeerId, status, meta, now);
                // Respond with own presence so they know we're here
                this.#sendPresence('heartbeat');
                break;

            case 'leave':
                this.#handleLeave(fromPeerId);
                break;

            case 'heartbeat':
            case 'update':
                this.#handleUpdate(fromPeerId, status, meta, now);
                break;
        }
    }

    /**
     * Handles peer join.
     */
    #handleJoin(peerId, status, meta, now) {
        const isNew = !this.#peers.has(peerId);

        this.#peers.set(peerId, {
            peerId,
            status: status ?? 'online',
            lastSeen: now,
            meta: meta ?? {}
        });

        if (isNew) {
            this.emitSync('join', { peerId, meta });
        }
    }

    /**
     * Handles peer leave.
     */
    #handleLeave(peerId) {
        const peer = this.#peers.get(peerId);
        if (!peer) return;

        peer.status = 'offline';
        this.#peers.delete(peerId);
        this.emitSync('leave', { peerId });
    }

    /**
     * Handles presence update/heartbeat.
     */
    #handleUpdate(peerId, status, meta, now) {
        let peer = this.#peers.get(peerId);
        const wasOffline = !peer || peer.status === 'offline';

        if (!peer) {
            peer = {
                peerId,
                status: status ?? 'online',
                lastSeen: now,
                meta: meta ?? {}
            };
            this.#peers.set(peerId, peer);
        } else {
            peer.lastSeen = now;
            if (status) peer.status = status;
            if (meta) peer.meta = { ...peer.meta, ...meta };
        }

        if (wasOffline && peer.status !== 'offline') {
            this.emitSync('join', { peerId, meta: peer.meta });
        } else {
            this.emitSync('update', { peerId, peer });
        }
    }

    /**
     * Cleans up peers that haven't sent heartbeat.
     */
    #cleanupOfflinePeers() {
        const now = Date.now();
        const threshold = now - this.#timeout;

        for (const [peerId, peer] of this.#peers) {
            if (peer.lastSeen < threshold && peer.status !== 'offline') {
                peer.status = 'offline';
                this.#peers.delete(peerId);
                this.emitSync('leave', { peerId });
            }
        }
    }

    /**
     * Sends presence message.
     */
    async #sendPresence(type) {
        if (this.#destroyed) return;

        const message = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            t: 'presence',
            pt: type,
            peerId: this.#peerId,
            status: this.#status,
            meta: this.#meta,
            ts: Date.now()
        };

        try {
            await this.#sendFn(message);
        } catch (e) {
            console.error('[CrossBus] Failed to send presence:', e);
        }
    }

    /**
     * Destroys the presence manager.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.stop();
        this.#peers.clear();
    }

    /**
     * Gets whether manager is destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }
}

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
export function createPresence(bus, options = {}) {
    const sendFn = async (message) => {
        // Broadcast to all peers
        await bus.signal('__presence__', message);
    };

    const presence = new PresenceManager(sendFn, {
        peerId: bus.peerId,
        ...options
    });

    // Register handler for presence messages
    bus.on('__presence__', (message, ctx) => {
        presence.handleMessage(message, ctx?.peerId ?? message.peerId);
    });

    return presence;
}
