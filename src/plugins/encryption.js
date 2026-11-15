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
     * @param {Object} [options={}] - Encryption options
     * @param {string} [options.additionalData] - Context authenticated by AES-GCM but not
     *   encrypted. Decryption must supply the same value.
     * @returns {Promise<EncryptedPayload>} Encrypted payload
     */
    static async encrypt(payload, key, options = {}) {
        // Wrap payload with timestamp for replay protection
        const wrapped = {
            data: payload,
            _ts: Date.now()
        };

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(wrapped));

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        /** @type {AesGcmParams} */
        const params = { name: this.ALGORITHM, iv };
        if (options.additionalData !== undefined) params.additionalData = encoder.encode(options.additionalData);

        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(params, key, data);

        return {
            _encrypted: true,
            ciphertext: this.#arrayBufferToBase64(ciphertext),
            iv: this.#arrayBufferToBase64(iv)
        };
    }

    /**
     * Checks whether a value has the encrypted-envelope shape.
     *
     * @param {any} value
     * @returns {value is EncryptedPayload}
     */
    static isEncrypted(value) {
        return value !== null && typeof value === 'object' && value._encrypted === true &&
            typeof value.ciphertext === 'string' && typeof value.iv === 'string';
    }

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
    static async decrypt(encrypted, key, options = {}) {
        if (!this.isEncrypted(encrypted)) throw encryptionError('ERR_ENCRYPTION_INVALID', 'Malformed encrypted payload');
        const iv = this.#base64ToArrayBuffer(encrypted.iv);
        if (iv.byteLength !== this.IV_LENGTH) throw encryptionError('ERR_ENCRYPTION_INVALID', 'Invalid initialization vector');
        const ciphertext = this.#base64ToArrayBuffer(encrypted.ciphertext);

        /** @type {AesGcmParams} */
        const params = { name: this.ALGORITHM, iv };
        if (options.additionalData !== undefined) params.additionalData = new TextEncoder().encode(options.additionalData);
        let decrypted;
        try {
            decrypted = await crypto.subtle.decrypt(params, key, ciphertext);
        } catch {
            throw encryptionError('ERR_DECRYPTION_FAILED', 'Encrypted payload failed authentication');
        }

        const unwrapped = JSON.parse(new TextDecoder().decode(decrypted));
        const timestamp = unwrapped?._ts;
        if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
            throw encryptionError('ERR_ENCRYPTION_INVALID', 'Encrypted payload has no timestamp');
        }

        const ttl = options.ttl ?? 60000;
        const maxClockSkew = options.maxClockSkew ?? 5000;
        const now = Date.now();
        if (now - timestamp > ttl) {
            throw encryptionError('ERR_MESSAGE_EXPIRED', `Message expired (replay window exceeded). Age: ${now - timestamp}ms, TTL: ${ttl}ms`);
        }
        if (timestamp - now > maxClockSkew) {
            throw encryptionError('ERR_MESSAGE_EXPIRED', `Message timestamp is ${timestamp - now}ms in the future (max skew ${maxClockSkew}ms)`);
        }

        return unwrapped.data;
    }

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
    static createEncryptedHooks(key, options = {}) {
        const requireEncryption = options.requireEncryption ?? true;
        const ttl = options.ttl ?? 60000;
        const maxClockSkew = options.maxClockSkew ?? 5000;
        const replay = new ReplayCache(options.maxReplayEntries ?? 50000, ttl + maxClockSkew);
        return {
            encryptHook: async (payload, context) => {
                const encrypted = await this.encrypt(payload, key, { additionalData: additionalData(context) });
                // Reflecting this message back to its sender is rejected as a replay.
                replay.remember(encrypted.iv);
                return encrypted;
            },

            decryptHook: async (payload, context) => {
                // Items of a batch whose envelope was already decrypted.
                if (context?.batched === true) return payload;
                // Error replies carry their encrypted detail in the error field.
                if (context?.type === 'response' && context.success === false && payload == null) return payload;
                if (!this.isEncrypted(payload)) {
                    if (!requireEncryption) return payload;
                    throw encryptionError('ERR_ENCRYPTION_REQUIRED', 'Unencrypted payload rejected');
                }
                if (replay.has(payload.iv)) throw encryptionError('ERR_REPLAY_DETECTED', 'Encrypted payload was already received');
                const data = await this.decrypt(payload, key, { ttl, maxClockSkew, additionalData: additionalData(context) });
                replay.remember(payload.iv);
                return data;
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
 * @param {EncryptionHookOptions} [options={}]
 * @returns {import("../core/cross-bus.js").CrossBus} Same bus with encryption hooks installed
 *
 * @example
 * const bus = new CrossBus({ peerId: 'secure-agent' });
 * const key = await Encryption.deriveKey('password', 'salt');
 * withEncryption(bus, key);
 * // All messages now encrypted automatically
 */
export function withEncryption(bus, key, options = {}) {
    const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key, options);
    bus.addOutboundHook(encryptHook, 10, { errors: true });
    bus.addInboundHook(decryptHook, 10, { errors: true });
    return bus;
}

/**
 * Authenticated context for a hook invocation. Replies are bound to the
 * handler and ID of the request they answer.
 * @param {any} context
 * @returns {string}
 */
function additionalData(context = {}) {
    const reply = context.type === 'response' || context.type === 'error';
    return JSON.stringify(['crossbus-encryption/2', context.type ?? null,
        (reply ? context.requestName : context.handlerName) ?? null, reply ? context.requestId ?? null : null]);
}

/**
 * @param {string} code
 * @param {string} message
 */
function encryptionError(code, message) {
    return Object.assign(new Error(message), { code });
}

/** Bounded set of recently accepted initialization vectors. */
class ReplayCache {
    /** @type {Map<string, number>} */
    #entries = new Map();
    #max;
    #lifetime;

    /**
     * @param {number} max
     * @param {number} lifetime
     */
    constructor(max, lifetime) {
        if (!Number.isSafeInteger(max) || max < 1) throw new RangeError('maxReplayEntries must be a positive safe integer');
        this.#max = max;
        this.#lifetime = lifetime;
    }

    /** @param {string} iv */
    has(iv) {
        const expires = this.#entries.get(iv);
        return expires !== undefined && expires > Date.now();
    }

    /** @param {string} iv */
    remember(iv) {
        const now = Date.now();
        // Entries are inserted in time order, so expired ones are at the front.
        for (const [entry, expires] of this.#entries) {
            if (expires > now && this.#entries.size < this.#max) break;
            this.#entries.delete(entry);
        }
        this.#entries.set(iv, now + this.#lifetime);
    }
}
