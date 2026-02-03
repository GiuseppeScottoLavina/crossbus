/**
 * @fileoverview Tests for EventEmitter.
 * Following TDD: tests written FIRST.
 */

import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { EventEmitter } from '../../src/core/event-emitter.js';

describe('EventEmitter', () => {
    let emitter;

    beforeEach(() => {
        emitter = new EventEmitter();
    });

    afterEach(() => {
        emitter.clear();
    });

    // ═══════════════════════════════════════════════════════════
    // on() tests
    // ═══════════════════════════════════════════════════════════

    describe('on()', () => {
        it('should register a listener and return subscription', () => {
            const handler = mock();
            const sub = emitter.on('test', handler);

            expect(sub).toBeDefined();
            expect(sub.id).toMatch(/^sub_\d+$/);
            expect(sub.signalName).toBe('test');
            expect(sub.active).toBe(true);
            expect(typeof sub.unsubscribe).toBe('function');
        });

        it('should throw TypeError for non-string name', () => {
            expect(() => emitter.on(123, mock())).toThrow(TypeError);
            expect(() => emitter.on(null, mock())).toThrow(TypeError);
        });

        it('should throw TypeError for non-function handler', () => {
            expect(() => emitter.on('test', 'not a function')).toThrow(TypeError);
            expect(() => emitter.on('test', null)).toThrow(TypeError);
        });

        it('should support multiple listeners for same signal', () => {
            const handler1 = mock();
            const handler2 = mock();

            emitter.on('test', handler1);
            emitter.on('test', handler2);

            expect(emitter.listenerCount('test')).toBe(2);
        });

        it('should respect priority ordering', async () => {
            const order = [];
            emitter.on('test', () => order.push('low'), { priority: 1 });
            emitter.on('test', () => order.push('high'), { priority: 10 });
            emitter.on('test', () => order.push('medium'), { priority: 5 });

            await emitter.emit('test', {});

            expect(order).toEqual(['high', 'medium', 'low']);
        });

        it('should support once option', async () => {
            const handler = mock();
            emitter.on('test', handler, { once: true });

            await emitter.emit('test', { a: 1 });
            await emitter.emit('test', { a: 2 });

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should support AbortSignal', () => {
            const controller = new AbortController();
            const handler = mock();

            emitter.on('test', handler, { signal: controller.signal });
            expect(emitter.listenerCount('test')).toBe(1);

            controller.abort();
            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should immediately remove if AbortSignal already aborted', () => {
            const controller = new AbortController();
            controller.abort();

            const handler = mock();
            const sub = emitter.on('test', handler, { signal: controller.signal });

            expect(sub.active).toBe(false);
            expect(emitter.listenerCount('test')).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // once() tests
    // ═══════════════════════════════════════════════════════════

    describe('once()', () => {
        it('should auto-remove after first invocation', async () => {
            const handler = mock();
            emitter.once('test', handler);

            await emitter.emit('test', { a: 1 });
            await emitter.emit('test', { a: 2 });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(emitter.listenerCount('test')).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // off() tests
    // ═══════════════════════════════════════════════════════════

    describe('off()', () => {
        it('should remove specific handler', () => {
            const handler1 = mock();
            const handler2 = mock();

            emitter.on('test', handler1);
            emitter.on('test', handler2);

            const result = emitter.off('test', handler1);

            expect(result.success).toBe(true);
            expect(result.removedCount).toBe(1);
            expect(result.remainingCount).toBe(1);
        });

        it('should remove all listeners when no handler specified', () => {
            emitter.on('test', mock());
            emitter.on('test', mock());

            const result = emitter.off('test');

            expect(result.success).toBe(true);
            expect(result.removedCount).toBe(2);
            expect(result.remainingCount).toBe(0);
        });

        it('should return success=false for non-existent signal', () => {
            const result = emitter.off('nonexistent');

            expect(result.success).toBe(false);
            expect(result.removedCount).toBe(0);
        });

        it('should throw TypeError for non-string name', () => {
            expect(() => emitter.off(123)).toThrow(TypeError);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // emit() tests
    // ═══════════════════════════════════════════════════════════

    describe('emit()', () => {
        it('should invoke handler with event object', async () => {
            const handler = mock();
            emitter.on('test', handler);

            await emitter.emit('test', { value: 42 });

            expect(handler).toHaveBeenCalledTimes(1);
            const event = handler.mock.calls[0][0];
            expect(event.name).toBe('test');
            expect(event.data).toEqual({ value: 42 });
            expect(event.messageId).toBeDefined();
            expect(event.timestamp).toBeDefined();
            expect(event.source.peerId).toBe('self');
            expect(event.source.type).toBe('local');
        });

        it('should return count of invoked listeners', async () => {
            emitter.on('test', mock());
            emitter.on('test', mock());
            emitter.on('other', mock());

            const count = await emitter.emit('test', {});

            expect(count).toBe(2);
        });

        it('should throw TypeError for non-string name', async () => {
            await expect(emitter.emit(123, {})).rejects.toThrow(TypeError);
        });

        it('should not throw if handler errors (logs instead)', async () => {
            let errorThrown = false;
            const errorHandler = () => {
                errorThrown = true;
                throw new Error('Handler error');
            };
            let goodCalled = false;
            const goodHandler = () => {
                goodCalled = true;
            };

            // Use sync mode to ensure proper error catching
            emitter.on('test', errorHandler, { mode: 'sync' });
            emitter.on('test', goodHandler, { mode: 'sync' });

            // Should not throw - errors are caught
            const consoleSpy = spyOn(console, 'error');
            await emitter.emit('test', {});

            // Both handlers should be called (error doesn't stop execution)
            expect(errorThrown).toBe(true);
            expect(goodCalled).toBe(true);
            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // Wildcard tests
    // ═══════════════════════════════════════════════════════════

    describe('Wildcards', () => {
        it('should match global wildcard *', async () => {
            const handler = mock();
            emitter.on('*', handler);

            await emitter.emit('test', {});
            await emitter.emit('user:login', {});
            await emitter.emit('anything', {});

            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should match namespace wildcard user:*', async () => {
            const handler = mock();
            emitter.on('user:*', handler);

            await emitter.emit('user:login', {});
            await emitter.emit('user:logout', {});
            await emitter.emit('system:start', {}); // Should NOT match

            expect(handler).toHaveBeenCalledTimes(2);
        });

        it('should pass correct event name in wildcard handlers', async () => {
            const handler = mock();
            emitter.on('user:*', handler);

            await emitter.emit('user:login', { userId: 1 });

            expect(handler.mock.calls[0][0].name).toBe('user:login');
        });
    });

    // ═══════════════════════════════════════════════════════════
    // Utility methods tests
    // ═══════════════════════════════════════════════════════════

    describe('Utility methods', () => {
        it('hasListeners should return true if listeners exist', () => {
            expect(emitter.hasListeners('test')).toBe(false);

            emitter.on('test', mock());
            expect(emitter.hasListeners('test')).toBe(true);
        });

        it('listenerCount should return correct count', () => {
            expect(emitter.listenerCount('test')).toBe(0);

            emitter.on('test', mock());
            emitter.on('test', mock());
            expect(emitter.listenerCount('test')).toBe(2);
        });

        it('getSignalNames should return all registered signals', () => {
            emitter.on('a', mock());
            emitter.on('b', mock());
            emitter.on('c', mock());

            const names = emitter.getSignalNames();
            expect(names).toContain('a');
            expect(names).toContain('b');
            expect(names).toContain('c');
            expect(names.length).toBe(3);
        });

        it('clear should remove all listeners', () => {
            emitter.on('a', mock());
            emitter.on('b', mock());

            emitter.clear();

            expect(emitter.getSignalNames()).toEqual([]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // Subscription tests
    // ═══════════════════════════════════════════════════════════

    describe('Subscription', () => {
        it('unsubscribe should remove the listener', () => {
            const handler = mock();
            const sub = emitter.on('test', handler);

            expect(emitter.listenerCount('test')).toBe(1);

            sub.unsubscribe();

            expect(sub.active).toBe(false);
            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('unsubscribe should be idempotent', () => {
            const sub = emitter.on('test', mock());

            sub.unsubscribe();
            sub.unsubscribe(); // Second call should not error

            expect(sub.active).toBe(false);
        });
    });
});
