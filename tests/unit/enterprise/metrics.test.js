/**
 * @fileoverview Tests for enterprise metrics module.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Metrics, globalMetrics } from '../../../src/enterprise/metrics.js';

describe('Metrics', () => {
    let metrics;

    beforeEach(() => {
        metrics = new Metrics();
    });

    describe('constructor', () => {
        it('should create with default prefix', () => {
            const m = new Metrics();
            const json = m.toJSON();
            expect(json.prefix).toBe('crossbus');
        });

        it('should accept custom prefix', () => {
            const m = new Metrics({ prefix: 'myapp' });
            const json = m.toJSON();
            expect(json.prefix).toBe('myapp');
        });
    });

    describe('counters', () => {
        it('should increment counter', () => {
            metrics.increment('requests');
            expect(metrics.getCounter('requests')).toBe(1);
        });

        it('should increment by custom value', () => {
            metrics.increment('requests', 5);
            expect(metrics.getCounter('requests')).toBe(5);
        });

        it('should accumulate increments', () => {
            metrics.increment('requests');
            metrics.increment('requests');
            metrics.increment('requests');
            expect(metrics.getCounter('requests')).toBe(3);
        });

        it('should support labels', () => {
            metrics.increment('requests', 1, { status: '200' });
            metrics.increment('requests', 1, { status: '404' });
            expect(metrics.getCounter('requests', { status: '200' })).toBe(1);
            expect(metrics.getCounter('requests', { status: '404' })).toBe(1);
        });

        it('should return 0 for unknown counter', () => {
            expect(metrics.getCounter('unknown')).toBe(0);
        });
    });

    describe('histograms', () => {
        it('should observe values', () => {
            metrics.observe('latency', 0.1);
            metrics.observe('latency', 0.2);
            const data = metrics.getHistogram('latency');
            expect(data.count).toBe(2);
            expect(data.sum).toBeCloseTo(0.3, 5);
        });

        it('should bucket values correctly', () => {
            metrics.observe('latency', 0.001);
            metrics.observe('latency', 0.01);
            metrics.observe('latency', 0.1);
            const data = metrics.getHistogram('latency');
            expect(data.buckets.length).toBeGreaterThan(0);
        });

        it('should return empty for unknown histogram', () => {
            const data = metrics.getHistogram('unknown');
            expect(data.count).toBe(0);
            expect(data.sum).toBe(0);
        });
    });

    describe('gauges', () => {
        it('should set gauge value', () => {
            metrics.set('queue_depth', 10);
            expect(metrics.getGauge('queue_depth')).toBe(10);
        });

        it('should overwrite gauge value', () => {
            metrics.set('queue_depth', 10);
            metrics.set('queue_depth', 5);
            expect(metrics.getGauge('queue_depth')).toBe(5);
        });

        it('should support labels', () => {
            metrics.set('queue_depth', 10, { peer: 'a' });
            metrics.set('queue_depth', 20, { peer: 'b' });
            expect(metrics.getGauge('queue_depth', { peer: 'a' })).toBe(10);
            expect(metrics.getGauge('queue_depth', { peer: 'b' })).toBe(20);
        });

        it('should return 0 for unknown gauge', () => {
            expect(metrics.getGauge('unknown')).toBe(0);
        });
    });

    describe('on()', () => {
        it('should subscribe to metric events', () => {
            const events = [];
            metrics.on('metric', (e) => events.push(e));
            metrics.increment('test');
            expect(events.length).toBe(1);
            expect(events[0].name).toBe('crossbus_test');
        });

        it('should return unsubscribe function', () => {
            const events = [];
            const off = metrics.on('metric', (e) => events.push(e));
            metrics.increment('test');
            off();
            metrics.increment('test');
            expect(events.length).toBe(1);
        });

        it('should return no-op for unknown event', () => {
            const off = metrics.on('unknown', () => { });
            expect(typeof off).toBe('function');
        });
    });

    describe('hooks', () => {
        it('should have outboundHook', () => {
            expect(typeof metrics.outboundHook).toBe('function');
        });

        it('should have inboundHook', () => {
            expect(typeof metrics.inboundHook).toBe('function');
        });

        it('outboundHook should count messages', () => {
            const hook = metrics.outboundHook;
            hook({ data: 1 }, { type: 'signal' });
            expect(metrics.getCounter('messages_sent_total', { type: 'signal' })).toBe(1);
        });

        it('inboundHook should count messages', () => {
            const hook = metrics.inboundHook;
            hook({ data: 1 }, { type: 'signal' });
            expect(metrics.getCounter('messages_received_total', { type: 'signal' })).toBe(1);
        });

        it('should track request latency', () => {
            const outbound = metrics.outboundHook;
            const inbound = metrics.inboundHook;

            outbound({ id: 'req-1' }, { type: 'request' });
            inbound({ requestId: 'req-1' }, { type: 'response' });

            const data = metrics.getHistogram('latency_seconds');
            expect(data.count).toBe(1);
        });
    });

    describe('toPrometheus()', () => {
        it('should export in prometheus format', () => {
            metrics.increment('requests');
            metrics.set('queue', 5);
            const output = metrics.toPrometheus();
            expect(output).toContain('crossbus_requests 1');
            expect(output).toContain('crossbus_queue 5');
        });
    });

    describe('toJSON()', () => {
        it('should export as JSON', () => {
            metrics.increment('test');
            const json = metrics.toJSON();
            expect(json.prefix).toBe('crossbus');
            expect(json.counters.test).toBe(1);
            expect(json.exportedAt).toBeDefined();
        });
    });

    describe('reset()', () => {
        it('should clear all metrics', () => {
            metrics.increment('test');
            metrics.set('gauge', 10);
            metrics.observe('hist', 0.1);
            metrics.reset();
            expect(metrics.getCounter('test')).toBe(0);
            expect(metrics.getGauge('gauge')).toBe(0);
        });
    });
});

describe('globalMetrics', () => {
    it('should be a Metrics instance', () => {
        expect(globalMetrics).toBeInstanceOf(Metrics);
    });
});
