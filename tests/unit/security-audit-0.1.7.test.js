/**
 * Regression tests for the 0.1.7 security audit findings. Each block names the
 * defect it pins; the original proofs of concept used the same message shapes.
 */
import { describe, it, expect, mock } from 'bun:test';
import { gzipSync } from 'node:zlib';
import {
    CrossBus, MessageChannelTransport, OriginValidator, Handshake, StreamManager, PostMessageTransport
} from '../../src/index.js';
import { Encryption, withEncryption } from '../../src/plugins/encryption.js';
import { Compression, withCompression } from '../../src/plugins/compression.js';
import { createValidationHook } from '../../src/plugins/schema-validation.js';
import { RateLimiter } from '../../src/plugins/rate-limiter.js';
import { withBatching } from '../../src/plugins/batch.js';
import { Tracer, tracingPlugin } from '../../src/enterprise/tracing.js';
import { compileOriginPattern } from '../../src/security/origin-validator.js';
import { MessageType } from '../../src/common/types.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/** Two buses joined by explicit send functions so the test controls the wire. */
function wiredPair({ client: clientOptions = {}, server: serverOptions = {} } = {}) {
    const client = new CrossBus({ peerId: 'client', allowedOrigins: ['channel'], requestTimeout: 500, ...clientOptions });
    const server = new CrossBus({ peerId: 'server', allowedOrigins: ['channel'], ...serverOptions });
    const toServer = [];
    const toClient = [];
    const wire = [];
    client.addPeer('server', message => { wire.push(message); toServer.push(message); });
    server.addPeer('client', message => { wire.push(message); toClient.push(message); });
    // Hooks are asynchronous (Web Crypto, streams), so keep delivering until
    // the wire has been quiet for a few macrotasks.
    const deliver = async () => {
        for (let quiet = 0, round = 0; quiet < 3 && round < 200; round++) {
            if (!toServer.length && !toClient.length) { quiet++; await new Promise(resolve => setTimeout(resolve, 2)); continue; }
            quiet = 0;
            while (toServer.length) await server.handleMessage(toServer.shift(), 'channel', 'client')?.catch?.(() => {});
            while (toClient.length) await client.handleMessage(toClient.shift(), 'channel', 'server')?.catch?.(() => {});
        }
    };
    return { client, server, toServer, toClient, wire, deliver, close() { client.destroy(); server.destroy(); } };
}

/** Real MessageChannel pair with addTransport bindings. */
function channelPair(wireFormat) {
    const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'], requestTimeout: 1000 });
    const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'], requestTimeout: 1000 });
    const channel = new MessageChannelTransport(wireFormat ? { wireFormat } : {});
    a.addTransport(channel, { peerId: 'b', origin: 'channel' });
    b.addTransport(MessageChannelTransport.fromPort(channel.remotePort, wireFormat ? { wireFormat } : {}), { peerId: 'a', origin: 'channel' });
    return { a, b, close() { a.destroy(); b.destroy(); } };
}

