/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */
/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID() when available, falls back to manual generation.
 *
 * @returns {string} UUID v4 string.
 */
export function uuid(): string;
/**
 * Checks if data can be structured cloned.
 *
 * @param {*} data - Data to check.
 * @returns {boolean} True if cloneable.
 */
export function isCloneable(data: any): boolean;
/**
 * Creates a deferred promise (Promise.withResolvers polyfill).
 * Uses native Promise.withResolvers() when available (ES2024+).
 *
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void}}
 */
export function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
};
/**
 * Creates a promise that resolves after a timeout.
 *
 * @param {number} ms - Timeout in milliseconds.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<void>}
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * Creates a promise that rejects after a timeout.
 *
 * @template T
 * @param {Promise<T>} promise - Promise to race against.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} [message='Operation timed out'] - Timeout error message.
 * @returns {Promise<T>}
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;
/**
 * Detects the type of a peer target.
 *
 * @param {*} target - Target to check.
 * @returns {'iframe'|'worker'|'sw'|'window'|'port'|'unknown'}
 */
export function detectPeerType(target: any): "iframe" | "worker" | "sw" | "window" | "port" | "unknown";
/**
 * Creates a frozen timestamp object.
 *
 * @returns {{timestamp: number, iso: string}}
 */
export function timestamp(): {
    timestamp: number;
    iso: string;
};
