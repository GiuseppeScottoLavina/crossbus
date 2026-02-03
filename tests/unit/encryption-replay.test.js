import { describe, it, expect, beforeEach } from 'bun:test';
import { Encryption } from '../../src/plugins/encryption.js';

describe('Encryption Plugin - Replay Protection', () => {
    let key;

    beforeEach(async () => {
        key = await Encryption.generateKey();
    });

    it('should accept fresh messages', async () => {
        const payload = { secret: 'data' };

        // Encrypt with current time
        const encrypted = await Encryption.encrypt(payload, key);

        // Decrypt immediately
        const decrypted = await Encryption.decrypt(encrypted, key);

        expect(decrypted).toEqual(payload);
    });

    it('should reject expired messages (replay attack)', async () => {
        const payload = { secret: 'old-data' };

        // Mock Date.now to exist in the past
        const pastTime = Date.now() - 61000; // 61 seconds ago

        // We need to manually inject the old timestamp or mock simple Encryption.encrypt behavior
        // Since we can't easily mock Date.now() inside the module without rewiring,
        // let's pass an options object if the API supports it, 
        // OR we just use the fact that we're implementing the _ts injection now.

        // Strategy: We will modify encrypt to allow overriding timestamp for testing,
        // or we mocking the result of encryption to contain an old timestamp.

        // Since we haven't implemented it yet, let's write the test assuming 
        // we can control the timestamp or that we can wait (waiting is too slow).

        // Let's rely on the fact that decrypt will extract _ts. 
        // We will create a manually encrypted payload with an old timestamp.

        const encoder = new TextEncoder();
        const oldData = encoder.encode(JSON.stringify({
            data: payload,
            _ts: pastTime
        }));

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            oldData
        );

        const arrayBufferToBase64 = (buffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        };

        const forgedEncrypted = {
            _encrypted: true,
            ciphertext: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv)
        };

        // Should throw/reject
        let error;
        try {
            await Encryption.decrypt(forgedEncrypted, key, { ttl: 60000 });
        } catch (e) {
            error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Message expired');
    });

    it('should allow configuring TTL', async () => {
        const payload = { secret: 'data' };

        // 5 seconds ago
        const slightlyOldTime = Date.now() - 5000;

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify({
            data: payload,
            _ts: slightlyOldTime
        }));

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const arrayBufferToBase64 = (buffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        };

        const encrypted = {
            _encrypted: true,
            ciphertext: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv)
        };

        // Should pass with default TTL (60s)
        await expect(Encryption.decrypt(encrypted, key)).resolves.toBeDefined();

        // Should fail with strict TTL (2s)
        let error;
        try {
            await Encryption.decrypt(encrypted, key, { ttl: 2000 });
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();
    });
});
