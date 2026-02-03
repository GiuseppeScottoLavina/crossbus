/**
 * Helper to create an encrypted CrossBus instance.
 *
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance
 * @param {CryptoKey} key - Encryption key
 * @returns {import("../core/cross-bus.js").CrossBus} Same bus with encryption hooks installed
 *
 * @example
 * const bus = new CrossBus({ peerId: 'secure-agent' });
 * const key = await Encryption.deriveKey('password', 'salt');
 * withEncryption(bus, key);
 * // All messages now encrypted automatically
 */
export function withEncryption(bus: import("../core/cross-bus.js").CrossBus, key: CryptoKey): import("../core/cross-bus.js").CrossBus;
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
 * Encryption utilities for CrossBus messages.
 * Uses AES-256-GCM for authenticated encryption.
 *
 * @example
 * import { Encryption } from 'crossbus/plugins/encryption';
 *
 * // Generate or derive a key
 * const key = await Encryption.generateKey();
 * // or: const key = await Encryption.deriveKey('password', 'salt');
 *
 * // Use with CrossBus hooks
 * const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);
 * bus.addOutboundHook(encryptHook);
 * bus.addInboundHook(decryptHook);
 *
 * // Now all messages are automatically encrypted!
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
     * @returns {Promise<EncryptedPayload>} Encrypted payload
     */
    static encrypt(payload: any, key: CryptoKey): Promise<EncryptedPayload>;
    /**
     * Decrypts an encrypted payload.
     *
     * @param {EncryptedPayload} encrypted - Encrypted payload
     * @param {CryptoKey} key - Decryption key
     * @param {Object} [options={}] - Decryption options
     * @param {number} [options.ttl=60000] - Time-to-live window in ms (replay protection)
     * @returns {Promise<any>} Decrypted payload
     * @throws {Error} If message is expired (replay attack)
     */
    static decrypt(encrypted: EncryptedPayload, key: CryptoKey, options?: {
        ttl?: number | undefined;
    }): Promise<any>;
    /**
     * Creates hook functions for automatic encryption/decryption.
     *
     * @param {CryptoKey} key - Encryption key
     * @returns {{ encryptHook: import('../core/cross-bus.js').MessageHook, decryptHook: import('../core/cross-bus.js').MessageHook }}
     *
     * @example
     * const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);
     * bus.addOutboundHook(encryptHook);
     * bus.addInboundHook(decryptHook);
     */
    static createEncryptedHooks(key: CryptoKey): {
        encryptHook: import("../core/cross-bus.js").MessageHook;
        decryptHook: import("../core/cross-bus.js").MessageHook;
    };
    static "__#private@#arrayBufferToBase64"(buffer: any): string;
    static "__#private@#base64ToArrayBuffer"(base64: any): ArrayBuffer;
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
