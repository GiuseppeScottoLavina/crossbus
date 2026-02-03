/**
 * @fileoverview Distributed tracing for CrossBus.
 * W3C Trace Context compatible for cross-context message tracing.
 * @module enterprise/tracing
 */

import { uuid } from '../common/utils.js';

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
    /** @type {SpanContext} */
    #context;

    /** @type {string} */
    #name;

    /** @type {number} */
    #startTime;

    /** @type {number|null} */
    #endTime = null;

    /** @type {SpanStatus} */
    #status = 'unset';

    /** @type {string|null} */
    #statusMessage = null;

    /** @type {SpanEvent[]} */
    #events = [];

    /** @type {Object} */
    #attributes = {};

    /** @type {Tracer} */
    #tracer;

    /**
     * @param {Tracer} tracer - Parent tracer
     * @param {string} name - Span name
     * @param {SpanContext} context - Span context
     */
    constructor(tracer, name, context) {
        this.#tracer = tracer;
        this.#name = name;
        this.#context = context;
        this.#startTime = Date.now();
    }

    /** @returns {SpanContext} */
    get context() {
        return this.#context;
    }

    /** @returns {string} */
    get name() {
        return this.#name;
    }

    /** @returns {boolean} */
    get isEnded() {
        return this.#endTime !== null;
    }

    /**
     * Sets a span attribute.
     * @param {string} key - Attribute key
     * @param {string|number|boolean} value - Attribute value
     * @returns {this}
     */
    setAttribute(key, value) {
        if (!this.isEnded) {
            this.#attributes[key] = value;
        }
        return this;
    }

    /**
     * Sets multiple attributes.
     * @param {Object} attributes - Key-value pairs
     * @returns {this}
     */
    setAttributes(attributes) {
        if (!this.isEnded) {
            Object.assign(this.#attributes, attributes);
        }
        return this;
    }

    /**
     * Adds an event to the span.
     * @param {string} name - Event name
     * @param {Object} [attributes] - Event attributes
     * @returns {this}
     */
    addEvent(name, attributes) {
        if (!this.isEnded) {
            this.#events.push({
                name,
                timestamp: Date.now(),
                attributes
            });
        }
        return this;
    }

    /**
     * Sets the span status.
     * @param {SpanStatus} status - Status code
     * @param {string} [message] - Status message (for errors)
     * @returns {this}
     */
    setStatus(status, message) {
        if (!this.isEnded) {
            this.#status = status;
            this.#statusMessage = message ?? null;
        }
        return this;
    }

    /**
     * Records an exception on the span.
     * @param {Error} error - The exception
     * @returns {this}
     */
    recordException(error) {
        this.addEvent('exception', {
            'exception.type': error.name,
            'exception.message': error.message,
            'exception.stacktrace': error.stack
        });
        this.setStatus('error', error.message);
        return this;
    }

    /**
     * Ends the span.
     */
    end() {
        if (!this.isEnded) {
            this.#endTime = Date.now();
            this.#tracer._onSpanEnd(this);
        }
    }

    /**
     * Returns the W3C traceparent header value.
     * @returns {string}
     */
    toTraceparent() {
        const version = '00';
        const flags = this.#context.traceFlags.toString(16).padStart(2, '0');
        return `${version}-${this.#context.traceId}-${this.#context.spanId}-${flags}`;
    }

    /**
     * Exports the span as a JSON object.
     * @returns {Object}
     */
    toJSON() {
        return {
            traceId: this.#context.traceId,
            spanId: this.#context.spanId,
            parentSpanId: this.#context.parentSpanId,
            name: this.#name,
            startTime: this.#startTime,
            endTime: this.#endTime,
            duration: this.#endTime ? this.#endTime - this.#startTime : null,
            status: this.#status,
            statusMessage: this.#statusMessage,
            attributes: { ...this.#attributes },
            events: [...this.#events]
        };
    }
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
    /** @type {string} */
    #serviceName;

    /** @type {Map<string, Span[]>} Traces by traceId */
    #traces = new Map();

    /** @type {Span[]} All completed spans */
    #completedSpans = [];

    /** @type {number} Max completed spans to keep */
    #maxSpans;

    /** @type {boolean} Whether to sample (record) traces */
    #sampled;

    /** @type {((span: Span) => void)[]} */
    #spanEndCallbacks = [];

    /**
     * Creates a new tracer.
     * @param {string} [serviceName='crossbus'] - Service name for traces
     * @param {Object} [options={}] - Tracer options
     * @param {number} [options.maxSpans=1000] - Max completed spans to keep
     * @param {boolean} [options.sampled=true] - Whether to record traces
     */
    constructor(serviceName = 'crossbus', options = {}) {
        this.#serviceName = serviceName;
        this.#maxSpans = options.maxSpans ?? 1000;
        this.#sampled = options.sampled ?? true;
    }

    /**
     * Starts a new span.
     * @param {string} name - Span name (e.g., 'user:save', 'widget:init')
     * @param {Object} [options={}] - Span options
     * @param {Span} [options.parent] - Parent span for context propagation
     * @param {Object} [options.attributes] - Initial attributes
     * @returns {Span}
     */
    startSpan(name, options = {}) {
        const parent = options.parent;

        const context = {
            traceId: parent?.context.traceId ?? this.#generateTraceId(),
            spanId: this.#generateSpanId(),
            parentSpanId: parent?.context.spanId,
            traceFlags: this.#sampled ? 1 : 0
        };

        const span = new Span(this, name, context);

        if (options.attributes) {
            span.setAttributes(options.attributes);
        }

        // Add to active traces
        if (!this.#traces.has(context.traceId)) {
            this.#traces.set(context.traceId, []);
        }
        const traceSpans = this.#traces.get(context.traceId);
        if (traceSpans) {
            traceSpans.push(span);
        }

        return span;
    }

    /**
     * Creates a span from a W3C traceparent header.
     * @param {string} name - Span name
     * @param {string} traceparent - W3C traceparent header value
     * @returns {Span}
     */
    startSpanFromTraceparent(name, traceparent) {
        const context = this.parseTraceparent(traceparent);
        if (!context) {
            return this.startSpan(name);
        }

        const span = new Span(this, name, {
            traceId: context.traceId,
            spanId: this.#generateSpanId(),
            parentSpanId: context.spanId,
            traceFlags: context.traceFlags
        });

        if (!this.#traces.has(context.traceId)) {
            this.#traces.set(context.traceId, []);
        }
        const traceSpans = this.#traces.get(context.traceId);
        if (traceSpans) {
            traceSpans.push(span);
        }

        return span;
    }

    /**
     * Parses a W3C traceparent header.
     * @param {string} traceparent - Header value
     * @returns {SpanContext|null}
     */
    parseTraceparent(traceparent) {
        if (!traceparent || typeof traceparent !== 'string') {
            return null;
        }

        const parts = traceparent.split('-');
        if (parts.length !== 4) {
            return null;
        }

        const [version, traceId, spanId, flags] = parts;

        // Validate format
        if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
            return null;
        }

        return {
            traceId,
            spanId,
            traceFlags: parseInt(flags, 16)
        };
    }

    /**
     * Gets all spans for a trace.
     * @param {string} traceId - Trace ID
     * @returns {Span[]}
     */
    getTrace(traceId) {
        return this.#traces.get(traceId) ?? [];
    }

    /**
     * Gets all completed spans.
     * @returns {Span[]}
     */
    getCompletedSpans() {
        return [...this.#completedSpans];
    }

    /**
     * Exports traces in JSON format.
     * @param {Object} [options={}] - Export options
     * @param {string} [options.traceId] - Export specific trace only
     * @returns {Object}
     */
    exportTraces(options = {}) {
        const spans = options.traceId
            ? this.getTrace(options.traceId)
            : this.#completedSpans;

        return {
            serviceName: this.#serviceName,
            exportedAt: new Date().toISOString(),
            spanCount: spans.length,
            spans: spans.map(s => s.toJSON())
        };
    }

    /**
     * Clears all traces.
     */
    clear() {
        this.#traces.clear();
        this.#completedSpans = [];
    }

    /**
     * Registers a callback for when spans end.
     * @param {(span: Span) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onSpanEnd(callback) {
        this.#spanEndCallbacks.push(callback);
        return () => {
            const idx = this.#spanEndCallbacks.indexOf(callback);
            if (idx !== -1) this.#spanEndCallbacks.splice(idx, 1);
        };
    }

    /**
     * Internal: Called when a span ends.
     * @param {Span} span
     */
    _onSpanEnd(span) {
        this.#completedSpans.push(span);

        // Trim if over limit
        if (this.#completedSpans.length > this.#maxSpans) {
            this.#completedSpans.shift();
        }

        // Notify callbacks
        for (const cb of this.#spanEndCallbacks) {
            try {
                cb(span);
            } catch (e) {
                console.error('[Tracer] Span end callback error:', e);
            }
        }
    }

    /**
     * Generates a 32-char hex trace ID.
     * @returns {string}
     */
    #generateTraceId() {
        return uuid().replace(/-/g, '');
    }

    /**
     * Generates a 16-char hex span ID.
     * @returns {string}
     */
    #generateSpanId() {
        return uuid().replace(/-/g, '').slice(0, 16);
    }
}

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
export function tracingPlugin(tracer) {
    return {
        /**
         * Outbound hook: adds traceparent header to messages
         */
        outbound: (payload, context) => {
            const span = tracer.startSpan(`${context.type}:${context.handlerName || 'signal'}`, {
                attributes: {
                    'crossbus.type': context.type,
                    'crossbus.direction': 'outbound',
                    'crossbus.peer': context.peerId
                }
            });

            // Add traceparent to payload metadata
            const tracedPayload = {
                ...payload,
                _trace: span.toTraceparent()
            };

            span.end();
            return tracedPayload;
        },

        /**
         * Inbound hook: extracts traceparent and creates child span
         */
        inbound: (payload, context) => {
            if (payload && payload._trace) {
                const span = tracer.startSpanFromTraceparent(
                    `${context.type}:${context.handlerName || 'signal'}`,
                    payload._trace
                );
                span.setAttributes({
                    'crossbus.type': context.type,
                    'crossbus.direction': 'inbound',
                    'crossbus.peer': context.peerId
                });
                span.end();

                // Remove trace metadata from payload
                const { _trace, ...cleanPayload } = payload;
                return cleanPayload;
            }
            return payload;
        }
    };
}

/**
 * Default global tracer instance.
 */
export const globalTracer = new Tracer('crossbus');