describe('Encryption authenticates inbound traffic', () => {
    async function encryptedPair(options) {
        const key = await Encryption.generateKey();
        const pair = wiredPair();
        withEncryption(pair.client, key, options);
        withEncryption(pair.server, key, options);
        return pair;
    }

    it('round-trips requests and encrypts error responses on the wire', async () => {
        const pair = await encryptedPair();
        pair.server.handle('profile', ({ user }) => ({ user, plan: 'pro' }));
        pair.server.handle('fail', () => { throw new Error('db password=hunter2 rejected'); });

        const ok = pair.client.request('server', 'profile', { user: 'alice' });
        await pair.deliver();
        expect(await ok).toEqual({ user: 'alice', plan: 'pro' });

        const failed = pair.client.request('server', 'fail', {}).catch(error => error);
        await pair.deliver();
        expect(JSON.stringify(pair.wire)).not.toContain('hunter2');
        expect(JSON.stringify(pair.wire)).not.toContain('alice');
        expect((await failed).message).toContain('hunter2');
        pair.close();
    });


    it('rejects forged plaintext requests', async () => {
        const pair = await encryptedPair();
        const transfer = mock(() => 'sent');
        pair.server.handle('transfer', transfer);
        await pair.server.handleMessage({
            _cb: 1, v: 1, id: 'forged', type: MessageType.REQUEST, timestamp: Date.now(),
            payload: { name: 'transfer', data: { to: 'mallory', amount: 1e6 } }
        }, 'channel', 'client');
        await tick();
        expect(transfer).not.toHaveBeenCalled();
        expect(pair.toClient[0].payload).toMatchObject({ success: false });
        pair.close();
    });

    it('rejects ciphertext moved to another handler and replayed ciphertext', async () => {
        const pair = await encryptedPair();
        const profile = mock(() => 'profile');
        const transfer = mock(() => 'transfer');
        pair.server.handle('profile', profile);
        pair.server.handle('transfer', transfer);
        void pair.client.request('server', 'profile', { user: 'alice' }).catch(() => {});
        while (!pair.toServer.length) await tick();
        const captured = pair.toServer.shift();

        const moved = structuredClone(captured);
        moved.id = 'moved';
        moved.payload.name = 'transfer';
        await pair.server.handleMessage(moved, 'channel', 'client');
        expect(transfer).not.toHaveBeenCalled();

        await pair.server.handleMessage(captured, 'channel', 'client');
        await pair.server.handleMessage(structuredClone(captured), 'channel', 'client');
        await tick();
        expect(profile).toHaveBeenCalledTimes(1);
        pair.close();
    });

    it('binds responses to the request they answer', async () => {
        const pair = await encryptedPair();
        pair.server.handle('balance', ({ account }) => ({ account }));
        // Only the second request is meant to time out; a loaded machine must not expire the first.
        const first = pair.client.request('server', 'balance', { account: 'A' }, { timeout: 10000 });
        const second = pair.client.request('server', 'balance', { account: 'B' }, { timeout: 200 }).catch(error => error);
        while (pair.toServer.length < 2) await tick();
        for (const message of pair.toServer.splice(0)) await pair.server.handleMessage(message, 'channel', 'client');
        while (pair.toClient.length < 2) await tick();
        const [replyA, frozenB] = pair.toClient.splice(0);
        // Splice A's encrypted data into B's response envelope.
        const replyB = structuredClone(frozenB);
        replyB.payload.data = replyA.payload.data;
        await pair.client.handleMessage(replyB, 'channel', 'server').catch(() => {});
        await pair.client.handleMessage(replyA, 'channel', 'server');
        expect(await first).toEqual({ account: 'A' });
        expect(await second).toMatchObject({ code: 'ERR_RESPONSE_TIMEOUT' });
        pair.close();
    });

    it('encrypts payloads that already carry an _encrypted field', async () => {
        const pair = await encryptedPair();
        await pair.client.signal('token', { _encrypted: 1, token: 'BEARER-abc' });
        expect(JSON.stringify(pair.toServer)).not.toContain('BEARER-abc');
        pair.close();
    });

    it('keeps working with batching', async () => {
        const pair = await encryptedPair();
        withBatching(pair.client, { windowMs: 1 });
        withBatching(pair.server, { windowMs: 1 });
        const seen = [];
        pair.server.on('tick', event => seen.push(event.data.payload.n));
        pair.client.signal('tick', { n: 1 });
        pair.client.signal('tick', { n: 2 });
        await new Promise(resolve => setTimeout(resolve, 10));
        await pair.deliver();
        await tick();
        expect(seen).toEqual([1, 2]);
        expect(JSON.stringify(pair.toServer)).not.toContain('"n"');
        pair.close();
    });

    it('accepts plaintext only when requireEncryption is disabled', async () => {
        const pair = await encryptedPair({ requireEncryption: false });
        const handler = mock(() => 'ok');
        pair.server.handle('legacy', handler);
        await pair.server.handleMessage({
            _cb: 1, v: 1, id: 'plain', type: MessageType.REQUEST, timestamp: Date.now(),
            payload: { name: 'legacy', data: {} }
        }, 'channel', 'client');
        await tick();
        expect(handler).toHaveBeenCalledTimes(1);
        pair.close();
    });

    for (const wireFormat of [undefined, 'compact', 'compact-v2']) {
        it(`preserves encrypted errors over MessageChannel ${wireFormat ?? 'standard'}`, async () => {
            const key = await Encryption.generateKey();
            const pair = channelPair(wireFormat);
            withEncryption(pair.a, key);
            withEncryption(pair.b, key);
            pair.b.handle('echo', value => value);
            pair.b.handle('fail', () => { throw Object.assign(new Error('nope'), { code: 'ERR_APP' }); });
            expect(await pair.a.request('b', 'echo', { x: 1 })).toEqual({ x: 1 });
            await expect(pair.a.request('b', 'fail', {})).rejects.toMatchObject({ code: 'ERR_APP' });
            await expect(pair.a.request('b', 'missing', {})).rejects.toMatchObject({ code: 'ERR_NO_HANDLER' });
            pair.close();
        });
    }

    it('rejects timestamps beyond the clock skew and malformed envelopes', async () => {
        const key = await Encryption.generateKey();
        const realNow = Date.now;
        Date.now = () => realNow() + 60000;
        const future = await Encryption.encrypt({ a: 1 }, key);
        Date.now = realNow;
        await expect(Encryption.decrypt(future, key)).rejects.toMatchObject({ code: 'ERR_MESSAGE_EXPIRED' });
        await expect(Encryption.decrypt({ _encrypted: true, ciphertext: 'AA==', iv: 'AA==' }, key))
            .rejects.toMatchObject({ code: 'ERR_ENCRYPTION_INVALID' });
    });
});

