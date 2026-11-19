/**
 * Teardown: destroy() with work in flight, the opt-in goodbye on addTransport()
 * bindings, StreamManager.closePeer(), and the resources left after destroy().
 */
import { describe, it, expect, mock, spyOn } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { CrossBus, MessageChannelTransport, StreamManager } from '../../src/index.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const outcome = promise => promise.then(value => ({ value }), error => ({ code: error.code, message: error.message }));

/** Two buses over a real MessageChannel. */
function channelPair({ a: aOptions = {}, b: bOptions = {}, requestTimeout = 5000 } = {}) {
    const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'], requestTimeout });
    const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'], requestTimeout });
    const left = new MessageChannelTransport();
    const right = MessageChannelTransport.fromPort(left.remotePort);
    const cleanupA = a.addTransport(left, { peerId: 'b', origin: 'channel', ...aOptions });
    const cleanupB = b.addTransport(right, { peerId: 'a', origin: 'channel', ...bOptions });
    return { a, b, left, right, cleanupA, cleanupB, close() { a.destroy(); b.destroy(); } };
}

/** A transport whose inbound side the test drives. */
function fakeTransport() {
    const transport = {
        sent: [],
        handler: null,
        destroyed: false,
        send: mock(message => { transport.sent.push(message); }),
        onMessage(handler) { transport.handler = handler; },
        offMessage() { transport.handler = null; },
        destroy() { transport.destroyed = true; },
        deliver(message, origin = 'channel') { transport.handler?.(message, { origin }); }
    };
    return transport;
}

const BYE = { _cb: 1, version: 1, id: 'bye-1', type: 'bye', timestamp: Date.now(), payload: {}, meta: {} };

describe('destroy() with work in flight', () => {
    it('rejects a signal whose outbound hooks were still running', async () => {
        const pair = channelPair();
        try {
            pair.a.addOutboundHook(async payload => { await sleep(30); return payload; });
            const sent = outcome(pair.a.signal('x', {}));
            await sleep(5);
            pair.a.destroy();
            expect((await sent).code).toBe('ERR_DESTROYED');
        } finally { pair.close(); }
    });

    it('rejects requests to addPeer() peers with ERR_DESTROYED', async () => {
        const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'], requestTimeout: 5000 });
        bus.addPeer('b', () => {});
        const pending = outcome(bus.request('b', 'work', {}));
        bus.destroy();
        expect(await pending).toMatchObject({ code: 'ERR_DESTROYED' });
    });

    it('rejects requests to addTransport() peers with ERR_PEER_DISCONNECTED', async () => {
        const pair = channelPair();
        try {
            pair.b.handle('slow', () => sleep(200));
            const pending = outcome(pair.a.request('b', 'slow', {}));
            await sleep(5);
            pair.a.destroy();
            expect((await pending).code).toBe('ERR_PEER_DISCONNECTED');
        } finally { pair.close(); }
    });
});

describe('MessageChannelTransport.destroy()', () => {
    it('leaves a port adopted by fromPort() to its new owner', async () => {
        const left = new MessageChannelTransport();
        const right = MessageChannelTransport.fromPort(left.remotePort);
        const received = [];
        right.onMessage(message => received.push(message.id));
        left.send({ _cb: 1, version: 1, id: 'last', type: 'sig', timestamp: Date.now(), payload: { name: 'x', data: 1 }, meta: {} });
        left.destroy();
        await sleep(20);
        expect(received).toEqual(['last']);
        right.destroy();
    });
});

describe('addTransport() cleanup', () => {
    it('does not remove a later registration that reuses the peer ID', async () => {
        const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        const first = fakeTransport();
        const second = fakeTransport();
        const cleanupFirst = bus.addTransport(first, { peerId: 'b', origin: 'channel' });
        bus.removePeer('b');
        bus.addTransport(second, { peerId: 'b', origin: 'channel' });
        cleanupFirst();
        expect(bus.peers).toEqual(['b']);
        const received = mock(() => {});
        bus.on('ping', received);
        second.deliver({ _cb: 1, version: 1, id: 's1', type: 'sig', timestamp: Date.now(), payload: { name: 'ping', data: 1, source: 'b' }, meta: {} });
        await sleep(0);
        expect(received).toHaveBeenCalledTimes(1);
        bus.destroy();
        expect(second.destroyed).toBe(true);
    });
});

