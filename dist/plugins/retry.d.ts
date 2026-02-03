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
export function getDelay(attempt: number, options: RetryOptions): number;
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
export function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
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
export function createRetryWrapper(bus: import("../core/cross-bus.js").CrossBus, defaultOptions?: RetryOptions): any;
export namespace DEFAULT_RETRY_OPTIONS {
    let maxAttempts: number;
    let baseDelay: number;
    let maxDelay: number;
    let factor: number;
    let jitter: boolean;
    function shouldRetry(error: any): boolean;
    let onRetry: null;
}
export namespace RetryStrategies {
    namespace FAST {
        let maxAttempts_1: number;
        export { maxAttempts_1 as maxAttempts };
        let baseDelay_1: number;
        export { baseDelay_1 as baseDelay };
        let maxDelay_1: number;
        export { maxDelay_1 as maxDelay };
        let factor_1: number;
        export { factor_1 as factor };
    }
    namespace STANDARD {
        let maxAttempts_2: number;
        export { maxAttempts_2 as maxAttempts };
        let baseDelay_2: number;
        export { baseDelay_2 as baseDelay };
        let maxDelay_2: number;
        export { maxDelay_2 as maxDelay };
        let factor_2: number;
        export { factor_2 as factor };
    }
    namespace AGGRESSIVE {
        let maxAttempts_3: number;
        export { maxAttempts_3 as maxAttempts };
        let baseDelay_3: number;
        export { baseDelay_3 as baseDelay };
        let maxDelay_3: number;
        export { maxDelay_3 as maxDelay };
        let factor_3: number;
        export { factor_3 as factor };
    }
    namespace ONCE {
        let maxAttempts_4: number;
        export { maxAttempts_4 as maxAttempts };
        let baseDelay_4: number;
        export { baseDelay_4 as baseDelay };
        let factor_4: number;
        export { factor_4 as factor };
    }
}
export type RetryOptions = {
    /**
     * - Maximum number of retry attempts.
     */
    maxAttempts?: number | undefined;
    /**
     * - Base delay in ms.
     */
    baseDelay?: number | undefined;
    /**
     * - Maximum delay in ms.
     */
    maxDelay?: number | undefined;
    /**
     * - Exponential factor.
     */
    factor?: number | undefined;
    /**
     * - Add randomness to delay.
     */
    jitter?: boolean | undefined;
    /**
     * - Custom retry condition.
     */
    shouldRetry?: Function | undefined;
    /**
     * - Callback on each retry.
     */
    onRetry?: Function | null | undefined;
};
