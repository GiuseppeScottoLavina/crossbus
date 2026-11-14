import { it, expect } from 'bun:test';
import {
    ReadableSignalStream,
    WritableSignalStream,
    StreamManager
} from '../../src/core/stream.js';
import { MessageChannelTransport } from '../../src/transports/message-channel.js';
import * as legacy from '../../benchmarks/next-release/baseline/crossbus.min.js';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function pair(options = {}) {
    const sent = [];
    let left, right;
    left = new StreamManager((_peer, m) => {
        sent.push(structuredClone(m));
        right.handleMessage(structuredClone(m), 'left');
    }, options.left);
    right = new StreamManager(
        (_peer, m) => left.handleMessage(structuredClone(m), 'right'),
        options.right
    );
    return {
        left,
        right,
        sent,
        close() {
            left.destroy();
            right.destroy();
        }
    };
}

it('bounds unconsumed chunks, serializes concurrent writes/end and waits for consumption', async () => {
    const p = pair();
    let reader;
    p.right.onStream('data', (stream) => {
        reader = stream;
    });
    const w = p.left.createStream('data', 'right', {
        flowControl: true,
        windowSize: 2,
        chunkSize: 1,
        ackTimeout: 500
    });
    try {
        const a = w.write('abc'),
            b = w.write('def'),
            ending = w.end();
        let ended = false;
        ending.then(() => {
            ended = true;
        });
        await pause(10);
        expect(p.sent.filter((m) => m.st === 'data').map((m) => m.d)).toEqual(['a', 'b']);
        expect(reader.bufferedChunks).toBe(2);
        expect(ended).toBe(false);
        const collected = reader.collect();
        await Promise.all([a, b, ending]);
        expect(await collected).toBe('abcdef');
        expect(reader.bufferedBytes).toBe(0);
        expect(p.left.outgoingStreamCount).toBe(0);
        expect(p.right.activeStreamCount).toBe(0);
    } finally {
        p.close();
    }
});

it('uses exact native chunk allocations without detaching caller-owned binary storage', async () => {
    const p = pair();
    let collected;
    p.right.onStream('data', (s) => {
        collected = s.collect();
    });
    const w = p.left.createStream('data', 'right', {
        flowControl: true,
        binaryEncoding: 'native',
        chunkSize: 5,
        windowSize: 2
    });
    const source = Uint8Array.from({ length: 41 }, (_, i) => i * 3);
    const view = source.subarray(7, 34);
    try {
        await w.write(view);
        await w.end();
        expect(await collected).toEqual(view);
        expect(source.byteLength).toBe(41);
        const chunks = p.sent.filter((m) => m.st === 'data');
        expect(chunks.length).toBe(6);
        for (const m of chunks) {
            expect(m.b64).toBe(false);
            expect(m.d.buffer.byteLength).toBe(m.d.byteLength);
        }
    } finally {
        p.close();
    }
});

it('keeps canonical independently padded base64 chunks for every byte value and empty input', async () => {
    for (const length of [0, 1, 2, 3, 257, 4099]) {
        const input = Uint8Array.from({ length }, (_, i) => i & 255);
        const frames = [];
        const writer = new WritableSignalStream((frame) => frames.push(frame), 'bytes', {
            chunkSize: 5
        });
        await writer.write(input);
        await writer.end();
        const reader = new legacy.ReadableSignalStream(writer.streamId, 'bytes');
        const collected = reader.collect();
        let offset = 0;
        for (const frame of frames.filter((frame) => frame.st === 'data')) {
            expect(frame.b64).toBe(true);
            expect(frame.d).toBe(btoa(String.fromCharCode(...input.subarray(offset, offset + 5))));
            reader.push(frame);
            offset += 5;
        }
        reader.end();
        expect(await collected).toEqual(input);
        expect(input.byteLength).toBe(length);
    }
});

