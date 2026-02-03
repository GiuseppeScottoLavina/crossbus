/**
 * Creates a CrossBus plugin that automatically traces messages.
 *
 * @param {Tracer} tracer - Tracer instance
 * @returns {Object} Plugin with inbound/outbound hooks
 *
 * @example
 * const tracer = new Tracer('my-app');
 * const unhook = bus.addOutboundHook(tracingPlugin(tracer).outbound);
 */
export function tracingPlugin(tracer: Tracer): any;
/**
 * @typedef {Object} SpanContext
 * @property {string} traceId - 32-char hex trace ID
 * @property {string} spanId - 16-char hex span ID
 * @property {string} [parentSpanId] - Parent span ID
 * @property {number} traceFlags - Trace flags (1 = sampled)
 */
/**
 * @typedef {Object} SpanEvent
 * @property {string} name - Event name
 * @property {number} timestamp - Unix timestamp in ms
 * @property {Object} [attributes] - Event attributes
 */
/**
 * @typedef {'unset'|'ok'|'error'} SpanStatus
 */
/**
 * Represents a single span in a distributed trace.
 */
export class Span {
    /**
     * @param {Tracer} tracer - Parent tracer
     * @param {string} name - Span name
     * @param {SpanContext} context - Span context
     */
    constructor(tracer: Tracer, name: string, context: SpanContext);
    /** @returns {SpanContext} */
    get context(): SpanContext;
    /** @returns {string} */
    get name(): string;
    /** @returns {boolean} */
    get isEnded(): boolean;
    /**
     * Sets a span attribute.
     * @param {string} key - Attribute key
     * @param {string|number|boolean} value - Attribute value
     * @returns {this}
     */
    setAttribute(key: string, value: string | number | boolean): this;
    /**
     * Sets multiple attributes.
     * @param {Object} attributes - Key-value pairs
     * @returns {this}
     */
    setAttributes(attributes: any): this;
    /**
     * Adds an event to the span.
     * @param {string} name - Event name
     * @param {Object} [attributes] - Event attributes
     * @returns {this}
     */
    addEvent(name: string, attributes?: any): this;
    /**
     * Sets the span status.
     * @param {SpanStatus} status - Status code
     * @param {string} [message] - Status message (for errors)
     * @returns {this}
     */
    setStatus(status: SpanStatus, message?: string): this;
    /**
     * Records an exception on the span.
     * @param {Error} error - The exception
     * @returns {this}
     */
    recordException(error: Error): this;
    /**
     * Ends the span.
     */
    end(): void;
    /**
     * Returns the W3C traceparent header value.
     * @returns {string}
     */
    toTraceparent(): string;
    /**
     * Exports the span as a JSON object.
     * @returns {Object}
     */
    toJSON(): any;
    #private;
}
/**
 * Distributed tracer for CrossBus.
 *
 * @example
 * const tracer = new Tracer('my-service');
 *
 * const span = tracer.startSpan('user:save');
 * span.setAttribute('user.id', 123);
 * span.addEvent('validated');
 *
 * try {
 *   await saveUser();
 *   span.setStatus('ok');
 * } catch (e) {
 *   span.recordException(e);
 * } finally {
 *   span.end();
 * }
 */
export class Tracer {
    /**
     * Creates a new tracer.
     * @param {string} [serviceName='crossbus'] - Service name for traces
     * @param {Object} [options={}] - Tracer options
     * @param {number} [options.maxSpans=1000] - Max completed spans to keep
     * @param {boolean} [options.sampled=true] - Whether to record traces
     */
    constructor(serviceName?: string, options?: {
        maxSpans?: number | undefined;
        sampled?: boolean | undefined;
    });
    /**
     * Starts a new span.
     * @param {string} name - Span name (e.g., 'user:save', 'widget:init')
     * @param {Object} [options={}] - Span options
     * @param {Span} [options.parent] - Parent span for context propagation
     * @param {Object} [options.attributes] - Initial attributes
     * @returns {Span}
     */
    startSpan(name: string, options?: {
        parent?: Span | undefined;
        attributes?: any;
    }): Span;
    /**
     * Creates a span from a W3C traceparent header.
     * @param {string} name - Span name
     * @param {string} traceparent - W3C traceparent header value
     * @returns {Span}
     */
    startSpanFromTraceparent(name: string, traceparent: string): Span;
    /**
     * Parses a W3C traceparent header.
     * @param {string} traceparent - Header value
     * @returns {SpanContext|null}
     */
    parseTraceparent(traceparent: string): SpanContext | null;
    /**
     * Gets all spans for a trace.
     * @param {string} traceId - Trace ID
     * @returns {Span[]}
     */
    getTrace(traceId: string): Span[];
    /**
     * Gets all completed spans.
     * @returns {Span[]}
     */
    getCompletedSpans(): Span[];
    /**
     * Exports traces in JSON format.
     * @param {Object} [options={}] - Export options
     * @param {string} [options.traceId] - Export specific trace only
     * @returns {Object}
     */
    exportTraces(options?: {
        traceId?: string | undefined;
    }): any;
    /**
     * Clears all traces.
     */
    clear(): void;
    /**
     * Registers a callback for when spans end.
     * @param {(span: Span) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onSpanEnd(callback: (span: Span) => void): () => void;
    /**
     * Internal: Called when a span ends.
     * @param {Span} span
     */
    _onSpanEnd(span: Span): void;
    #private;
}
/**
 * Default global tracer instance.
 */
export const globalTracer: Tracer;
export type SpanContext = {
    /**
     * - 32-char hex trace ID
     */
    traceId: string;
    /**
     * - 16-char hex span ID
     */
    spanId: string;
    /**
     * - Parent span ID
     */
    parentSpanId?: string | undefined;
    /**
     * - Trace flags (1 = sampled)
     */
    traceFlags: number;
};
export type SpanEvent = {
    /**
     * - Event name
     */
    name: string;
    /**
     * - Unix timestamp in ms
     */
    timestamp: number;
    /**
     * - Event attributes
     */
    attributes?: any;
};
export type SpanStatus = "unset" | "ok" | "error";