describe('Compression bounds decompressed output', () => {
    const bomb = (bytes, algorithm = 'gzip') => ({
        _compressed: true, algorithm, data: gzipSync(Buffer.alloc(bytes)).toString('base64')
    });

    it('stops decompression at the budget', async () => {
        await expect(Compression.decompress(bomb(64 * 1024 * 1024), { maxBytes: 1024 * 1024 }))
            .rejects.toMatchObject({ code: 'ERR_PAYLOAD_TOO_LARGE' });
        await expect(Compression.decompress({ ...bomb(10), algorithm: 'brotli' })).rejects.toMatchObject({ code: 'ERR_INVALID_PAYLOAD' });
    });

    it('rejects a remote decompression bomb before any handler runs', async () => {
        const pair = wiredPair();
        withCompression(pair.server);
        const handler = mock(() => 'ok');
        pair.server.handle('upload', handler);
        await pair.server.handleMessage({
            _cb: 1, v: 1, id: 'bomb', type: MessageType.REQUEST, timestamp: Date.now(),
            payload: { name: 'upload', data: bomb(64 * 1024 * 1024) }
        }, 'channel', 'client');
        await tick();
        expect(handler).not.toHaveBeenCalled();
        expect(pair.toClient[0].payload.error.code).toBe('ERR_PAYLOAD_TOO_LARGE');
        pair.close();
    });

    it('still round-trips ordinary payloads', async () => {
        const pair = wiredPair();
        withCompression(pair.client);
        withCompression(pair.server);
        pair.server.handle('echo', value => value);
        const reply = pair.client.request('server', 'echo', { text: 'x'.repeat(5000) });
        await pair.deliver();
        expect(await reply).toEqual({ text: 'x'.repeat(5000) });
        pair.close();
    });
});

describe('Schema validation of sparse arrays', () => {
    it('checks maxItems before visiting items', () => {
        const hook = createValidationHook({ list: { type: 'array', maxItems: 10, items: { type: 'number' } } });
        const sparse = [];
        sparse.length = 4e9;
        const started = performance.now();
        expect(() => hook(sparse, { handlerName: 'list' })).toThrow();
        expect(performance.now() - started).toBeLessThan(100);
    });

    it('validates only present elements, like forEach', () => {
        const hook = createValidationHook({ list: { type: 'array', items: { type: 'number' } } });
        const sparse = [1];
        sparse.length = 1e8;
        sparse[5] = 2;
        const started = performance.now();
        expect(hook(sparse, { handlerName: 'list' })).toBe(sparse);
        expect(performance.now() - started).toBeLessThan(100);
        sparse[7] = 'x';
        expect(() => hook(sparse, { handlerName: 'list' })).toThrow();
    });
});