it('reorders chunks across an early end and ignores duplicate sequences', async () => {
    const reader = new ReadableSignalStream('id', 'data', {}, { idleTimeout: 100 });
    const result = reader.collect();
    reader.push({ seq: 2, d: 'c' });
    reader.push({ seq: 2, d: 'wrong' });
    reader.end({ final: 7 }, 3);
    expect(reader.ended).toBe(false);
    reader.push({ seq: 0, d: 'a' });
    reader.push({ seq: 0, d: 'wrong' });
    reader.push({ seq: 1, d: 'b' });
    expect(await result).toBe('abc');
    expect(reader.meta.final).toBe(7);
    expect(reader.bufferedBytes).toBe(0);
});

it('rejects gaps at the configured idle deadline and releases buffered storage', async () => {
    const reader = new ReadableSignalStream('id', 'data', {}, { idleTimeout: 15 });
    const result = reader.collect();
    reader.push({ seq: 1, d: 'later' });
    reader.end({}, 2);
    await expect(result).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
    expect(reader.bufferedBytes).toBe(0);
    expect(reader.bufferedChunks).toBe(0);
});

it('enforces the default chunk cap and the configured full backing-storage budget', () => {
    const reader = new ReadableSignalStream('id', 'data');
    for (let i = 0; i < 1024; i++) reader.push({ seq: i, d: 'x' });
    expect(() => reader.push({ seq: 1024, d: 'overflow' })).toThrow('chunk buffer exceeded');
    expect(reader.bufferedChunks).toBe(0);
    const small = new ReadableSignalStream('id2', 'data', {}, { maxBufferedBytes: 32 });
    const value = new Uint8Array(new ArrayBuffer(4096), 0, 1);
    Object.defineProperty(value, 'buffer', { value: new ArrayBuffer(1) });
    expect(() => small.push({ seq: 0, d: value })).toThrow('byte buffer exceeded');
    expect(small.bufferedBytes).toBe(0);
});

