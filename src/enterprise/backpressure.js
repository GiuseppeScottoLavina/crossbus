/**
 * @fileoverview Backpressure and flow control for CrossBus.
 * Prevents slow receivers from causing memory issues.
 * @module enterprise/backpressure
 */

/**
 * @typedef {'drop-oldest'|'drop-newest'|'reject'|'pause'} BackpressureStrategy
 */

/**
 * @typedef {Object} QueueStats
 * @property {number} size - Current queue size
 * @property {number} maxSize - Maximum queue size
 * @property {number} dropped - Messages dropped
 * @property {number} processed - Messages processed
 * @property {boolean} isPaused - Whether queue is paused
 */

/**
 * Per-peer message queue with backpressure support.
 */
class PeerQueue {
    /** @type {Object[]} */
    #queue = [];

    /** @type {number} */
    #maxSize;

    /** @type {BackpressureStrategy} */
    #strategy;

    /** @type {number} */
    #dropped = 0;

    /** @type {number} */
    #processed = 0;

    /** @type {boolean} */
    #paused = false;

    /** @type {((message: Object) => void)|null} */
    #sendFn = null;

    /** @type {string} */
    // #peerId;

    /**
     * @param {string} peerId - Peer ID
     * @param {Object} options - Queue options
     * @param {number} options.maxSize - Maximum queue size
     * @param {BackpressureStrategy} options.strategy - Backpressure strategy
     */
    constructor(peerId, options) {
        // this.#peerId = peerId;
        this.#maxSize = options.maxSize;
        this.#strategy = options.strategy;
    }

    /**
     * Sets the send function.
     * @param {(message: Object) => void} sendFn
     */
    setSendFn(sendFn) {
        this.#sendFn = sendFn;
    }

    /**
     * Enqueues a message.
     * @param {Object} message - Message to enqueue
     * @returns {{ success: boolean, queued: boolean, dropped: boolean }}
     */
    enqueue(message) {
        // If not paused and queue is empty, send immediately
        if (!this.#paused && this.#queue.length === 0 && this.#sendFn) {
            try {
                this.#sendFn(message);
                this.#processed++;
                return { success: true, queued: false, dropped: false };
            } catch {
                // Send failed, queue the message
            }
        }

        // Check if queue is full
        if (this.#queue.length >= this.#maxSize) {
            return this.#handleBackpressure(message);
        }

        // Add to queue
        this.#queue.push(message);
        return { success: true, queued: true, dropped: false };
    }

    /**
     * Handles backpressure when queue is full.
     */
    #handleBackpressure(message) {
        switch (this.#strategy) {
            case 'drop-oldest':
                this.#queue.shift();
                this.#queue.push(message);
                this.#dropped++;
                return { success: true, queued: true, dropped: true };

            case 'drop-newest':
                this.#dropped++;
                return { success: false, queued: false, dropped: true };

            case 'reject':
                return { success: false, queued: false, dropped: false };

            case 'pause':
                this.#paused = true;
                return { success: false, queued: false, dropped: false };

            default:
                return { success: false, queued: false, dropped: false };
        }
    }

    /**
     * Processes queued messages.
     * @param {number} [count] - Max messages to process (default: all)
     * @returns {number} Number of messages processed
     */
    flush(count) {
        if (!this.#sendFn) return 0;

        const toProcess = count ?? this.#queue.length;
        let processed = 0;

        for (let i = 0; i < toProcess && this.#queue.length > 0; i++) {
            const message = this.#queue.shift();
            try {
                this.#sendFn(message);
                processed++;
                this.#processed++;
            } catch {
                // Put back at front of queue
                this.#queue.unshift(message);
                break;
            }
        }

        return processed;
    }

    /**
     * Resumes a paused queue.
     */
    resume() {
        this.#paused = false;
        this.flush();
    }

    /**
     * Pauses the queue.
     */
    pause() {
        this.#paused = true;
    }

    /**
     * Clears the queue.
     */
    clear() {
        this.#queue = [];
    }

    /**
     * Gets queue statistics.
     * @returns {QueueStats}
     */
    getStats() {
        return {
            size: this.#queue.length,
            maxSize: this.#maxSize,
            dropped: this.#dropped,
            processed: this.#processed,
            isPaused: this.#paused
        };
    }
}

/**
 * Backpressure controller for CrossBus.
 * Manages per-peer message queues with configurable strategies.
 * 
 * @example
 * const bp = new BackpressureController({
 *   maxQueueSize: 100,
 *   strategy: 'drop-oldest'
 * });
 * 
 * // Wrap peer send functions
 * const wrappedSend = bp.wrap('widget-1', originalSendFn);
 * 
 * // Check if peer is slow
 * if (bp.getStats('widget-1').size > 50) {
 *   console.warn('widget-1 is falling behind');
 * }
 */
export class BackpressureController {
    /** @type {Map<string, PeerQueue>} */
    #queues = new Map();

    /** @type {number} */
    #defaultMaxSize;

