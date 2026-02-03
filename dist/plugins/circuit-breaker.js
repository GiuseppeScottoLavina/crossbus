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
 * @fileoverview Circuit Breaker plugin for CrossBus.
 * Prevents cascading failures by tracking errors and opening circuit.
 * @module plugins/circuit-breaker
 */


/**
 * Circuit breaker states.
 */
const CircuitState = Object.freeze({
    CLOSED: 'closed',     // Normal operation, requests flow through
    OPEN: 'open',         // Circuit tripped, requests fail fast
    HALF_OPEN: 'half_open' // Testing if service recovered
});

/**
 * @typedef {Object} CircuitBreakerOptions
 * @property {number} [failureThreshold=5] - Failures before opening circuit.
 * @property {number} [successThreshold=2] - Successes needed to close from half-open.
 * @property {number} [resetTimeout=30000] - Time in ms before trying half-open.
 * @property {Function|null} [onStateChange] - Callback when state changes.
 * @property {Function} [isFailure] - Custom failure detector.
 */

/**
 * Default circuit breaker options.
 */
const DEFAULT_CIRCUIT_OPTIONS = {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30000,
    onStateChange: null,
    isFailure: (error) => true // All errors count as failures by default
};

/**
 * Circuit Breaker implementation.
 * 
 * States:
 * - CLOSED: Normal operation, tracking failures
 * - OPEN: Circuit tripped, all requests fail fast
 * - HALF_OPEN: Allowing test requests to check recovery
 * 
 * @example
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 3,
 *   resetTimeout: 10000
 * });
 * 
 * try {
 *   const result = await breaker.execute(() => 
 *     bus.request('unstable-service', 'getData')
 *   );
 * } catch (error) {
 *   if (error.code === 'ERR_CIRCUIT_OPEN') {
 *     // Circuit is open, service unavailable
 *   }
 * }
 */
class CircuitBreaker {
    /** @type {string} */
    #state = CircuitState.CLOSED;

    /** @type {number} */
    #failures = 0;

    /** @type {number} */
    #successes = 0;

    /** @type {number|null} */
    #lastFailureTime = null;

    /** @type {number|null} */
    #openedAt = null;

    /** @type {CircuitBreakerOptions} */
    #options;

    /** @type {number} */
    #totalRequests = 0;

    /** @type {number} */
    #totalFailures = 0;

    /** @type {number} */
    #totalSuccesses = 0;

    /**
     * Creates a new circuit breaker.
     * 
     * @param {CircuitBreakerOptions} [options={}]
     */
    constructor(options = {}) {
        this.#options = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
    }

    /**
     * Gets current circuit state.
     * @returns {string}
     */
    get state() {
        this.#checkHalfOpen();
        return this.#state;
    }

    /**
     * Gets failure count in current period.
     * @returns {number}
     */
    get failures() {
        return this.#failures;
    }

    /**
     * Gets circuit statistics.
     * @returns {Object}
     */
    get stats() {
        return {
            state: this.state,
            failures: this.#failures,
            successes: this.#successes,
            totalRequests: this.#totalRequests,
            totalFailures: this.#totalFailures,
            totalSuccesses: this.#totalSuccesses,
            lastFailureTime: this.#lastFailureTime,
            openedAt: this.#openedAt
        };
    }

    /**
     * Checks if the circuit allows requests.
     * @returns {boolean}
     */
    get isOpen() {
        return this.state === CircuitState.OPEN;
    }

    /**
     * Checks if the circuit is closed (normal operation).
     * @returns {boolean}
     */
    get isClosed() {
        return this.state === CircuitState.CLOSED;
    }

    /**
     * Executes a function through the circuit breaker.
     * 
     * @template T
     * @param {() => Promise<T>} fn - Function to execute.
     * @returns {Promise<T>}
     * @throws {CrossBusError} When circuit is open.
     * 
     * @example
     * const result = await breaker.execute(async () => {
     *   return await bus.request('service', 'method');
     * });
     */
    async execute(fn) {
        this.#totalRequests++;

        // Check if circuit allows request
        const currentState = this.state;

        if (currentState === CircuitState.OPEN) {
            throw CrossBusError.from(ErrorCode.CIRCUIT_OPEN, {
                state: this.#state,
                openedAt: this.#openedAt,
                failures: this.#failures
            });
        }

        try {
            const result = await fn();
            this.#onSuccess();
            return result;
        } catch (error) {
            // Check if this error should count as failure
            if (this.#options.isFailure && this.#options.isFailure(error)) {
                this.#onFailure();
            }
            throw error;
        }
    }

