/**
 * @fileoverview Comprehensive tests for CrossBus hooks API.
 * Tests inbound/outbound hooks for encryption, compression, logging use cases.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { MessageType } from '../../src/common/types.js';

describe('CrossBus Hooks', () => {
    let bus;

    afterEach(() => {
        if (bus && !bus.isDestroyed) {
            bus.destroy();
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // Hook Registration
    // ─────────────────────────────────────────────────────────────────

    describe('Hook Registration', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should accept function hooks', () => {
            expect(() => bus.addInboundHook((p) => p)).not.toThrow();
            expect(() => bus.addOutboundHook((p) => p)).not.toThrow();
        });

        it('should reject non-function hooks', () => {
            expect(() => bus.addInboundHook(null)).toThrow(TypeError);
            expect(() => bus.addInboundHook(undefined)).toThrow(TypeError);
            expect(() => bus.addInboundHook('string')).toThrow(TypeError);
            expect(() => bus.addInboundHook(123)).toThrow(TypeError);
            expect(() => bus.addInboundHook({})).toThrow(TypeError);

            expect(() => bus.addOutboundHook(null)).toThrow(TypeError);
            expect(() => bus.addOutboundHook([])).toThrow(TypeError);
        });

        it('should return unsubscribe function', () => {
            const unsub = bus.addInboundHook((p) => p);
            expect(typeof unsub).toBe('function');
            expect(unsub()).toBe(true);
            expect(unsub()).toBe(false); // Already removed
        });

        it('should allow multiple hooks of same function', () => {
            const hook = (p) => p;
            bus.addInboundHook(hook);
            bus.addInboundHook(hook); // Duplicates are allowed

            // Both should be removable
            expect(bus.removeInboundHook(hook)).toBe(true);
            expect(bus.removeInboundHook(hook)).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Priority Ordering
    // ─────────────────────────────────────────────────────────────────

    describe('Priority Ordering', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should execute hooks in ascending priority order', async () => {
            const order = [];

            bus.addInboundHook((p) => { order.push('C'); return p; }, 30);
            bus.addInboundHook((p) => { order.push('A'); return p; }, 10);
            bus.addInboundHook((p) => { order.push('B'); return p; }, 20);

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(order).toEqual(['A', 'B', 'C']);
        });

        it('should use default priority of 10', async () => {
            const order = [];

            bus.addInboundHook((p) => { order.push('high'); return p; }, 5);
            bus.addInboundHook((p) => { order.push('default'); return p; }); // priority 10
            bus.addInboundHook((p) => { order.push('low'); return p; }, 15);

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(order).toEqual(['high', 'default', 'low']);
        });

        it('should maintain insertion order for same priority', async () => {
            const order = [];

            bus.addInboundHook((p) => { order.push('first'); return p; }, 10);
            bus.addInboundHook((p) => { order.push('second'); return p; }, 10);
            bus.addInboundHook((p) => { order.push('third'); return p; }, 10);

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(order).toEqual(['first', 'second', 'third']);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Inbound Hook Transformation
    // ─────────────────────────────────────────────────────────────────

    describe('Inbound Hook Transformation', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should transform signal payload', async () => {
            bus.addInboundHook((payload) => ({
                ...payload,
                transformed: true,
                timestamp: 12345
            }));

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { original: 'data' }
            }, '*', 'peer-1');

            expect(received.original).toBe('data');
            expect(received.transformed).toBe(true);
            expect(received.timestamp).toBe(12345);
        });

        it('should transform request payload', async () => {
            bus.addInboundHook((payload) => ({
                ...payload,
                hookApplied: true
            }));

            let receivedPayload;
            bus.handle('testHandler', (payload) => {
                receivedPayload = payload;
                return { success: true };
            });

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'testHandler',
                p: { requestData: 'test' }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(receivedPayload.requestData).toBe('test');
            expect(receivedPayload.hookApplied).toBe(true);
        });

        it('should chain multiple transformations', async () => {
            bus.addInboundHook((p) => ({ ...p, step1: true }));
            bus.addInboundHook((p) => ({ ...p, step2: true }));
            bus.addInboundHook((p) => ({ ...p, step3: true }));

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { original: true }
            }, '*', 'peer-1');

            expect(received).toEqual({
                original: true,
                step1: true,
                step2: true,
                step3: true
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Outbound Hook Transformation
    // ─────────────────────────────────────────────────────────────────

    describe('Outbound Hook Transformation', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should transform signal payload before sending', async () => {
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            bus.addOutboundHook((payload) => ({
                ...payload,
                encrypted: true,
                signature: 'abc123'
            }));

            await bus.signal('test', { secret: 'data' });

            expect(messages.length).toBe(1);
            const sentPayload = messages[0].p.payload.data;
            expect(sentPayload.secret).toBe('data');
            expect(sentPayload.encrypted).toBe(true);
            expect(sentPayload.signature).toBe('abc123');
        });

        it('should transform request payload before sending', async () => {
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            bus.addOutboundHook((payload, ctx) => {
                if (ctx.type === 'request') {
                    return { ...payload, requestHooked: true };
                }
                return payload;
            });

            // Start request (will timeout, but we just check the sent message)
            const promise = bus.request('peer-1', 'handler', { data: 'test' }, { timeout: 20 });

            // Wait for async processing
            await new Promise(r => setTimeout(r, 10));

            expect(messages.length).toBe(1);
            // Request messages are now sent directly as protocol messages
            expect(messages[0].payload.data.data).toBe('test');
            expect(messages[0].payload.data.requestHooked).toBe(true);

            await promise.catch(() => { }); // Ignore timeout
        });

        it('should transform response payload', async () => {
            const responses = [];

            bus.addOutboundHook((payload, ctx) => {
                if (ctx.type === 'response') {
                    return { ...payload, responseHooked: true };
                }
                return payload;
            });

            bus.handle('getData', () => ({ result: 42 }));

            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'getData',
                p: {}
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses.length).toBe(1);
            // Response messages use payload structure
            expect(responses[0].payload.data.result).toBe(42);
            expect(responses[0].payload.data.responseHooked).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Hook Context
    // ─────────────────────────────────────────────────────────────────

    describe('Hook Context', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should provide type=signal for signals', async () => {
            let ctx;
            bus.addInboundHook((p, c) => { ctx = c; return p; });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(ctx.type).toBe('signal');
            expect(ctx.direction).toBe('inbound');
            expect(ctx.peerId).toBe('peer-1');
        });

        it('should provide type=request for requests', async () => {
            let ctx;
            bus.addInboundHook((p, c) => { ctx = c; return p; });
            bus.handle('myHandler', () => ({}));

            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'myHandler',
                p: {}
            }, '*', 'peer-1', () => { });

            expect(ctx.type).toBe('request');
            expect(ctx.direction).toBe('inbound');
            expect(ctx.handlerName).toBe('myHandler');
        });

        it('should provide direction=outbound for outgoing', async () => {
            let ctx;
            bus.addPeer('peer-1', () => { });
            bus.addOutboundHook((p, c) => { ctx = c; return p; });

            await bus.signal('test', {});

            expect(ctx.direction).toBe('outbound');
            expect(ctx.type).toBe('signal');
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Async Hooks
    // ─────────────────────────────────────────────────────────────────

    describe('Async Hooks', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should await async inbound hooks', async () => {
            bus.addInboundHook(async (payload) => {
                await new Promise(r => setTimeout(r, 10));
                return { ...payload, asyncProcessed: true };
            });

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { data: 'test' }
            }, '*', 'peer-1');

            expect(received.asyncProcessed).toBe(true);
        });

        it('should await async outbound hooks', async () => {
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            bus.addOutboundHook(async (payload) => {
                await new Promise(r => setTimeout(r, 10));
                return { ...payload, asyncEncrypted: true };
            });

            await bus.signal('test', { data: 'secret' });

            expect(messages[0].p.payload.data.asyncEncrypted).toBe(true);
        });

        it('should chain async and sync hooks', async () => {
            const order = [];

            bus.addInboundHook((p) => { order.push('sync1'); return p; });
            bus.addInboundHook(async (p) => {
                await new Promise(r => setTimeout(r, 5));
                order.push('async');
                return p;
            });
            bus.addInboundHook((p) => { order.push('sync2'); return p; });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(order).toEqual(['sync1', 'async', 'sync2']);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Error Handling
    // ─────────────────────────────────────────────────────────────────

    describe('Error Handling', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should continue processing after hook error', async () => {
            bus.addInboundHook(() => { throw new Error('Hook 1 failed'); });
            bus.addInboundHook((p) => ({ ...p, secondHookRan: true }));

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { original: true }
            }, '*', 'peer-1');

            expect(received.secondHookRan).toBe(true);
        });

        it('should continue with unmodified payload on error', async () => {
            bus.addInboundHook(() => { throw new Error('Failed'); });

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { keep: 'this' }
            }, '*', 'peer-1');

            expect(received.keep).toBe('this');
        });

        it('should handle async hook rejection', async () => {
            bus.addInboundHook(async () => {
                throw new Error('Async rejection');
            });
            bus.addInboundHook((p) => ({ ...p, recovered: true }));

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: {}
            }, '*', 'peer-1');

            expect(received.recovered).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Real-World Use Cases
    // ─────────────────────────────────────────────────────────────────

    describe('Use Case: Encryption/Decryption', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should encrypt outbound and decrypt inbound', async () => {
            // Simple XOR "encryption" for testing
            const key = 42;
            const encrypt = (str) => str.split('').map(c =>
                String.fromCharCode(c.charCodeAt(0) ^ key)
            ).join('');
            const decrypt = encrypt; // XOR is symmetric

            bus.addOutboundHook((payload) => ({
                encrypted: true,
                data: encrypt(JSON.stringify(payload))
            }));

            bus.addInboundHook((payload) => {
                if (payload.encrypted) {
                    return JSON.parse(decrypt(payload.data));
                }
                return payload;
            });

            // Test outbound
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));
            await bus.signal('test', { secret: 'password123' });

            const sent = messages[0].p.payload.data;
            expect(sent.encrypted).toBe(true);
            expect(sent.data).not.toContain('password123');

            // Test inbound
            let received;
            bus.on('decrypted', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'decrypted',
                p: {
                    encrypted: true,
                    data: encrypt(JSON.stringify({ secret: 'password123' }))
                }
            }, '*', 'peer-1');

            expect(received.secret).toBe('password123');
        });
    });

    describe('Use Case: Compression', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should compress large payloads', async () => {
            // Simulated compression (just adds flag)
            bus.addOutboundHook((payload) => {
                const data = JSON.stringify(payload);
                if (data.length > 100) {
                    return { compressed: true, size: data.length, data };
                }
                return payload;
            });

            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));

            // Small payload - no compression
            await bus.signal('small', { x: 1 });
            expect(messages[0].p.payload.data.compressed).toBeUndefined();

            // Large payload - compressed
            await bus.signal('large', { data: 'x'.repeat(200) });
            expect(messages[1].p.payload.data.compressed).toBe(true);
        });
    });

    describe('Use Case: Logging', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should log all messages without modifying them', async () => {
            const logs = [];

            bus.addInboundHook((payload, ctx) => {
                logs.push({ direction: 'in', type: ctx.type, payload });
                return payload; // Unchanged
            });

            bus.addOutboundHook((payload, ctx) => {
                logs.push({ direction: 'out', type: ctx.type, payload });
                return payload; // Unchanged
            });

            // Outbound
            const messages = [];
            bus.addPeer('peer-1', (msg) => messages.push(msg));
            await bus.signal('test', { data: 1 });

            // Inbound
            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { data: 2 }
            }, '*', 'peer-1');

            expect(logs.length).toBe(2);
            expect(logs[0].direction).toBe('out');
            expect(logs[0].payload.data).toBe(1);
            expect(logs[1].direction).toBe('in');
            expect(logs[1].payload.data).toBe(2);
        });
    });

    describe('Use Case: Validation', () => {
        beforeEach(() => {
            bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
        });

        it('should validate and sanitize inbound payloads', async () => {
            bus.addInboundHook((payload) => {
                // Remove dangerous props
                const sanitized = { ...payload };
                delete sanitized.dangerous;
                delete sanitized.secret;

                // Validate required fields
                if (!sanitized.id) {
                    sanitized.id = 'auto-' + Date.now();
                }

                return sanitized;
            });

            let received;
            bus.on('test', (e) => { received = e.data.payload; }, { mode: 'sync' });

            await bus.handleMessage({
                t: MessageType.SIGNAL,
                name: 'test',
                p: { data: 'test', dangerous: 'evil', secret: 'password' }
            }, '*', 'peer-1');

            expect(received.data).toBe('test');
            expect(received.id).toMatch(/^auto-/);
            expect(received.dangerous).toBeUndefined();
            expect(received.secret).toBeUndefined();
        });
    });
});
