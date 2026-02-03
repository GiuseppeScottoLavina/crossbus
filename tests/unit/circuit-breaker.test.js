/**
 * @fileoverview Tests for Circuit Breaker plugin.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
    CircuitBreaker,
    CircuitState,
    createPeerCircuitBreaker,
    DEFAULT_CIRCUIT_OPTIONS
} from '../../src/plugins/circuit-breaker.js';

describe('Circuit Breaker', () => {
    let breaker;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            failureThreshold: 3,
            successThreshold: 2,
            resetTimeout: 50  // Shorter for faster tests
        });
    });

    describe('Initial state', () => {
        it('should start in CLOSED state', () => {
            expect(breaker.state).toBe(CircuitState.CLOSED);
        });

        it('should have zero failures', () => {
            expect(breaker.failures).toBe(0);
        });

        it('should report isClosed as true', () => {
            expect(breaker.isClosed).toBe(true);
            expect(breaker.isOpen).toBe(false);
        });
    });

    describe('execute() - success path', () => {
        it('should return result on success', async () => {
            const result = await breaker.execute(() => Promise.resolve(42));
            expect(result).toBe(42);
        });

        it('should keep circuit closed on success', async () => {
            await breaker.execute(() => Promise.resolve('ok'));
            expect(breaker.state).toBe(CircuitState.CLOSED);
        });

        it('should reset failure count on success', async () => {
            // Add some failures
            await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });

            expect(breaker.failures).toBe(2);

            // Success resets
            await breaker.execute(() => Promise.resolve('ok'));
            expect(breaker.failures).toBe(0);
        });
    });

    describe('execute() - failure path', () => {
        it('should track failures', async () => {
            await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            expect(breaker.failures).toBe(1);

            await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            expect(breaker.failures).toBe(2);
        });

        it('should open circuit after threshold failures', async () => {
            for (let i = 0; i < 3; i++) {
                await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }

            expect(breaker.state).toBe(CircuitState.OPEN);
            expect(breaker.isOpen).toBe(true);
        });

        it('should fail fast when open', async () => {
            // Trip the circuit
            for (let i = 0; i < 3; i++) {
                await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }

            // Should fail fast without calling fn
            const fn = mock(() => Promise.resolve('should not call'));

            await expect(breaker.execute(fn)).rejects.toThrow();
            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe('Half-open state', () => {
        it('should transition to half-open after resetTimeout', async () => {
            const b = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 20 });

            // Trip the circuit
            for (let i = 0; i < 3; i++) {
                await b.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }
            expect(b.state).toBe(CircuitState.OPEN);

            // Wait for reset timeout (3x to be safe)
            await new Promise(r => setTimeout(r, 60));

            expect(b.state).toBe(CircuitState.HALF_OPEN);
        });

        it('should close circuit after success threshold in half-open', async () => {
            const b = new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, resetTimeout: 20 });

            // Trip the circuit
            for (let i = 0; i < 3; i++) {
                await b.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }

            // Wait for half-open
            await new Promise(r => setTimeout(r, 60));
            expect(b.state).toBe(CircuitState.HALF_OPEN);

            // Two successes should close
            await b.execute(() => Promise.resolve('ok'));
            expect(b.state).toBe(CircuitState.HALF_OPEN);

            await b.execute(() => Promise.resolve('ok'));
            expect(b.state).toBe(CircuitState.CLOSED);
        });

        it('should reopen on failure in half-open', async () => {
            const b = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 20 });

            // Trip the circuit
            for (let i = 0; i < 3; i++) {
                await b.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }

            // Wait for half-open
            await new Promise(r => setTimeout(r, 60));
            expect(b.state).toBe(CircuitState.HALF_OPEN);

            // Failure should reopen
            await b.execute(() => Promise.reject(new Error('still failing'))).catch(() => { });
            expect(b.state).toBe(CircuitState.OPEN);
        });
    });

    describe('reset() and trip()', () => {
        it('should manually reset circuit', async () => {
            // Trip the circuit
            for (let i = 0; i < 3; i++) {
                await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            }
            expect(breaker.isOpen).toBe(true);

            breaker.reset();

            expect(breaker.state).toBe(CircuitState.CLOSED);
            expect(breaker.failures).toBe(0);
        });

        it('should manually trip circuit', () => {
            expect(breaker.state).toBe(CircuitState.CLOSED);

            breaker.trip();

            expect(breaker.state).toBe(CircuitState.OPEN);
        });
    });

    describe('onStateChange callback', () => {
        it('should call callback on state change', async () => {
            const onStateChange = mock();
            const b = new CircuitBreaker({
                failureThreshold: 2,
                onStateChange
            });

            await b.execute(() => Promise.reject(new Error('fail'))).catch(() => { });
            await b.execute(() => Promise.reject(new Error('fail'))).catch(() => { });

            expect(onStateChange).toHaveBeenCalled();
            expect(onStateChange.mock.calls[0][0].from).toBe(CircuitState.CLOSED);
            expect(onStateChange.mock.calls[0][0].to).toBe(CircuitState.OPEN);
        });
    });

    describe('stats', () => {
        it('should track statistics', async () => {
            await breaker.execute(() => Promise.resolve('ok'));
            await breaker.execute(() => Promise.resolve('ok'));
            await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => { });

            const stats = breaker.stats;
            expect(stats.totalRequests).toBe(3);
            expect(stats.totalSuccesses).toBe(2);
            expect(stats.totalFailures).toBe(1);
        });
    });

    describe('createPeerCircuitBreaker()', () => {
        it('should create wrapper for peer requests', () => {
            const mockBus = {
                request: mock(() => Promise.resolve({ data: 'ok' }))
            };

            const { request, breaker } = createPeerCircuitBreaker(mockBus, 'peer-1');

            expect(request).toBeDefined();
            expect(breaker).toBeInstanceOf(CircuitBreaker);
        });

        it('should protect peer with circuit breaker', async () => {
            const mockBus = {
                request: mock(() => Promise.reject(new Error('fail')))
            };

            const { request, breaker } = createPeerCircuitBreaker(mockBus, 'peer-1', {
                failureThreshold: 2
            });

            await request('handler').catch(() => { });
            await request('handler').catch(() => { });

            expect(breaker.isOpen).toBe(true);

            // Should fail fast now
            await expect(request('handler')).rejects.toThrow();
            expect(mockBus.request).toHaveBeenCalledTimes(2); // Not 3
        });
    });
});
