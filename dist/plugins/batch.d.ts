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
export function withBatching(bus: import("../core/cross-bus.js").CrossBus, options?: BatchOptions): import("../core/cross-bus.js").CrossBus;
/**
 * Creates a standalone batcher for custom use cases.
 *
 * @param {BatchOptions} options
 * @returns {MessageBatcher}
 */
export function createBatcher(options?: BatchOptions): MessageBatcher;
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
export class MessageBatcher {
    /**
     * Creates a new MessageBatcher.
     *
     * @param {BatchOptions} [options={}]
     */
    constructor(options?: BatchOptions);
    /**
     * Queues a message for batching.
     *
     * @param {Object} message - Message to queue
     * @returns {boolean} True if message was queued
     */
    queue(message: any): boolean;
    /**
     * Sets the function to call when flushing batches.
     *
     * @param {(batch: Object[]) => void} fn
     */
    onFlush(fn: (batch: any[]) => void): void;
    /**
     * Manually flushes all pending batches.
     */
    flush(): void;
    /**
     * Gets statistics.
     */
    get stats(): {
        batchesSent: number;
        messagesBatched: number;
        pendingMessages: number;
        avgBatchSize: number;
    };
    /**
     * Resets statistics.
     */
    resetStats(): void;
    /**
     * Destroys the batcher.
     */
    destroy(): void;
    #private;
}
/**
 * Batch envelope type marker.
 */
export const BATCH_TYPE: "__crossbus_batch__";
export type BatchOptions = {
    /**
     * - Time window for batching (default: 1 frame @ 60fps)
     */
    windowMs?: number | undefined;
    /**
     * - Maximum messages per batch
     */
    maxBatchSize?: number | undefined;
    /**
     * - Use requestAnimationFrame for timing
     */
    useRaf?: boolean | undefined;
};
