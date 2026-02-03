/**
 * @fileoverview Unit tests for error handling scenarios.
 * Tests CrossBus error handling without browser dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';

describe('Error Handling', () => {
    let bus;

    beforeEach(() => {
        bus = new CrossBus({ isHub: true, allowedOrigins: ['*'] });
    });

    afterEach(() => {
        if (bus && !bus.isDestroyed) {
            bus.destroy();
        }
    });

    describe('Request to non-existent peer', () => {
        it('should throw error for non-existent peer', async () => {
            await expect(
                bus.request('non-existent-peer', 'getData', {}, { timeout: 100 })
            ).rejects.toThrow();
        });

        it('should include peer not found in error', async () => {
            try {
                await bus.request('unknown-peer', 'handler', {});
            } catch (e) {
                expect(e.message.toLowerCase()).toContain('peer');
            }
        });
    });

    describe('Request timeout', () => {
        it('should timeout when peer does not respond', async () => {
            // Add peer that never responds
            bus.addPeer('slow-peer', () => {
                // Do nothing - never respond
            });

            const start = Date.now();
            try {
                await bus.request('slow-peer', 'neverResponds', {}, { timeout: 150 });
                throw new Error('Should have thrown');
            } catch (e) {
                const elapsed = Date.now() - start;
                // Allow 30ms tolerance for CI environments (timer may fire slightly early/late)
                expect(elapsed).toBeGreaterThanOrEqual(120);
                expect(elapsed).toBeLessThan(1000);
            }
        });
    });

    describe('Handler errors', () => {
        it('should propagate handler errors to caller', async () => {
            bus.handle('throwingHandler', () => {
                throw new Error('Intentional error');
            });

            // Request to self
            const responses = [];
            await bus.handleMessage({
                t: 'req',
                id: 'test-req-1',
                handler: 'throwingHandler',
                p: {}
            }, '*', bus.peerId, (msg) => responses.push(msg));

            expect(responses.length).toBe(1);
            expect(responses[0].payload.success).toBe(false);
            expect(responses[0].payload.error).toBeDefined();
        });

        it('should include error message in response', async () => {
            bus.handle('failHandler', () => {
                throw new Error('Custom error message');
            });

            const responses = [];
            await bus.handleMessage({
                t: 'req',
                id: 'test-req-2',
                handler: 'failHandler',
                p: {}
            }, '*', bus.peerId, (msg) => responses.push(msg));

            expect(responses[0].payload.error.message).toContain('Custom error message');
        });
    });

    describe('Signal with edge case names', () => {
        it('should handle empty signal name', async () => {
            const result = await bus.signal('', {});
            expect(result).toBeDefined();
            expect(result.delivered).toBe(0); // No peers to deliver to
        });

        it('should handle signal with special characters', async () => {
            const result = await bus.signal('test:with:colons', { data: 1 });
            expect(result).toBeDefined();
        });

        it('should handle signal with unicode characters', async () => {
            const result = await bus.signal('test:日本語', { emoji: '🚌' });
            expect(result).toBeDefined();
        });
    });

    describe('Handler not found', () => {
        it('should return error for unknown handler', async () => {
            const responses = [];
            await bus.handleMessage({
                t: 'req',
                id: 'test-req-3',
                handler: 'nonExistentHandler',
                p: {}
            }, '*', bus.peerId, (msg) => responses.push(msg));

            expect(responses.length).toBe(1);
            expect(responses[0].payload.success).toBe(false);
        });
    });
});
