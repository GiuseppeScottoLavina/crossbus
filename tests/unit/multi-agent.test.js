import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CrossBus, MessageChannelTransport } from '../../src/index.js';

describe('Multi-agent orchestration over MessageChannels', () => {
    let hub, planner, executor, memory;
    let stored;
    beforeEach(() => {
        hub = new CrossBus({ isHub: true, peerId: 'hub', allowedOrigins: ['channel'] });
        [planner, executor, memory] = ['planner', 'executor', 'memory'].map(peerId => new CrossBus({ peerId, allowedOrigins: ['channel'] }));
        for (const peer of [planner, executor, memory]) {
            const channel = new MessageChannelTransport();
            hub.addTransport(channel, { peerId: peer.peerId, origin: 'channel' });
            peer.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: 'hub', origin: 'channel' });
        }
        stored = new Map();
        planner.handle('plan:create', ({ goal }) => ({ steps: ['Research', 'Write'], goal }));
        executor.handle('task:run', ({ steps }) => ({ success: true, completed: steps.length }));
        memory.handle('memory:store', ({ key, value }) => { stored.set(key, value); return { stored: true, key }; });
    });
    afterEach(() => { for (const peer of [hub, planner, executor, memory]) peer.destroy(); });
    it('returns the planner response to the hub', async () => {
        expect(await hub.request('planner', 'plan:create', { goal: 'Write' })).toEqual({ steps: ['Research', 'Write'], goal: 'Write' });
    });
    it('executes tasks on the executor', async () => {
        expect(await hub.request('executor', 'task:run', { steps: ['a', 'b'] })).toEqual({ success: true, completed: 2 });
    });
    it('stores the requested value', async () => {
        expect(await hub.request('memory', 'memory:store', { key: 'a', value: 42 })).toEqual({ stored: true, key: 'a' });
        expect(stored.get('a')).toBe(42);
    });
    it('runs the plan, execute, store pipeline with actual responses', async () => {
        const plan = await hub.request('planner', 'plan:create', { goal: 'Publish' });
        const execution = await hub.request('executor', 'task:run', { steps: plan.steps });
        await hub.request('memory', 'memory:store', { key: 'last', value: execution });
        expect(stored.get('last')).toEqual({ success: true, completed: 2 });
        expect(hub.healthCheck().pendingRequests).toBe(0);
    });
    it('supports authorized forwarding through an explicit hub handler', async () => {
        hub.handle('execute', payload => hub.request('executor', 'task:run', payload), { allowedPeers: ['planner'] });
        expect(await planner.request('hub', 'execute', { steps: ['one'] })).toEqual({ success: true, completed: 1 });
        await expect(memory.request('hub', 'execute', { steps: [] })).rejects.toMatchObject({ code: 'ERR_UNAUTHORIZED' });
    });
    it('unregisters handlers and returns NO_HANDLER to the caller', async () => {
        planner.unhandle('plan:create');
        expect(planner.hasHandler('plan:create')).toBe(false);
        await expect(hub.request('planner', 'plan:create', {})).rejects.toMatchObject({ code: 'ERR_NO_HANDLER' });
    });
    it('propagates handler exceptions without breaking subsequent requests', async () => {
        executor.handle('fail', () => { throw new Error('Agent failure'); });
        await expect(hub.request('executor', 'fail')).rejects.toMatchObject({ code: 'ERR_HANDLER_ERROR', message: 'Agent failure' });
        expect(await hub.request('executor', 'task:run', { steps: [] })).toEqual({ success: true, completed: 0 });
    });
    it('destroys all attached agents cleanly', () => {
        hub.destroy();
        expect(hub.isDestroyed).toBe(true);
        expect(hub.peers).toEqual([]);
        expect(hub.healthCheck().pendingRequests).toBe(0);
    });
});
