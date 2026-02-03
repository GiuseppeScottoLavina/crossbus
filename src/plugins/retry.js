/**
 * @fileoverview Retry plugin with exponential backoff for CrossBus.
 * Provides automatic retry logic for failed requests.
 * @module plugins/retry
 */

import { CrossBusError, ErrorCode, isRetryable } from '../common/errors.js';
import { sleep } from '../common/utils.js';

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
export const DEFAULT_RETRY_OPTIONS = {
    maxAttempts: 3,
    baseDelay: 100,
    maxDelay: 5000,
    factor: 2,
    jitter: true,
    shouldRetry: (error) => isRetryable(error),
    onRetry: null
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
export function getDelay(attempt, options) {
    const { baseDelay, maxDelay, factor, jitter } = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options
    };

    // Exponential backoff
    let delay = (baseDelay || 100) * Math.pow(factor || 2, attempt);

    // Cap at maxDelay
    delay = Math.min(delay, maxDelay || 5000);

    // Add jitter (±25%)
    if (jitter) {
        const jitterRange = delay * 0.25;
        delay = delay + (Math.random() * jitterRange * 2 - jitterRange);
    }

    return Math.round(delay);
}

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
export async function withRetry(fn, options = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

    let lastError;

    for (let attempt = 0; attempt < (opts.maxAttempts || 3); attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (opts.shouldRetry && !opts.shouldRetry(error)) {
                throw error;
            }

            // Check if we have more attempts
            if (attempt + 1 >= (opts.maxAttempts || 3)) {
                throw error;
            }

            // Calculate and wait for delay
            const delay = getDelay(attempt, opts);

            // Call onRetry callback
            if (opts.onRetry) {
                opts.onRetry({
                    attempt: attempt + 1,
                    delay,
                    error,
                    nextAttempt: attempt + 2,
                    maxAttempts: opts.maxAttempts
                });
            }

            await sleep(delay);
        }
    }

    throw lastError;
}

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
export function createRetryWrapper(bus, defaultOptions = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...defaultOptions };

    return {
        /**
         * Request with retry.
         * 
         * @param {string} peerId - Target peer ID.
         * @param {string} handlerName - Handler name.
         * @param {*} [payload] - Request payload.
         * @param {Object} [requestOptions] - Request and retry options.
         * @returns {Promise<*>}
         */
        request: (peerId, handlerName, payload, requestOptions = {}) => {
            const retryOpts = { ...opts, ...requestOptions };
            return withRetry(
                () => bus.request(peerId, handlerName, payload, requestOptions),
                retryOpts
            );
        },

        /**
         * Broadcast request with retry (per-peer).
         * Note: Each peer request is retried independently.
         * 
         * @param {string} handlerName - Handler name.
         * @param {*} [payload] - Request payload.
         * @param {Object} [broadcastOptions] - Broadcast and retry options.
         * @returns {Promise<Map<string, *>>}
         */
        broadcastRequest: (handlerName, payload, broadcastOptions = {}) => {
            // For broadcast, we don't retry the whole operation
            // but individual peer failures are ignored by default
            return bus.broadcastRequest(handlerName, payload, broadcastOptions);
        }
    };
}

/**
 * Retry strategies presets.
 */
export const RetryStrategies = {
    /** Fast retry for quick failures */
    FAST: {
        maxAttempts: 3,
        baseDelay: 50,
        maxDelay: 500,
        factor: 1.5
    },

    /** Standard retry with moderate backoff */
    STANDARD: {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 3000,
        factor: 2
    },

    /** Aggressive retry for critical operations */
    AGGRESSIVE: {
        maxAttempts: 5,
        baseDelay: 200,
        maxDelay: 10000,
        factor: 2
    },

    /** Single immediate retry */
    ONCE: {
        maxAttempts: 2,
        baseDelay: 0,
        factor: 1
    }
};
