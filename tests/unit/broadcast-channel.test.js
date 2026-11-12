import { describe, it, expect, afterEach, mock } from 'bun:test';
import { BroadcastChannelTransport } from '../../src/transports/broadcast-channel.js';
const resources = [];
const channelName = () => `crossbus-test-${crypto.randomUUID()}`;
function transport(name) { const item = new BroadcastChannelTransport(name); resources.push(item); return item; }
afterEach(() => { for (const item of resources.splice(0)) item.destroy(); });

describe('BroadcastChannelTransport with real channels', () => {
    it('reports platform support', () => expect(BroadcastChannelTransport.isSupported()).toBe(true));
    it('honors a string channel name and object options', () => {
        expect(transport('specified').channelName).toBe('specified');
        expect(transport({ channelName: 'options' }).channelName).toBe('options');
    });
    it('defaults the channel name', () => expect(transport().channelName).toBe('crossbus:default'));
    it('delivers a marked envelope to the other endpoint with source context', async () => {
        const name = channelName();
        const a = transport(name), b = transport(name);
        const message = new Promise(resolve => b.onMessage((data, source) => resolve({ data, source })));
        a.send({ id: 'one', t: 'sig', p: { value: 42 } });
        expect(await message).toEqual({ data: { _cb: 1, id: 'one', t: 'sig', p: { value: 42 } }, source: { origin: 'broadcast' } });
    });
    it('isolates distinct channel names and never loops back to its sender', async () => {
        const a = transport(channelName()), b = transport(channelName());
        const called = mock();
        a.onMessage(called); b.onMessage(called);
        a.send({ id: 'isolated', t: 'sig' });
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(called).not.toHaveBeenCalled();
    });
    it('ignores non-protocol messages and stops receiving after offMessage', async () => {
        const name = channelName();
        const a = transport(name), b = transport(name);
        const raw = new BroadcastChannel(name);
        const called = mock();
        b.onMessage(called);
        try {
            raw.postMessage({ random: true });
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(called).not.toHaveBeenCalled();
            b.offMessage();
            a.send({ id: 'after-off', t: 'sig' });
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(called).not.toHaveBeenCalled();
        } finally { raw.close(); }
    });
    it('closes idempotently and rejects subsequent sends', () => {
        const a = transport(channelName());
        a.destroy(); a.destroy();
        expect(a.isDestroyed).toBe(true);
        expect(() => a.send({ id: 'closed', t: 'sig' })).toThrow();
    });
    it('rejects non-function receivers', () => expect(() => transport(channelName()).onMessage(null)).toThrow(TypeError));
});
