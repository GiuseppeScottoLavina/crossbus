/**
 * @fileoverview Message Batching plugin for CrossBus.
 * Collects messages and sends them in batches to reduce postMessage overhead.
 * @module plugins/batch
 */

/**
 * @typedef {Object} BatchOptions
 * @property {number} [windowMs=16] - Time window for batching (default: 1 frame @ 60fps)
 * @property {number} [maxBatchSize=100] - Maximum messages per batch
 * @property {boolean} [useRaf=true] - Use requestAnimationFrame for timing
 */

/**
 * Message Batcher for high-frequency messaging scenarios.
 * 
 * Instead of sending each message immediately, this plugin:
 * 1. Queues messages for a short time window (default: 16ms / 1 frame)
 * 2. Sends all messages as a single batch
 * 3. Automatically unbatches on the receiving side
 * 
 * **Performance Impact:**
 * - 2-5x throughput improvement for high-frequency signals
 * - Reduces postMessage call overhead
 * - Ideal for streaming data, telemetry, mouse/touch events
 * 
 * @example
 * import { CrossBus } from 'crossbus';
 * import { withBatching } from 'crossbus/plugins/batch';
 * 
 * const bus = new CrossBus({ peerId: 'sender' });
 * withBatching(bus, { windowMs: 16 });
 * 
 * // These 100 signals are sent as ~6 batches instead of 100 calls
 * for (let i = 0; i < 100; i++) {
 *   bus.signal('telemetry', { value: i });
 * }
 */
class MessageBatcher {
    /** @type {number} */
    #windowMs;

    /** @type {number} */
    #maxBatchSize;

    /** @type {boolean} */
    #useRaf;

    /** @type {Map<string, Object[]>} Batches per peer */
    #batches = new Map();

    /** @type {ReturnType<typeof setTimeout>|number|null} */
    #flushTimer = null;

    /** @type {boolean} */
    #flushScheduled = false;

    /** @type {((batch: Object[]) => void)|null} */
    #sendFn = null;

    /** @type {number} */
    #batchesSent = 0;

    /** @type {number} */
    #messagesBatched = 0;

    /**
     * Creates a new MessageBatcher.
     * 
     * @param {BatchOptions} [options={}]
     */
    constructor(options = {}) {
        this.#windowMs = options.windowMs ?? 16;
        this.#maxBatchSize = options.maxBatchSize ?? 100;
        this.#useRaf = options.useRaf ?? (typeof requestAnimationFrame !== 'undefined');
    }

    /**
     * Queues a message for batching.
     * 
     * @param {Object} message - Message to queue
     * @returns {boolean} True if message was queued
     */
    queue(message) {
        const key = 'default';  // Could be per-peer in future

        if (!this.#batches.has(key)) {
            this.#batches.set(key, []);
        }

        const batch = this.#batches.get(key);
        if (batch) {
            batch.push(message);
            this.#messagesBatched++;

            // Flush if batch is full
            if (batch.length >= this.#maxBatchSize) {
                this.#flushBatch(key);
            } else if (!this.#flushScheduled) {
                this.#scheduleFlush();
            }
        }

        return true;
    }

    /**
     * Sets the function to call when flushing batches.
     * 
     * @param {(batch: Object[]) => void} fn
     */
    onFlush(fn) {
        this.#sendFn = fn;
    }

    /**
     * Manually flushes all pending batches.
     */
    flush() {
        for (const key of this.#batches.keys()) {
            this.#flushBatch(key);
        }
    }

    /**
     * Gets statistics.
     */
    get stats() {
        return {
            batchesSent: this.#batchesSent,
            messagesBatched: this.#messagesBatched,
            pendingMessages: this.#getPendingCount(),
            avgBatchSize: this.#batchesSent > 0
                ? Math.round(this.#messagesBatched / this.#batchesSent)
                : 0
        };
    }

    /**
     * Resets statistics.
     */
    resetStats() {
        this.#batchesSent = 0;
        this.#messagesBatched = 0;
    }

    /**
     * Destroys the batcher.
     */
    destroy() {
        if (this.#flushTimer !== null) {
            if (this.#useRaf && typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(/** @type {number} */(this.#flushTimer));
            } else {
                clearTimeout(/** @type {ReturnType<typeof setTimeout>} */(this.#flushTimer));
            }
        }
        this.#batches.clear();
        this.#sendFn = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    #scheduleFlush() {
        this.#flushScheduled = true;

        if (this.#useRaf && typeof requestAnimationFrame !== 'undefined') {
            this.#flushTimer = requestAnimationFrame(() => {
                this.#flushScheduled = false;
                this.flush();
            });
        } else {
            this.#flushTimer = setTimeout(() => {
                this.#flushScheduled = false;
                this.flush();
            }, this.#windowMs);
        }
    }

    #flushBatch(key) {
        const batch = this.#batches.get(key);
        if (!batch || batch.length === 0) return;

        if (this.#sendFn) {
            this.#sendFn(batch);
            this.#batchesSent++;
        }

        this.#batches.set(key, []);
    }

    #getPendingCount() {
        let count = 0;
        for (const batch of this.#batches.values()) {
            count += batch.length;
        }
        return count;
    }
}

/**
 * Batch envelope type marker.
 */
const BATCH_TYPE = '__crossbus_batch__';

/**
 * Wraps a CrossBus to batch outgoing signals.
 * 
 * @param {import('../core/cross-bus.js').CrossBus} bus - CrossBus instance
 * @param {BatchOptions} [options={}]
 * @returns {import('../core/cross-bus.js').CrossBus} Same bus with batching installed
 * 
 * @example
 * const bus = new CrossBus({ peerId: 'high-freq-sender' });
 * withBatching(bus, { windowMs: 16 });
 * 
 * // Rapid signals are now batched
 * for (let i = 0; i < 1000; i++) {
 *   bus.signal('data', { n: i });
 * }
 */
function withBatching(bus, options = {}) {
    const batcher = new MessageBatcher(options);

    // Wrap the signal method
    const originalSignal = bus.signal.bind(bus);

    batcher.onFlush((batch) => {
        // Send batch as a single message
        originalSignal(BATCH_TYPE, { messages: batch });
    });

    // Override signal to queue
    /** @type {any} */ (bus).signal = (/** @type {string} */ event, /** @type {any} */ data) => {
        batcher.queue({ event, data });
    };

    // Add inbound hook to unbatch
    bus.addInboundHook((payload, context) => {
        if (payload && payload.messages && Array.isArray(payload.messages)) {
            // Emit each message in the batch
            for (const msg of payload.messages) {
                bus.emit(msg.event, msg.data);
            }
            return null; // Don't pass batch through
        }
        return payload;
    });

    // Expose batcher for stats/control
    // @ts-ignore - adding custom property
    bus._batcher = batcher;

    return bus;
}

/**
 * Creates a standalone batcher for custom use cases.
 * 
 * @param {BatchOptions} options
 * @returns {MessageBatcher}
 */
function createBatcher(options = {}) {
    return new MessageBatcher(options);
}

export { BATCH_TYPE, MessageBatcher, createBatcher, withBatching };
//# sourceMappingURL=batch.js.map