    /**
     * Manually resets the circuit to closed state.
     */
    reset() {
        const previousState = this.#state;
        this.#state = CircuitState.CLOSED;
        this.#failures = 0;
        this.#successes = 0;
        this.#openedAt = null;

        if (previousState !== CircuitState.CLOSED) {
            this.#notifyStateChange(previousState, CircuitState.CLOSED);
        }
    }

    /**
     * Manually trips the circuit to open state.
     */
    trip() {
        const previousState = this.#state;
        if (previousState === CircuitState.OPEN) return;

        this.#state = CircuitState.OPEN;
        this.#openedAt = Date.now();
        this.#notifyStateChange(previousState, CircuitState.OPEN);
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles successful execution.
     * 
     */
    #onSuccess() {
        this.#totalSuccesses++;

        if (this.#state === CircuitState.HALF_OPEN) {
            this.#successes++;

            if (this.#successes >= (this.#options.successThreshold || 2)) {
                // Recovered! Close the circuit
                const previousState = this.#state;
                this.#state = CircuitState.CLOSED;
                this.#failures = 0;
                this.#successes = 0;
                this.#openedAt = null;
                this.#notifyStateChange(previousState, CircuitState.CLOSED);
            }
        } else if (this.#state === CircuitState.CLOSED) {
            // Reset failure count on success in closed state
            this.#failures = 0;
        }
    }

    /**
     * Handles failed execution.
     * 
     */
    #onFailure() {
        this.#totalFailures++;
        this.#lastFailureTime = Date.now();
        this.#failures++;

        if (this.#state === CircuitState.HALF_OPEN) {
            // Failed during test, go back to open
            const previousState = this.#state;
            this.#state = CircuitState.OPEN;
            this.#openedAt = Date.now();
            this.#successes = 0;
            this.#notifyStateChange(previousState, CircuitState.OPEN);
        } else if (this.#state === CircuitState.CLOSED) {
            if (this.#failures >= (this.#options.failureThreshold || 5)) {
                // Too many failures, trip the circuit
                const previousState = this.#state;
                this.#state = CircuitState.OPEN;
                this.#openedAt = Date.now();
                this.#notifyStateChange(previousState, CircuitState.OPEN);
            }
        }
    }

    /**
     * Checks if circuit should transition to half-open.
     * 
     */
    #checkHalfOpen() {
        if (this.#state === CircuitState.OPEN && this.#openedAt) {
            const elapsed = Date.now() - this.#openedAt;

            if (elapsed >= (this.#options.resetTimeout || 30000)) {
                const previousState = this.#state;
                this.#state = CircuitState.HALF_OPEN;
                this.#successes = 0;
                this.#notifyStateChange(previousState, CircuitState.HALF_OPEN);
            }
        }
    }

    /**
     * Notifies state change callback.
     * 
     */
    #notifyStateChange(from, to) {
        if (this.#options.onStateChange) {
            this.#options.onStateChange({ from, to, timestamp: Date.now() });
        }
    }
}

/**
 * Creates a circuit breaker wrapper for CrossBus peer requests.
 * 
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance.
 * @param {string} peerId - Peer ID to protect.
 * @param {CircuitBreakerOptions} [options={}]
 * @returns {{ request: Function, breaker: CircuitBreaker }}
 * 
 * @example
 * const { request, breaker } = createPeerCircuitBreaker(
 *   bus, 
 *   'unstable-widget',
 *   { failureThreshold: 3 }
 * );
 * 
 * try {
 *   const data = await request('getData', { id: 5 });
 * } catch (error) {
 *   if (breaker.isOpen) {
 *     console.log('Widget is unavailable');
 *   }
 * }
 */
function createPeerCircuitBreaker(bus, peerId, options = {}) {
    const breaker = new CircuitBreaker(options);

    return {
        breaker,

        /**
         * Request through circuit breaker.
         * 
         * @param {string} handlerName - Handler to invoke.
         * @param {*} [payload] - Request payload.
         * @param {Object} [requestOptions] - Request options.
         * @returns {Promise<*>}
         */
        request: (handlerName, payload, requestOptions = {}) => {
            return breaker.execute(() =>
                bus.request(peerId, handlerName, payload, requestOptions)
            );
        }
    };
}

export { CircuitBreaker, CircuitState, DEFAULT_CIRCUIT_OPTIONS, createPeerCircuitBreaker };
//# sourceMappingURL=circuit-breaker.js.map
