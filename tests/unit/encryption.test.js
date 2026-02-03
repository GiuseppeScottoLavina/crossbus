/**
 * @fileoverview TDD tests for Encryption plugin.
 * AES-GCM encryption for CrossBus messages using Web Crypto API.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';

// Mock Web Crypto API for Node/Bun environment
const crypto = globalThis.crypto || (await import('crypto')).webcrypto;
globalThis.crypto = crypto;

describe('Encryption Plugin', () => {
    let Encryption;
    let key;

    beforeAll(async () => {
        const module = await import('../../src/plugins/encryption.js');
        Encryption = module.Encryption;

        // Generate a test key
        key = await Encryption.generateKey();
    });

    describe('generateKey()', () => {
        it('should generate an AES-GCM key', async () => {
            const newKey = await Encryption.generateKey();
            expect(newKey).toBeDefined();
            expect(newKey.algorithm.name).toBe('AES-GCM');
            expect(newKey.algorithm.length).toBe(256);
        });
    });

    describe('encrypt() / decrypt()', () => {
        it('should encrypt and decrypt a string payload', async () => {
            const original = 'Hello, World!';

            const encrypted = await Encryption.encrypt(original, key);
            expect(encrypted).toBeDefined();
            expect(encrypted.ciphertext).toBeDefined();
            expect(encrypted.iv).toBeDefined();

            const decrypted = await Encryption.decrypt(encrypted, key);
            expect(decrypted).toBe(original);
        });

        it('should encrypt and decrypt an object payload', async () => {
            const original = { user: 'alice', data: [1, 2, 3] };

            const encrypted = await Encryption.encrypt(original, key);
            const decrypted = await Encryption.decrypt(encrypted, key);

            expect(decrypted).toEqual(original);
        });

        it('should produce different ciphertext for same plaintext (random IV)', async () => {
            const original = 'same message';

            const encrypted1 = await Encryption.encrypt(original, key);
            const encrypted2 = await Encryption.encrypt(original, key);

            expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
            expect(encrypted1.iv).not.toBe(encrypted2.iv);
        });

        it('should fail to decrypt with wrong key', async () => {
            const original = 'secret message';
            const encrypted = await Encryption.encrypt(original, key);

            const wrongKey = await Encryption.generateKey();

            await expect(Encryption.decrypt(encrypted, wrongKey)).rejects.toThrow();
        });
    });

    describe('exportKey() / importKey()', () => {
        it('should export key to base64 and import it back', async () => {
            const exported = await Encryption.exportKey(key);
            expect(typeof exported).toBe('string');
            expect(exported.length).toBeGreaterThan(0);

            const imported = await Encryption.importKey(exported);
            expect(imported.algorithm.name).toBe('AES-GCM');

            // Verify the imported key works
            const original = 'test message';
            const encrypted = await Encryption.encrypt(original, key);
            const decrypted = await Encryption.decrypt(encrypted, imported);
            expect(decrypted).toBe(original);
        });
    });

    describe('createEncryptedHooks()', () => {
        it('should return encrypt and decrypt hook functions', async () => {
            const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);

            expect(typeof encryptHook).toBe('function');
            expect(typeof decryptHook).toBe('function');
        });

        it('should encrypt on outbound and decrypt on inbound', async () => {
            const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);

            const original = { secret: 'data' };

            // Encrypt (outbound)
            const encrypted = await encryptHook(original, { direction: 'outbound' });
            expect(encrypted._encrypted).toBe(true);
            expect(encrypted.ciphertext).toBeDefined();

            // Decrypt (inbound)
            const decrypted = await decryptHook(encrypted, { direction: 'inbound' });
            expect(decrypted).toEqual(original);
        });
    });

    describe('deriveKey()', () => {
        it('should derive a key from password and salt', async () => {
            const password = 'my-secret-password';
            const salt = 'random-salt-value';

            const derivedKey = await Encryption.deriveKey(password, salt);
            expect(derivedKey.algorithm.name).toBe('AES-GCM');
        });

        it('should derive same key from same password and salt', async () => {
            const password = 'password123';
            const salt = 'salt456';

            const key1 = await Encryption.deriveKey(password, salt);
            const key2 = await Encryption.deriveKey(password, salt);

            // Encrypt with key1, decrypt with key2
            const original = 'test';
            const encrypted = await Encryption.encrypt(original, key1);
            const decrypted = await Encryption.decrypt(encrypted, key2);

            expect(decrypted).toBe(original);
        });
    });
});
