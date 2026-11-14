import {
    CrossBus,
    MessageChannelTransport,
    PostMessageTransport,
    StreamManager,
    ReadableSignalStream,
    uuid
} from '/dist/crossbus.min.js';
const check = (condition, message) => {
    if (!condition) throw new Error(message);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function pair(options = {}) {
    const a = CrossBus.createSecure({
        peerId: 'a',
        allowedOrigins: ['channel'],
        requestTimeout: options.timeout ?? 1000
    });
    const b = CrossBus.createSecure({
        peerId: 'b',
        allowedOrigins: ['channel'],
        maxPayloadSize: options.limit ?? 1048576
    });
    const left = new MessageChannelTransport(options),
        right = MessageChannelTransport.fromPort(left.remotePort, options);
    a.addTransport(left, { peerId: 'b', origin: 'channel' });
    b.addTransport(right, { peerId: 'a', origin: 'channel' });
    return {
        a,
        b,
        close() {
            a.destroy();
            b.destroy();
        }
    };
}
async function eventFrom(target, kind, origin) {
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            removeEventListener('message', listener);
            reject(Error('Frame fixture did not become ready'));
        }, 5000);
        const listener = (e) => {
            if (e.source === target && e.origin === origin && e.data?.kind === kind) {
                clearTimeout(timer);
                removeEventListener('message', listener);
                resolve(e.data);
            }
        };
        addEventListener('message', listener);
    });
}