for (const seq of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    it(`rejects invalid sequence ${seq}`, () => {
        const reader = new ReadableSignalStream('id', 'data');
        expect(() => reader.push({ seq, d: 'x' })).toThrow('sequence');
        expect(reader.ended).toBe(true);
    });

it('does not let another peer forge credits or errors for an outgoing stream', async () => {
    const manager = new StreamManager(() => {});
    const w = manager.createStream('data', 'trusted', { flowControl: true, ackTimeout: 20 });
    const pending = w.write('x');
    await pause(1);
    manager.handleMessage(
        { t: 'stream', sid: w.streamId, st: 'ack', flow: 1, seq: 0, ready: true },
        'attacker'
    );
    manager.handleMessage(
        { t: 'stream', sid: w.streamId, st: 'error', reason: 'forged' },
        'attacker'
    );
    await expect(pending).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
    expect(manager.outgoingStreamCount).toBe(0);
    manager.destroy();
});

it('fails rather than silently downgrading when a receiver never acknowledges flow support', async () => {
    const writer = new WritableSignalStream(() => {}, 'data', {
        flowControl: true,
        ackTimeout: 10
    });
    await expect(writer.write('x')).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
    expect(writer.ended).toBe(true);
});

it('cancels a writer whose underlying send never settles at its total deadline', async () => {
    const manager = new StreamManager(() => new Promise(() => {}));
    const writer = manager.createStream('data', 'peer', { timeout: 15 });
    await expect(writer.write('x')).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
    expect(manager.outgoingStreamCount).toBe(0);
    manager.destroy();
});

it('releases a reader and wakes a blocked sender when iteration stops early', async () => {
    const p = pair();
    let read;
    let first;
    p.right.onStream('data', (s) => {
        read = s;
        first = (async () => {
            for await (const chunk of s) {
                expect(chunk).toBe('a');
                break;
            }
        })();
    });
    const w = p.left.createStream('data', 'right', {
        flowControl: true,
        windowSize: 1,
        chunkSize: 1,
        ackTimeout: 100
    });
    try {
        await expect(w.write('abcdef')).rejects.toThrow('stopped before completion');
        await first;
        expect(read.bufferedChunks).toBe(0);
        expect(p.right.activeStreamCount).toBe(0);
    } finally {
        p.close();
    }
});

it('cancels pending and queued writes on AbortSignal and manager destruction', async () => {
    const manager = new StreamManager(() => {});
    const controller = new AbortController();
    const writer = manager.createStream('data', 'peer', {
        flowControl: true,
        signal: controller.signal,
        ackTimeout: 500
    });
    const a = writer.write('a'),
        b = writer.write('b');
    const outcomes = Promise.all([a, b].map((p) => p.catch((e) => e.message)));
    await pause(1);
    controller.abort();
    expect(await outcomes).toEqual(['Stream aborted by signal', 'Stream aborted by signal']);
    expect(manager.outgoingStreamCount).toBe(0);
    const next = manager.createStream('data', 'peer', { flowControl: true });
    const pending = next.write('x');
    await pause(1);
    manager.destroy();
    await expect(pending).rejects.toThrow('manager destroyed');
    expect(manager.outgoingStreamCount).toBe(0);
});

it('enforces stream quotas before invoking a second protected handler', () => {
    const manager = new StreamManager(() => {}, { maxIncomingStreams: 1, maxOutgoingStreams: 1 });
    let calls = 0;
    manager.onStream('data', () => {
        calls++;
    });
    manager.handleMessage({ t: 'stream', sid: 'one', st: 'open', name: 'data' }, 'peer');
    manager.handleMessage({ t: 'stream', sid: 'two', st: 'open', name: 'data' }, 'peer');
    expect(calls).toBe(1);
    expect(manager.activeStreamCount).toBe(1);
    manager.createStream('data', 'peer');
    expect(() => manager.createStream('data', 'peer')).toThrow('limit exceeded');
    manager.destroy();
});

it('supports flow-controlled binary streaming through actual MessageChannelTransport frames', async () => {
    const channel = new MessageChannelTransport({ autoTransfer: true }),
        remote = MessageChannelTransport.fromPort(channel.remotePort, { autoTransfer: true });
    const a = new StreamManager((_peer, m) => channel.send(m)),
        b = new StreamManager((_peer, m) => remote.send(m));
    channel.onMessage((m) => a.handleMessage(m, 'b'));
    remote.onMessage((m) => b.handleMessage(m, 'a'));
    let collected;
    b.onStream('binary', (s) => {
        collected = s.collect();
    });
    try {
        const writer = a.createStream('binary', 'b', {
            flowControl: true,
            binaryEncoding: 'native',
            chunkSize: 7,
            ackTimeout: 500
        });
        const input = Uint8Array.from({ length: 99 }, (_, i) => i);
        await writer.write(input);
        await writer.end();
        expect(await collected).toEqual(input);
        expect(input.byteLength).toBe(99);
        expect(a.outgoingStreamCount).toBe(0);
        expect(b.activeStreamCount).toBe(0);
    } finally {
        a.destroy();
        b.destroy();
        channel.destroy();
        remote.destroy();
    }
});

it('rejects mixed collection instead of returning corrupted binary data', async () => {
    const reader = new ReadableSignalStream('id', 'data');
    reader.push({ d: 'text' });
    reader.push({ d: new Uint8Array([7]) });
    reader.end();
    await expect(reader.collect()).rejects.toThrow('mixed binary and text');
    expect(reader.bufferedChunks).toBe(0);
});

it('rejects unsupported flow versions and oversized controls before running handlers', () => {
    const manager = new StreamManager(() => {}, { maxControlBytes: 1024 });
    let calls = 0;
    manager.onStream('data', () => {
        calls++;
    });
    manager.handleMessage(
        { t: 'stream', sid: 'new', st: 'open-flow', flow: 2, name: 'data' },
        'peer'
    );
    manager.handleMessage(
        { t: 'stream', sid: 'large', st: 'open', name: 'data', meta: { text: 'x'.repeat(1000) } },
        'peer'
    );
    expect(calls).toBe(0);
    expect(manager.activeStreamCount).toBe(0);
    manager.destroy();
});

it('does not reflect oversized errors indefinitely and cleans the original stream ID', async () => {
    const p = pair({ left: { maxControlBytes: 32 }, right: { maxControlBytes: 32 } });
    let calls = 0;
    p.right.onStream('data', () => {
        calls++;
    });
    try {
        const w = p.left.createStream('data', 'right', { flowControl: true, ackTimeout: 50 });
        await expect(w.write('x')).rejects.toThrow('control payload exceeds budget');
        expect(calls).toBe(0);
        expect(p.left.outgoingStreamCount).toBe(0);
    } finally {
        p.close();
    }
    const manager = new StreamManager(() => {});
    let read;
    manager.onStream('data', (s) => {
        read = s;
    });
    const open = { t: 'stream', sid: 'original', st: 'open', name: 'data' };
    manager.handleMessage(open, 'peer');
    open.sid = 'changed';
    manager.handleMessage({ t: 'stream', sid: 'original', st: 'end', seq: 0 }, 'peer');
    expect(read.ended).toBe(true);
    expect(manager.activeStreamCount).toBe(0);
    manager.destroy();
});

for (const direction of ['new-to-old', 'old-to-new'])
    it(`keeps default binary streaming interoperable with published 0.1.4: ${direction}`, async () => {
        const Sender = direction === 'new-to-old' ? StreamManager : legacy.StreamManager,
            Receiver = direction === 'new-to-old' ? legacy.StreamManager : StreamManager;
        let a, b, result;
        a = new Sender((_peer, m) => b.handleMessage(structuredClone(m), 'a'));
        b = new Receiver((_peer, m) => a.handleMessage(structuredClone(m), 'b'));
        b.onStream('data', (s) => {
            result = s.collect();
        });
        try {
            const w = a.createStream('data', 'b', { chunkSize: 5 });
            const input = Uint8Array.from({ length: 23 }, (_, i) => i * 7);
            await w.write(input);
            await w.end();
            expect(await result).toEqual(input);
            expect(b.activeStreamCount).toBe(0);
        } finally {
            a.destroy();
            b.destroy();
        }
    });

it('does not invoke an old receiver handler when flow negotiation is unsupported', async () => {
    let a, b;
    let calls = 0;
    a = new StreamManager((_peer, m) => b.handleMessage(m, 'a'));
    b = new legacy.StreamManager((_peer, m) => a.handleMessage(m, 'b'));
    b.onStream('data', () => {
        calls++;
    });
    try {
        const w = a.createStream('data', 'b', { flowControl: true, ackTimeout: 15 });
        await expect(w.write('x')).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
        expect(calls).toBe(0);
        expect(a.outgoingStreamCount).toBe(0);
    } finally {
        a.destroy();
        b.destroy();
    }
});

it('ignores impossible cumulative credits from the authenticated peer', async () => {
    const sent = [];
    const manager = new StreamManager((_peer, m) => sent.push(m));
    const w = manager.createStream('data', 'trusted', {
        flowControl: true,
        windowSize: 1,
        chunkSize: 1,
        ackTimeout: 20
    });
    const pending = w.write('abc');
    await pause(1);
    manager.handleMessage(
        { t: 'stream', sid: w.streamId, st: 'ack', flow: 1, ready: true, seq: 0 },
        'trusted'
    );
    await pause(1);
    expect(sent.filter((m) => m.st === 'data').map((m) => m.d)).toEqual(['a']);
    manager.handleMessage(
        { t: 'stream', sid: w.streamId, st: 'ack', flow: 1, seq: 100 },
        'trusted'
    );
    await expect(pending).rejects.toMatchObject({ code: 'ERR_STREAM_TIMEOUT' });
    expect(sent.filter((m) => m.st === 'data').map((m) => m.d)).toEqual(['a']);
    manager.destroy();
});
