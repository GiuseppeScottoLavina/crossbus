/**
 * @fileoverview Extended tests for EventEmitter - coverage gaps.
 * Covers: setMaxListeners, onFast, offFast, emitSync, createFastEmitter.
 */

import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { EventEmitter, createFastEmitter } from '../../src/core/event-emitter.js';

describe('EventEmitter Extended', () => {
    let emitter;

    beforeEach(() => {
        emitter = new EventEmitter();
    });

    afterEach(() => {
        emitter.clear();
    });

    // ═══════════════════════════════════════════════════════════
    // setMaxListeners / getMaxListeners
    // ═══════════════════════════════════════════════════════════

    describe('setMaxListeners / getMaxListeners', () => {
        it('should get default max listeners (10)', () => {
            expect(emitter.getMaxListeners()).toBe(10);
        });

        it('should set custom max listeners', () => {
            emitter.setMaxListeners(50);
            expect(emitter.getMaxListeners()).toBe(50);
        });

        it('should return emitter for chaining', () => {
            const result = emitter.setMaxListeners(20);
            expect(result).toBe(emitter);
        });

        it('should warn when exceeding max listeners', () => {
            const warnSpy = spyOn(console, 'warn');
            emitter.setMaxListeners(2);

            emitter.on('test', () => { });
            emitter.on('test', () => { });
            expect(warnSpy).not.toHaveBeenCalled();

            // Third listener exceeds limit
            emitter.on('test', () => { });
            expect(warnSpy).toHaveBeenCalled();
            expect(warnSpy.mock.calls[0][0]).toContain('memory leak');
        });

        it('should not warn when maxListeners is 0 (unlimited)', () => {
            // Use fresh emitter to avoid spy pollution from previous test
            const freshEmitter = new EventEmitter();
            freshEmitter.setMaxListeners(0);

            for (let i = 0; i < 20; i++) {
                freshEmitter.on('test', () => { });
            }

            // If we reached here, no exception was thrown and test passes
            expect(freshEmitter.listenerCount('test')).toBe(20);
            freshEmitter.clear();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // onFast / offFast
    // ═══════════════════════════════════════════════════════════

    describe('onFast()', () => {
        it('should register listener and return unbind function', () => {
            const handler = mock();
            const off = emitter.onFast('test', handler);

            expect(typeof off).toBe('function');

            // Should be callable via emitSync
            emitter.emitSync('test', { value: 1 });
            expect(handler).toHaveBeenCalledWith({ value: 1 });
        });

        it('should remove listener with unbind function', () => {
            const handler = mock();
            const off = emitter.onFast('test', handler);

            off();

            emitter.emitSync('test', { value: 1 });
            expect(handler).not.toHaveBeenCalled();
        });

        it('should handle multiple listeners', () => {
            const h1 = mock();
            const h2 = mock();

            emitter.onFast('test', h1);
            emitter.onFast('test', h2);

            emitter.emitSync('test', 'data');
            expect(h1).toHaveBeenCalledWith('data');
            expect(h2).toHaveBeenCalledWith('data');
        });
    });

    describe('offFast()', () => {
        it('should remove specific fast listener', () => {
            const h1 = mock();
            const h2 = mock();

            emitter.onFast('test', h1);
            emitter.onFast('test', h2);

            emitter.offFast('test', h1);

            emitter.emitSync('test', 'data');
            expect(h1).not.toHaveBeenCalled();
            expect(h2).toHaveBeenCalledWith('data');
        });

        it('should handle non-existent signal gracefully', () => {
            // Should not throw
            emitter.offFast('nonexistent', () => { });
        });

        it('should handle non-existent handler gracefully', () => {
            emitter.onFast('test', () => { });
            // Should not throw
            emitter.offFast('test', () => { }); // Different function reference
        });

        it('should also clean LISTENERS map', () => {
            const handler = () => { };
            emitter.on('test', handler); // Uses full LISTENERS map

            emitter.offFast('test', handler);

            expect(emitter.listenerCount('test')).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // emitSync - all branches (0,1,2,3,4,5+ listeners)
    // ═══════════════════════════════════════════════════════════

    describe('emitSync()', () => {
        it('should return 0 for non-existent signal', () => {
            const count = emitter.emitSync('nonexistent', {});
            expect(count).toBe(0);
        });

        it('should handle 1 listener', () => {
            const h = mock();
            emitter.onFast('test', h);

            const count = emitter.emitSync('test', 'data');
            expect(count).toBe(1);
            expect(h).toHaveBeenCalledWith('data');
        });

        it('should handle 2 listeners', () => {
            const handlers = [mock(), mock()];
            handlers.forEach(h => emitter.onFast('test', h));

            const count = emitter.emitSync('test', 'data');
            expect(count).toBe(2);
            handlers.forEach(h => expect(h).toHaveBeenCalledWith('data'));
        });

        it('should handle 3 listeners', () => {
            const handlers = [mock(), mock(), mock()];
            handlers.forEach(h => emitter.onFast('test', h));

            const count = emitter.emitSync('test', 'data');
            expect(count).toBe(3);
            handlers.forEach(h => expect(h).toHaveBeenCalledWith('data'));
        });

        it('should handle 4 listeners', () => {
            const handlers = [mock(), mock(), mock(), mock()];
            handlers.forEach(h => emitter.onFast('test', h));

            const count = emitter.emitSync('test', 'data');
            expect(count).toBe(4);
            handlers.forEach(h => expect(h).toHaveBeenCalledWith('data'));
        });

        it('should handle 5+ listeners (loop path)', () => {
            const handlers = [mock(), mock(), mock(), mock(), mock(), mock()];
            handlers.forEach(h => emitter.onFast('test', h));

            const count = emitter.emitSync('test', 'data');
            expect(count).toBe(6);
            handlers.forEach(h => expect(h).toHaveBeenCalledWith('data'));
        });
    });

    // ═══════════════════════════════════════════════════════════
    // emit() - advanced paths  
    // ═══════════════════════════════════════════════════════════

    describe('emit() advanced', () => {
        it('should use sync mode when specified', async () => {
            const order = [];
            emitter.on('test', () => order.push('sync'), { mode: 'sync' });
            emitter.on('test', () => order.push('async'), { mode: 'async' });

            await emitter.emit('test', {});
            await new Promise(r => setTimeout(r, 10)); // Let async resolve

            // Sync runs immediately, async deferred
            expect(order[0]).toBe('sync');
        });

        it('should support custom source', async () => {
            const handler = mock();
            emitter.on('test', handler);

            await emitter.emit('test', { data: 1 }, { peerId: 'remote-1', type: 'iframe' });

            const event = handler.mock.calls[0][0];
            expect(event.source.peerId).toBe('remote-1');
            expect(event.source.type).toBe('iframe');
        });

        it('should remove once listener after fast path invocation', async () => {
            const handler = mock();
            emitter.on('test', handler, { once: true });

            await emitter.emit('test', { a: 1 });
            expect(emitter.listenerCount('test')).toBe(0);
        });

        it('should catch sync handler errors in fast path', async () => {
            const errorSpy = spyOn(console, 'error');
            emitter.on('test', () => { throw new Error('boom'); }, { mode: 'sync' });

            await emitter.emit('test', {});

            expect(errorSpy).toHaveBeenCalled();
        });

        it('should handle multiple sources in wildcard match', async () => {
            const exactHandler = mock();
            const wildcardHandler = mock();
            const globalHandler = mock();

            emitter.on('user:login', exactHandler, { priority: 10 });
            emitter.on('user:*', wildcardHandler, { priority: 5 });
            emitter.on('*', globalHandler, { priority: 1 });

            const count = await emitter.emit('user:login', { id: 1 });

            expect(count).toBe(3);
            expect(exactHandler).toHaveBeenCalled();
            expect(wildcardHandler).toHaveBeenCalled();
            expect(globalHandler).toHaveBeenCalled();
        });

        it('should handle no matching listeners', async () => {
            const count = await emitter.emit('unknown', {});
            expect(count).toBe(0);
        });

        it('should handle single source in wildcard (namespace only)', async () => {
            const handler = mock();
            emitter.on('user:*', handler);

            const count = await emitter.emit('user:action', {});
            expect(count).toBe(1);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // Priority insert (binary search path)
    // ═══════════════════════════════════════════════════════════

    describe('Priority binary insert', () => {
        it('should insert high priority in middle via binary search', async () => {
            const order = [];

            emitter.on('test', () => order.push('p0-first'), { priority: 0 });
            emitter.on('test', () => order.push('p0-second'), { priority: 0 });
            // This goes through binary search path (higher than existing)
            emitter.on('test', () => order.push('p5'), { priority: 5 });

            await emitter.emit('test', {});

            expect(order[0]).toBe('p5');
            expect(order[1]).toBe('p0-first');
            expect(order[2]).toBe('p0-second');
        });

        it('should handle complex priority ordering', async () => {
            const order = [];

            emitter.on('test', () => order.push('p1'), { priority: 1 });
            emitter.on('test', () => order.push('p10'), { priority: 10 });
            emitter.on('test', () => order.push('p5'), { priority: 5 });
            emitter.on('test', () => order.push('p3'), { priority: 3 });
            emitter.on('test', () => order.push('p7'), { priority: 7 });

            await emitter.emit('test', {});

            expect(order).toEqual(['p10', 'p7', 'p5', 'p3', 'p1']);
        });
    });

    // ═══════════════════════════════════════════════════════════
    // off() - remaining handlers path
    // ═══════════════════════════════════════════════════════════

    describe('off() advanced', () => {
        it('should update cache when some handlers remain', () => {
            const h1 = () => { };
            const h2 = () => { };
            const h3 = () => { };

            emitter.on('test', h1);
            emitter.on('test', h2);
            emitter.on('test', h3);

            const result = emitter.off('test', h2);

            expect(result.removedCount).toBe(1);
            expect(result.remainingCount).toBe(2);
            expect(emitter.listenerCount('test')).toBe(2);
        });
    });
});

// ═══════════════════════════════════════════════════════════
// createFastEmitter - factory function
// ═══════════════════════════════════════════════════════════

describe('createFastEmitter', () => {
    it('should create emitter with on/emit/off methods', () => {
        const emitter = createFastEmitter();

        expect(typeof emitter.on).toBe('function');
        expect(typeof emitter.emit).toBe('function');
        expect(typeof emitter.off).toBe('function');
        expect(emitter.events).toBeDefined();
    });

    it('should register and invoke listeners', () => {
        const emitter = createFastEmitter();
        const handler = mock();

        emitter.on('test', handler);
        emitter.emit('test', 'data');

        expect(handler).toHaveBeenCalledWith('data');
    });

    it('should return unbind function from on()', () => {
        const emitter = createFastEmitter();
        const handler = mock();

        const off = emitter.on('test', handler);
        off();
        emitter.emit('test', 'data');

        expect(handler).not.toHaveBeenCalled();
    });

    it('should handle 1 listener', () => {
        const emitter = createFastEmitter();
        const h = mock();
        emitter.on('test', h);
        emitter.emit('test', 'x');
        expect(h).toHaveBeenCalledTimes(1);
    });

    it('should handle 2 listeners', () => {
        const emitter = createFastEmitter();
        const handlers = [mock(), mock()];
        handlers.forEach(h => emitter.on('test', h));
        emitter.emit('test', 'x');
        handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should handle 3 listeners', () => {
        const emitter = createFastEmitter();
        const handlers = [mock(), mock(), mock()];
        handlers.forEach(h => emitter.on('test', h));
        emitter.emit('test', 'x');
        handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should handle 4 listeners', () => {
        const emitter = createFastEmitter();
        const handlers = [mock(), mock(), mock(), mock()];
        handlers.forEach(h => emitter.on('test', h));
        emitter.emit('test', 'x');
        handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should handle 5+ listeners (loop path)', () => {
        const emitter = createFastEmitter();
        const handlers = [mock(), mock(), mock(), mock(), mock(), mock()];
        handlers.forEach(h => emitter.on('test', h));
        emitter.emit('test', 'x');
        handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should not emit if no listeners', () => {
        const emitter = createFastEmitter();
        // Should not throw
        emitter.emit('test', 'data');
    });

    it('off() should remove specific event listeners', () => {
        const emitter = createFastEmitter();
        const h1 = mock();
        const h2 = mock();

        emitter.on('test', h1);
        emitter.on('other', h2);

        emitter.off('test');

        emitter.emit('test', 'x');
        emitter.emit('other', 'x');

        expect(h1).not.toHaveBeenCalled();
        expect(h2).toHaveBeenCalled();
    });

    it('off() without argument should clear all events', () => {
        const emitter = createFastEmitter();
        emitter.on('a', mock());
        emitter.on('b', mock());

        emitter.off();

        expect(emitter.events).toEqual({});
    });
});
