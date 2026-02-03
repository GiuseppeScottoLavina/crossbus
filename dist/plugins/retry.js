/**
 * @fileoverview Centralized error handling for CrossBus.
 * @module common/errors
 */

/**
 * Error codes for CrossBus.
 * @readonly
 * @enum {string}
 */
const ErrorCode = Object.freeze({
    // Connection errors
    HANDSHAKE_TIMEOUT: 'ERR_HANDSHAKE_TIMEOUT',
    HANDSHAKE_REJECTED: 'ERR_HANDSHAKE_REJECTED',
    ORIGIN_FORBIDDEN: 'ERR_ORIGIN_FORBIDDEN',
    PEER_EXISTS: 'ERR_PEER_EXISTS',
    PEER_NOT_FOUND: 'ERR_PEER_NOT_FOUND',
    PEER_DISCONNECTED: 'ERR_PEER_DISCONNECTED',
    RECONNECT_FAILED: 'ERR_RECONNECT_FAILED',
    UNSUPPORTED: 'ERR_UNSUPPORTED',
    NOT_CONNECTED: 'ERR_NOT_CONNECTED',

    // Message errors
    ACK_TIMEOUT: 'ERR_ACK_TIMEOUT',
    RESPONSE_TIMEOUT: 'ERR_RESPONSE_TIMEOUT',
    QUEUE_FULL: 'ERR_QUEUE_FULL',
    INVALID_MESSAGE: 'ERR_INVALID_MESSAGE',
    VERSION_MISMATCH: 'ERR_VERSION_MISMATCH',
    CLONE_ERROR: 'ERR_CLONE_ERROR',
    TRANSFER_ERROR: 'ERR_TRANSFER_ERROR',
    MESSAGE_TOO_LARGE: 'ERR_MESSAGE_TOO_LARGE',

    // Routing errors
    UNREACHABLE: 'ERR_UNREACHABLE',
    TTL_EXCEEDED: 'ERR_TTL_EXCEEDED',
    NO_ROUTE: 'ERR_NO_ROUTE',

    // Handler errors
    NO_HANDLER: 'ERR_NO_HANDLER',
    HANDLER_ERROR: 'ERR_HANDLER_ERROR',
    HANDLER_TIMEOUT: 'ERR_HANDLER_TIMEOUT',
    HANDLER_EXISTS: 'ERR_HANDLER_EXISTS',
    SEND_FAILED: 'ERR_SEND_FAILED',

    // Channel errors
    CHANNEL_FAILED: 'ERR_CHANNEL_FAILED',
    CHANNEL_CLOSED: 'ERR_CHANNEL_CLOSED',

    // Resource errors
    MAX_PEERS: 'ERR_MAX_PEERS',
    MAX_PENDING: 'ERR_MAX_PENDING',
    DESTROYED: 'ERR_DESTROYED',

    // Circuit Breaker
    CIRCUIT_OPEN: 'ERR_CIRCUIT_OPEN',

    // Security errors
    PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE',
    RATE_LIMITED: 'ERR_RATE_LIMITED',
    UNAUTHORIZED: 'ERR_UNAUTHORIZED',
    INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD'
});

/**
 * Error metadata including default messages, retryability, and AI-friendly suggestions.
 * @type {Object<ErrorCode, {message: string, retryable: boolean, suggestion: string}>}
 */
