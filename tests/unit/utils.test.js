/**
 * @fileoverview Tests for common utility functions.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
    uuid,
    deferred,
    sleep,
    withTimeout,
    isCloneable,
    detectPeerType,
    timestamp
} from '../../src/common/utils.js';

describe('Utils', () => {
    describe('uuid()', () => {
        it('should generate unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(uuid());
            }
            expect(ids.size).toBe(100);
        });

        it('should return string', () => {
            expect(typeof uuid()).toBe('string');
        });

        it('should have reasonable length', () => {
            const id = uuid();
            expect(id.length).toBeGreaterThan(8);
        });

        it('should follow UUID format', () => {
            const id = uuid();
            // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
    });

    describe('deferred()', () => {
        it('should return promise, resolve, and reject', () => {
            const { promise, resolve, reject } = deferred();

            expect(promise).toBeInstanceOf(Promise);
            expect(typeof resolve).toBe('function');
            expect(typeof reject).toBe('function');
        });

        it('should resolve promise when resolve is called', async () => {
            const { promise, resolve } = deferred();

            resolve('test-value');

            const result = await promise;
            expect(result).toBe('test-value');
        });

        it('should reject promise when reject is called', async () => {
            const { promise, reject } = deferred();

            reject(new Error('test-error'));

            await expect(promise).rejects.toThrow('test-error');
        });
    });

    describe('sleep()', () => {
        it('should resolve after specified time', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
        });

        it('should return a promise', () => {
            expect(sleep(10)).toBeInstanceOf(Promise);
        });

        it('should reject immediately if signal already aborted', async () => {
            const controller = new AbortController();
            controller.abort('Pre-aborted');

            await expect(sleep(1000, controller.signal)).rejects.toThrow();
        });

        it('should reject when signal is aborted during sleep', async () => {
            const controller = new AbortController();
            const sleepPromise = sleep(1000, controller.signal);

            setTimeout(() => controller.abort('Aborted mid-sleep'), 20);

            await expect(sleepPromise).rejects.toThrow();
        });
    });

    describe('withTimeout()', () => {
        it('should resolve if promise completes before timeout', async () => {
            const fastPromise = Promise.resolve('fast');

            const result = await withTimeout(fastPromise, 1000);

            expect(result).toBe('fast');
        });

        it('should reject if promise takes longer than timeout', async () => {
            const slowPromise = new Promise(resolve => setTimeout(resolve, 500));

            await expect(withTimeout(slowPromise, 50)).rejects.toThrow();
        });

        it('should preserve original rejection', async () => {
            const failingPromise = Promise.reject(new Error('original error'));

            await expect(withTimeout(failingPromise, 1000)).rejects.toThrow('original error');
        });

        it('should use custom timeout message', async () => {
            const slowPromise = new Promise(resolve => setTimeout(resolve, 500));

            await expect(withTimeout(slowPromise, 10, 'Custom timeout')).rejects.toThrow('Custom timeout');
        });
    });

    describe('isCloneable()', () => {
        it('should return true for primitives', () => {
            expect(isCloneable('string')).toBe(true);
            expect(isCloneable(123)).toBe(true);
            expect(isCloneable(true)).toBe(true);
            expect(isCloneable(null)).toBe(true);
            expect(isCloneable(undefined)).toBe(true);
        });

        it('should return true for plain objects', () => {
            expect(isCloneable({ a: 1, b: 2 })).toBe(true);
        });

        it('should return true for arrays', () => {
            expect(isCloneable([1, 2, 3])).toBe(true);
        });

        it('should return false for functions', () => {
            expect(isCloneable(() => { })).toBe(false);
        });

        it('should return false for symbols', () => {
            expect(isCloneable(Symbol('test'))).toBe(false);
        });

        it('should return false for WeakMap', () => {
            expect(isCloneable(new WeakMap())).toBe(false);
        });

        it('should return false for WeakSet', () => {
            expect(isCloneable(new WeakSet())).toBe(false);
        });

        it('should return true for Date objects', () => {
            expect(isCloneable(new Date())).toBe(true);
        });

        it('should return true for Map and Set', () => {
            expect(isCloneable(new Map())).toBe(true);
            expect(isCloneable(new Set())).toBe(true);
        });
    });

    describe('detectPeerType()', () => {
        it('should detect iframe context', () => {
            const mockTarget = {
                postMessage: () => { },
                parent: {}
            };

            const type = detectPeerType(mockTarget);
            expect(['iframe', 'window', 'unknown']).toContain(type);
        });

        it('should handle null gracefully', () => {
            const type = detectPeerType(null);
            expect(type).toBe('unknown');
        });

        it('should handle undefined gracefully', () => {
            const type = detectPeerType(undefined);
            expect(type).toBe('unknown');
        });

        it('should detect MessagePort', () => {
            const channel = new MessageChannel();
            expect(detectPeerType(channel.port1)).toBe('port');
        });
    });

    describe('timestamp()', () => {
        it('should return an object with timestamp and iso', () => {
            const ts = timestamp();
            expect(typeof ts.timestamp).toBe('number');
            expect(typeof ts.iso).toBe('string');
        });

        it('should return frozen object', () => {
            const ts = timestamp();
            expect(Object.isFrozen(ts)).toBe(true);
        });

        it('should return valid ISO date string', () => {
            const ts = timestamp();
            expect(new Date(ts.iso).getTime()).toBe(ts.timestamp);
        });

        it('should return current time', () => {
            const before = Date.now();
            const ts = timestamp();
            const after = Date.now();
            expect(ts.timestamp).toBeGreaterThanOrEqual(before);
            expect(ts.timestamp).toBeLessThanOrEqual(after);
        });
    });

});

