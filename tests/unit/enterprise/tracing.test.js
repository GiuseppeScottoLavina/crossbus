/**
 * @fileoverview Tests for enterprise tracing module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Tracer, Span, tracingPlugin, globalTracer } from '../../../src/enterprise/tracing.js';

describe('Tracer', () => {
    let tracer;

    beforeEach(() => {
        tracer = new Tracer('test-service');
    });

    afterEach(() => {
        tracer.clear();
    });

    describe('constructor', () => {
        it('should create tracer with default options', () => {
            const t = new Tracer();
            expect(t).toBeInstanceOf(Tracer);
        });

        it('should accept custom service name', () => {
            const t = new Tracer('my-service');
            const exported = t.exportTraces();
            expect(exported.serviceName).toBe('my-service');
        });

        it('should accept options', () => {
            const t = new Tracer('svc', { maxSpans: 10, sampled: false });
            expect(t).toBeInstanceOf(Tracer);
        });
    });

    describe('startSpan()', () => {
        it('should create a new span', () => {
            const span = tracer.startSpan('test-span');
            expect(span).toBeInstanceOf(Span);
            expect(span.name).toBe('test-span');
        });

        it('should generate unique trace and span IDs', () => {
            const span1 = tracer.startSpan('span-1');
            const span2 = tracer.startSpan('span-2');
            expect(span1.context.traceId).not.toBe(span2.context.traceId);
            expect(span1.context.spanId).not.toBe(span2.context.spanId);
        });

        it('should create child span from parent', () => {
            const parent = tracer.startSpan('parent');
            const child = tracer.startSpan('child', { parent });
            expect(child.context.traceId).toBe(parent.context.traceId);
            expect(child.context.parentSpanId).toBe(parent.context.spanId);
        });

        it('should accept initial attributes', () => {
            const span = tracer.startSpan('span', { attributes: { key: 'value' } });
            const json = span.toJSON();
            expect(json.attributes.key).toBe('value');
        });
    });

    describe('startSpanFromTraceparent()', () => {
        it('should parse valid traceparent header', () => {
            const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
            const span = tracer.startSpanFromTraceparent('child', traceparent);
            expect(span.context.traceId).toBe('0123456789abcdef0123456789abcdef');
            expect(span.context.parentSpanId).toBe('0123456789abcdef');
        });

        it('should create new trace for invalid traceparent', () => {
            const span = tracer.startSpanFromTraceparent('span', 'invalid');
            expect(span.context.traceId).toHaveLength(32);
            expect(span.context.parentSpanId).toBeUndefined();
        });
    });

    describe('parseTraceparent()', () => {
        it('should return null for invalid input', () => {
            expect(tracer.parseTraceparent(null)).toBeNull();
            expect(tracer.parseTraceparent('')).toBeNull();
            expect(tracer.parseTraceparent('invalid')).toBeNull();
            expect(tracer.parseTraceparent('01-abc-def-01')).toBeNull();
        });

        it('should parse valid traceparent', () => {
            const ctx = tracer.parseTraceparent('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
            expect(ctx.traceId).toBe('0123456789abcdef0123456789abcdef');
            expect(ctx.spanId).toBe('0123456789abcdef');
            expect(ctx.traceFlags).toBe(1);
        });
    });

    describe('getTrace()', () => {
        it('should return spans for a trace', () => {
            const span = tracer.startSpan('test');
            const spans = tracer.getTrace(span.context.traceId);
            expect(spans).toContain(span);
        });

        it('should return empty array for unknown trace', () => {
            expect(tracer.getTrace('unknown')).toEqual([]);
        });
    });

    describe('exportTraces()', () => {
        it('should export completed spans', () => {
            const span = tracer.startSpan('test');
            span.end();
            const exported = tracer.exportTraces();
            expect(exported.spanCount).toBe(1);
            expect(exported.spans[0].name).toBe('test');
        });

        it('should export specific trace', () => {
            const span1 = tracer.startSpan('span1');
            const span2 = tracer.startSpan('span2');
            span1.end();
            span2.end();
            const exported = tracer.exportTraces({ traceId: span1.context.traceId });
            expect(exported.spans.length).toBe(1);
        });
    });

    describe('onSpanEnd()', () => {
        it('should call callback when span ends', () => {
            let called = false;
            tracer.onSpanEnd(() => { called = true; });
            const span = tracer.startSpan('test');
            span.end();
            expect(called).toBe(true);
        });

        it('should return unsubscribe function', () => {
            let count = 0;
            const off = tracer.onSpanEnd(() => { count++; });
            tracer.startSpan('test1').end();
            off();
            tracer.startSpan('test2').end();
            expect(count).toBe(1);
        });
    });

    describe('clear()', () => {
        it('should clear all traces', () => {
            tracer.startSpan('test').end();
            tracer.clear();
            expect(tracer.getCompletedSpans()).toHaveLength(0);
        });
    });
});

describe('Span', () => {
    let tracer;

    beforeEach(() => {
        tracer = new Tracer('test');
    });

    describe('setAttribute()', () => {
        it('should set a single attribute', () => {
            const span = tracer.startSpan('test');
            span.setAttribute('key', 'value');
            expect(span.toJSON().attributes.key).toBe('value');
        });

        it('should not modify ended span', () => {
            const span = tracer.startSpan('test');
            span.end();
            span.setAttribute('key', 'value');
            expect(span.toJSON().attributes.key).toBeUndefined();
        });
    });

    describe('setAttributes()', () => {
        it('should set multiple attributes', () => {
            const span = tracer.startSpan('test');
            span.setAttributes({ a: 1, b: 2 });
            const attrs = span.toJSON().attributes;
            expect(attrs.a).toBe(1);
            expect(attrs.b).toBe(2);
        });
    });

    describe('addEvent()', () => {
        it('should add an event', () => {
            const span = tracer.startSpan('test');
            span.addEvent('my-event', { data: 123 });
            const events = span.toJSON().events;
            expect(events).toHaveLength(1);
            expect(events[0].name).toBe('my-event');
            expect(events[0].attributes.data).toBe(123);
        });
    });

    describe('setStatus()', () => {
        it('should set status to ok', () => {
            const span = tracer.startSpan('test');
            span.setStatus('ok');
            expect(span.toJSON().status).toBe('ok');
        });

        it('should set status with message', () => {
            const span = tracer.startSpan('test');
            span.setStatus('error', 'Something failed');
            const json = span.toJSON();
            expect(json.status).toBe('error');
            expect(json.statusMessage).toBe('Something failed');
        });
    });

    describe('recordException()', () => {
        it('should record exception event', () => {
            const span = tracer.startSpan('test');
            span.recordException(new Error('Test error'));
            const json = span.toJSON();
            expect(json.status).toBe('error');
            expect(json.events[0].name).toBe('exception');
            expect(json.events[0].attributes['exception.message']).toBe('Test error');
        });
    });

    describe('end()', () => {
        it('should set end time', () => {
            const span = tracer.startSpan('test');
            expect(span.isEnded).toBe(false);
            span.end();
            expect(span.isEnded).toBe(true);
            expect(span.toJSON().endTime).toBeDefined();
        });

        it('should not end twice', () => {
            const span = tracer.startSpan('test');
            span.end();
            const endTime = span.toJSON().endTime;
            span.end();
            expect(span.toJSON().endTime).toBe(endTime);
        });
    });

    describe('toTraceparent()', () => {
        it('should return W3C traceparent format', () => {
            const span = tracer.startSpan('test');
            const tp = span.toTraceparent();
            expect(tp).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/);
        });
    });

    describe('toJSON()', () => {
        it('should export span data', () => {
            const span = tracer.startSpan('test');
            span.setAttribute('key', 'value');
            span.addEvent('event');
            span.end();
            const json = span.toJSON();
            expect(json.name).toBe('test');
            expect(json.traceId).toHaveLength(32);
            expect(json.spanId).toHaveLength(16);
            expect(json.duration).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('tracingPlugin()', () => {
    it('should create outbound/inbound hooks', () => {
        const tracer = new Tracer('test');
        const plugin = tracingPlugin(tracer);
        expect(typeof plugin.outbound).toBe('function');
        expect(typeof plugin.inbound).toBe('function');
    });

    it('outbound should add _trace to payload', () => {
        const tracer = new Tracer('test');
        const plugin = tracingPlugin(tracer);
        const result = plugin.outbound({ data: 1 }, { type: 'signal', peerId: 'p1' });
        expect(result._trace).toBeDefined();
        expect(result._trace).toMatch(/^00-/);
    });

    it('inbound should remove _trace from payload', () => {
        const tracer = new Tracer('test');
        const plugin = tracingPlugin(tracer);
        const result = plugin.inbound(
            { data: 1, _trace: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01' },
            { type: 'signal', peerId: 'p1' }
        );
        expect(result._trace).toBeUndefined();
        expect(result.data).toBe(1);
    });

    it('inbound should pass through if no _trace', () => {
        const tracer = new Tracer('test');
        const plugin = tracingPlugin(tracer);
        const result = plugin.inbound({ data: 1 }, { type: 'signal', peerId: 'p1' });
        expect(result.data).toBe(1);
    });
});

describe('globalTracer', () => {
    it('should be a Tracer instance', () => {
        expect(globalTracer).toBeInstanceOf(Tracer);
    });
});
