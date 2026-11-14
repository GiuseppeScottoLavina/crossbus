import { uuid } from '../common/utils.js';
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
 * Batching trades additional latency for fewer transport calls.
 * Measure the actual application workload before enabling it.
 *
 * @example
 * import { CrossBus } from 'crossbus';
 * import { withBatching } from 'crossbus/plugins/batch';
 *
 * const bus = new CrossBus({ peerId: 'sender' });
 * withBatching(bus, { windowMs: 16 });
 *
 * // These signals are grouped by the configured time window and maximum size
 * for (let i = 0; i < 100; i++) {
 *   bus.signal('telemetry', { value: i });
 * }
 */
export class MessageBatcher {
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
        if (!Number.isSafeInteger(this.#maxBatchSize) || this.#maxBatchSize <= 0 ||
            !Number.isFinite(this.#windowMs) || this.#windowMs < 0) throw new RangeError('Invalid batch limits');
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
export const BATCH_TYPE = '__crossbus_batch__';

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
export function withBatching(bus, options = {}) {
    const batcher = new MessageBatcher(options);
    const originalSignal = bus.signal;
    const pending = new Set();
    batcher.onFlush(batch => {
        const items = batch.map(item => ({ event: item.event, data: item.data }));
        Promise.resolve().then(() => originalSignal.call(bus, BATCH_TYPE, { messages: items }))
            .then(result => { for (const item of batch) { pending.delete(item); item.resolve(result); } },
                error => { for (const item of batch) { pending.delete(item); item.reject(error); } });
    });
    const signal = (event, data, signalOptions = {}) => {
        if (bus.isDestroyed) return Promise.reject(new Error('Bus destroyed'));
        // Preserve per-call targeting and exclusions by sending these immediately.
        if (Object.keys(signalOptions).length || event === BATCH_TYPE) return originalSignal.call(bus, event, data, signalOptions);
        return new Promise((resolve, reject) => {
            const item = { event, data, resolve, reject };
            pending.add(item);
            batcher.queue(item);
        });
    };
    bus.signal = signal;
    const subscription = bus.on(BATCH_TYPE, async event => {
        const messages = event.data.payload?.messages;
        if (!Array.isArray(messages) || messages.length > (options.maxBatchSize ?? 100) ||
            messages.some(item => !item || typeof item.event !== 'string' || item.event === BATCH_TYPE)) {
            throw new Error('Invalid CrossBus batch');
        }
        for (const item of messages) {
            // Re-enter the normal inbound pipeline for each logical signal.
            await bus.handleMessage({ _cb: 1, id: uuid(), type: 'sig',
                payload: { name: item.event, data: item.data } }, event.source.origin, event.data.source);
        }
    }, { mode: 'sync' });
    bus.addCleanup(() => {
        batcher.destroy();
        subscription.unsubscribe();
        if (bus.signal === signal) bus.signal = originalSignal;
        for (const item of pending) item.reject(new Error('Bus destroyed'));
        pending.clear();
    });
    // @ts-ignore - public access to batch statistics/control
    bus._batcher = batcher;
    return bus;
}

/**
 * Creates a standalone batcher for custom use cases.
 *
 * @param {BatchOptions} options
 * @returns {MessageBatcher}
 */
export function createBatcher(options = {}) {
    return new MessageBatcher(options);
}