    /** @type {BackpressureStrategy} */
    #defaultStrategy;

    /** @type {((peerId: string, stats: QueueStats) => void)[]} */
    #backpressureListeners = [];

    /** @type {number} */
    #checkInterval;

    /** @type {ReturnType<typeof setInterval>|null} */
    #intervalId = null;

    /**
     * Creates a new backpressure controller.
     * @param {Object} [options={}] - Options
     * @param {number} [options.maxQueueSize=100] - Default max queue size
     * @param {BackpressureStrategy} [options.strategy='drop-oldest'] - Default strategy
     * @param {number} [options.checkIntervalMs=1000] - Interval to check queues
     */
    constructor(options = {}) {
        this.#defaultMaxSize = options.maxQueueSize ?? 100;
        this.#defaultStrategy = options.strategy ?? 'drop-oldest';
        this.#checkInterval = options.checkIntervalMs ?? 1000;
    }

    /**
     * Wraps a peer's send function with backpressure control.
     * @param {string} peerId - Peer ID
     * @param {(message: Object) => void} sendFn - Original send function
     * @param {Object} [options={}] - Per-peer options
     * @param {number} [options.maxQueueSize] - Max queue size for this peer
     * @param {BackpressureStrategy} [options.strategy] - Strategy for this peer
     * @returns {(message: Object) => { success: boolean, queued: boolean, dropped: boolean }}
     */
    wrap(peerId, sendFn, options = {}) {
        const queue = new PeerQueue(peerId, {
            maxSize: options.maxQueueSize ?? this.#defaultMaxSize,
            strategy: options.strategy ?? this.#defaultStrategy
        });
        queue.setSendFn(sendFn);
        this.#queues.set(peerId, queue);

        this.#startMonitoring();

        return (message) => queue.enqueue(message);
    }

    /**
     * Configures backpressure for a specific peer.
     * @param {string} peerId - Peer ID
     * @param {Object} options - Options
     */
    configure(peerId, options) {
        let queue = this.#queues.get(peerId);
        if (!queue) {
            queue = new PeerQueue(peerId, {
                maxSize: options.maxQueueSize ?? this.#defaultMaxSize,
                strategy: options.strategy ?? this.#defaultStrategy
            });
            this.#queues.set(peerId, queue);
        }
    }

    /**
     * Flushes queued messages for a peer.
     * @param {string} peerId - Peer ID
     * @param {number} [count] - Max messages to flush
     * @returns {number} Messages processed
     */
    flush(peerId, count) {
        return this.#queues.get(peerId)?.flush(count) ?? 0;
    }

    /**
     * Flushes all queues.
     * @returns {number} Total messages processed
     */
    flushAll() {
        let total = 0;
        for (const queue of this.#queues.values()) {
            total += queue.flush();
        }
        return total;
    }

    /**
     * Pauses a peer's queue.
     * @param {string} peerId - Peer ID
     */
    pause(peerId) {
        this.#queues.get(peerId)?.pause();
    }

    /**
     * Resumes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    resume(peerId) {
        this.#queues.get(peerId)?.resume();
    }

    /**
     * Gets stats for a peer.
     * @param {string} peerId - Peer ID
     * @returns {QueueStats|null}
     */
    getStats(peerId) {
        return this.#queues.get(peerId)?.getStats() ?? null;
    }

    /**
     * Gets stats for all peers.
     * @returns {Object<string, QueueStats>}
     */
    getAllStats() {
        /** @type {Object<string, QueueStats>} */
        const stats = {};
        for (const [peerId, queue] of this.#queues) {
            stats[peerId] = queue.getStats();
        }
        return stats;
    }

    /**
     * Subscribes to backpressure events.
     * @param {(peerId: string, stats: QueueStats) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onBackpressure(callback) {
        this.#backpressureListeners.push(callback);
        return () => {
            const idx = this.#backpressureListeners.indexOf(callback);
            if (idx !== -1) this.#backpressureListeners.splice(idx, 1);
        };
    }

    /**
     * Removes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    remove(peerId) {
        const queue = this.#queues.get(peerId);
        if (queue) {
            queue.clear();
            this.#queues.delete(peerId);
        }
    }

    /**
     * Clears all queues and stops monitoring.
     */
    destroy() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
        for (const queue of this.#queues.values()) {
            queue.clear();
        }
        this.#queues.clear();
        this.#backpressureListeners = [];
    }

    /**
     * Starts monitoring queues for backpressure.
     */
    #startMonitoring() {
        if (this.#intervalId) return;

        this.#intervalId = setInterval(() => {
            for (const [peerId, queue] of this.#queues) {
                const stats = queue.getStats();
                // Notify if queue is over 50% full or paused
                if (stats.size > stats.maxSize * 0.5 || stats.isPaused) {
                    for (const listener of this.#backpressureListeners) {
                        try {
                            listener(peerId, stats);
                        } catch (e) {
                            console.error('[Backpressure] Listener error:', e);
                        }
                    }
                }
            }
        }, this.#checkInterval);
    }
}
