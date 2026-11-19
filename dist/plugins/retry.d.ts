/**
 * @fileoverview Retry plugin with exponential backoff for CrossBus.
 * Provides automatic retry logic for failed requests.
 * @module plugins/retry
 */
export type RetryOptions = {
    /**
     * - Maximum number of retry attempts.
     */
    maxAttempts?: number;
    /**
     * - Base delay in ms.
     */
    baseDelay?: number;
    /**
     * - Maximum delay in ms.
     */
    maxDelay?: number;
    /**
     * - Exponential factor.
     */
    factor?: number;
    /**
     * - Add randomness to delay.
     */
    jitter?: boolean;
    /**
     * - Custom retry condition.
     */
    shouldRetry?: Function;
    /**
     * - Callback on each retry.
     */
    onRetry?: Function | null;
};
/**
 * @typedef {Object} RetryOptions
 * @property {number} [maxAttempts=3] - Maximum number of retry attempts.
 * @property {number} [baseDelay=100] - Base delay in ms.
 * @property {number} [maxDelay=5000] - Maximum delay in ms.
 * @property {number} [factor=2] - Exponential factor.
 * @property {boolean} [jitter=true] - Add randomness to delay.
 * @property {Function} [shouldRetry] - Custom retry condition.
 * @property {Function|null} [onRetry] - Callback on each retry.
 */
/**
 * Default retry options.
 */
export declare const DEFAULT_RETRY_OPTIONS: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    factor: number;
    jitter: boolean;
    shouldRetry: (error: any) => boolean;
    onRetry: null;
};
/**
 * Calculates delay for a specific attempt using exponential backoff.
 *
 * @param {number} attempt - Current attempt number (0-indexed).
 * @param {RetryOptions} options - Retry options.
 * @returns {number} Delay in ms.
 *
 * @example
 * getDelay(0, { baseDelay: 100, factor: 2 }); // 100
 * getDelay(1, { baseDelay: 100, factor: 2 }); // 200
 * getDelay(2, { baseDelay: 100, factor: 2 }); // 400
 */
export declare function getDelay(attempt: number, options: RetryOptions): number;
/**
 * Wraps a function with retry logic.
 *
 * @template T
 * @param {() => Promise<T>} fn - Function to retry.
 * @param {RetryOptions} [options={}] - Retry options.
 * @returns {Promise<T>}
 *
 * @example
 * const result = await withRetry(
 *   () => bus.request('widget', 'getData'),
 *   { maxAttempts: 3, baseDelay: 200 }
 * );
 */
export declare function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
/**
 * Creates a retry wrapper for CrossBus requests.
 *
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance.
 * @param {RetryOptions} [defaultOptions={}] - Default options for all retries.
 * @returns {Object} Retry-wrapped methods.
 *
 * @example
 * const retry = createRetryWrapper(bus, { maxAttempts: 3 });
 *
 * const result = await retry.request('widget', 'getData', { id: 5 });
 *
 * const responses = await retry.broadcastRequest('getStatus');
 */
export declare function createRetryWrapper(bus: import("../core/cross-bus.js").CrossBus, defaultOptions?: RetryOptions): any;
/**
 * Retry strategies presets.
 */
export declare const RetryStrategies: {
    /** Fast retry for quick failures */
    FAST: {
        maxAttempts: number;
        baseDelay: number;
        maxDelay: number;
        factor: number;
    };
    /** Standard retry with moderate backoff */
    STANDARD: {
        maxAttempts: number;
        baseDelay: number;
        maxDelay: number;
        factor: number;
    };
    /** Aggressive retry for critical operations */
    AGGRESSIVE: {
        maxAttempts: number;
        baseDelay: number;
        maxDelay: number;
        factor: number;
    };
    /** Single immediate retry */
    ONCE: {
        maxAttempts: number;
        baseDelay: number;
        factor: number;
    };
};
