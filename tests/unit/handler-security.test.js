/**
 * @fileoverview Tests for secure-by-default handler security features.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { ErrorCode } from '../../src/common/errors.js';
import { MessageType } from '../../src/common/types.js';

describe('Handler Security Features', () => {
    let bus;

    beforeEach(() => {
        bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
    });

    afterEach(() => {
        bus?.destroy();
    });

    describe('allowedPeers', () => {
        it('should allow requests from allowed peers', async () => {
            bus.handle('secure', () => 'secret', {
                allowedPeers: ['trusted-agent']
            });

            // Simulate request from allowed peer
            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'secure',
                p: {}
            }, '*', 'trusted-agent', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(true);
            expect(responses[0].payload.data).toBe('secret');
        });

        it('should reject requests from unauthorized peers', async () => {
            bus.handle('secure', () => 'secret', {
                allowedPeers: ['trusted-agent']
            });

            // Simulate request from unauthorized peer
            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'secure',
                p: {}
            }, '*', 'evil-agent', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error.code).toBe(ErrorCode.UNAUTHORIZED);
        });

        it('should allow multiple peers in allowedPeers list', async () => {
            bus.handle('multi', () => 'ok', {
                allowedPeers: ['agent-1', 'agent-2', 'agent-3']
            });

            for (const peer of ['agent-1', 'agent-2', 'agent-3']) {
                const responses = [];
                await bus.handleMessage({
                    t: MessageType.REQUEST,
                    id: `req-${peer}`,
                    handler: 'multi',
                    p: {}
                }, '*', peer, (msg) => responses.push(msg));
                expect(responses[0].payload.success).toBe(true);
            }
        });
    });

    describe('rateLimit', () => {
        it('should allow requests within rate limit', async () => {
            bus.handle('limited', () => 'ok', {
                rateLimit: 5  // 5 calls per second
            });

            // Make 5 requests (should all succeed)
            for (let i = 0; i < 5; i++) {
                const responses = [];
                await bus.handleMessage({
                    t: MessageType.REQUEST,
                    id: `req-${i}`,
                    handler: 'limited',
                    p: {}
                }, '*', 'peer-1', (msg) => responses.push(msg));
                expect(responses[0].payload.success).toBe(true);
            }
        });

        it('should reject requests exceeding rate limit', async () => {
            bus.handle('limited', () => 'ok', {
                rateLimit: 2  // Only 2 calls per second
            });

            // Make 3 requests (3rd should fail)
            const results = [];
            for (let i = 0; i < 3; i++) {
                const responses = [];
                await bus.handleMessage({
                    t: MessageType.REQUEST,
                    id: `req-${i}`,
                    handler: 'limited',
                    p: {}
                }, '*', 'peer-1', (msg) => responses.push(msg));
                results.push(responses[0]);
            }

            expect(results[0].payload.success).toBe(true);
            expect(results[1].payload.success).toBe(true);
            expect(results[2].payload.success).toBe(false);
            expect(results[2].payload.error.code).toBe(ErrorCode.RATE_LIMITED);
        });

        it('should track rate limits per peer', async () => {
            bus.handle('perPeer', () => 'ok', {
                rateLimit: 1
            });

            // Peer 1 first request - should succeed
            const res1 = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'perPeer',
                p: {}
            }, '*', 'peer-1', (msg) => res1.push(msg));
            expect(res1[0].payload.success).toBe(true);

            // Peer 1 second request - should fail (rate limited)
            const res2 = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-2',
                handler: 'perPeer',
                p: {}
            }, '*', 'peer-1', (msg) => res2.push(msg));
            expect(res2[0].payload.success).toBe(false);

            // Peer 2 first request - should succeed (different peer)
            const res3 = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-3',
                handler: 'perPeer',
                p: {}
            }, '*', 'peer-2', (msg) => res3.push(msg));
            expect(res3[0].payload.success).toBe(true);
        });
    });

    describe('validatePayload', () => {
        it('should accept valid payloads', async () => {
            bus.handle('validated', (data) => data.name, {
                validatePayload: (payload) => payload && typeof payload.name === 'string'
            });

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'validated',
                p: { name: 'John' }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(true);
            expect(responses[0].payload.data).toBe('John');
        });

        it('should reject invalid payloads', async () => {
            bus.handle('validated', (data) => data.name, {
                validatePayload: (payload) => payload && typeof payload.name === 'string'
            });

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'validated',
                p: { badField: 123 }
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error.code).toBe(ErrorCode.INVALID_PAYLOAD);
        });

        it('should handle validator exceptions gracefully', async () => {
            bus.handle('throwing', () => 'ok', {
                validatePayload: () => { throw new Error('Validator crashed'); }
            });

            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'throwing',
                p: {}
            }, '*', 'peer-1', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error.code).toBe(ErrorCode.INVALID_PAYLOAD);
        });
    });

    describe('Combined Security Options', () => {
        it('should enforce all security options together', async () => {
            bus.handle('superSecure', (data) => `Hello ${data.name}`, {
                allowedPeers: ['trusted'],
                rateLimit: 10,
                validatePayload: (p) => p && typeof p.name === 'string'
            });

            // Trusted peer with valid payload - should succeed
            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'superSecure',
                p: { name: 'Alice' }
            }, '*', 'trusted', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(true);
            expect(responses[0].payload.data).toBe('Hello Alice');
        });

        it('should check authorization before rate limit', async () => {
            bus.handle('authFirst', () => 'ok', {
                allowedPeers: ['trusted'],
                rateLimit: 1
            });

            // Unauthorized peer - should fail with UNAUTHORIZED, not RATE_LIMITED
            const responses = [];
            await bus.handleMessage({
                t: MessageType.REQUEST,
                id: 'req-1',
                handler: 'authFirst',
                p: {}
            }, '*', 'evil', (msg) => responses.push(msg));

            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error.code).toBe(ErrorCode.UNAUTHORIZED);
        });
    });

    describe('Handler Cleanup', () => {
        it('should remove handler options when handler is removed', () => {
            const unhandle = bus.handle('temp', () => 'ok', {
                allowedPeers: ['peer']
            });

            expect(bus.hasHandler('temp')).toBe(true);

            unhandle();

            expect(bus.hasHandler('temp')).toBe(false);
        });
    });
});

describe('CrossBus Security Properties', () => {
    describe('maxPayloadSize', () => {
        it('should expose maxPayloadSize with default value', () => {
            const bus = new CrossBus();
            expect(bus.maxPayloadSize).toBe(1024 * 1024); // 1MB
            bus.destroy();
        });

        it('should allow custom maxPayloadSize', () => {
            const bus = new CrossBus({ maxPayloadSize: 1024 });
            expect(bus.maxPayloadSize).toBe(1024);
            bus.destroy();
        });
    });

    describe('strictMode', () => {
        it('should expose strictMode property', () => {
            const bus = new CrossBus({ strictMode: true });
            expect(bus.strictMode).toBe(true);
            bus.destroy();
        });

        it('should default strictMode to false', () => {
            const bus = new CrossBus();
            expect(bus.strictMode).toBe(false);
            bus.destroy();
        });
    });
});
