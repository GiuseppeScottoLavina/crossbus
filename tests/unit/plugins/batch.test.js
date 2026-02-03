/**
 * @fileoverview Tests for Message Batching plugin.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { MessageBatcher, withBatching, createBatcher, BATCH_TYPE } from '../../../src/plugins/batch.js';

describe('MessageBatcher', () => {
    let batcher;

    beforeEach(() => {
        batcher = new MessageBatcher({ windowMs: 10, useRaf: false });
    });

    afterEach(() => {
        batcher.destroy();
    });

    describe('constructor', () => {
        it('should create with default options', () => {
            const b = new MessageBatcher();
            expect(b.stats.batchesSent).toBe(0);
            b.destroy();
        });

        it('should accept custom options', () => {
            const b = new MessageBatcher({ windowMs: 50, maxBatchSize: 10 });
            expect(b.stats).toBeDefined();
            b.destroy();
        });
    });

    describe('queue', () => {
        it('should queue messages', () => {
            batcher.queue({ type: 'test', data: 1 });
            batcher.queue({ type: 'test', data: 2 });
            expect(batcher.stats.messagesBatched).toBe(2);
            expect(batcher.stats.pendingMessages).toBe(2);
        });

        it('should flush when maxBatchSize reached', async () => {
            const smallBatcher = new MessageBatcher({ maxBatchSize: 3, useRaf: false });
            let flushed = null;

            smallBatcher.onFlush((batch) => {
                flushed = batch;
            });

            smallBatcher.queue({ n: 1 });
            smallBatcher.queue({ n: 2 });
            expect(flushed).toBeNull();

            smallBatcher.queue({ n: 3 }); // Should trigger flush
            expect(flushed).not.toBeNull();
            expect(flushed.length).toBe(3);

            smallBatcher.destroy();
        });
    });

    describe('flush', () => {
        it('should flush pending messages', () => {
            let flushed = null;
            batcher.onFlush((batch) => {
                flushed = batch;
            });

            batcher.queue({ a: 1 });
            batcher.queue({ a: 2 });
            batcher.flush();

            expect(flushed.length).toBe(2);
            expect(flushed[0].a).toBe(1);
            expect(flushed[1].a).toBe(2);
        });

        it('should not flush empty batches', () => {
            let flushCount = 0;
            batcher.onFlush(() => flushCount++);

            batcher.flush();
            expect(flushCount).toBe(0);
        });
    });

    describe('stats', () => {
        it('should track statistics', () => {
            batcher.onFlush(() => { });

            batcher.queue({ x: 1 });
            batcher.queue({ x: 2 });
            batcher.flush();

            const stats = batcher.stats;
            expect(stats.batchesSent).toBe(1);
            expect(stats.messagesBatched).toBe(2);
            expect(stats.avgBatchSize).toBe(2);
            expect(stats.pendingMessages).toBe(0);
        });

        it('should reset statistics', () => {
            batcher.onFlush(() => { });
            batcher.queue({ x: 1 });
            batcher.flush();

            batcher.resetStats();
            expect(batcher.stats.batchesSent).toBe(0);
            expect(batcher.stats.messagesBatched).toBe(0);
        });
    });

    describe('automatic flush timing', () => {
        it('should auto-flush after windowMs', async () => {
            const timedBatcher = new MessageBatcher({ windowMs: 20, useRaf: false });
            let flushed = null;

            timedBatcher.onFlush((batch) => {
                flushed = batch;
            });

            timedBatcher.queue({ auto: true });
            expect(flushed).toBeNull();

            await new Promise(r => setTimeout(r, 50));
            expect(flushed).not.toBeNull();
            expect(flushed[0].auto).toBe(true);

            timedBatcher.destroy();
        });
    });
});

describe('createBatcher', () => {
    it('should create a standalone batcher', () => {
        const batcher = createBatcher({ windowMs: 50 });
        expect(batcher).toBeInstanceOf(MessageBatcher);
        batcher.destroy();
    });
});

describe('BATCH_TYPE', () => {
    it('should be a valid string identifier', () => {
        expect(typeof BATCH_TYPE).toBe('string');
        expect(BATCH_TYPE.length).toBeGreaterThan(0);
    });
});
