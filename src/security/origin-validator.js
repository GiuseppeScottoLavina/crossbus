/**
 * @fileoverview Origin validation for cross-origin security.
 * Validates message origins against an allowlist.
 * @module security/origin-validator
 */

/**
 * @typedef {Object} OriginValidatorOptions
 * @property {string[]} [allowed=[]] - Allowed origins. Empty = same-origin only.
 * @property {boolean} [allowAll=false] - Allow all origins (dangerous!).
 */

/**
 * Validates message origins against a configured allowlist.
 *
 * Supports:
 * - Exact matches: 'https://example.com'
 * - Wildcards: 'https://*.example.com' (subdomains only)
 * - Protocols: 'chrome-extension://*', 'file://*'
 *
 * @example
 * const validator = new OriginValidator({
 *   allowed: [
 *     'https://app.example.com',
 *     'https://*.widgets.com'
 *   ]
 * });
 *
 * validator.isAllowed('https://app.example.com');     // true
 * validator.isAllowed('https://foo.widgets.com');     // true
 * validator.isAllowed('https://evil.com');            // false
 */
export class OriginValidator {
    /** @type {Set<string>} */
    #exactOrigins = new Set();

    /** @type {RegExp[]} */
    #patterns = [];

    /** @type {boolean} */
    #allowAll = false;

    /** @type {string|undefined} */
    #selfOrigin;

    /**
     * Creates a new origin validator.
     *
     * @param {OriginValidatorOptions} [options={}] - Configuration.
     */
    constructor(options = {}) {
        this.#allowAll = options.allowAll ?? false;
        this.#selfOrigin = globalThis.location?.origin;

        // Process allowed origins
        if (options.allowed) {
            for (const origin of options.allowed) {
                this.#addOrigin(origin);
            }
        }
    }

    /**
     * Checks if an origin is allowed.
     *
     * @param {string} origin - Origin to check (e.g., 'https://example.com').
     * @returns {boolean} True if allowed.
     *
     * @example
     * validator.isAllowed('https://trusted.com');  // true
     * validator.isAllowed('https://unknown.com');  // false
     */
    isAllowed(origin) {
        // Allow-all mode (dangerous but sometimes needed)
        if (this.#allowAll) {
            return true;
        }

        // Null origin (file://, sandboxed iframes, etc.)
        if (origin === 'null' || origin === null) {
            return this.#exactOrigins.has('null');
        }

        // Empty/no allowed origins = same-origin only
        if (this.#exactOrigins.size === 0 && this.#patterns.length === 0) {
            return typeof this.#selfOrigin === 'string' && origin === this.#selfOrigin;
        }

        // Check exact match first (fast path)
        if (this.#exactOrigins.has(origin)) {
            return true;
        }

        // Check pattern matches
        for (const pattern of this.#patterns) {
            if (pattern.test(origin)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Adds an origin to the allowlist.
     *
     * @param {string} origin - Origin to add (supports wildcards).
     * @returns {this} For chaining.
     */
    allow(origin) {
        this.#addOrigin(origin);
        return this;
    }

    /**
     * Removes an origin from the allowlist.
     *
     * @param {string} origin - Origin to remove.
     * @returns {boolean} True if removed.
     */
    disallow(origin) {
        // For exact origins
        if (this.#exactOrigins.has(origin)) {
            this.#exactOrigins.delete(origin);
            return true;
        }

        // For patterns, we'd need to store the original string
        // For simplicity, patterns cannot be removed individually
        return false;
    }

    /**
     * Gets all exact (non-pattern) allowed origins.
     *
     * @returns {string[]} Array of allowed origins.
     */
    getAllowed() {
        return Array.from(this.#exactOrigins);
    }

    /**
     * Clears all allowed origins.
     */
    clear() {
        this.#allowAll = false;
        this.#exactOrigins.clear();
        this.#patterns = [];
    }

    /**
     * Gets the current origin (if available).
     * @returns {string|undefined}
     */
    get selfOrigin() {
        return this.#selfOrigin;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds an origin to the appropriate collection.
     *
     * @param {string} origin
     */
    #addOrigin(origin) {
        if (typeof origin !== 'string') {
            throw new TypeError('Origin must be a string');
        }

        // Wildcard '*' means allow all
        if (origin === '*') {
            this.#allowAll = true;
            return;
        }

        // Contains wildcards - create pattern
        if (origin.includes('*')) {
            const pattern = this.#createPattern(origin);
            this.#patterns.push(pattern);
        } else {
            // Exact origin
            this.#exactOrigins.add(origin);
        }
    }

    /**
     * Creates a RegExp from a wildcard pattern.
     *
     * @param {string} pattern - Pattern with wildcards.
     * @returns {RegExp}
     */
    #createPattern(pattern) {
        return compileOriginPattern(pattern);
    }
}

/**
 * Compiles an origin wildcard pattern.
 *
 * Supported forms, where `*` must be the whole component it replaces:
 * - `https://*.example.com`: one or more subdomain labels (not the apex);
 * - `chrome-extension://*`: any host for the scheme;
 * - `http://localhost:*`: any port.
 *
 * Any other `*` position (for example `https://example.com*`) is rejected,
 * because it could match a different registrable domain.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
export function compileOriginPattern(pattern) {
    const match = /^([a-z][a-z0-9+.-]*:\/\/)(.*?)(:(?:\d{1,5}|\*))?$/i.exec(pattern);
    if (!match) throw new TypeError(`Invalid origin pattern: ${pattern}`);
    const [, scheme, host, port = ''] = match;
    const escape = (/** @type {string} */ value) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    let hostSource;
    if (host === '*') {
        // Bounded single-component host; '/' and ':' cannot match.
        hostSource = '[a-zA-Z0-9.-]{0,253}';
    } else if (host.startsWith('*.') && !host.slice(2).includes('*') && host.length > 2) {
        // Labels exclude '.', so this cannot backtrack catastrophically.
        hostSource = '(?:[a-zA-Z0-9-]{1,63}\\.){1,127}' + escape(host.slice(2));
    } else if (!host.includes('*')) {
        hostSource = escape(host);
    } else {
        throw new TypeError(`Unsupported wildcard position in origin pattern: ${pattern}`);
    }
    const portSource = port === ':*' ? ':\\d{1,5}' : escape(port);
    return new RegExp(`^${escape(scheme)}${hostSource}${portSource}$`);
}

/**
 * Creates an origin validator with common configurations.
 */
export const OriginValidatorPresets = {
    /**
     * Same-origin only (most secure).
     * @returns {OriginValidator}
     */
    sameOrigin() {
        return new OriginValidator();
    },

    /**
     * Allow all origins (use with caution!).
     * @returns {OriginValidator}
     */
    allowAll() {
        return new OriginValidator({ allowAll: true });
    },

    /**
     * Allow specific domains.
     * @param {string[]} origins
     * @returns {OriginValidator}
     */
    fromList(origins) {
        return new OriginValidator({ allowed: origins });
    }
};
