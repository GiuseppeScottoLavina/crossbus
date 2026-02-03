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
export function createPeerCircuitBreaker(bus: import("../core/cross-bus.js").CrossBus, peerId: string, options?: CircuitBreakerOptions): {
    request: Function;
    breaker: CircuitBreaker;
};
/**
 * Circuit breaker states.
 */
export const CircuitState: Readonly<{
    CLOSED: "closed";
    OPEN: "open";
    HALF_OPEN: "half_open";
}>;
export namespace DEFAULT_CIRCUIT_OPTIONS {
    let failureThreshold: number;
    let successThreshold: number;
    let resetTimeout: number;
    let onStateChange: null;
    function isFailure(error: any): boolean;
}
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
    /**
     * Creates a new circuit breaker.
     *
     * @param {CircuitBreakerOptions} [options={}]
     */
    constructor(options?: CircuitBreakerOptions);
    /**
     * Gets current circuit state.
     * @returns {string}
     */
    get state(): string;
    /**
     * Gets failure count in current period.
     * @returns {number}
     */
    get failures(): number;
    /**
     * Gets circuit statistics.
     * @returns {Object}
     */
    get stats(): any;
    /**
     * Checks if the circuit allows requests.
     * @returns {boolean}
     */
    get isOpen(): boolean;
    /**
     * Checks if the circuit is closed (normal operation).
     * @returns {boolean}
     */
    get isClosed(): boolean;
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
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Manually resets the circuit to closed state.
     */
    reset(): void;
    /**
     * Manually trips the circuit to open state.
     */
    trip(): void;
    #private;
}
export type CircuitBreakerOptions = {
    /**
     * - Failures before opening circuit.
     */
    failureThreshold?: number | undefined;
    /**
     * - Successes needed to close from half-open.
     */
    successThreshold?: number | undefined;
    /**
     * - Time in ms before trying half-open.
     */
    resetTimeout?: number | undefined;
    /**
     * - Callback when state changes.
     */
    onStateChange?: Function | null | undefined;
    /**
     * - Custom failure detector.
     */
    isFailure?: Function | undefined;
};
