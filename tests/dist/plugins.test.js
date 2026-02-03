/**
 * @fileoverview Tests for the plugin bundles.
 */

import { describe, it, expect } from 'bun:test';

// Test retry plugin exports
import {
    withRetry,
    getDelay,
    createRetryWrapper,
    RetryStrategies,
    DEFAULT_RETRY_OPTIONS
} from '../../dist/plugins/retry.js';

// Test circuit breaker plugin exports  
import {
    CircuitBreaker,
    CircuitState,
    createPeerCircuitBreaker
} from '../../dist/plugins/circuit-breaker.js';

describe('Retry Plugin Exports', () => {
    it('should export withRetry function', () => {
        expect(typeof withRetry).toBe('function');
    });

    it('should export getDelay function', () => {
        expect(typeof getDelay).toBe('function');
        const delay = getDelay(1);
        expect(delay).toBeGreaterThan(0);
    });

    it('should export createRetryWrapper function', () => {
        expect(typeof createRetryWrapper).toBe('function');
    });

    it('should export RetryStrategies presets', () => {
        expect(RetryStrategies.FAST).toBeDefined();
        expect(RetryStrategies.STANDARD).toBeDefined();
        expect(RetryStrategies.AGGRESSIVE).toBeDefined();
        expect(RetryStrategies.ONCE).toBeDefined();
    });

    it('should export DEFAULT_RETRY_OPTIONS', () => {
        expect(DEFAULT_RETRY_OPTIONS).toBeDefined();
        expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(3);
    });

    it('should calculate exponential backoff delay', () => {
        const delay1 = getDelay(1, { baseDelay: 100, jitter: false });
        const delay2 = getDelay(2, { baseDelay: 100, jitter: false });
        const delay3 = getDelay(3, { baseDelay: 100, jitter: false });

        expect(delay2).toBeGreaterThan(delay1);
        expect(delay3).toBeGreaterThan(delay2);
    });

    it('should execute withRetry successfully', async () => {
        // Verify withRetry is callable and works for success case
        // Full retry logic is tested in unit tests
        const result = await withRetry(async () => 'success');
        expect(result).toBe('success');
    });
});

describe('Circuit Breaker Plugin Exports', () => {
    it('should export CircuitBreaker class', () => {
        expect(CircuitBreaker).toBeDefined();
        expect(typeof CircuitBreaker).toBe('function');
    });

    it('should export CircuitState enum', () => {
        expect(CircuitState.CLOSED).toBe('closed');
        expect(CircuitState.OPEN).toBe('open');
        expect(CircuitState.HALF_OPEN).toBe('half_open');
    });

    it('should export createPeerCircuitBreaker function', () => {
        expect(typeof createPeerCircuitBreaker).toBe('function');
    });

    it('should create circuit breaker instance', () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3 });
        expect(breaker.state).toBe('closed');
    });

    it('should execute successful operations', async () => {
        const breaker = new CircuitBreaker();
        const result = await breaker.execute(() => Promise.resolve('ok'));
        expect(result).toBe('ok');
    });

    it('should track failures and open circuit', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 2 });

        // Fail twice
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { }
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { }

        expect(breaker.state).toBe('open');
    });

    it('should reject when circuit is open', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1 });

        // Trip the circuit
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { }

        // Should reject immediately
        await expect(breaker.execute(() => Promise.resolve('ok')))
            .rejects.toThrow();
    });

    it('should allow manual reset', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 1 });

        // Trip the circuit
        try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch { }
        expect(breaker.state).toBe('open');

        // Reset
        breaker.reset();
        expect(breaker.state).toBe('closed');
    });
});
