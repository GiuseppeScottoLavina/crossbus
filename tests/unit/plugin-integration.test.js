import { describe, it, expect, mock } from 'bun:test';
import { CrossBus, MessageChannelTransport, createPresence } from '../../src/index.js';
import { withBatching } from '../../src/plugins/batch.js';

function pair() {
    const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
    const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
    const channel = new MessageChannelTransport();
    a.addTransport(channel, { peerId: 'b', origin: 'channel' });
    b.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'a', origin: 'channel' });
    return { a, b, close() { a.destroy(); b.destroy(); } };
}

async function until(fn) {
    const deadline = Date.now() + 1000;
    while (!fn()) {
        if (Date.now() >= deadline) throw new Error('Message was not delivered');
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

describe('Optional feature integration on real channels', () => {
    it('batches signals, preserves their peer/payload and resolves send results', async () => {
        const connected = pair();
        const received = [];
        withBatching(connected.a, { maxBatchSize: 2, useRaf: false });
        withBatching(connected.b, { maxBatchSize: 2, useRaf: false });
        connected.b.on('tick', event => received.push(event.data), { mode: 'sync' });
        try {
            const first = connected.a.signal('tick', { value: 1 });
            const second = connected.a.signal('tick', { value: 2 });
            expect((await first).delivered).toBe(1);
            expect((await second).delivered).toBe(1);
            await until(() => received.length === 2);
            expect(received).toEqual([{ payload: { value: 1 }, source: 'a' }, { payload: { value: 2 }, source: 'a' }]);
            expect(connected.a._batcher.stats.batchesSent).toBe(1);
        } finally { connected.close(); }
    });
    it('runs inbound validation for individual batched signals', async () => {
        const connected = pair();
        withBatching(connected.a, { maxBatchSize: 1, useRaf: false });
        withBatching(connected.b, { maxBatchSize: 1, useRaf: false });
        let rejected = false;
        connected.b.addInboundHook((payload, context) => {
            if (context.handlerName === 'protected') { rejected = true; throw new Error('Denied'); }
            return payload;
        });
        const protectedHandler = mock();
        connected.b.on('protected', protectedHandler, { mode: 'sync' });
        try {
            await connected.a.signal('protected', { bad: true });
            await until(() => rejected);
            expect(protectedHandler).not.toHaveBeenCalled();
        } finally { connected.close(); }
    });
    it('preserves exclusions and cancels queued signals on destruction', async () => {
        const connected = pair();
        withBatching(connected.a, { windowMs: 1000, useRaf: false });
        try {
            expect((await connected.a.signal('event', {}, { exclude: ['b'] })).delivered).toBe(0);
            const pending = connected.a.signal('queued', {}).catch(error => error);
            connected.a.destroy();
            expect(await pending).toBeInstanceOf(Error);
            expect(connected.a._batcher.stats.pendingMessages).toBe(0);
        } finally { connected.close(); }
    });
    it('tracks presence through event envelopes and stops when the bus is destroyed', async () => {
        const connected = pair();
        const first = createPresence(connected.a, { autoStart: false });
        const second = createPresence(connected.b, { autoStart: false });
        try {
            first.start(); second.start();
            await until(() => first.isOnline('b') && second.isOnline('a'));
            expect(first.getPeer('b').peerId).toBe('b');
            connected.a.destroy();
            expect(first.isDestroyed).toBe(true);
        } finally { connected.close(); }
        expect(second.isDestroyed).toBe(true);
    });
});
