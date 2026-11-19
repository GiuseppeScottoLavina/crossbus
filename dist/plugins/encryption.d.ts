/**
 * @fileoverview Encryption plugin for CrossBus.
 * Provides AES-GCM encryption for message payloads using Web Crypto API.
 *
 * @module plugins/encryption
 */
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
    enabled?: boolean;
};
export type EncryptionHookOptions = {
    /**
     * - Reject inbound plaintext payloads.
     * Disable only while migrating a mixed deployment.
     */
    requireEncryption?: boolean;
    /**
     * - Replay window in ms.
     */
    ttl?: number;
    /**
     * - Accepted future timestamp skew in ms.
     */
    maxClockSkew?: number;
    /**
     * - Sequence numbers tracked per sending
     * session. A message more than this many positions behind the newest one
     * accepted from its sender is rejected as a possible replay.
     */
    replayWindow?: number;
    /**
     * - Sending sessions tracked within the
     * replay window. Only holders of the key can open a session. When all are
     * active, a message from a new session is rejected (`ERR_REPLAY_CAPACITY`).
     */
    maxReplaySessions?: number;
    /**
     * - IVs remembered within the replay
     * window for senders older than 0.1.8, which send no sequence number. When
     * full, their messages are rejected (`ERR_REPLAY_CAPACITY`) until entries expire.
     */
    maxReplayEntries?: number;
};
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
 * @property {number} [replayWindow=4096] - Sequence numbers tracked per sending
 *   session. A message more than this many positions behind the newest one
 *   accepted from its sender is rejected as a possible replay.
 * @property {number} [maxReplaySessions=1024] - Sending sessions tracked within the
 *   replay window. Only holders of the key can open a session. When all are
 *   active, a message from a new session is rejected (`ERR_REPLAY_CAPACITY`).
 * @property {number} [maxReplayEntries=50000] - IVs remembered within the replay
 *   window for senders older than 0.1.8, which send no sequence number. When
 *   full, their messages are rejected (`ERR_REPLAY_CAPACITY`) until entries expire.
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
export declare class Encryption {
    #private;
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
     * @param {number} [iterations=100000] - PBKDF2 iterations. OWASP recommends at
     *   least 600,000 for PBKDF2-SHA256; pass that for new deployments. The default
     *   stays 100,000 so endpoints still derive the same key as earlier versions.
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
        additionalData?: string;
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
        ttl?: number;
        maxClockSkew?: number;
        additionalData?: string;
    }): Promise<any>;
    /**
     * Creates hook functions for automatic encryption/decryption.
     *
     * Every outbound payload, response and RPC error is encrypted. AES-GCM
     * authenticates the message type, signal/handler name and, for replies,
     * the request ID, so ciphertext cannot be moved to another handler or
     * request. Inbound plaintext is rejected unless `requireEncryption` is
     * false. Each hook pair is a sending session with a random ID; its
     * messages carry an encrypted sequence number, and each one is accepted
     * once (see `replayWindow`). Messages from senders older than 0.1.8 are
     * accepted once per initialization vector within the replay window.
     * A session refuses to encrypt more than 2^32 messages
     * (`ERR_ENCRYPTION_LIMIT`), the AES-GCM bound for random IVs under one key.
     * All holders of a shared key are equally trusted: the key authenticates
     * membership, not an individual peer.
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
        encryptHook: import('../core/cross-bus.js').MessageHook;
        decryptHook: import('../core/cross-bus.js').MessageHook;
    };
}
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
export declare function withEncryption(bus: import("../core/cross-bus.js").CrossBus, key: CryptoKey, options?: EncryptionHookOptions): import("../core/cross-bus.js").CrossBus;