describe('Rate limiter drop mode', () => {
    it('drops inbound requests and signals beyond the limit', async () => {
        const pair = wiredPair();
        const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
        pair.server.addInboundHook(limiter.createHook({ throwOnLimit: false }));
        const handler = mock(() => 'ok');
        const listener = mock();
        pair.server.handle('work', handler);
        pair.server.on('ping', listener);
        for (let i = 0; i < 5; i++) {
            await pair.server.handleMessage({
                _cb: 1, v: 1, id: `r${i}`, type: MessageType.REQUEST, timestamp: Date.now(),
                payload: { name: 'work', data: {} }
            }, 'channel', 'client');
        }
        for (let i = 0; i < 5; i++) {
            await pair.server.handleMessage({
                _cb: 1, v: 1, id: `s${i}`, type: MessageType.SIGNAL, timestamp: Date.now(),
                payload: { name: 'ping', data: {} }
            }, 'channel', 'client');
        }
        await tick();
        expect(handler).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenCalledTimes(0);
        expect(pair.toClient).toHaveLength(2);
        pair.close();
    });

    it('reports outbound drops as undelivered signals and rejected requests', async () => {
        const pair = wiredPair();
        const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
        pair.client.addOutboundHook(limiter.createHook({ throwOnLimit: false }));
        expect((await pair.client.signal('a', {})).delivered).toBe(1);
        expect(await pair.client.signal('a', {})).toEqual({ success: false, delivered: 0, failed: [] });
        await expect(pair.client.request('server', 'x', {})).rejects.toMatchObject({ code: 'ERR_MESSAGE_DROPPED' });
        pair.close();
    });
});

describe('Tracing bounds remote trace IDs', () => {
    it('keeps at most maxTraces traces', () => {
        const tracer = new Tracer('t', { maxSpans: 50 });
        const { inbound } = tracingPlugin(tracer);
        const ids = [];
        for (let i = 0; i < 500; i++) {
            const traceId = i.toString(16).padStart(32, '0').replace(/^0/, '1');
            ids.push(traceId);
            inbound({ _trace: `00-${traceId}-${'1'.repeat(16)}-01` }, { type: 'signal' });
        }
        expect(tracer.getTrace(ids[0])).toEqual([]);
        expect(tracer.getTrace(ids.at(-1))).toHaveLength(1);
        expect(ids.filter(id => tracer.getTrace(id).length).length).toBe(50);
    });
});

describe('Origin wildcard patterns', () => {
    it('matches only subdomain labels, whole hosts and ports', () => {
        expect(compileOriginPattern('https://*.example.com').test('https://app.example.com')).toBe(true);
        expect(compileOriginPattern('https://*.example.com').test('https://.example.com')).toBe(false);
        expect(compileOriginPattern('https://*.example.com').test('https://example.com')).toBe(false);
        expect(compileOriginPattern('http://localhost:*').test('http://localhost:5173')).toBe(true);
        expect(compileOriginPattern('chrome-extension://*').test('chrome-extension://abc')).toBe(true);
        for (const pattern of ['https://example.com*', '*.example.com', 'https://a*.example.com']) {
            expect(() => compileOriginPattern(pattern)).toThrow(TypeError);
        }
        expect(() => new OriginValidator({ allowed: ['https://example.com*'] })).toThrow(TypeError);
    });

    it('uses the shared matcher in PostMessageTransport', () => {
        const target = { postMessage() {}, addEventListener() {}, removeEventListener() {} };
        expect(() => new PostMessageTransport(target, { allowedOrigins: ['https://example.com*'] })).toThrow(TypeError);
        expect(() => new PostMessageTransport(target, { allowedOrigins: ['https://*.example.com'] })).not.toThrow();
    });
});

