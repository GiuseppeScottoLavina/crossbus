/**
 * @fileoverview Rate Limiter plugin for CrossBus.
 * Prevents message flooding with configurable rate limits.
 *
 * @module plugins/rate-limiter
 */
export type RateLimiterOptions = {
    /**
     * - Maximum requests per window
     */
    maxRequests?: number;
    /**
     * - Time window in milliseconds
     */
    windowMs?: number;
    /**
     * - 'sliding' or 'fixed' window
     */
    strategy?: string;
    /**
     * - Called when limit exceeded
     */
    onLimitExceeded?: Function | null;
};
/**
 * Rate limiter using token bucket algorithm.
 *
 * @example
 * import { RateLimiter } from 'crossbus/plugins/rate-limiter';
 *
 * const limiter = new RateLimiter({
 *   maxRequests: 100,
 *   windowMs: 1000 // 100 requests per second
 * });
 *
 * // Check before sending
 * if (limiter.tryAcquire()) {
 *   await bus.emit('event', data);
 * } else {
 *   console.log('Rate limited!');
 * }
 *
 * // Or use as hook
 * bus.addOutboundHook(limiter.createHook());
 */
export declare class RateLimiter {
    #private;
    /**
     * Creates a new rate limiter.
     *
     * @param {RateLimiterOptions} [options={}]
     */
    constructor(options?: RateLimiterOptions);
    /**
     * Attempts to acquire a token.
     *
     * @returns {boolean} True if request allowed, false if rate limited
     */
    tryAcquire(): boolean;
    /**
     * Gets remaining tokens.
     * @returns {number}
     */
    get remaining(): number;
    /**
     * Gets time until next token is available.
     * @returns {number} Milliseconds until next refill
     */
    get retryAfter(): number;
    /**
     * Resets the rate limiter.
     */
    reset(): void;
    /**
     * Creates a per-peer rate limiter.
     * Each peer gets its own token bucket.
     *
     * @param {string} peerId - Peer identifier
     * @returns {RateLimiter}
     */
    forPeer(peerId: string): RateLimiter;
    /**
     * Creates a hook function for automatic rate limiting.
     *
     * With `throwOnLimit: false`, a limited message is dropped: the hook throws
     * `ERR_MESSAGE_DROPPED`, which the bus treats as a silent inbound drop, an
     * undelivered outbound signal or a rejected outbound request.
     *
     * @param {{ perPeer?: boolean, throwOnLimit?: boolean }} [options={}]
     * @returns {import('../core/cross-bus.js').MessageHook} Hook function
     *
     * @example
     * bus.addOutboundHook(limiter.createHook({ perPeer: true }));
     */
    createHook(options?: {
        perPeer?: boolean;
        throwOnLimit?: boolean;
    }): import('../core/cross-bus.js').MessageHook;
    /**
     * Cleans up per-peer limiters for disconnected peers.
     *
     * @param {string[]} activePeers - List of currently active peer IDs
     */
    cleanup(activePeers: string[]): void;
}
/**
 * Helper to rate limit a CrossBus instance.
 *
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance
 * @param {RateLimiterOptions} options - Rate limiter options
 * @returns {RateLimiter} The rate limiter (for inspection)
 *
 * @example
 * const limiter = withRateLimiter(bus, {
 *   maxRequests: 50,
 *   windowMs: 1000
 * });
 */
export declare function withRateLimiter(bus: import("../core/cross-bus.js").CrossBus, options?: RateLimiterOptions): RateLimiter;
