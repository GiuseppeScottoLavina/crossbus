/**
 * @fileoverview TDD tests for Rate Limiter plugin.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RateLimiter, withRateLimiter } from '../../src/plugins/rate-limiter.js';

describe('Rate Limiter Plugin', () => {
    describe('tryAcquire()', () => {
        it('should allow requests within limit', () => {
            const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

            expect(limiter.tryAcquire()).toBe(true);
            expect(limiter.tryAcquire()).toBe(true);
            expect(limiter.tryAcquire()).toBe(true);
        });

        it('should block requests exceeding limit', () => {
            const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

            expect(limiter.tryAcquire()).toBe(true);
            expect(limiter.tryAcquire()).toBe(true);
            expect(limiter.tryAcquire()).toBe(false); // Blocked
        });

        it('should refill tokens after window', async () => {
            const limiter = new RateLimiter({ maxRequests: 2, windowMs: 50 });

            limiter.tryAcquire();
            limiter.tryAcquire();
            expect(limiter.tryAcquire()).toBe(false);

            // Wait for refill
            await new Promise(r => setTimeout(r, 60));

            expect(limiter.tryAcquire()).toBe(true);
        });
    });

    describe('remaining', () => {
        it('should return remaining tokens', () => {
            const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

            expect(limiter.remaining).toBe(5);
            limiter.tryAcquire();
            expect(limiter.remaining).toBe(4);
        });
    });

    describe('reset()', () => {
        it('should reset tokens to max', () => {
            const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

            limiter.tryAcquire();
            limiter.tryAcquire();
            expect(limiter.remaining).toBe(3);

            limiter.reset();
            expect(limiter.remaining).toBe(5);
        });
    });

    describe('forPeer()', () => {
        it('should create separate limiters per peer', () => {
            const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

            const peerA = limiter.forPeer('peer-a');
            const peerB = limiter.forPeer('peer-b');

            // Each peer has its own bucket
            peerA.tryAcquire();
            peerA.tryAcquire();
            expect(peerA.tryAcquire()).toBe(false);

            // Peer B still has tokens
            expect(peerB.tryAcquire()).toBe(true);
        });
    });

    describe('createHook()', () => {
        it('should return a hook function', () => {
            const limiter = new RateLimiter();
            const hook = limiter.createHook();

            expect(typeof hook).toBe('function');
        });

        it('should throw when limit exceeded with throwOnLimit=true', () => {
            const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
            const hook = limiter.createHook({ throwOnLimit: true });

            // First call passes
            expect(hook({ data: 1 }, {})).toEqual({ data: 1 });

            // Second call throws
            expect(() => hook({ data: 2 }, {})).toThrow('Rate limit exceeded');
        });

        it('should return null when limit exceeded with throwOnLimit=false', () => {
            const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
            const hook = limiter.createHook({ throwOnLimit: false });

            expect(hook({ data: 1 }, {})).toEqual({ data: 1 });
            expect(hook({ data: 2 }, {})).toBe(null); // Dropped
        });
    });

    describe('onLimitExceeded callback', () => {
        it('should call callback when limit exceeded', () => {
            let callCount = 0;
            const limiter = new RateLimiter({
                maxRequests: 1,
                windowMs: 1000,
                onLimitExceeded: () => callCount++
            });

            limiter.tryAcquire();
            limiter.tryAcquire();
            limiter.tryAcquire();

            expect(callCount).toBe(2);
        });
    });

    describe('cleanup()', () => {
        it('should remove limiters for disconnected peers', () => {
            const limiter = new RateLimiter({ maxRequests: 5 });

            limiter.forPeer('peer-a');
            limiter.forPeer('peer-b');
            limiter.forPeer('peer-c');

            limiter.cleanup(['peer-a']); // Only peer-a still active

            // peer-b and peer-c should be removed, peer-a kept
            const peerA = limiter.forPeer('peer-a');
            expect(peerA.remaining).toBe(5); // Same instance, not reset
        });
    });
});
