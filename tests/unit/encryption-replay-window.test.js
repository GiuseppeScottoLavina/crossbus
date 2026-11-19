/**
 * Replay protection of the encryption hooks since 0.1.8: per-session sequence
 * windows, and the bounded IV cache kept for senders older than 0.1.8.
 * Before 0.1.8 two concurrent copies of one message were both accepted, and a
 * full IV cache forgot entries that were still inside the replay window.
 */
import { describe, it, expect, mock } from 'bun:test';
import { CrossBus, MessageChannelTransport } from '../../src/index.js';
import { Encryption, withEncryption } from '../../src/plugins/encryption.js';

const SIGNAL = { type: 'signal', handlerName: 'pay' };
// The additional data the hooks bind for SIGNAL (see additionalData() in the plugin).
const SIGNAL_AD = JSON.stringify(['crossbus-encryption/2', 'signal', 'pay', null]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const code = promise => promise.then(() => 'accepted', error => error.code);

const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** Encrypts an exact plaintext envelope, as a sender would. */
async function seal(key, wrapped, additionalData = SIGNAL_AD) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(additionalData) },
        key, new TextEncoder().encode(JSON.stringify(wrapped)));
    return { _encrypted: true, ciphertext: base64(ciphertext), iv: base64(iv) };
}

function channelPair(key, options) {
    const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'], requestTimeout: 1000 });
    const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'], requestTimeout: 1000 });
    withEncryption(a, key, options);
    withEncryption(b, key, options);
    const channel = new MessageChannelTransport();
    // Every frame a sends reaches b twice, as if an attacker on the channel replayed it at once.
    const send = channel.send.bind(channel);
    channel.send = (message, transfer) => {
        const result = send(message, transfer);
        send(structuredClone(message));
        return result;
    };
    a.addTransport(channel, { peerId: 'b', origin: 'channel' });
    b.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'a', origin: 'channel' });
    return { a, b, close() { a.destroy(); b.destroy(); } };
}

