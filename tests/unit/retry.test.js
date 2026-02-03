/**
 * @fileoverview Tests for retry plugin.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
    withRetry,
    getDelay,
    createRetryWrapper,
    RetryStrategies,
    DEFAULT_RETRY_OPTIONS
} from '../../src/plugins/retry.js';

describe('Retry Plugin', () => {
    describe('getDelay()', () => {
        it('should calculate exponential delay', () => {
            const opts = { baseDelay: 100, factor: 2, jitter: false, maxDelay: 10000 };

            expect(getDelay(0, opts)).toBe(100);
            expect(getDelay(1, opts)).toBe(200);
            expect(getDelay(2, opts)).toBe(400);
            expect(getDelay(3, opts)).toBe(800);
        });

        it('should cap at maxDelay', () => {
            const opts = { baseDelay: 100, factor: 2, jitter: false, maxDelay: 300 };

            expect(getDelay(0, opts)).toBe(100);
            expect(getDelay(1, opts)).toBe(200);
            expect(getDelay(2, opts)).toBe(300); // Capped
            expect(getDelay(3, opts)).toBe(300); // Still capped
        });

        it('should add jitter when enabled', () => {
            const opts = { baseDelay: 100, factor: 2, jitter: true, maxDelay: 10000 };

            // With jitter, values should vary (test multiple times)
            const delays = new Set();
            for (let i = 0; i < 10; i++) {
                delays.add(getDelay(1, opts));
            }

            // Should have some variance (not all same value)
            expect(delays.size).toBeGreaterThan(1);
        });
    });

    describe('withRetry()', () => {
        it('should return result on success', async () => {
            const fn = mock(() => Promise.resolve({ value: 42 }));

            const result = await withRetry(fn, { maxAttempts: 3 });

            expect(result.value).toBe(42);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure', async () => {
            let attempts = 0;
            const fn = mock(() => {
                attempts++;
                if (attempts < 3) {
                    const error = new Error('Temporary failure');
                    error.retryable = true;
                    return Promise.reject(error);
                }
                return Promise.resolve({ success: true });
            });

            const result = await withRetry(fn, {
                maxAttempts: 5,
                baseDelay: 10,
                shouldRetry: (e) => e.retryable
            });

            expect(result.success).toBe(true);
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should throw after max attempts', async () => {
            const fn = mock(() => {
                const error = new Error('Always fails');
                error.retryable = true;
                return Promise.reject(error);
            });

            await expect(
                withRetry(fn, {
                    maxAttempts: 3,
                    baseDelay: 10,
                    shouldRetry: () => true
                })
            ).rejects.toThrow('Always fails');

            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should not retry non-retryable errors', async () => {
            const fn = mock(() => {
                return Promise.reject(new Error('Non-retryable'));
            });

            await expect(
                withRetry(fn, {
                    maxAttempts: 3,
                    shouldRetry: () => false
                })
            ).rejects.toThrow('Non-retryable');

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should call onRetry callback', async () => {
            let attempts = 0;
            const fn = mock(() => {
                attempts++;
                if (attempts < 2) {
                    const error = new Error('Fail');
                    error.retryable = true;
                    return Promise.reject(error);
                }
                return Promise.resolve('ok');
            });

            const onRetry = mock();

            await withRetry(fn, {
                maxAttempts: 3,
                baseDelay: 10,
                shouldRetry: () => true,
                onRetry
            });

            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0][0].attempt).toBe(1);
        });
    });

    describe('RetryStrategies', () => {
        it('should have FAST strategy', () => {
            expect(RetryStrategies.FAST.maxAttempts).toBe(3);
            expect(RetryStrategies.FAST.baseDelay).toBe(50);
        });

        it('should have STANDARD strategy', () => {
            expect(RetryStrategies.STANDARD.maxAttempts).toBe(3);
            expect(RetryStrategies.STANDARD.baseDelay).toBe(100);
        });

        it('should have AGGRESSIVE strategy', () => {
            expect(RetryStrategies.AGGRESSIVE.maxAttempts).toBe(5);
        });

        it('should have ONCE strategy for single retry', () => {
            expect(RetryStrategies.ONCE.maxAttempts).toBe(2);
            expect(RetryStrategies.ONCE.baseDelay).toBe(0);
        });
    });

    describe('createRetryWrapper()', () => {
        it('should create wrapper with request method', () => {
            const mockBus = {
                request: mock(() => Promise.resolve({ data: 'ok' }))
            };

            const retry = createRetryWrapper(mockBus);

            expect(retry.request).toBeDefined();
            expect(retry.broadcastRequest).toBeDefined();
        });

        it('should retry failed bus requests', async () => {
            let attempts = 0;
            const mockBus = {
                request: mock(() => {
                    attempts++;
                    if (attempts < 2) {
                        const error = new Error('Timeout');
                        error.retryable = true;
                        return Promise.reject(error);
                    }
                    return Promise.resolve({ value: 'success' });
                })
            };

            const retry = createRetryWrapper(mockBus, {
                baseDelay: 10,
                shouldRetry: (e) => e.retryable
            });

            const result = await retry.request('peer-1', 'getData');

            expect(result.value).toBe('success');
            expect(mockBus.request).toHaveBeenCalledTimes(2);
        });
    });
});