const ERROR_META = Object.freeze({
    [ErrorCode.HANDSHAKE_TIMEOUT]: {
        message: 'Handshake timed out',
        retryable: true,
        suggestion: 'Increase timeout or check if target is loaded. Use iframe.onload before connecting.'
    },
    [ErrorCode.HANDSHAKE_REJECTED]: {
        message: 'Handshake rejected by peer',
        retryable: false,
        suggestion: 'Check targetOrigin matches the peer\'s origin. Verify peer allows your origin.'
    },
    [ErrorCode.ORIGIN_FORBIDDEN]: {
        message: 'Origin not in allowed origins list',
        retryable: false,
        suggestion: 'Add your origin to allowedOrigins option or use targetOrigin: "*" for development.'
    },
    [ErrorCode.PEER_EXISTS]: {
        message: 'Peer with this ID already exists',
        retryable: false,
        suggestion: 'Use unique peerId for each context. Try: peerId: `agent-${Date.now()}`'
    },
    [ErrorCode.PEER_NOT_FOUND]: {
        message: 'Peer not found',
        retryable: false,
        suggestion: 'Check if peer is connected using bus.peers. Wait for peer connection before request.'
    },
    [ErrorCode.PEER_DISCONNECTED]: {
        message: 'Peer is disconnected',
        retryable: true,
        suggestion: 'Wait for peer to reconnect. Listen for "peer:join" event before retry.'
    },
    [ErrorCode.RECONNECT_FAILED]: {
        message: 'Max reconnection attempts reached',
        retryable: false,
        suggestion: 'Check network connectivity. Consider increasing maxRetries option.'
    },
    [ErrorCode.UNSUPPORTED]: {
        message: 'Operation not supported by this environment',
        retryable: false,
        suggestion: 'This feature requires a browser environment. Check for feature availability first.'
    },
    [ErrorCode.NOT_CONNECTED]: {
        message: 'Transport is not connected',
        retryable: true,
        suggestion: 'Call addTransport() and wait for connection before sending messages.'
    },
    [ErrorCode.ACK_TIMEOUT]: {
        message: 'ACK not received within timeout',
        retryable: true,
        suggestion: 'Increase ackTimeout option or check peer availability.'
    },
    [ErrorCode.RESPONSE_TIMEOUT]: {
        message: 'Response not received within timeout',
        retryable: true,
        suggestion: 'Increase timeout in request options: { timeout: 10000 }. Check if handler exists on peer.'
    },
    [ErrorCode.QUEUE_FULL]: {
        message: 'Message queue is full',
        retryable: false,
        suggestion: 'Increase maxQueueSize or wait for queue to drain. Consider using batching plugin.'
    },
    [ErrorCode.INVALID_MESSAGE]: {
        message: 'Invalid message format',
        retryable: false,
        suggestion: 'Ensure message data is JSON-serializable. Avoid DOM nodes and functions.'
    },
    [ErrorCode.VERSION_MISMATCH]: {
        message: 'Protocol version mismatch',
        retryable: false,
        suggestion: 'Update CrossBus to same version on both sides.'
    },
    [ErrorCode.CLONE_ERROR]: {
        message: 'Data cannot be cloned (contains functions or DOM nodes)',
        retryable: false,
        suggestion: 'Remove functions, DOM nodes, and circular references from message data.'
    },
    [ErrorCode.TRANSFER_ERROR]: {
        message: 'Failed to transfer object ownership',
        retryable: false,
        suggestion: 'Ensure ArrayBuffers are not detached. Each buffer can only be transferred once.'
    },
    [ErrorCode.MESSAGE_TOO_LARGE]: {
        message: 'Message exceeds maximum size',
        retryable: false,
        suggestion: 'Use streaming for large payloads or increase maxMessageSize option.'
    },
    [ErrorCode.UNREACHABLE]: {
        message: 'Destination peer is unreachable',
        retryable: true,
        suggestion: 'Check if peer is still connected. Use bus.peers to list available peers.'
    },
    [ErrorCode.TTL_EXCEEDED]: {
        message: 'Message TTL exceeded (possible routing loop)',
        retryable: false,
        suggestion: 'Check for circular transport configurations. Increase maxTTL if needed.'
    },
    [ErrorCode.NO_ROUTE]: {
        message: 'No route to destination',
        retryable: false,
        suggestion: 'Add transport connecting to target peer. Set isHub: true on orchestrator.'
    },
    [ErrorCode.NO_HANDLER]: {
        message: 'No handler registered for this request',
        retryable: false,
        suggestion: 'Register handler on target: bus.handle("handlerName", fn). Check handler name spelling.'
    },
    [ErrorCode.HANDLER_ERROR]: {
        message: 'Handler threw an exception',
        retryable: false,
        suggestion: 'Check target peer logs for error. Wrap handler in try/catch.'
    },
    [ErrorCode.HANDLER_TIMEOUT]: {
        message: 'Handler did not respond within timeout',
        retryable: true,
        suggestion: 'Handler is slow. Increase timeout or optimize handler performance.'
    },
    [ErrorCode.HANDLER_EXISTS]: {
        message: 'Handler already registered with this name',
        retryable: false,
        suggestion: 'Use different handler name or call bus.removeHandler() first.'
    },
    [ErrorCode.SEND_FAILED]: {
        message: 'Failed to send message to peer',
        retryable: true,
        suggestion: 'Check transport status. Target window may be closed or blocked.'
    },
    [ErrorCode.CHANNEL_FAILED]: {
        message: 'Failed to create direct channel',
        retryable: true,
        suggestion: 'Check browser support for MessageChannel. Retry after short delay.'
    },
    [ErrorCode.CHANNEL_CLOSED]: {
        message: 'Channel was closed unexpectedly',
        retryable: false,
        suggestion: 'Target context was destroyed. Check if iframe/worker still exists.'
    },
    [ErrorCode.MAX_PEERS]: {
        message: 'Maximum number of peers reached',
        retryable: false,
        suggestion: 'Increase maxPeers option or disconnect unused peers first.'
    },
    [ErrorCode.MAX_PENDING]: {
        message: 'Maximum pending requests reached',
        retryable: false,
        suggestion: 'Wait for pending requests to complete. Increase maxPendingRequests option.'
    },
    [ErrorCode.DESTROYED]: {
        message: 'CrossBus instance has been destroyed',
        retryable: false,
        suggestion: 'Create new CrossBus instance. Do not use bus after calling destroy().'
    },
    [ErrorCode.CIRCUIT_OPEN]: {
        message: 'Circuit breaker is open',
        retryable: false,
        suggestion: 'Too many failures. Wait for circuit to reset or call circuit.reset().'
    },
    [ErrorCode.PAYLOAD_TOO_LARGE]: {
        message: 'Payload exceeds maximum allowed size',
        retryable: false,
        suggestion: 'Reduce payload size or increase maxPayloadSize option. Consider using streaming for large data.'
    },
    [ErrorCode.RATE_LIMITED]: {
        message: 'Request rate limit exceeded',
        retryable: true,
        suggestion: 'Wait before retrying. Consider adding delay or using exponential backoff.'
    },
    [ErrorCode.UNAUTHORIZED]: {
        message: 'Peer is not authorized to call this handler',
        retryable: false,
        suggestion: 'Add peer to handler allowedPeers list or remove peer restrictions.'
    },
    [ErrorCode.INVALID_PAYLOAD]: {
        message: 'Payload validation failed',
        retryable: false,
        suggestion: 'Check payload structure against handler requirements.'
    }
});