describe('addTransport({ goodbye: true })', () => {
    for (const [how, leave] of [
        ['destroy()', pair => pair.b.destroy()],
        ['removePeer()', pair => pair.b.removePeer('a')],
        ['its cleanup function', pair => pair.cleanupB()]
    ]) {
        it(`ends the other side's binding at once when one side leaves with ${how}`, async () => {
            const pair = channelPair({ a: { goodbye: true }, b: { goodbye: true } });
            try {
                const disconnected = mock(() => {});
                pair.a.on('peer:disconnected', disconnected);
                pair.b.handle('slow', () => sleep(1000));
                const started = Date.now();
                const pending = outcome(pair.a.request('b', 'slow', {}));
                await sleep(10);
                leave(pair);
                expect((await pending).code).toBe('ERR_PEER_DISCONNECTED');
                expect(Date.now() - started).toBeLessThan(500);
                // Local events are delivered after the rejection's microtask.
                await sleep(0);
                expect(disconnected).toHaveBeenCalledTimes(1);
                expect(disconnected.mock.calls[0][0].data.peerId).toBe('b');
                expect(pair.a.peers).toEqual([]);
                expect((await outcome(pair.a.request('b', 'slow', {}))).code).toBe('ERR_PEER_NOT_FOUND');
            } finally { pair.close(); }
        });
    }

    it('does not answer a goodbye, and sends one goodbye per binding', async () => {
        const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        const transport = fakeTransport();
        const cleanup = bus.addTransport(transport, { peerId: 'b', origin: 'channel', goodbye: true });
        transport.deliver(BYE);
        expect(transport.sent).toEqual([]);
        expect(transport.destroyed).toBe(true);
        cleanup();
        bus.destroy();
        expect(transport.sent).toEqual([]);

        const other = fakeTransport();
        const otherBus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        otherBus.addTransport(other, { peerId: 'b', origin: 'channel', goodbye: true });
        otherBus.removePeer('b');
        otherBus.destroy();
        expect(other.sent.map(message => message.type)).toEqual(['bye']);
        expect(other.sent[0]).toMatchObject({ _cb: 1, type: 'bye', meta: { source: 'a' } });
    });

    it('is off by default: no goodbye is sent, and a received one is ignored without a warning', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const pair = channelPair({ a: { goodbye: true } });
            const sent = spyOn(pair.right, 'send');
            pair.b.destroy();
            expect(sent.mock.calls.map(([message]) => message?.type)).not.toContain('bye');
            pair.a.destroy();

            const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
            const transport = fakeTransport();
            bus.addTransport(transport, { peerId: 'b', origin: 'channel' });
            transport.deliver(BYE);
            await bus.handleMessage(BYE, 'channel', 'b');
            expect(bus.peers).toEqual(['b']);
            expect(transport.destroyed).toBe(false);
            expect(warn.mock.calls.filter(args => String(args[0]).includes('bye'))).toEqual([]);
            bus.destroy();
        } finally { warn.mockRestore(); }
    });

    it('ignores a goodbye from an origin the bus does not allow', () => {
        const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['https://app.example'] });
        const transport = fakeTransport();
        bus.addTransport(transport, { peerId: 'b', origin: 'https://app.example', goodbye: true });
        transport.deliver(BYE, 'https://evil.example');
        expect(bus.peers).toEqual(['b']);
        transport.deliver(BYE, 'https://app.example');
        expect(bus.peers).toEqual([]);
        bus.destroy();
    });

    it('leaves a replacement registration for the same peer ID alone', () => {
        const bus = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        const first = fakeTransport();
        const second = fakeTransport();
        const cleanupFirst = bus.addTransport(first, { peerId: 'b', origin: 'channel', goodbye: true });
        bus.removePeer('b');
        bus.addTransport(second, { peerId: 'b', origin: 'channel', goodbye: true });
        cleanupFirst();
        expect(bus.peers).toEqual(['b']);
        expect(first.destroyed).toBe(true);
        expect(second.destroyed).toBe(false);
        expect(second.sent).toEqual([]);
        bus.destroy();
        expect(second.sent.map(message => message.type)).toEqual(['bye']);
    });
});

