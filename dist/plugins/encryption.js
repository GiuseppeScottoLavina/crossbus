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
     * @param {number} [iterations=100000] - PBKDF2 iterations. OWASP recommends at
     *   least 600,000 for PBKDF2-SHA256; pass that for new deployments. The default
     *   stays 100,000 so endpoints still derive the same key as earlier versions.
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
        return this.#seal({ data: payload, _ts: Date.now() }, key, options);
    }

    /**
     * Encrypts an already wrapped payload.
     * @param {{ data: any, _ts: number, _sid?: string, _seq?: number }} wrapped
     * @param {CryptoKey} key
     * @param {{ additionalData?: string }} options
     * @returns {Promise<EncryptedPayload>}
     */
    static async #seal(wrapped, key, options) {
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
        return (await this.#open(encrypted, key, options)).data;
    }

    /**
     * Authenticates, decrypts and checks the age of an envelope.
     * @param {EncryptedPayload} encrypted
     * @param {CryptoKey} key
     * @param {{ ttl?: number, maxClockSkew?: number, additionalData?: string }} options
     * @returns {Promise<{ data: any, _ts: number, _sid?: string, _seq?: number }>}
     */
    static async #open(encrypted, key, options) {
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
        // Senders since 0.1.8 add a session ID and sequence number; earlier ones neither.
        const { _sid: sid, _seq: seq } = unwrapped;
        if ((sid !== undefined || seq !== undefined) &&
            (typeof sid !== 'string' || !sid || sid.length > 64 || !Number.isSafeInteger(seq) || seq < 0)) {
            throw encryptionError('ERR_ENCRYPTION_INVALID', 'Encrypted payload has an invalid sequence');
        }

        return unwrapped;
    }

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
    static createEncryptedHooks(key, options = {}) {
        const requireEncryption = options.requireEncryption ?? true;
        const ttl = options.ttl ?? 60000;
        const maxClockSkew = options.maxClockSkew ?? 5000;
        // A message accepted at time T is dated at most T + maxClockSkew, so it
        // expires by T + ttl + maxClockSkew; replay state is kept that long.
        const lifetime = ttl + maxClockSkew;
        const legacy = new ReplayCache(options.maxReplayEntries ?? 50000, lifetime);
        const sessions = new SessionWindows(options.maxReplaySessions ?? 1024, options.replayWindow ?? 4096, lifetime);
        const session = this.#arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
        let sequence = 0;
        return {
            encryptHook: async (payload, context) => {
                if (sequence >= MAX_SESSION_MESSAGES) {
                    throw encryptionError('ERR_ENCRYPTION_LIMIT', 'This key has encrypted 2^32 messages in this session; install the hooks with a new key');
                }
                // Numbered before any await, so numbers follow call order.
                return this.#seal({ data: payload, _ts: Date.now(), _sid: session, _seq: sequence++ }, key,
                    { additionalData: additionalData(context) });
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
                const message = await this.#open(payload, key, { ttl, maxClockSkew, additionalData: additionalData(context) });
                // Checked and recorded in one synchronous step after authentication:
                // of two concurrent copies only the first to finish is accepted, and
                // a forgery cannot claim a genuine message's IV or sequence number.
                if (message._sid === undefined) legacy.accept(payload.iv);
                else if (message._sid === session) throw encryptionError('ERR_REPLAY_DETECTED', 'Encrypted payload was sent by this endpoint');
                else sessions.accept(message._sid, /** @type {number} */ (message._seq));
                return message.data;
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
function withEncryption(bus, key, options = {}) {
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

/** Random 96-bit IVs stay within the AES-GCM collision bound up to 2^32 messages per key. */
const MAX_SESSION_MESSAGES = 2 ** 32;

/**
 * @param {any} value
 * @param {string} name
 * @returns {number}
 */
function positiveLimit(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
    return value;
}

/**
 * IVs accepted from senders older than 0.1.8. Bounded: when every entry is
 * still inside the replay window it refuses new messages instead of
 * forgetting one, which would let that message be replayed.
 */
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
        this.#max = positiveLimit(max, 'maxReplayEntries');
        this.#lifetime = lifetime;
    }

    /** @param {string} iv */
    accept(iv) {
        const now = Date.now();
        // Entries are inserted in time order, so expired ones are at the front.
        for (const [entry, expires] of this.#entries) {
            if (expires >= now) break;
            this.#entries.delete(entry);
        }
        if (this.#entries.has(iv)) throw encryptionError('ERR_REPLAY_DETECTED', 'Encrypted payload was already received');
        if (this.#entries.size >= this.#max) throw encryptionError('ERR_REPLAY_CAPACITY', 'Replay cache is full; raise maxReplayEntries or upgrade the sender');
        this.#entries.set(iv, now + this.#lifetime);
    }
}

/**
 * Sliding windows of accepted sequence numbers, one per sending session, as
 * in IPsec and DTLS. A session is forgotten once its newest accepted message
 * has expired, because every earlier message of that session has expired too.
 */
class SessionWindows {
    /** @type {Map<string, { top: number, bits: Uint32Array, expires: number }>} */
    #sessions = new Map();
    #max;
    #size;
    #lifetime;

    /**
     * @param {number} max
     * @param {number} size
     * @param {number} lifetime
     */
    constructor(max, size, lifetime) {
        this.#max = positiveLimit(max, 'maxReplaySessions');
        this.#size = Math.ceil(positiveLimit(size, 'replayWindow') / 32) * 32;
        this.#lifetime = lifetime;
    }

    /**
     * @param {string} sid
     * @param {number} seq
     */
    accept(sid, seq) {
        const now = Date.now();
        let session = this.#sessions.get(sid);
        if (session && session.expires < now) {
            this.#sessions.delete(sid);
            session = undefined;
        }
        if (!session) {
            if (this.#sessions.size >= this.#max) {
                for (const [id, entry] of this.#sessions) if (entry.expires < now) this.#sessions.delete(id);
                if (this.#sessions.size >= this.#max) throw encryptionError('ERR_REPLAY_CAPACITY', 'Too many active encrypted sessions; raise maxReplaySessions');
            }
            session = { top: -1, bits: new Uint32Array(this.#size / 32), expires: 0 };
            this.#sessions.set(sid, session);
        }
        const { bits } = session;
        if (seq > session.top) {
            // Slide forward, clearing the positions the window moves over.
            if (seq - session.top >= this.#size) bits.fill(0);
            else for (let n = session.top + 1; n < seq; n++) bits[(n % this.#size) >>> 5] &= ~(1 << (n & 31));
            session.top = seq;
        } else if (session.top - seq >= this.#size) {
            throw encryptionError('ERR_REPLAY_DETECTED', 'Encrypted payload is older than the replay window');
        } else if (bits[(seq % this.#size) >>> 5] & (1 << (seq & 31))) {
            throw encryptionError('ERR_REPLAY_DETECTED', 'Encrypted payload was already received');
        }
        bits[(seq % this.#size) >>> 5] |= 1 << (seq & 31);
        session.expires = now + this.#lifetime;
    }
}

export { Encryption, withEncryption };
//# sourceMappingURL=encryption.js.map