describe('Core bus channel hygiene', () => {
    it('ignores remote signals using local lifecycle names and labels remote sources', async () => {
        const pair = wiredPair();
        const destroyed = mock();
        const disconnected = mock();
        const sources = [];
        pair.server.on('destroyed', destroyed);
        pair.server.on('peer:disconnected', disconnected);
        pair.server.on('hello', event => sources.push(event.source.type));
        await pair.client.signal('destroyed', {});
        await pair.client.signal('peer:disconnected', { peerId: 'client' });
        await pair.client.signal('hello', {});
        await pair.deliver();
        await tick();
        expect(destroyed).not.toHaveBeenCalled();
        expect(disconnected).not.toHaveBeenCalled();
        expect(sources).toEqual(['remote']);
        pair.close();
    });

    it('stops accepting a transport after removePeer()', async () => {
        const pair = channelPair();
        const listener = mock();
        pair.a.on('ping', listener);
        await pair.b.signal('ping', {});
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(listener).toHaveBeenCalledTimes(1);
        pair.a.removePeer('b');
        pair.b.handle('x', () => 1);
        await pair.b.signal('ping', {});
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(listener).toHaveBeenCalledTimes(1);
        pair.close();
    });

    it('rejects unknown handlers and unauthorized peers before inbound hooks', async () => {
        const pair = wiredPair();
        const hook = mock(payload => payload);
        pair.server.addInboundHook(hook);
        pair.server.handle('admin', () => 'secret', { allowedPeers: ['root'] });
        for (const name of ['admin', 'missing']) {
            await pair.server.handleMessage({
                _cb: 1, v: 1, id: name, type: MessageType.REQUEST, timestamp: Date.now(),
                payload: { name, data: {} }
            }, 'channel', 'client');
        }
        await tick();
        expect(hook).not.toHaveBeenCalled();
        expect(pair.toClient.map(message => message.payload.error.code)).toEqual(['ERR_UNAUTHORIZED', 'ERR_NO_HANDLER']);
        pair.close();
    });

    it('ignores handshake messages without a reply channel and bounds responder state', async () => {
        const bus = new CrossBus({ peerId: 'hub', allowedOrigins: ['channel'] });
        const transport = { send() {}, onMessage(fn) { this.deliver = fn; } };
        bus.addTransport(transport, { peerId: 'peer', origin: 'channel' });
        const errors = mock();
        const original = console.error;
        console.error = errors;
        transport.deliver({ type: MessageType.HANDSHAKE_INIT, handshakeId: 'h1', peerId: 'x' });
        await tick();
        console.error = original;
        expect(errors).not.toHaveBeenCalled();
        bus.destroy();

        const handshake = new Handshake({ peerId: 'responder' });
        for (let i = 0; i < 500; i++) {
            handshake.handleMessage({ type: MessageType.HANDSHAKE_INIT, handshakeId: `h${i}`, peerId: 'x' }, 'o', () => {});
        }
        expect(handshake.hasPending('h0')).toBe(false);
        expect(handshake.hasPending('h499')).toBe(true);
        // An ACK for a responder entry is not treated as our own handshake.
        expect(handshake.handleMessage({ type: MessageType.HANDSHAKE_ACK, handshakeId: 'h499', accept: true }, 'o', () => {})).toBe(null);
    });

    it('keeps createSecure budgets enabled', () => {
        expect(() => CrossBus.createSecure({ allowedOrigins: ['https://a.example'], maxPayloadSize: 0 })).toThrow(RangeError);
        expect(() => CrossBus.createSecure({ allowedOrigins: ['https://a.example'], maxPendingRequests: 0 })).toThrow(RangeError);
    });
});

describe('Stream per-peer slots', () => {
    it('limits incoming streams per peer without affecting other peers', () => {
        const sent = [];
        const manager = new StreamManager(async (peerId, message) => { sent.push([peerId, message]); }, {
            maxIncomingStreams: 10, maxIncomingStreamsPerPeer: 1
        });
        manager.onStream('upload', () => {});
        const open = sid => ({ _cb: 1, t: 'stream', sid, st: 'open', name: 'upload' });
        manager.handleMessage(open('s1'), 'mallory');
        manager.handleMessage(open('s2'), 'mallory');
        manager.handleMessage(open('s3'), 'alice');
        const rejected = sent.filter(([, message]) => message.st === 'error');
        expect(rejected).toEqual([['mallory', expect.objectContaining({ sid: 's2', reason: 'Per-peer incoming stream limit exceeded' })]]);
        manager.destroy();
    });
});