describe('StreamManager.closePeer()', () => {
    function streamPair() {
        const toB = [];
        const toA = [];
        const a = new StreamManager((peerId, frame) => { toB.push([peerId, frame]); return Promise.resolve(); });
        const b = new StreamManager((peerId, frame) => { toA.push([peerId, frame]); return Promise.resolve(); });
        const pump = async () => {
            for (let i = 0; i < 20 && (toA.length || toB.length); i++) {
                while (toB.length) b.handleMessage(toB.shift()[1], 'a');
                while (toA.length) a.handleMessage(toA.shift()[1], 'b');
                await sleep(0);
            }
        };
        return { a, b, toA, toB, pump };
    }

    it('fails readers and writers of that peer only, without sending to it', async () => {
        const { a, b, toA, toB, pump } = streamPair();
        const readers = [];
        b.onStream('up', stream => { readers.push(stream); });
        const writer = a.createStream('up', 'b');
        await writer.open();
        await writer.write('hello');
        const other = a.createStream('up', 'c');
        await pump();
        toB.length = 0;
        const reading = outcome(readers[0].collect());
        expect(b.closePeer('a')).toBe(1);
        expect(a.closePeer('b')).toBe(1);
        expect(await reading).toMatchObject({ code: 'ERR_STREAM_CANCELLED', message: 'Stream peer disconnected' });
        expect((await outcome(writer.write('more'))).code).toBe('ERR_STREAM_CANCELLED');
        expect(toA).toEqual([]);
        expect(toB).toEqual([]);
        expect(b.activeStreamCount).toBe(0);
        expect(a.outgoingStreamCount).toBe(1);
        expect(a.closePeer('c', 'gone')).toBe(1);
        expect((await outcome(other.open())).message).toBe('gone');
        a.destroy();
        b.destroy();
    });

    it('follows a bus peer leaving with goodbye', async () => {
        const pair = channelPair({ a: { goodbye: true }, b: { goodbye: true } });
        try {
            const streamsA = new StreamManager((peerId, frame) => pair.a.signal('stream', frame));
            const streamsB = new StreamManager((peerId, frame) => pair.b.signal('stream', frame));
            pair.a.on('stream', event => streamsA.handleMessage(event.data.payload, event.data.source));
            pair.b.on('stream', event => streamsB.handleMessage(event.data.payload, event.data.source));
            pair.a.on('peer:disconnected', event => streamsA.closePeer(event.data.peerId));
            pair.a.addCleanup(() => streamsA.destroy());
            pair.b.addCleanup(() => streamsB.destroy());
            const received = new Promise(resolve => streamsA.onStream('down', resolve));
            const writer = streamsB.createStream('down', 'a');
            await writer.open();
            const reader = await received;
            const reading = outcome(reader.collect());
            pair.b.destroy();
            expect((await reading).code).toBe('ERR_STREAM_CANCELLED');
            expect(streamsA.activeStreamCount).toBe(0);
        } finally { pair.close(); }
    });
});

describe('Resources after destroy()', () => {
    it('leaves no port or timer that keeps Node running', () => {
        // Node reports live handles; Bun keeps its own event loop accounting.
        const script = `
            import { CrossBus, MessageChannelTransport, StreamManager } from ${JSON.stringify(new URL('../../src/index.js', import.meta.url).href)};
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
            const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'], requestTimeout: 60000 });
            const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'], requestTimeout: 60000 });
            const left = new MessageChannelTransport();
            a.addTransport(left, { peerId: 'b', origin: 'channel', goodbye: true });
            b.addTransport(MessageChannelTransport.fromPort(left.remotePort), { peerId: 'a', origin: 'channel', goodbye: true });
            b.handle('echo', value => value);
            b.handle('slow', () => new Promise(() => {}));
            await a.request('b', 'echo', 1);
            const pending = a.request('b', 'slow', {}).catch(error => error.code);
            const streams = new StreamManager(() => Promise.resolve());
            a.addCleanup(() => streams.destroy());
            const writer = streams.createStream('s', 'b', { flowControl: true, timeout: 60000 });
            void writer.open().catch(() => {});
            await sleep(10);
            a.destroy();
            b.destroy();
            const code = await pending;
            await sleep(20);
            const live = process.getActiveResourcesInfo().filter(name => !['PipeWrap', 'TTYWrap', 'FSReqCallback'].includes(name));
            console.log(JSON.stringify({ code, live }));
        `;
        const result = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000, env: { ...process.env, NODE_ENV: 'production' } });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout.trim().split('\n').pop())).toEqual({ code: 'ERR_PEER_DISCONNECTED', live: [] });
    });
});
