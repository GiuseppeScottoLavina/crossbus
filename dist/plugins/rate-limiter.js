/**
 * @fileoverview Rate Limiter plugin for CrossBus.
 * Prevents message flooding with configurable rate limits.
 * 
 * @module plugins/rate-limiter
 */

/**
 * @typedef {Object} RateLimiterOptions
 * @property {number} [maxRequests=100] - Maximum requests per window
 * @property {number} [windowMs=1000] - Time window in milliseconds
 * @property {string} [strategy='sliding'] - 'sliding' or 'fixed' window
 * @property {Function|null} [onLimitExceeded] - Called when limit exceeded
 */

/**
 * Custom error for rate limiting
 * @extends Error
 */
class RateLimitError extends Error {
    /** @type {string} */
    code;
    /** @type {number} */
    retryAfter;

    /**
     * @param {string} message 
     * @param {number} retryAfter 
     */
    constructor(message, retryAfter) {
        super(message);
        this.code = 'ERR_RATE_LIMITED';
        this.retryAfter = retryAfter;
    }
}

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
class RateLimiter {
    /** @type {number} */
    #maxTokens;

    /** @type {number} */
    #tokens;

    /** @type {number} */
    #windowMs;

    /** @type {number} */
    #lastRefill;

    /** @type {Function|null} */
    #onLimitExceeded;

    /** @type {Map<string, RateLimiter>} */
    #perPeerLimiters = new Map();

    /**
     * Creates a new rate limiter.
     * 
     * @param {RateLimiterOptions} [options={}]
     */
    constructor(options = {}) {
        this.#maxTokens = options.maxRequests ?? 100;
        this.#tokens = this.#maxTokens;
        this.#windowMs = options.windowMs ?? 1000;
        this.#lastRefill = Date.now();
        this.#onLimitExceeded = options.onLimitExceeded ?? null;
    }

    /**
     * Attempts to acquire a token.
     * 
     * @returns {boolean} True if request allowed, false if rate limited
     */
    tryAcquire() {
        this.#refill();

        if (this.#tokens > 0) {
            this.#tokens--;
            return true;
        }

        if (this.#onLimitExceeded) {
            this.#onLimitExceeded();
        }

        return false;
    }

    /**
     * Gets remaining tokens.
     * @returns {number}
     */
    get remaining() {
        this.#refill();
        return this.#tokens;
    }

    /**
     * Gets time until next token is available.
     * @returns {number} Milliseconds until next refill
     */
    get retryAfter() {
        const now = Date.now();
        const elapsed = now - this.#lastRefill;
        return Math.max(0, this.#windowMs - elapsed);
    }

    /**
     * Resets the rate limiter.
     */
    reset() {
        this.#tokens = this.#maxTokens;
        this.#lastRefill = Date.now();
    }

    /**
     * Creates a per-peer rate limiter.
     * Each peer gets its own token bucket.
     * 
     * @param {string} peerId - Peer identifier
     * @returns {RateLimiter}
     */
    forPeer(peerId) {
        if (!this.#perPeerLimiters.has(peerId)) {
            this.#perPeerLimiters.set(peerId, new RateLimiter({
                maxRequests: this.#maxTokens,
                windowMs: this.#windowMs,
                onLimitExceeded: this.#onLimitExceeded
            }));
        }
        return /** @type {RateLimiter} */ (this.#perPeerLimiters.get(peerId));
    }

    /**
     * Creates a hook function for automatic rate limiting.
     * 
     * @param {{ perPeer?: boolean, throwOnLimit?: boolean }} [options={}]
     * @returns {import('../core/cross-bus.js').MessageHook} Hook function
     * 
     * @example
     * bus.addOutboundHook(limiter.createHook({ perPeer: true }));
     */
    createHook(options = {}) {
        const { perPeer = false, throwOnLimit = true } = options;

        return (payload, context) => {
            const limiter = perPeer && context.peerId
                ? this.forPeer(context.peerId)
                : this;

            if (!limiter.tryAcquire()) {
                if (throwOnLimit) {
                    throw new RateLimitError('Rate limit exceeded', limiter.retryAfter);
                }
                return null; // Drop message
            }

            return payload;
        };
    }

    /**
     * Cleans up per-peer limiters for disconnected peers.
     * 
     * @param {string[]} activePeers - List of currently active peer IDs
     */
    cleanup(activePeers) {
        const activeSet = new Set(activePeers);
        for (const peerId of this.#perPeerLimiters.keys()) {
            if (!activeSet.has(peerId)) {
                this.#perPeerLimiters.delete(peerId);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    #refill() {
        const now = Date.now();
        const elapsed = now - this.#lastRefill;

        if (elapsed >= this.#windowMs) {
            // Full refill
            this.#tokens = this.#maxTokens;
            this.#lastRefill = now;
        } else {
            // Sliding window: proportional refill
            const tokensToAdd = Math.floor((elapsed / this.#windowMs) * this.#maxTokens);
            if (tokensToAdd > 0) {
                this.#tokens = Math.min(this.#maxTokens, this.#tokens + tokensToAdd);
                this.#lastRefill = now;
            }
        }
    }
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
function withRateLimiter(bus, options = {}) {
    const limiter = new RateLimiter(options);
    bus.addOutboundHook(limiter.createHook({ perPeer: true }));
    return limiter;
}

export { RateLimiter, withRateLimiter };
//# sourceMappingURL=rate-limiter.js.map
