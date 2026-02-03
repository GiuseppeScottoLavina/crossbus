/**
 * @fileoverview Circuit Breaker plugin for CrossBus.
 * Prevents cascading failures by tracking errors and opening circuit.
 * @module plugins/circuit-breaker
 */

import { CrossBusError, ErrorCode } from '../common/errors.js';

/**
 * Circuit breaker states.
 */
export const CircuitState = Object.freeze({
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
export const DEFAULT_CIRCUIT_OPTIONS = {
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
export class CircuitBreaker {
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
export function createPeerCircuitBreaker(bus, peerId, options = {}) {
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
