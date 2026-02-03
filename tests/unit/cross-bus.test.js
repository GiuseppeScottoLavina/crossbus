/**
 * @fileoverview Tests for CrossBus main facade.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { MessageType } from '../../src/common/types.js';

describe('CrossBus', () => {
    let bus;

    afterEach(() => {
        if (bus && !bus.isDestroyed) {
            bus.destroy();
        }
    });

    describe('constructor', () => {
        it('should create bus with auto-generated peerId', () => {
            bus = new CrossBus();
            expect(bus.peerId).toBeDefined();
            expect(typeof bus.peerId).toBe('string');
        });

        it('should use provided peerId', () => {
            bus = new CrossBus({ peerId: 'my-hub' });
            expect(bus.peerId).toBe('my-hub');
        });

        it('should default isHub to false', () => {
            bus = new CrossBus();
            expect(bus.isHub).toBe(false);
        });

        it('should set isHub when specified', () => {
            bus = new CrossBus({ isHub: true });
            expect(bus.isHub).toBe(true);
        });
    });

    describe('addPeer() and removePeer()', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true });
        });

        it('should add peer', () => {
            bus.addPeer('peer-1', mock());
            expect(bus.peerCount).toBe(1);
            expect(bus.peers).toContain('peer-1');
        });

        it('should remove peer', () => {
            bus.addPeer('peer-1', mock());
            const removed = bus.removePeer('peer-1');
            expect(removed).toBe(true);
            expect(bus.peerCount).toBe(0);
        });

        it('should get peer info', () => {
            bus.addPeer('peer-1', mock(), { meta: { type: 'widget' } });

            const peer = bus.getPeer('peer-1');
            expect(peer).toBeDefined();
            expect(peer.meta.type).toBe('widget');
        });
    });

    describe('signal()', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true });
        });

        it('should broadcast signal to all peers', async () => {
            const send1 = mock();
            const send2 = mock();

            bus.addPeer('peer-1', send1);
            bus.addPeer('peer-2', send2);

            const result = await bus.signal('user:login', { userId: 123 });

            expect(result.delivered).toBe(2);
            expect(send1).toHaveBeenCalled();
            expect(send2).toHaveBeenCalled();
        });

        it('should exclude specified peers', async () => {
            const send1 = mock();
            const send2 = mock();

            bus.addPeer('peer-1', send1);
            bus.addPeer('peer-2', send2);

            await bus.signal('event', {}, { exclude: ['peer-1'] });

            expect(send1).not.toHaveBeenCalled();
            expect(send2).toHaveBeenCalled();
        });
    });

    describe('handle() and unhandle()', () => {
        beforeEach(() => {
            bus = new CrossBus();
        });

        it('should register handler', () => {
            bus.handle('getData', () => ({ value: 42 }));
            expect(bus.hasHandler('getData')).toBe(true);
        });

        it('should return unregister function', () => {
            const unhandle = bus.handle('getData', () => ({}));
            expect(bus.hasHandler('getData')).toBe(true);

            unhandle();
            expect(bus.hasHandler('getData')).toBe(false);
        });

        it('should throw for duplicate handler', () => {
            bus.handle('getData', () => ({}));
            expect(() => bus.handle('getData', () => ({}))).toThrow();
        });

        it('should unhandle by name', () => {
            bus.handle('getData', () => ({}));
            const removed = bus.unhandle('getData');
            expect(removed).toBe(true);
            expect(bus.hasHandler('getData')).toBe(false);
        });
    });

    describe('request()', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true });
        });

        it('should throw for unknown peer', async () => {
            await expect(bus.request('unknown', 'getData')).rejects.toThrow();
        });

        it('should send request message to peer', async () => {
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            // Start request but don't await (will timeout)
            const promise = bus.request('peer-1', 'getData', { id: 5 }, { timeout: 50 });

            // Wait for async hook processing
            await new Promise(r => setTimeout(r, 10));

            // Check message was sent - protocol messages are now sent directly
            expect(messages.length).toBe(1);
            expect(messages[0].type).toBe(MessageType.REQUEST);
            expect(messages[0].payload.name).toBe('getData');

            // Let it timeout
            await promise.catch(() => { });
        });
    });

    describe('handleMessage()', () => {
        beforeEach(() => {
            bus = new CrossBus({ allowedOrigins: ['*'] });
        });

        it('should handle signal and emit event', async () => {
            const handler = mock();
            bus.on('user:login', handler);

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'user:login',
                p: { userId: 123 }
            }, 'https://example.com', 'peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(handler).toHaveBeenCalled();
        });

        it('should handle request and invoke handler', async () => {
            bus.handle('getDouble', (payload) => payload.n * 2);

            const responses = [];
            const replyFn = (msg) => responses.push(msg);

            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-123',
                handler: 'getDouble',
                p: { n: 21 }
            }, 'https://example.com', 'peer-1', replyFn);

            expect(responses.length).toBe(1);
            expect(responses[0].payload.success).toBe(true);
            expect(responses[0].payload.data).toBe(42);
        });
    });

    describe('destroy()', () => {
        it('should set isDestroyed to true', () => {
            bus = new CrossBus();
            expect(bus.isDestroyed).toBe(false);

            bus.destroy();
            expect(bus.isDestroyed).toBe(true);
        });

        it('should throw on operations after destroy', () => {
            bus = new CrossBus();
            bus.destroy();

            expect(() => bus.signal('test', {})).toThrow();
        });

        it('should be idempotent', () => {
            bus = new CrossBus();
            bus.destroy();
            bus.destroy(); // Should not throw
            expect(bus.isDestroyed).toBe(true);
        });
    });

    describe('peer events', () => {
        it('should emit peer:connected when peer added', async () => {
            bus = new CrossBus({ isHub: true });
            let eventReceived = false;
            bus.on('peer:connected', () => { eventReceived = true; });

            bus.addPeer('peer-1', mock());

            await new Promise(r => setTimeout(r, 20));
            expect(eventReceived).toBe(true);
        });

        it('should emit peer:disconnected when peer removed', async () => {
            bus = new CrossBus({ isHub: true });
            let eventReceived = false;
            bus.on('peer:disconnected', () => { eventReceived = true; });
            bus.addPeer('peer-1', mock());

            bus.removePeer('peer-1');

            await new Promise(r => setTimeout(r, 20));
            expect(eventReceived).toBe(true);
        });
    });

    describe('hooks', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should register inbound hook and return unregister function', () => {
            const hook = (payload) => payload;
            const unhook = bus.addInboundHook(hook);
            expect(typeof unhook).toBe('function');
        });

        it('should register outbound hook and return unregister function', () => {
            const hook = (payload) => payload;
            const unhook = bus.addOutboundHook(hook);
            expect(typeof unhook).toBe('function');
        });

        it('should throw if hook is not a function', () => {
            expect(() => bus.addInboundHook('not a function')).toThrow(TypeError);
            expect(() => bus.addOutboundHook(123)).toThrow(TypeError);
        });

        it('should remove inbound hook', () => {
            const hook = (payload) => payload;
            bus.addInboundHook(hook);
            const removed = bus.removeInboundHook(hook);
            expect(removed).toBe(true);
        });

        it('should remove outbound hook', () => {
            const hook = (payload) => payload;
            bus.addOutboundHook(hook);
            const removed = bus.removeOutboundHook(hook);
            expect(removed).toBe(true);
        });

        it('should return false when removing non-existent hook', () => {
            const hook = (payload) => payload;
            expect(bus.removeInboundHook(hook)).toBe(false);
            expect(bus.removeOutboundHook(hook)).toBe(false);
        });

        it('should unregister hook via returned function', () => {
            const hook = (payload) => payload;
            const unhook = bus.addInboundHook(hook);
            const result = unhook();
            expect(result).toBe(true);
            // Second removal should fail
            const second = bus.removeInboundHook(hook);
            expect(second).toBe(false);
        });

        it('should transform inbound payload through hook chain', async () => {
            bus.addInboundHook((payload) => ({ ...payload, hook1: true }));
            bus.addInboundHook((payload) => ({ ...payload, hook2: true }));

            let receivedPayload;
            bus.on('test:signal', (e) => { receivedPayload = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test:signal',
                p: { original: true }
            }, 'https://example.com', 'peer-1');

            expect(receivedPayload).toBeDefined();
            expect(receivedPayload.original).toBe(true);
            expect(receivedPayload.hook1).toBe(true);
            expect(receivedPayload.hook2).toBe(true);
        });

        it('should transform outbound payload through hook chain', async () => {
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            bus.addOutboundHook((payload) => ({ ...payload, encrypted: true }));

            await bus.signal('test:signal', { data: 'secret' });

            expect(messages.length).toBe(1);
            // Signal message wrapped by router in envelope
            expect(messages[0].p?.payload?.data?.encrypted || messages[0].payload?.data?.encrypted).toBe(true);
        });

        it('should execute hooks in priority order', async () => {
            const order = [];
            bus.addInboundHook((p) => { order.push('high'); return p; }, 1);
            bus.addInboundHook((p) => { order.push('low'); return p; }, 20);
            bus.addInboundHook((p) => { order.push('mid'); return p; }, 10);

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, 'https://example.com', 'peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(order).toEqual(['high', 'mid', 'low']);
        });

        it('should support async hooks', async () => {
            bus.addInboundHook(async (payload) => {
                await new Promise(r => setTimeout(r, 5));
                return { ...payload, async: true };
            });

            let receivedPayload;
            bus.on('test', (e) => { receivedPayload = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { sync: true }
            }, 'https://example.com', 'peer-1');

            expect(receivedPayload).toBeDefined();
            expect(receivedPayload.sync).toBe(true);
            expect(receivedPayload.async).toBe(true);
        });

        it('should provide context to hooks', async () => {
            let capturedContext;
            bus.addInboundHook((payload, ctx) => {
                capturedContext = ctx;
                return payload;
            });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, 'https://example.com', 'peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(capturedContext.type).toBe('signal');
            expect(capturedContext.direction).toBe('inbound');
            expect(capturedContext.peerId).toBe('peer-1');
        });

        it('should continue on hook error', async () => {
            bus.addInboundHook(() => { throw new Error('Hook failed'); });
            bus.addInboundHook((payload) => ({ ...payload, fallback: true }));

            let receivedPayload;
            bus.on('test', (e) => { receivedPayload = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { original: true }
            }, 'https://example.com', 'peer-1');

            // Should still have processed with second hook
            expect(receivedPayload).toBeDefined();
            expect(receivedPayload.fallback).toBe(true);
        });
    });
});
