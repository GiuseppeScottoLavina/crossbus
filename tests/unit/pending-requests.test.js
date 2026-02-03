/**
 * @fileoverview Tests for PendingRequests tracker.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { PendingRequests } from '../../src/router/pending-requests.js';

describe('PendingRequests', () => {
    let tracker;

    beforeEach(() => {
        tracker = new PendingRequests({ defaultTimeout: 500 }); // Longer timeout to avoid race conditions
    });

    afterEach(async () => {
        // Collect promises BEFORE cancelAll (it removes entries)
        const promises = tracker.getRequestIds().map(id => {
            const entry = tracker.get(id);
            return entry?.promise;
        }).filter(Boolean);

        tracker.cancelAll();

        // Wait for all rejections to be handled
        await Promise.allSettled(promises);
    });

    describe('create()', () => {
        it('should create pending request and return id + promise', () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');
            promise.catch(() => { }); // Prevent unhandled rejection on cleanup

            expect(requestId).toMatch(/^req_/);
            expect(promise).toBeInstanceOf(Promise);
            expect(tracker.has(requestId)).toBe(true);
        });

        it('should generate unique request IDs', () => {
            const r1 = tracker.create('peer-1', 'handler1');
            const r2 = tracker.create('peer-1', 'handler2');
            const r3 = tracker.create('peer-2', 'handler1');
            // Prevent unhandled rejections on cleanup
            r1.promise.catch(() => { });
            r2.promise.catch(() => { });
            r3.promise.catch(() => { });

            expect(r1.requestId).not.toBe(r2.requestId);
            expect(r2.requestId).not.toBe(r3.requestId);
        });

        it('should store target peer and handler name', () => {
            const { requestId, promise } = tracker.create('widget-1', 'getState');
            promise.catch(() => { }); // Prevent unhandled rejection on cleanup

            const pending = tracker.get(requestId);
            expect(pending.targetPeer).toBe('widget-1');
            expect(pending.handlerName).toBe('getState');
        });
    });

    describe('resolve()', () => {
        it('should resolve promise with success data', async () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');

            tracker.resolve(requestId, {
                success: true,
                data: { value: 42 }
            });

            const result = await promise;
            expect(result.value).toBe(42);
            expect(tracker.has(requestId)).toBe(false);
        });

        it('should reject promise on handler error', async () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');

            tracker.resolve(requestId, {
                success: false,
                error: { message: 'Not found', code: 'ERR_NOT_FOUND' }
            });

            await expect(promise).rejects.toThrow();
            expect(tracker.has(requestId)).toBe(false);
        });

        it('should return false for unknown request', () => {
            const result = tracker.resolve('unknown-id', { success: true });
            expect(result).toBe(false);
        });
    });

    describe('reject()', () => {
        it('should reject promise with error', async () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');

            tracker.reject(requestId, new Error('Connection lost'));

            await expect(promise).rejects.toThrow('Connection lost');
        });

        it('should accept string as error', async () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');

            tracker.reject(requestId, 'Something went wrong');

            await expect(promise).rejects.toThrow('Something went wrong');
        });
    });

    describe('cancel()', () => {
        it('should cancel pending request', async () => {
            const { requestId, promise } = tracker.create('peer-1', 'getData');

            const cancelled = tracker.cancel(requestId);

            expect(cancelled).toBe(true);
            expect(tracker.has(requestId)).toBe(false);
            await expect(promise).rejects.toThrow('cancelled');
        });

        it('should return false for unknown request', () => {
            expect(tracker.cancel('unknown-id')).toBe(false);
        });
    });

    describe('cancelForPeer()', () => {
        it('should cancel all requests for a peer', async () => {
            const r1 = tracker.create('peer-1', 'handler1');
            const r2 = tracker.create('peer-1', 'handler2');
            const r3 = tracker.create('peer-2', 'handler1');

            const count = tracker.cancelForPeer('peer-1');

            expect(count).toBe(2);
            expect(tracker.has(r1.requestId)).toBe(false);
            expect(tracker.has(r2.requestId)).toBe(false);
            expect(tracker.has(r3.requestId)).toBe(true);

            // Use Promise.allSettled to properly handle all rejections
            const results = await Promise.allSettled([r1.promise, r2.promise]);
            expect(results[0].status).toBe('rejected');
            expect(results[1].status).toBe('rejected');

            // Cleanup r3 to prevent timeout
            tracker.cancel(r3.requestId);
            await r3.promise.catch(() => { });
        });
    });

    describe('cancelAll()', () => {
        it('should cancel all requests', async () => {
            const r1 = tracker.create('peer-1', 'h1');
            const r2 = tracker.create('peer-2', 'h2');
            const r3 = tracker.create('peer-3', 'h3');

            const count = tracker.cancelAll();

            expect(count).toBe(3);
            expect(tracker.size).toBe(0);

            // Await rejections to prevent unhandled
            await Promise.allSettled([r1.promise, r2.promise, r3.promise]);
        });
    });

    describe('timeout', () => {
        it('should reject on timeout', async () => {
            const shortTracker = new PendingRequests({ defaultTimeout: 20 });
            const { promise } = shortTracker.create('peer-1', 'slowHandler');

            await expect(promise).rejects.toThrow();
        });
    });

    describe('getForPeer()', () => {
        it('should return requests for specific peer', () => {
            const r1 = tracker.create('peer-1', 'handler1');
            const r2 = tracker.create('peer-1', 'handler2');
            const r3 = tracker.create('peer-2', 'handler3');
            // Prevent unhandled rejections on cleanup
            r1.promise.catch(() => { });
            r2.promise.catch(() => { });
            r3.promise.catch(() => { });

            const requests = tracker.getForPeer('peer-1');

            expect(requests.length).toBe(2);
            expect(requests[0].targetPeer).toBe('peer-1');
            expect(requests[1].targetPeer).toBe('peer-1');
        });
    });

    describe('size and getRequestIds()', () => {
        it('should track pending count', () => {
            expect(tracker.size).toBe(0);

            const r1 = tracker.create('p1', 'h1');
            const r2 = tracker.create('p2', 'h2');
            // Prevent unhandled rejections on cleanup
            r1.promise.catch(() => { });
            r2.promise.catch(() => { });

            expect(tracker.size).toBe(2);
            expect(tracker.getRequestIds()).toContain(r1.requestId);
            expect(tracker.getRequestIds()).toContain(r2.requestId);
        });
    });

    describe('maxPending limit', () => {
        it('should throw ERR_MAX_PENDING when limit is reached', () => {
            const limitedTracker = new PendingRequests({
                defaultTimeout: 500,
                maxPending: 3
            });

            // Create 3 requests (at limit)
            limitedTracker.create('p1', 'h1').promise.catch(() => { });
            limitedTracker.create('p2', 'h2').promise.catch(() => { });
            limitedTracker.create('p3', 'h3').promise.catch(() => { });

            // Fourth should throw
            expect(() => {
                limitedTracker.create('p4', 'h4');
            }).toThrow('Maximum pending requests reached');

            limitedTracker.cancelAll();
        });

        it('should allow requests after previous ones resolve', () => {
            const limitedTracker = new PendingRequests({
                defaultTimeout: 500,
                maxPending: 2
            });

            // Create 2 requests
            const r1 = limitedTracker.create('p1', 'h1');
            const r2 = limitedTracker.create('p2', 'h2');
            r1.promise.catch(() => { });
            r2.promise.catch(() => { });

            // Third should throw
            expect(() => limitedTracker.create('p3', 'h3')).toThrow();

            // Resolve one
            limitedTracker.resolve(r1.requestId, { success: true, data: 'ok' });

            // Now should work
            const r3 = limitedTracker.create('p3', 'h3');
            r3.promise.catch(() => { });
            expect(limitedTracker.size).toBe(2);

            limitedTracker.cancelAll();
        });

        it('should allow unlimited requests when maxPending is 0', () => {
            const unlimitedTracker = new PendingRequests({
                defaultTimeout: 500,
                maxPending: 0
            });

            // Create many requests
            const requests = [];
            for (let i = 0; i < 100; i++) {
                const req = unlimitedTracker.create(`p${i}`, `h${i}`);
                req.promise.catch(() => { });
                requests.push(req);
            }

            expect(unlimitedTracker.size).toBe(100);
            unlimitedTracker.cancelAll();
        });
    });
});