export async function runBrowserSuite(otherOrigin) {
    const cases = [];
    const run = async (name, fn) => {
        const start = performance.now();
        await fn();
        cases.push({ name, passed: true, elapsedMs: performance.now() - start });
    };
    for (const wireFormat of ['standard', 'compact'])
        await run(wireFormat + ' RPC, graph cloning, async hooks and handler guards', async () => {
            const p = pair({ wireFormat });
            let protectedCalls = 0,
                echoCalls = 0;
            p.b.handle('echo', (v) => {
                echoCalls++;
                return v;
            });
            p.a.handle('reverse', (v) => v.n + 1);
            p.b.handle(
                'secret',
                () => {
                    protectedCalls++;
                    return 7;
                },
                { allowedPeers: ['other'] }
            );
            p.b.addInboundHook(async (v) => {
                if (v?.blocked) throw Error('blocked by inbound hook');
                return v;
            });
            p.b.addOutboundHook(async (v) => v);
            try {
                const payload = { n: 7, text: 'Unicode 🐟', map: new Map([['x', 4]]) };
                payload.self = payload;
                const result = await p.a.request('b', 'echo', payload);
                check(
                    result.self === result &&
                        result.map.get('x') === 4 &&
                        result.n === 7 &&
                        result.text === payload.text,
                    'Structured clone graph changed'
                );
                check((await p.b.request('a', 'reverse', { n: 40 })) === 41, 'Reverse RPC failed');
                const outcomes = await Promise.all(
                    Array.from({ length: 64 }, (_, n) =>
                        p.a.request('b', 'echo', { n, text: 'x'.repeat(1024) })
                    )
                );
                check(
                    outcomes.every((v, n) => v.n === n && v.text === 'x'.repeat(1024)),
                    'Concurrent RPC result mismatch'
                );
                const denied = await p.a.request('b', 'secret', {}).then(
                    () => null,
                    (e) => e.code
                );
                const rejected = await p.a.request('b', 'echo', { blocked: true }).then(
                    () => null,
                    (e) => e.message
                );
                check(
                    denied === 'ERR_UNAUTHORIZED' && rejected.includes('blocked by inbound hook'),
                    'Expected guard rejection missing'
                );
                check(
                    protectedCalls === 0 && echoCalls === 65,
                    'Rejected request executed a protected handler'
                );
            } finally {
                p.close();
            }
        });
    await run('JSON fallback decodes valid RPC and retains handler authorization', async () => {
        const p = pair({ contentType: 'application/json; charset=utf-8' });
        let protectedCalls = 0;
        p.b.handle('echo', (v) => v);
        p.b.handle(
            'secret',
            () => {
                protectedCalls++;
            },
            { allowedPeers: ['other'] }
        );
        try {
            const r = await p.a.request('b', 'echo', { n: 7, text: 'JSON 🐟' });
            check(r.n === 7 && r.text === 'JSON 🐟', 'JSON RPC failed');
            const error = await p.a.request('b', 'secret', {}).then(
                () => null,
                (e) => e.code
            );
            check(
                error === 'ERR_UNAUTHORIZED' && protectedCalls === 0,
                'JSON authorization failed'
            );
        } finally {
            p.close();
        }
    });
    await run('typed-view ownership and receiver backing-storage budget', async () => {
        const p = pair({ autoTransfer: true });
        p.b.handle('echo', (v) => v);
        try {
            const storage = new ArrayBuffer(32768),
                unrelated = new ArrayBuffer(16),
                all = new Uint8Array(storage);
            for (let i = 0; i < all.length; i++) all[i] = i % 251;
            const view = new Uint8Array(storage, 8, 16);
            Object.defineProperty(view, 'buffer', { value: unrelated });
            const pending = p.a.request('b', 'echo', view);
            check(
                storage.byteLength === 0 && unrelated.byteLength === 16,
                'Wrong sender buffer detached'
            );
            const r = await pending;
            check(
                r.byteOffset === 8 && r.byteLength === 16 && r.buffer.byteLength === 32768,
                'Subview storage changed'
            );
            check(
                new Uint8Array(r.buffer).every((v, i) => v === i % 251),
                'Transferred binary data corrupted'
            );
        } finally {
            p.close();
        }
        const limited = pair({ limit: 32 });
        let calls = 0;
        limited.b.handle('echo', (v) => {
            calls++;
            return v;
        });
        try {
            const error = await limited.a
                .request('b', 'echo', new Uint8Array(new ArrayBuffer(4096), 0, 1))
                .then(
                    () => null,
                    (e) => e.code
                );
            check(
                error === 'ERR_PAYLOAD_TOO_LARGE' && calls === 0,
                'Receiver backing budget bypassed'
            );
        } finally {
            limited.close();
        }
    });
    await run('coalesced default deadlines and destruction settle pending RPCs', async () => {
        const p = pair({ timeout: 200 });
        let calls = 0;
        p.b.handle('hold', () => {
            calls++;
            return new Promise(() => {});
        });
        try {
            const start = performance.now();
            const results = await Promise.all(
                Array.from({ length: 32 }, () =>
                    p.a.request('b', 'hold', {}).then(
                        () => null,
                        (e) => e.code
                    )
                )
            );
            check(
                results.every((e) => e === 'ERR_RESPONSE_TIMEOUT') &&
                    calls === 32 &&
                    performance.now() - start >= 199,
                'Default deadlines changed'
            );
            const pending = p.a.request('b', 'hold', {}).then(
                () => null,
                (e) => e.code
            );
            await pause(10);
            p.a.destroy();
            check(
                (await pending) === 'ERR_PEER_DISCONNECTED',
                'Destroy did not cancel bound-peer RPC'
            );
        } finally {
            p.close();
        }
    });
    for (const contentType of ['application/json', 'application/json; charset=utf-8'])
        await run('cross-origin window ' + contentType + ' with real source binding', async () => {
            const child = document.createElement('iframe');
            child.src =
                otherOrigin +
                '/tests/qualification/window.html?parent=' +
                encodeURIComponent(location.origin);
            document.body.append(child);
            const ready = eventFrom(child.contentWindow, 'ready', otherOrigin);
            await ready;
            const bus = CrossBus.createSecure({ peerId: 'parent', allowedOrigins: [otherOrigin] });
            let protectedCalls = 0;
            bus.handle('protected', () => {
                protectedCalls++;
                return 7;
            });
            bus.addTransport(
                new PostMessageTransport(child.contentWindow, {
                    targetOrigin: otherOrigin,
                    allowedOrigins: [otherOrigin],
                    contentType
                }),
                { peerId: 'child', origin: otherOrigin }
            );
            const rogue = document.createElement('iframe');
            try {
                const result = await bus.request(
                    'child',
                    'echo',
                    { n: 7, text: 'window 🐟' },
                    { timeout: 3000 }
                );
                check(result.n === 7 && result.text === 'window 🐟', 'Window RPC failed');
                const error = await bus.request('child', 'secret', {}, { timeout: 3000 }).then(
                    () => null,
                    (e) => e.code
                );
                check(error === 'ERR_UNAUTHORIZED', 'Window handler authorization failed');
                check(
                    (await bus.request('child', 'stats', {})) === 0,
                    'Protected child handler executed'
                );
                rogue.src =
                    otherOrigin +
                    '/tests/qualification/window.html?rogue=1&parent=' +
                    encodeURIComponent(location.origin);
                document.body.append(rogue);
                await eventFrom(rogue.contentWindow, 'forged', otherOrigin);
                check(
                    (await bus.request('child', 'echo', 7)) === 7 && protectedCalls === 0,
                    'Wrong Window source forged a request'
                );
            } finally {
                bus.destroy();
                child.remove();
                rogue.remove();
            }
        });
    await run('real module Worker RPC and flow-controlled native binary streaming', async () => {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        const rpc = new MessageChannelTransport({ autoTransfer: true }),
            streamTransport = new MessageChannelTransport({ autoTransfer: true });
        const messages = new Map();
        const wait = (kind) =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Worker ' + kind + ' missing')), 5000);
                messages.set(kind, (v) => {
                    clearTimeout(timer);
                    resolve(v);
                });
            });
        worker.onmessage = (e) => messages.get(e.data.kind)?.(e.data);
        worker.onerror = (e) => {
            throw Error(e.message);
        };
        const ready = wait('ready');
        worker.postMessage({ rpc: rpc.remotePort, stream: streamTransport.remotePort }, [
            rpc.remotePort,
            streamTransport.remotePort
        ]);
        const bus = CrossBus.createSecure({ peerId: 'main', allowedOrigins: ['channel'] });
        bus.addTransport(rpc, { peerId: 'worker', origin: 'channel' });
        const streams = new StreamManager((_peer, m) => streamTransport.send(m));
        streamTransport.onMessage((m) => streams.handleMessage(m, 'worker'));
        try {
            await ready;
            const values = await Promise.all(
                Array.from({ length: 64 }, (_, n) =>
                    bus.request('worker', 'echo', { n, text: 'x'.repeat(1024) }, { timeout: 3000 })
                )
            );
            check(
                values.every((v, n) => v.n === n && v.text.length === 1024),
                'Worker RPC mismatched members'
            );
            check(
                (await bus.request('worker', 'stats', {})) === 64,
                'Worker invocation count mismatch'
            );
            const input = Uint8Array.from({ length: 32771 }, (_, i) => i % 251),
                result = wait('stream');
            const writer = streams.createStream('binary', 'worker', {
                flowControl: true,
                windowSize: 2,
                chunkSize: 4096,
                binaryEncoding: 'native',
                ackTimeout: 3000
            });
            await writer.write(input);
            await writer.end();
            const reply = await result;
            check(
                input.byteLength === 32771 &&
                    reply.value.length === input.length &&
                    reply.value.every((v, i) => v === input[i]),
                'Worker stream corrupted data or detached caller storage'
            );
            check(
                streams.outgoingStreamCount === 0,
                'Completed Worker stream retained writer state'
            );
        } finally {
            streams.destroy();
            streamTransport.destroy();
            bus.destroy();
            worker.terminate();
        }
    });
    await run('base64 stream preserves all byte values and independent chunk padding', async () => {
        const left = new MessageChannelTransport();
        const right = MessageChannelTransport.fromPort(left.remotePort);
        const sender = new StreamManager((_peer, frame) => left.send(frame));
        const receiver = new StreamManager((_peer, frame) => right.send(frame));
        left.onMessage((frame) => sender.handleMessage(frame, 'receiver'));
        right.onMessage((frame) => receiver.handleMessage(frame, 'sender'));
        let resolveResult, rejectResult;
        const result = new Promise((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });
        result.catch(() => {});
        receiver.onStream('bytes', (stream) => stream.collect().then(resolveResult, rejectResult));
        const input = Uint8Array.from({ length: 257 }, (_, i) => i & 255);
        try {
            const writer = sender.createStream('bytes', 'receiver', {
                flowControl: true,
                chunkSize: 5,
                windowSize: 4,
                ackTimeout: 3000,
                timeout: 5000
            });
            await writer.write(input);
            await writer.end();
            const actual = await result;
            check(
                actual.length === input.length && actual.every((v, i) => v === input[i]),
                'Base64 corrupted binary input'
            );
            check(input.buffer.byteLength === 257, 'Base64 detached original storage');
        } finally {
            sender.destroy();
            receiver.destroy();
            left.destroy();
            right.destroy();
        }
    });
    await run('stream reorder, idle timeout and UUID v4 conformance', async () => {
        const reader = new ReadableSignalStream('id', 'text', {}, { idleTimeout: 1000 });
        const result = reader.collect();
        reader.push({ seq: 1, d: 'b' });
        reader.end({}, 2);
        reader.push({ seq: 0, d: 'a' });
        check((await result) === 'ab', 'Reordering failed');
        const gap = new ReadableSignalStream('gap', 'text', {}, { idleTimeout: 20 });
        const error = gap.collect().then(
            () => null,
            (e) => e.code
        );
        gap.push({ seq: 1, d: 'later' });
        gap.end({}, 2);
        check(
            (await error) === 'ERR_STREAM_TIMEOUT' && gap.bufferedBytes === 0,
            'Gap deadline leaked state'
        );
        const ids = Array.from({ length: 2049 }, () => uuid());
        check(
            new Set(ids).size === 2049 &&
                ids.every((id) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
                ),
            'UUID conformance failed'
        );
    });
    return { userAgent: navigator.userAgent, cases, checkedCases: cases.length };
}
