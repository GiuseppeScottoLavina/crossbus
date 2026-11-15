/**
 * Helper to create an encrypted CrossBus instance.
 *
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance
 * @param {CryptoKey} key - Encryption key
 * @param {EncryptionHookOptions} [options={}]
 * @returns {import("../core/cross-bus.js").CrossBus} Same bus with encryption hooks installed
 *
 * @example
 * const bus = new CrossBus({ peerId: 'secure-agent' });
 * const key = await Encryption.deriveKey('password', 'salt');
 * withEncryption(bus, key);
 * // All messages now encrypted automatically
 */
export function withEncryption(bus: import("../core/cross-bus.js").CrossBus, key: CryptoKey, options?: EncryptionHookOptions): import("../core/cross-bus.js").CrossBus;
/**
 * @fileoverview Encryption plugin for CrossBus.
 * Provides AES-GCM encryption for message payloads using Web Crypto API.
 *
 * @module plugins/encryption
 */
/**
 * @typedef {Object} EncryptedPayload
 * @property {boolean} _encrypted - Marker indicating encrypted content
 * @property {string} ciphertext - Base64-encoded encrypted data
 * @property {string} iv - Base64-encoded initialization vector
 */
/**
 * @typedef {Object} EncryptionOptions
 * @property {boolean} [enabled=true] - Whether encryption is enabled
 */
/**
 * @typedef {Object} EncryptionHookOptions
 * @property {boolean} [requireEncryption=true] - Reject inbound plaintext payloads.
 *   Disable only while migrating a mixed deployment.
 * @property {number} [ttl=60000] - Replay window in ms.
 * @property {number} [maxClockSkew=5000] - Accepted future timestamp skew in ms.
 * @property {number} [maxReplayEntries=50000] - Accepted IVs remembered within the
 *   replay window. When full, the oldest entry is forgotten first.
 */
/**
 * Encryption utilities for CrossBus messages.
 * Uses AES-256-GCM. The hooks authenticate message context, reject plaintext
 * and replays, and encrypt RPC errors; see {@link Encryption.createEncryptedHooks}.
 *
 * @example
 * import { Encryption } from 'crossbus/plugins/encryption';
 *
 * // Generate or derive a key
 * const key = await Encryption.generateKey();
 * // or: const key = await Encryption.deriveKey('password', 'salt');
 *
 * // Install on both endpoints; RPC errors are encrypted too.
 * withEncryption(bus, key);
 */
export class Encryption {
    static ALGORITHM: string;
    static KEY_LENGTH: number;
    static IV_LENGTH: number;
    /**
     * Generates a new random AES-256 key.
     *
     * @returns {Promise<CryptoKey>} Generated key
     */
    static generateKey(): Promise<CryptoKey>;
    /**
     * Derives a key from a password using PBKDF2.
     *
     * @param {string} password - User password
     * @param {string} salt - Salt for key derivation (should be unique per user/session)
     * @param {number} [iterations=100000] - PBKDF2 iterations
     * @returns {Promise<CryptoKey>} Derived key
     */
    static deriveKey(password: string, salt: string, iterations?: number): Promise<CryptoKey>;
    /**
     * Exports a CryptoKey to base64 string for storage.
     *
     * @param {CryptoKey} key - Key to export
     * @returns {Promise<string>} Base64-encoded key
     */
    static exportKey(key: CryptoKey): Promise<string>;
    /**
     * Imports a key from base64 string.
     *
     * @param {string} keyStr - Base64-encoded key
     * @returns {Promise<CryptoKey>} Imported key
     */
    static importKey(keyStr: string): Promise<CryptoKey>;
    /**
     * Encrypts a payload.
     *
     * @param {any} payload - Data to encrypt (will be JSON serialized)
     * @param {CryptoKey} key - Encryption key
     * @param {Object} [options={}] - Encryption options
     * @param {string} [options.additionalData] - Context authenticated by AES-GCM but not
     *   encrypted. Decryption must supply the same value.
     * @returns {Promise<EncryptedPayload>} Encrypted payload
     */
    static encrypt(payload: any, key: CryptoKey, options?: {
        additionalData?: string | undefined;
    }): Promise<EncryptedPayload>;
    /**
     * Checks whether a value has the encrypted-envelope shape.
     *
     * @param {any} value
     * @returns {value is EncryptedPayload}
     */
    static isEncrypted(value: any): value is EncryptedPayload;
    /**
     * Decrypts an encrypted payload.
     *
     * @param {EncryptedPayload} encrypted - Encrypted payload
     * @param {CryptoKey} key - Decryption key
     * @param {Object} [options={}] - Decryption options
     * @param {number} [options.ttl=60000] - Maximum message age in ms (replay window)
     * @param {number} [options.maxClockSkew=5000] - Accepted future timestamp skew in ms
     * @param {string} [options.additionalData] - Authenticated context used at encryption
     * @returns {Promise<any>} Decrypted payload
     * @throws {Error} If the envelope is malformed, fails authentication, has no
     *   timestamp, is older than `ttl` or is dated beyond `maxClockSkew`
     */
    static decrypt(encrypted: EncryptedPayload, key: CryptoKey, options?: {
        ttl?: number | undefined;
        maxClockSkew?: number | undefined;
        additionalData?: string | undefined;
    }): Promise<any>;
    /**
     * Creates hook functions for automatic encryption/decryption.
     *
     * Every outbound payload, response and RPC error is encrypted. AES-GCM
     * authenticates the message type, signal/handler name and, for replies,
     * the request ID, so ciphertext cannot be moved to another handler or
     * request. Inbound plaintext is rejected unless `requireEncryption` is
     * false, and each initialization vector is accepted once within the
     * replay window. All holders of a shared key are equally trusted: the key
     * authenticates membership, not an individual peer.
     *
     * @param {CryptoKey} key - Encryption key
     * @param {EncryptionHookOptions} [options={}]
     * @returns {{ encryptHook: import('../core/cross-bus.js').MessageHook, decryptHook: import('../core/cross-bus.js').MessageHook }}
     *
     * @example
     * const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);
     * bus.addOutboundHook(encryptHook, 10, { errors: true });
     * bus.addInboundHook(decryptHook, 10, { errors: true });
     */
    static createEncryptedHooks(key: CryptoKey, options?: EncryptionHookOptions): {
        encryptHook: import("../core/cross-bus.js").MessageHook;
        decryptHook: import("../core/cross-bus.js").MessageHook;
    };
    static #arrayBufferToBase64(buffer: any): string;
    static #base64ToArrayBuffer(base64: any): ArrayBuffer;
}
export type EncryptedPayload = {
    /**
     * - Marker indicating encrypted content
     */
    _encrypted: boolean;
    /**
     * - Base64-encoded encrypted data
     */
    ciphertext: string;
    /**
     * - Base64-encoded initialization vector
     */
    iv: string;
};
export type EncryptionOptions = {
    /**
     * - Whether encryption is enabled
     */
    enabled?: boolean | undefined;
};
export type EncryptionHookOptions = {
    /**
     * - Reject inbound plaintext payloads.
     * Disable only while migrating a mixed deployment.
     */
    requireEncryption?: boolean | undefined;
    /**
     * - Replay window in ms.
     */
    ttl?: number | undefined;
    /**
     * - Accepted future timestamp skew in ms.
     */
    maxClockSkew?: number | undefined;
    /**
     * - Accepted IVs remembered within the
     * replay window. When full, the oldest entry is forgotten first.
     */
    maxReplayEntries?: number | undefined;
};