/**
 * Custom error class for CrossBus.
 * 
 * @extends Error
 * 
 * @example
 * try {
 *   await bus.emit('msg', data, 'unknown-peer');
 * } catch (err) {
 *   if (err instanceof CrossBusError) {
 *     console.log(err.code);      // 'ERR_PEER_NOT_FOUND'
 *     console.log(err.message);   // 'Peer not found'
 *     console.log(err.details);   // { peerId: 'unknown-peer' }
 *     console.log(err.retryable); // false
 *   }
 * }
 */
class CrossBusError extends Error {
    /**
     * Error code.
     * @type {ErrorCode}
     */
    code;

    /**
     * Additional error context.
     * @type {Object}
     */
    details;

    /**
     * Whether the operation can be retried.
     * @type {boolean}
     */
    retryable;

    /**
     * Original error that caused this error.
     * @type {Error|undefined}
     */
    cause;

    /**
     * Timestamp when error occurred.
     * @type {number}
     */
    timestamp;

    /**
     * Creates a new CrossBusError.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {string} [message] - Custom message (uses default if omitted).
     * @param {Object} [options] - Additional options.
     * @param {Object} [options.details={}] - Error context.
     * @param {boolean} [options.retryable] - Override default retryable.
     * @param {Error} [options.cause] - Original error.
     */
    constructor(code, message, options = {}) {
        const meta = ERROR_META[code] ?? { message: 'Unknown error', retryable: false };
        super(message ?? meta.message);

        this.name = 'CrossBusError';
        this.code = code;
        this.details = options.details ?? {};
        this.retryable = options.retryable ?? meta.retryable;
        this.cause = options.cause;
        this.timestamp = Date.now();

        // Maintain proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CrossBusError);
        }
    }

    /**
     * Creates error from code with default message.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {Object} [details] - Error context.
     * @returns {CrossBusError}
     */
    static from(code, details = {}) {
        return new CrossBusError(code, undefined, { details });
    }

    /**
     * Creates error from another error.
     * 
     * @param {ErrorCode} code - Error code.
     * @param {Error} cause - Original error.
     * @param {Object} [details] - Additional context.
     * @returns {CrossBusError}
     */
    static wrap(code, cause, details = {}) {
        return new CrossBusError(code, cause.message, { cause, details });
    }

    /**
     * Converts error to JSON-serializable object.
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            retryable: this.retryable,
            timestamp: this.timestamp
        };
    }

    /**
     * String representation.
     * @returns {string}
     */
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}

/**
 * Checks if an error is retryable.
 * 
 * @param {Error} err - Error to check.
 * @returns {boolean}
 */
function isRetryable(err) {
    if (err instanceof CrossBusError) {
        return err.retryable;
    }
    return false;
}

/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */


/**
 * Creates a promise that resolves after a timeout.
 * 
 * @param {number} ms - Timeout in milliseconds.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {

        setTimeout(resolve, ms);
    });
}

/**
 * @fileoverview Retry plugin with exponential backoff for CrossBus.
 * Provides automatic retry logic for failed requests.
 * @module plugins/retry
 */


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
const DEFAULT_RETRY_OPTIONS = {
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
function getDelay(attempt, options) {
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
async function withRetry(fn, options = {}) {
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
function createRetryWrapper(bus, defaultOptions = {}) {
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
const RetryStrategies = {
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

export { DEFAULT_RETRY_OPTIONS, RetryStrategies, createRetryWrapper, getDelay, withRetry };
//# sourceMappingURL=retry.js.map