describe('Encryption replay protection', () => {
    it('accepts only one of two concurrent copies of a message', async () => {
        const key = await Encryption.generateKey();
        const sender = Encryption.createEncryptedHooks(key);
        const receiver = Encryption.createEncryptedHooks(key);
        const message = await sender.encryptHook({ amount: 100 }, SIGNAL);
        const results = await Promise.allSettled([
            receiver.decryptHook(message, SIGNAL),
            receiver.decryptHook(structuredClone(message), SIGNAL),
            receiver.decryptHook(structuredClone(message), SIGNAL)
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected').map(r => r.reason.code)).toEqual(['ERR_REPLAY_DETECTED', 'ERR_REPLAY_DETECTED']);
    });

    it('delivers a signal and runs a handler once when the channel duplicates every frame', async () => {
        const key = await Encryption.generateKey();
        const pair = channelPair(key);
        const errors = mock(() => {});
        const original = console.error;
        console.error = errors;
        try {
            const listener = mock(() => {});
            const transfer = mock(({ amount }) => ({ amount }));
            pair.b.on('pay', listener);
            pair.b.handle('transfer', transfer);
            await pair.a.signal('pay', { amount: 100 });
            expect(await pair.a.request('b', 'transfer', { amount: 5 })).toEqual({ amount: 5 });
            await sleep(50);
            expect(listener).toHaveBeenCalledTimes(1);
            expect(transfer).toHaveBeenCalledTimes(1);
        } finally {
            console.error = original;
            pair.close();
        }
    });

    it('keeps rejecting an early message after more messages than maxReplayEntries', async () => {
        const key = await Encryption.generateKey();
        const sender = Encryption.createEncryptedHooks(key);
        const receiver = Encryption.createEncryptedHooks(key, { maxReplayEntries: 10, replayWindow: 64 });
        const first = await sender.encryptHook({ n: 0 }, SIGNAL);
        await receiver.decryptHook(first, SIGNAL);
        for (let n = 1; n < 200; n++) await receiver.decryptHook(await sender.encryptHook({ n }, SIGNAL), SIGNAL);
        // Far behind the newest sequence number: refused, never forgotten.
        expect(await code(receiver.decryptHook(first, SIGNAL))).toBe('ERR_REPLAY_DETECTED');
    });

    it('accepts reordered messages inside the window and refuses those behind it', async () => {
        const key = await Encryption.generateKey();
        const sender = Encryption.createEncryptedHooks(key);
        const receiver = Encryption.createEncryptedHooks(key, { replayWindow: 32 });
        const messages = [];
        for (let n = 0; n < 40; n++) messages.push(await sender.encryptHook({ n }, SIGNAL));
        for (const n of [5, 3, 4, 0]) expect(await receiver.decryptHook(messages[n], SIGNAL)).toEqual({ n });
        expect(await receiver.decryptHook(messages[39], SIGNAL)).toEqual({ n: 39 });
        // 39 - 32 = 7: positions 8..39 are tracked, 7 and below are too old.
        expect(await code(receiver.decryptHook(messages[7], SIGNAL))).toBe('ERR_REPLAY_DETECTED');
        expect(await receiver.decryptHook(messages[8], SIGNAL)).toEqual({ n: 8 });
        expect(await code(receiver.decryptHook(messages[8], SIGNAL))).toBe('ERR_REPLAY_DETECTED');
        expect(await code(receiver.decryptHook(messages[39], SIGNAL))).toBe('ERR_REPLAY_DETECTED');
    });

    it('matches a reference model for random sequence numbers', async () => {
        const key = await Encryption.generateKey();
        const size = 96;
        const receiver = Encryption.createEncryptedHooks(key, { replayWindow: size });
        const accepted = new Set();
        let top = -1;
        let seed = 7;
        const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        for (let i = 0; i < 1500; i++) {
            const roll = random();
            const seq = roll < 0.1 && accepted.size ? [...accepted][Math.floor(random() * accepted.size)]
                : roll < 0.15 ? top + 1 + Math.floor(random() * 300)
                    : Math.max(0, top + Math.floor(random() * 2 * size) - size - 8);
            const expected = seq > top || (top - seq < size && !accepted.has(seq)) ? 'accepted' : 'ERR_REPLAY_DETECTED';
            const actual = await code(receiver.decryptHook(await seal(key, { data: i, _ts: Date.now(), _sid: 'model', _seq: seq }), SIGNAL));
            expect(`${i}:${seq}:${actual}`).toBe(`${i}:${seq}:${expected}`);
            if (actual === 'accepted') { accepted.add(seq); top = Math.max(top, seq); }
        }
    });

    it('refuses its own messages reflected back to it', async () => {
        const key = await Encryption.generateKey();
        const hooks = Encryption.createEncryptedHooks(key);
        const message = await hooks.encryptHook({ amount: 1 }, SIGNAL);
        expect(await code(hooks.decryptHook(message, SIGNAL))).toBe('ERR_REPLAY_DETECTED');
    });

    it('bounds the sending sessions it tracks and frees them when they expire', async () => {
        const key = await Encryption.generateKey();
        const receiver = Encryption.createEncryptedHooks(key, { maxReplaySessions: 2, ttl: 40, maxClockSkew: 0 });
        const from = async () => Encryption.createEncryptedHooks(key).encryptHook({}, SIGNAL);
        await receiver.decryptHook(await from(), SIGNAL);
        await receiver.decryptHook(await from(), SIGNAL);
        expect(await code(receiver.decryptHook(await from(), SIGNAL))).toBe('ERR_REPLAY_CAPACITY');
        await sleep(60);
        expect(await code(receiver.decryptHook(await from(), SIGNAL))).toBe('accepted');
    });

    it('rejects a malformed session ID or sequence number', async () => {
        const key = await Encryption.generateKey();
        const receiver = Encryption.createEncryptedHooks(key);
        for (const extra of [{ _sid: 's' }, { _seq: 1 }, { _sid: '', _seq: 1 }, { _sid: 's', _seq: -1 },
            { _sid: 's', _seq: 1.5 }, { _sid: 's', _seq: '1' }, { _sid: 'x'.repeat(65), _seq: 1 }, { _sid: 5, _seq: 1 }]) {
            const message = await seal(key, { data: 1, _ts: Date.now(), ...extra });
            expect(await code(receiver.decryptHook(message, SIGNAL))).toBe('ERR_ENCRYPTION_INVALID');
        }
    });

    it('validates the replay limits', async () => {
        const key = await Encryption.generateKey();
        for (const option of ['replayWindow', 'maxReplaySessions', 'maxReplayEntries']) {
            for (const value of [0, -1, 1.5, '8', Infinity]) {
                expect(() => Encryption.createEncryptedHooks(key, { [option]: value })).toThrow(RangeError);
            }
        }
    });

    it('accepts messages that already include a sequence through Encryption.decrypt', async () => {
        const key = await Encryption.generateKey();
        const message = await Encryption.createEncryptedHooks(key).encryptHook({ ok: true }, SIGNAL);
        expect(await Encryption.decrypt(message, key, { additionalData: SIGNAL_AD })).toEqual({ ok: true });
    });
});

describe('Encryption replay protection for senders older than 0.1.8', () => {
    // Encryption.encrypt() writes the 0.1.7 envelope: a timestamp, no session or sequence.
    const legacy = (key, data) => Encryption.encrypt(data, key, { additionalData: SIGNAL_AD });

    it('accepts each IV once, also for concurrent copies', async () => {
        const key = await Encryption.generateKey();
        const receiver = Encryption.createEncryptedHooks(key);
        const message = await legacy(key, { n: 1 });
        const results = await Promise.allSettled([receiver.decryptHook(message, SIGNAL), receiver.decryptHook(structuredClone(message), SIGNAL)]);
        expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect(await code(receiver.decryptHook(message, SIGNAL))).toBe('ERR_REPLAY_DETECTED');
    });

    it('refuses new messages when full instead of forgetting live entries', async () => {
        const key = await Encryption.generateKey();
        const receiver = Encryption.createEncryptedHooks(key, { maxReplayEntries: 3, ttl: 40, maxClockSkew: 0 });
        const first = await legacy(key, { n: 0 });
        await receiver.decryptHook(first, SIGNAL);
        await receiver.decryptHook(await legacy(key, { n: 1 }), SIGNAL);
        await receiver.decryptHook(await legacy(key, { n: 2 }), SIGNAL);
        expect(await code(receiver.decryptHook(await legacy(key, { n: 3 }), SIGNAL))).toBe('ERR_REPLAY_CAPACITY');
        expect(await code(receiver.decryptHook(first, SIGNAL))).toBe('ERR_REPLAY_DETECTED');
        await sleep(60);
        expect(await code(receiver.decryptHook(await legacy(key, { n: 4 }), SIGNAL))).toBe('accepted');
        expect(await code(receiver.decryptHook(first, SIGNAL))).toBe('ERR_MESSAGE_EXPIRED');
    });

    it('interoperates with the published 0.1.7 plugin in both directions', async () => {
        const fixture = new URL('fixtures/encryption-0.1.7.js', import.meta.url);
        // Byte-for-byte dist/plugins/encryption.js of tag v0.1.7.
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await Bun.file(fixture).arrayBuffer()));
        expect([...digest].map(b => b.toString(16).padStart(2, '0')).join('')).toBe('9cedc5c31e08bcf97ab4a37b9911e90d7186d8fcd300b725b18787eb2f5f8efd');
        const { Encryption: Published } = await import(fixture.href);
        const key = await Encryption.generateKey();
        const request = { type: 'request', handlerName: 'transfer' };
        const response = { type: 'response', requestName: 'transfer', requestId: 'r1', success: true };
        for (const [Sender, Receiver] of [[Published, Encryption], [Encryption, Published]]) {
            const sender = Sender.createEncryptedHooks(key);
            const receiver = Receiver.createEncryptedHooks(key);
            const message = await sender.encryptHook({ amount: 5 }, request);
            expect(await receiver.decryptHook(message, request)).toEqual({ amount: 5 });
            expect(await code(receiver.decryptHook(message, request))).toBe('ERR_REPLAY_DETECTED');
            expect(await sender.decryptHook(await receiver.encryptHook({ done: true }, response), response)).toEqual({ done: true });
        }
    });

    it('does not let a forgery with a genuine IV block that message', async () => {
        const key = await Encryption.generateKey();
        const receiver = Encryption.createEncryptedHooks(key);
        const genuine = await legacy(key, { n: 1 });
        const forged = { ...genuine, ciphertext: base64(crypto.getRandomValues(new Uint8Array(48))) };
        const [forgery, real] = await Promise.allSettled([receiver.decryptHook(forged, SIGNAL), receiver.decryptHook(genuine, SIGNAL)]);
        expect(forgery.reason.code).toBe('ERR_DECRYPTION_FAILED');
        expect(real.value).toEqual({ n: 1 });
    });
});
