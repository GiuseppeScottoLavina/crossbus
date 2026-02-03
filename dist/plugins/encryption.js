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
class Encryption {
    static ALGORITHM = 'AES-GCM';
    static KEY_LENGTH = 256;
    static IV_LENGTH = 12; // 96 bits recommended for GCM

    /**
     * Generates a new random AES-256 key.
     * 
     * @returns {Promise<CryptoKey>} Generated key
     */
    static async generateKey() {
        return await crypto.subtle.generateKey(
            {
                name: this.ALGORITHM,
                length: this.KEY_LENGTH
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Derives a key from a password using PBKDF2.
     * 
     * @param {string} password - User password
     * @param {string} salt - Salt for key derivation (should be unique per user/session)
     * @param {number} [iterations=100000] - PBKDF2 iterations
     * @returns {Promise<CryptoKey>} Derived key
     */
    static async deriveKey(password, salt, iterations = 100000) {
        const encoder = new TextEncoder();

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive AES key
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            {
                name: this.ALGORITHM,
                length: this.KEY_LENGTH
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Exports a CryptoKey to base64 string for storage.
     * 
     * @param {CryptoKey} key - Key to export
     * @returns {Promise<string>} Base64-encoded key
     */
    static async exportKey(key) {
        const exported = await crypto.subtle.exportKey('raw', key);
        return this.#arrayBufferToBase64(exported);
    }

    /**
     * Imports a key from base64 string.
     * 
     * @param {string} keyStr - Base64-encoded key
     * @returns {Promise<CryptoKey>} Imported key
     */
    static async importKey(keyStr) {
        const keyData = this.#base64ToArrayBuffer(keyStr);
        return await crypto.subtle.importKey(
            'raw',
            keyData,
            {
                name: this.ALGORITHM,
                length: this.KEY_LENGTH
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts a payload.
     * 
     * @param {any} payload - Data to encrypt (will be JSON serialized)
     * @param {CryptoKey} key - Encryption key
     * @returns {Promise<EncryptedPayload>} Encrypted payload
     */
    static async encrypt(payload, key) {
        // Wrap payload with timestamp for replay protection
        const wrapped = {
            data: payload,
            _ts: Date.now()
        };

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(wrapped));

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: this.ALGORITHM,
                iv
            },
            key,
            data
        );

        return {
            _encrypted: true,
            ciphertext: this.#arrayBufferToBase64(ciphertext),
            iv: this.#arrayBufferToBase64(iv)
        };
    }

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
    static async decrypt(encrypted, key, options = {}) {
        const ciphertext = this.#base64ToArrayBuffer(encrypted.ciphertext);
        const iv = this.#base64ToArrayBuffer(encrypted.iv);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: this.ALGORITHM,
                iv
            },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        const unwrapped = JSON.parse(decoder.decode(decrypted));

        // Handle legacy payloads (no timestamp) vs new wrapped payloads
        const payload = unwrapped._ts ? unwrapped.data : unwrapped;
        const timestamp = unwrapped._ts;

        // Replay protection check
        if (timestamp) {
            const ttl = options.ttl ?? 60000;
            const now = Date.now();

            // Check if expired
            if (now - timestamp > ttl) {
                throw new Error(`Message expired (replay attack detected). Age: ${now - timestamp}ms, TTL: ${ttl}ms`);
            }

            // Check for future timestamps (clock skew/manipulation)
            if (timestamp > now + 5000) { // Allow 5s slack
                console.warn('[CrossBus] Detected future timestamp in encrypted message (clock skew?)');
            }
        }

        return payload;
    }

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
    static createEncryptedHooks(key) {
        return {
            encryptHook: async (payload, context) => {
                // Skip if already encrypted
                if (payload && payload._encrypted) return payload;
                return await this.encrypt(payload, key);
            },

            decryptHook: async (payload, context) => {
                // Skip if not encrypted
                if (!payload || !payload._encrypted) return payload;
                return await this.decrypt(payload, key);
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────

    static #arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    static #base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

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
function withEncryption(bus, key) {
    const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);
    bus.addOutboundHook(encryptHook);
    bus.addInboundHook(decryptHook);
    return bus;
}

export { Encryption, withEncryption };
//# sourceMappingURL=encryption.js.map
