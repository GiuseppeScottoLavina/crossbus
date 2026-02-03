/**
 * @fileoverview Tests for enterprise backpressure module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BackpressureController } from '../../../src/enterprise/backpressure.js';

describe('BackpressureController', () => {
    let controller;

    beforeEach(() => {
        controller = new BackpressureController({
            maxQueueSize: 5,
            strategy: 'drop-oldest'
        });
    });

    afterEach(() => {
        controller.destroy();
    });

    describe('constructor', () => {
        it('should create with default options', () => {
            const c = new BackpressureController();
            expect(c).toBeInstanceOf(BackpressureController);
            c.destroy();
        });

        it('should accept custom options', () => {
            const c = new BackpressureController({
                maxQueueSize: 100,
                strategy: 'reject'
            });
            expect(c).toBeInstanceOf(BackpressureController);
            c.destroy();
        });
    });

    describe('wrap()', () => {
        it('should return a wrapped send function', () => {
            const sent = [];
            const wrappedSend = controller.wrap('peer-1', (msg) => sent.push(msg));
            expect(typeof wrappedSend).toBe('function');
        });

        it('should send immediately when queue is empty', () => {
            const sent = [];
            const wrappedSend = controller.wrap('peer-1', (msg) => sent.push(msg));
            const result = wrappedSend({ data: 1 });
            expect(result.success).toBe(true);
            expect(result.queued).toBe(false);
            expect(sent.length).toBe(1);
        });

        it('should accept per-peer options', () => {
            const sent = [];
            controller.wrap('peer-1', (msg) => sent.push(msg), {
                maxQueueSize: 3,
                strategy: 'reject'
            });
            const stats = controller.getStats('peer-1');
            expect(stats.maxSize).toBe(3);
        });
    });

    describe('backpressure strategies', () => {
        it('drop-oldest should drop oldest message when full', () => {
            const c = new BackpressureController({ maxQueueSize: 2, strategy: 'drop-oldest' });
            const sent = [];
            const failingSend = () => { throw new Error('Slow'); };
            const wrappedSend = c.wrap('peer', failingSend);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });
            const result = wrappedSend({ id: 3 });

            expect(result.success).toBe(true);
            expect(result.dropped).toBe(true);
            expect(c.getStats('peer').dropped).toBe(1);
            c.destroy();
        });

        it('drop-newest should drop new message when full', () => {
            const c = new BackpressureController({ maxQueueSize: 2, strategy: 'drop-newest' });
            const failingSend = () => { throw new Error('Slow'); };
            const wrappedSend = c.wrap('peer', failingSend);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });
            const result = wrappedSend({ id: 3 });

            expect(result.success).toBe(false);
            expect(result.dropped).toBe(true);
            c.destroy();
        });

        it('reject should reject when full', () => {
            const c = new BackpressureController({ maxQueueSize: 2, strategy: 'reject' });
            const failingSend = () => { throw new Error('Slow'); };
            const wrappedSend = c.wrap('peer', failingSend);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });
            const result = wrappedSend({ id: 3 });

            expect(result.success).toBe(false);
            expect(result.dropped).toBe(false);
            c.destroy();
        });

        it('pause should pause when full', () => {
            const c = new BackpressureController({ maxQueueSize: 2, strategy: 'pause' });
            const failingSend = () => { throw new Error('Slow'); };
            const wrappedSend = c.wrap('peer', failingSend);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });
            wrappedSend({ id: 3 });

            expect(c.getStats('peer').isPaused).toBe(true);
            c.destroy();
        });
    });

    describe('flush()', () => {
        it('should process queued messages', () => {
            const sent = [];
            let shouldFail = true;
            const sendFn = (msg) => {
                if (shouldFail) throw new Error('Slow');
                sent.push(msg);
            };
            const wrappedSend = controller.wrap('peer', sendFn);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });

            shouldFail = false;
            const processed = controller.flush('peer');

            expect(processed).toBe(2);
            expect(sent.length).toBe(2);
        });

        it('should return 0 for unknown peer', () => {
            expect(controller.flush('unknown')).toBe(0);
        });
    });

    describe('flushAll()', () => {
        it('should flush all queues', () => {
            const sent = [];
            let shouldFail = true;
            const sendFn = (msg) => {
                if (shouldFail) throw new Error('Slow');
                sent.push(msg);
            };

            const send1 = controller.wrap('peer1', sendFn);
            const send2 = controller.wrap('peer2', sendFn);

            send1({ id: 1 });
            send2({ id: 2 });

            shouldFail = false;
            const total = controller.flushAll();

            expect(total).toBe(2);
        });
    });

    describe('pause/resume', () => {
        it('should pause and resume queue', () => {
            const sent = [];
            controller.wrap('peer', (msg) => sent.push(msg));

            controller.pause('peer');
            expect(controller.getStats('peer').isPaused).toBe(true);

            controller.resume('peer');
            expect(controller.getStats('peer').isPaused).toBe(false);
        });
    });

    describe('getStats()', () => {
        it('should return queue stats', () => {
            const sent = [];
            const wrappedSend = controller.wrap('peer', (msg) => sent.push(msg));
            wrappedSend({ data: 1 });

            const stats = controller.getStats('peer');
            expect(stats.size).toBe(0);
            expect(stats.processed).toBe(1);
            expect(stats.dropped).toBe(0);
        });

        it('should return null for unknown peer', () => {
            expect(controller.getStats('unknown')).toBeNull();
        });
    });

    describe('getAllStats()', () => {
        it('should return all queue stats', () => {
            controller.wrap('peer1', () => { });
            controller.wrap('peer2', () => { });

            const stats = controller.getAllStats();
            expect(stats.peer1).toBeDefined();
            expect(stats.peer2).toBeDefined();
        });
    });

    describe('onBackpressure()', () => {
        it('should call callback when queue is over threshold', async () => {
            const c = new BackpressureController({ maxQueueSize: 2, checkIntervalMs: 50 });
            const events = [];
            c.onBackpressure((peerId, stats) => events.push({ peerId, stats }));

            const failingSend = () => { throw new Error('Slow'); };
            const wrappedSend = c.wrap('peer', failingSend);

            wrappedSend({ id: 1 });
            wrappedSend({ id: 2 });

            await new Promise(r => setTimeout(r, 100));

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].peerId).toBe('peer');

            c.destroy();
        });

        it('should return unsubscribe function', () => {
            const events = [];
            const off = controller.onBackpressure((peerId, stats) => events.push({ peerId, stats }));
            off();
            // Just verify it doesn't throw
            expect(typeof off).toBe('function');
        });
    });

    describe('remove()', () => {
        it('should remove peer queue', () => {
            controller.wrap('peer', () => { });
            controller.remove('peer');
            expect(controller.getStats('peer')).toBeNull();
        });
    });

    describe('destroy()', () => {
        it('should clean up all queues', () => {
            controller.wrap('peer1', () => { });
            controller.wrap('peer2', () => { });
            controller.destroy();
            expect(controller.getStats('peer1')).toBeNull();
        });
    });
});
