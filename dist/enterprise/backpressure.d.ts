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
    /**
     * Creates a new backpressure controller.
     * @param {Object} [options={}] - Options
     * @param {number} [options.maxQueueSize=100] - Default max queue size
     * @param {BackpressureStrategy} [options.strategy='drop-oldest'] - Default strategy
     * @param {number} [options.checkIntervalMs=1000] - Interval to check queues
     */
    constructor(options?: {
        maxQueueSize?: number | undefined;
        strategy?: BackpressureStrategy | undefined;
        checkIntervalMs?: number | undefined;
    });
    /**
     * Wraps a peer's send function with backpressure control.
     * @param {string} peerId - Peer ID
     * @param {(message: Object) => void} sendFn - Original send function
     * @param {Object} [options={}] - Per-peer options
     * @param {number} [options.maxQueueSize] - Max queue size for this peer
     * @param {BackpressureStrategy} [options.strategy] - Strategy for this peer
     * @returns {(message: Object) => { success: boolean, queued: boolean, dropped: boolean }}
     */
    wrap(peerId: string, sendFn: (message: any) => void, options?: {
        maxQueueSize?: number | undefined;
        strategy?: BackpressureStrategy | undefined;
    }): (message: any) => {
        success: boolean;
        queued: boolean;
        dropped: boolean;
    };
    /**
     * Configures backpressure for a specific peer.
     * @param {string} peerId - Peer ID
     * @param {Object} options - Options
     */
    configure(peerId: string, options: any): void;
    /**
     * Flushes queued messages for a peer.
     * @param {string} peerId - Peer ID
     * @param {number} [count] - Max messages to flush
     * @returns {number} Messages processed
     */
    flush(peerId: string, count?: number): number;
    /**
     * Flushes all queues.
     * @returns {number} Total messages processed
     */
    flushAll(): number;
    /**
     * Pauses a peer's queue.
     * @param {string} peerId - Peer ID
     */
    pause(peerId: string): void;
    /**
     * Resumes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    resume(peerId: string): void;
    /**
     * Gets stats for a peer.
     * @param {string} peerId - Peer ID
     * @returns {QueueStats|null}
     */
    getStats(peerId: string): QueueStats | null;
    /**
     * Gets stats for all peers.
     * @returns {Object<string, QueueStats>}
     */
    getAllStats(): {
        [x: string]: QueueStats;
    };
    /**
     * Subscribes to backpressure events.
     * @param {(peerId: string, stats: QueueStats) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onBackpressure(callback: (peerId: string, stats: QueueStats) => void): () => void;
    /**
     * Removes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    remove(peerId: string): void;
    /**
     * Clears all queues and stops monitoring.
     */
    destroy(): void;
    #private;
}
export type BackpressureStrategy = "drop-oldest" | "drop-newest" | "reject" | "pause";
export type QueueStats = {
    /**
     * - Current queue size
     */
    size: number;
    /**
     * - Maximum queue size
     */
    maxSize: number;
    /**
     * - Messages dropped
     */
    dropped: number;
    /**
     * - Messages processed
     */
    processed: number;
    /**
     * - Whether queue is paused
     */
    isPaused: boolean;
};
