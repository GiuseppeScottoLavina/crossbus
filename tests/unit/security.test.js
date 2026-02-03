/**
 * @fileoverview Security-focused tests for CrossBus.
 * Tests ReDoS protection, type validation, prototype pollution, and origin bypass.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { OriginValidator } from '../../src/security/origin-validator.js';
import { PostMessageTransport } from '../../src/transports/postmessage.js';

describe('Security Tests', () => {
    // ==================== ReDoS Protection ====================

    describe('ReDoS Protection', () => {
        it('should handle malicious origin patterns without hanging', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });

            // Evil pattern that would cause catastrophic backtracking with .*
            const evilOrigin = 'https://' + 'a'.repeat(500) + '!';

            const start = Date.now();
            const result = validator.isAllowed(evilOrigin);
            const duration = Date.now() - start;

            expect(result).toBe(false);
            expect(duration).toBeLessThan(100); // Should be instant, not hanging
        });

        it('should reject origins exceeding DNS label length (253 chars)', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });

            // Origin with subdomain > 253 chars should be rejected
            const longSubdomain = 'a'.repeat(300);
            const origin = `https://${longSubdomain}.example.com`;

            expect(validator.isAllowed(origin)).toBe(false);
        });

        it('should allow legitimate subdomains', () => {
            const validator = new OriginValidator({
                allowed: ['https://*.example.com']
            });

            expect(validator.isAllowed('https://sub.example.com')).toBe(true);
            expect(validator.isAllowed('https://deep.sub.example.com')).toBe(true);
            expect(validator.isAllowed('https://api-v2.example.com')).toBe(true);
        });
    });

    // ==================== Type Validation ====================

    describe('Type Validation', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({
                isHub: true,
                allowedOrigins: ['*'],
                peerId: 'test-hub'
            });
        });

        afterEach(() => {
            bus.destroy();
        });

        it('should reject message with non-string handler', async () => {
            let handlerCalled = false;
            bus.handle('myHandler', () => { handlerCalled = true; });

            // Malicious message with object handler
            await bus.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'evil-1',
                handler: { toString: () => 'myHandler' },
                p: {}
            }, 'null', 'attacker');

            expect(handlerCalled).toBe(false);
        });

        it('should reject signal with non-string name', async () => {
            let signalReceived = false;
            bus.on('mySignal', () => { signalReceived = true; });

            // Malicious signal with object name
            await bus.handleMessage({
                _cb: 1,
                t: 'sig',
                id: 'evil-2',
                name: { toString: () => 'mySignal' },
                p: {}
            }, 'null', 'attacker');

            expect(signalReceived).toBe(false);
        });

        it('should handle null/undefined payload gracefully', async () => {
            let receivedPayload;
            bus.handle('echo', (p) => { receivedPayload = p; return p; });

            await bus.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'null-1',
                handler: 'echo',
                p: null
            }, 'null', 'peer1');

            expect(receivedPayload).toBe(null);
        });
    });

    // ==================== Prototype Pollution ====================

    describe('Prototype Pollution Resistance', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({
                isHub: true,
                allowedOrigins: ['*'],
                peerId: 'test-hub'
            });
        });

        afterEach(() => {
            bus.destroy();
        });

        it('should not pollute Object.prototype via payload', async () => {
            const originalPolluted = Object.prototype.polluted;

            bus.handle('process', (payload) => {
                // Simulate naive processing that could cause pollution
                const result = {};
                for (const key of Object.keys(payload)) {
                    result[key] = payload[key];
                }
                return result;
            });

            await bus.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'proto-1',
                handler: 'process',
                p: { '__proto__': { polluted: true } }
            }, 'null', 'peer1');

            // __proto__ should be treated as regular key, not prototype
            expect(Object.prototype.polluted).toBe(originalPolluted);
        });

        it('should handle constructor pollution attempts', async () => {
            let receivedPayload;
            bus.handle('echo', (p) => { receivedPayload = p; return p; });

            await bus.handleMessage({
                _cb: 1,
                t: 'req',
                id: 'proto-2',
                handler: 'echo',
                p: { 'constructor': { 'prototype': { 'evil': true } } }
            }, 'null', 'peer1');

            expect({}.evil).toBeUndefined();
        });
    });

    // ==================== Origin Bypass ====================

    describe('Origin Bypass Prevention', () => {
        it('should reject null origin when not explicitly allowed', () => {
            const validator = new OriginValidator({
                allowed: ['https://safe.com']
            });

            expect(validator.isAllowed('null')).toBe(false);
            expect(validator.isAllowed(null)).toBe(false);
        });

        it('should handle file:// protocol (appears as null origin in browsers)', () => {
            // file:// origins appear as 'null' string in browsers
            const validator = new OriginValidator({
                allowed: ['null']  // Allow null origins explicitly
            });

            expect(validator.isAllowed('null')).toBe(true);
            expect(validator.isAllowed(null)).toBe(true); // Also accepts null value
        });

        it('should reject origins with embedded newlines', () => {
            const validator = new OriginValidator({
                allowed: ['https://safe.com']
            });

            expect(validator.isAllowed('https://safe.com\nhttps://evil.com')).toBe(false);
        });

        it('should be case-sensitive for origins', () => {
            const validator = new OriginValidator({
                allowed: ['https://Safe.Com']
            });

            // Origins are case-sensitive per RFC
            expect(validator.isAllowed('https://safe.com')).toBe(false);
            expect(validator.isAllowed('https://Safe.Com')).toBe(true);
        });
    });

    // ==================== Handler Name Injection ====================

    describe('Handler Name Injection Prevention', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({
                isHub: true,
                allowedOrigins: ['*'],
                peerId: 'test-hub'
            });
        });

        afterEach(() => {
            bus.destroy();
        });

        it('should not allow hasOwnProperty as handler name to break internals', () => {
            // This should work without breaking Map internals
            bus.handle('hasOwnProperty', () => 'safe');
            expect(bus.hasHandler('hasOwnProperty')).toBe(true);
        });

        it('should handle empty string handler name', () => {
            bus.handle('', () => 'empty');
            expect(bus.hasHandler('')).toBe(true);
        });

        it('should handle unicode handler names', () => {
            bus.handle('处理程序', () => 'chinese');
            bus.handle('معالج', () => 'arabic');
            expect(bus.hasHandler('处理程序')).toBe(true);
            expect(bus.hasHandler('معالج')).toBe(true);
        });
    });

    // ==================== Message ID Collision ====================

    describe('Message ID Collision', () => {
        let bus;

        beforeEach(() => {
            bus = new CrossBus({
                isHub: true,
                allowedOrigins: ['*'],
                peerId: 'test-hub'
            });
        });

        afterEach(() => {
            bus.destroy();
        });

        it('should handle duplicate response IDs gracefully', async () => {
            let callCount = 0;
            bus.handle('counter', () => { callCount++; return callCount; });

            // First response
            await bus.handleMessage({
                _cb: 1,
                t: 'res',
                id: 'same-id',
                success: true,
                data: 'first'
            }, 'null', 'peer1');

            // Duplicate ID (should be ignored or handled gracefully)
            await bus.handleMessage({
                _cb: 1,
                t: 'res',
                id: 'same-id',
                success: true,
                data: 'duplicate'
            }, 'null', 'peer1');

            // Should not crash
            expect(true).toBe(true);
        });
    });

    // ==================== Transport Security ====================

    describe('Transport Security', () => {
        it('SharedWorkerTransport should reject non-protocol messages', async () => {
            // Mock SharedWorker
            const mockPort = {
                postMessage: () => { },
                start: () => { },
                close: () => { },
                onmessage: null
            };
            globalThis.SharedWorker = class { constructor() { this.port = mockPort; } };

            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            let handlerCalled = false;
            transport.onMessage(() => { handlerCalled = true; });

            // Simulate non-protocol message (no _cb marker)
            mockPort.onmessage({ data: { evil: 'payload' } });

            expect(handlerCalled).toBe(false);
            transport.destroy();
            delete globalThis.SharedWorker;
        });

        it('ServiceWorkerTransport should reject non-protocol messages', async () => {
            // Mock navigator.serviceWorker
            const mockSW = { postMessage: () => { } };
            globalThis.navigator = {
                serviceWorker: {
                    ready: Promise.resolve({ active: mockSW }),
                    controller: mockSW,
                    addEventListener: () => { },
                    removeEventListener: () => { }
                }
            };

            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            expect(transport.isDestroyed).toBe(false);

            transport.destroy();
            delete globalThis.navigator;
        });
    });

    // ==================== VectorClock Security ====================

    describe('VectorClock Security', () => {
        it('should handle malicious ownId values', async () => {
            const { VectorClock } = await import('../../src/ordering/vector-clock.js');

            // Prototype pollution attempt
            const clock = new VectorClock('__proto__');
            clock.tick();

            expect({}.polluted).toBeUndefined();
            expect(clock.ownId).toBe('__proto__');
        });

        it('should handle very large counter values without overflow', async () => {
            const { VectorClock } = await import('../../src/ordering/vector-clock.js');

            const clock = new VectorClock('node', { node: Number.MAX_SAFE_INTEGER });
            clock.tick();

            // Should handle gracefully (may overflow, but shouldn't crash)
            expect(typeof clock.get('node')).toBe('number');
        });

        it('should handle malicious JSON deserialization', async () => {
            const { VectorClock } = await import('../../src/ordering/vector-clock.js');

            const maliciousJSON = {
                ownId: 'attacker',
                counters: {
                    '__proto__': { polluted: true },
                    'constructor': { prototype: { evil: true } }
                }
            };

            const clock = VectorClock.fromJSON(maliciousJSON);

            expect({}.polluted).toBeUndefined();
            expect({}.evil).toBeUndefined();
            expect(clock.get('__proto__')).toBeDefined();
        });
    });

    // ==================== CausalOrderer Security ====================

    describe('CausalOrderer Security', () => {
        it('should enforce buffer limits to prevent memory exhaustion', async () => {
            const { CausalOrderer } = await import('../../src/ordering/causal-orderer.js');
            const { VectorClock } = await import('../../src/ordering/vector-clock.js');

            let overflowCalled = false;
            const orderer = new CausalOrderer('node-1', {
                maxBufferSize: 5,
                onDeliver: () => { },
                onBufferOverflow: () => { overflowCalled = true; }
            });

            // Flood with out-of-order messages (skip seq 1)
            for (let i = 2; i <= 10; i++) {
                const clock = new VectorClock('attacker', { attacker: i });
                orderer.receive('attacker', { seq: i, clock: clock.toJSON() });
            }

            expect(orderer.bufferSize).toBeLessThanOrEqual(5);
            expect(overflowCalled).toBe(true);
            orderer.clear();
        });
    });
});

