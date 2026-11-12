import { it, expect } from 'bun:test';
import { CrossBus, EventEmitter, MessageChannelTransport } from '../../src/index.js';
import { withBatching } from '../../src/plugins/batch.js';

it('supports core RPC, event metadata and batching without global Web Crypto', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    let a, b;
    try {
        const emitter = new EventEmitter();
        let event;
        emitter.on('event', value => { event = value; }, { mode: 'sync' });
        await emitter.emit('event', 42);
        expect(event.messageId).toMatch(/^[0-9a-f-]{36}$/);
        expect(event.data).toBe(42);
        a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
        const channel = new MessageChannelTransport();
        a.addTransport(channel, { peerId: 'b', origin: 'channel' });
        b.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'a', origin: 'channel' });
        b.handle('echo', data => data);
        expect(await a.request('b', 'echo', { value: 42 }, { timeout: 500 })).toEqual({ value: 42 });
        withBatching(a, { maxBatchSize: 1, useRaf: false });
        withBatching(b, { maxBatchSize: 1, useRaf: false });
        let resolveMessage;
        const delivered = new Promise(resolve => { resolveMessage = resolve; });
        b.on('tick', value => resolveMessage(value.data.payload), { mode: 'sync' });
        await a.signal('tick', { value: 'batched' });
        expect(await delivered).toEqual({ value: 'batched' });
    } finally {
        a?.destroy(); b?.destroy();
        if (original) Object.defineProperty(globalThis, 'crypto', original);
        else delete globalThis.crypto;
    }
});
