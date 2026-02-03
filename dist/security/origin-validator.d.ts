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
    /**
     * Creates a new origin validator.
     *
     * @param {OriginValidatorOptions} [options={}] - Configuration.
     */
    constructor(options?: OriginValidatorOptions);
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
    isAllowed(origin: string): boolean;
    /**
     * Adds an origin to the allowlist.
     *
     * @param {string} origin - Origin to add (supports wildcards).
     * @returns {this} For chaining.
     */
    allow(origin: string): this;
    /**
     * Removes an origin from the allowlist.
     *
     * @param {string} origin - Origin to remove.
     * @returns {boolean} True if removed.
     */
    disallow(origin: string): boolean;
    /**
     * Gets all exact (non-pattern) allowed origins.
     *
     * @returns {string[]} Array of allowed origins.
     */
    getAllowed(): string[];
    /**
     * Clears all allowed origins.
     */
    clear(): void;
    /**
     * Gets the current origin (if available).
     * @returns {string|undefined}
     */
    get selfOrigin(): string | undefined;
    #private;
}
export namespace OriginValidatorPresets {
    /**
     * Same-origin only (most secure).
     * @returns {OriginValidator}
     */
    function sameOrigin(): OriginValidator;
    /**
     * Allow all origins (use with caution!).
     * @returns {OriginValidator}
     */
    function allowAll(): OriginValidator;
    /**
     * Allow specific domains.
     * @param {string[]} origins
     * @returns {OriginValidator}
     */
    function fromList(origins: string[]): OriginValidator;
}
export type OriginValidatorOptions = {
    /**
     * - Allowed origins. Empty = same-origin only.
     */
    allowed?: string[] | undefined;
    /**
     * - Allow all origins (dangerous!).
     */
    allowAll?: boolean | undefined;
};
