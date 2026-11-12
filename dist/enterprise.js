/*! CrossBus v0.1.3 | Apache-2.0 */
/**
 * @fileoverview Centralized error handling for CrossBus.
 * @module common/errors
 */

/**
 * Error codes for CrossBus.
 * @readonly
 * @enum {string}
 */
const ErrorCode = Object.freeze({
    // Connection errors
    HANDSHAKE_TIMEOUT: 'ERR_HANDSHAKE_TIMEOUT',
    HANDSHAKE_REJECTED: 'ERR_HANDSHAKE_REJECTED',
    ORIGIN_FORBIDDEN: 'ERR_ORIGIN_FORBIDDEN',
    PEER_EXISTS: 'ERR_PEER_EXISTS',
    PEER_NOT_FOUND: 'ERR_PEER_NOT_FOUND',
    PEER_DISCONNECTED: 'ERR_PEER_DISCONNECTED',
    RECONNECT_FAILED: 'ERR_RECONNECT_FAILED',
    UNSUPPORTED: 'ERR_UNSUPPORTED',
    NOT_CONNECTED: 'ERR_NOT_CONNECTED',

    // Message errors
    ACK_TIMEOUT: 'ERR_ACK_TIMEOUT',
    RESPONSE_TIMEOUT: 'ERR_RESPONSE_TIMEOUT',
    QUEUE_FULL: 'ERR_QUEUE_FULL',
    INVALID_MESSAGE: 'ERR_INVALID_MESSAGE',
    VERSION_MISMATCH: 'ERR_VERSION_MISMATCH',
    CLONE_ERROR: 'ERR_CLONE_ERROR',
    TRANSFER_ERROR: 'ERR_TRANSFER_ERROR',
    MESSAGE_TOO_LARGE: 'ERR_MESSAGE_TOO_LARGE',

    // Routing errors
    UNREACHABLE: 'ERR_UNREACHABLE',
    TTL_EXCEEDED: 'ERR_TTL_EXCEEDED',
    NO_ROUTE: 'ERR_NO_ROUTE',

    // Handler errors
    NO_HANDLER: 'ERR_NO_HANDLER',
    HANDLER_ERROR: 'ERR_HANDLER_ERROR',
    HANDLER_TIMEOUT: 'ERR_HANDLER_TIMEOUT',
    HANDLER_EXISTS: 'ERR_HANDLER_EXISTS',
    SEND_FAILED: 'ERR_SEND_FAILED',

    // Channel errors
    CHANNEL_FAILED: 'ERR_CHANNEL_FAILED',
    CHANNEL_CLOSED: 'ERR_CHANNEL_CLOSED',

    // Resource errors
    MAX_PEERS: 'ERR_MAX_PEERS',
    MAX_PENDING: 'ERR_MAX_PENDING',
    DESTROYED: 'ERR_DESTROYED',

    // Circuit Breaker
    CIRCUIT_OPEN: 'ERR_CIRCUIT_OPEN',

    // Security errors
    PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE',
    RATE_LIMITED: 'ERR_RATE_LIMITED',
    UNAUTHORIZED: 'ERR_UNAUTHORIZED',
    INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD'
});

/**
 * Error metadata including default messages, retryability, and AI-friendly suggestions.
 * @type {Object<ErrorCode, {message: string, retryable: boolean, suggestion: string}>}
 */
Object.freeze({
    [ErrorCode.HANDSHAKE_TIMEOUT]: {
        message: 'Handshake timed out',
        retryable: true,
        suggestion: 'Increase timeout or check if target is loaded. Use iframe.onload before connecting.'
    },
    [ErrorCode.HANDSHAKE_REJECTED]: {
        message: 'Handshake rejected by peer',
        retryable: false,
        suggestion: 'Check targetOrigin matches the peer\'s origin. Verify peer allows your origin.'
    },
    [ErrorCode.ORIGIN_FORBIDDEN]: {
        message: 'Origin not in allowed origins list',
        retryable: false,
        suggestion: 'Add your origin to allowedOrigins option or use targetOrigin: "*" for development.'
    },
    [ErrorCode.PEER_EXISTS]: {
        message: 'Peer with this ID already exists',
        retryable: false,
        suggestion: 'Use unique peerId for each context. Try: peerId: `agent-${Date.now()}`'
    },
    [ErrorCode.PEER_NOT_FOUND]: {
        message: 'Peer not found',
        retryable: false,
        suggestion: 'Check if peer is connected using bus.peers. Wait for peer connection before request.'
    },
    [ErrorCode.PEER_DISCONNECTED]: {
        message: 'Peer is disconnected',
        retryable: true,
        suggestion: 'Wait for peer to reconnect. Listen for "peer:join" event before retry.'
    },
    [ErrorCode.RECONNECT_FAILED]: {
        message: 'Max reconnection attempts reached',
        retryable: false,
        suggestion: 'Check network connectivity. Consider increasing maxRetries option.'
    },
    [ErrorCode.UNSUPPORTED]: {
        message: 'Operation not supported by this environment',
        retryable: false,
        suggestion: 'This feature requires a browser environment. Check for feature availability first.'
    },
    [ErrorCode.NOT_CONNECTED]: {
        message: 'Transport is not connected',
        retryable: true,
        suggestion: 'Call addTransport() and wait for connection before sending messages.'
    },
    [ErrorCode.ACK_TIMEOUT]: {
        message: 'ACK not received within timeout',
        retryable: true,
        suggestion: 'Increase ackTimeout option or check peer availability.'
    },
    [ErrorCode.RESPONSE_TIMEOUT]: {
        message: 'Response not received within timeout',
        retryable: true,
        suggestion: 'Increase timeout in request options: { timeout: 10000 }. Check if handler exists on peer.'
    },
    [ErrorCode.QUEUE_FULL]: {
        message: 'Message queue is full',
        retryable: false,
        suggestion: 'Increase maxQueueSize or wait for queue to drain. Consider using batching plugin.'
    },
    [ErrorCode.INVALID_MESSAGE]: {
        message: 'Invalid message format',
        retryable: false,
        suggestion: 'Ensure message data is JSON-serializable. Avoid DOM nodes and functions.'
    },
    [ErrorCode.VERSION_MISMATCH]: {
        message: 'Protocol version mismatch',
        retryable: false,
        suggestion: 'Update CrossBus to same version on both sides.'
    },
    [ErrorCode.CLONE_ERROR]: {
        message: 'Data cannot be cloned (contains functions or DOM nodes)',
        retryable: false,
        suggestion: 'Remove functions, DOM nodes, and circular references from message data.'
    },
    [ErrorCode.TRANSFER_ERROR]: {
        message: 'Failed to transfer object ownership',
        retryable: false,
        suggestion: 'Ensure ArrayBuffers are not detached. Each buffer can only be transferred once.'
    },
    [ErrorCode.MESSAGE_TOO_LARGE]: {
        message: 'Message exceeds maximum size',
        retryable: false,
        suggestion: 'Use streaming for large payloads or increase maxMessageSize option.'
    },
    [ErrorCode.UNREACHABLE]: {
        message: 'Destination peer is unreachable',
        retryable: true,
        suggestion: 'Check if peer is still connected. Use bus.peers to list available peers.'
    },
    [ErrorCode.TTL_EXCEEDED]: {
        message: 'Message TTL exceeded (possible routing loop)',
        retryable: false,
        suggestion: 'Check for circular transport configurations. Increase maxTTL if needed.'
    },
    [ErrorCode.NO_ROUTE]: {
        message: 'No route to destination',
        retryable: false,
        suggestion: 'Add transport connecting to target peer. Set isHub: true on orchestrator.'
    },
    [ErrorCode.NO_HANDLER]: {
        message: 'No handler registered for this request',
        retryable: false,
        suggestion: 'Register handler on target: bus.handle("handlerName", fn). Check handler name spelling.'
    },
    [ErrorCode.HANDLER_ERROR]: {
        message: 'Handler threw an exception',
        retryable: false,
        suggestion: 'Check target peer logs for error. Wrap handler in try/catch.'
    },
    [ErrorCode.HANDLER_TIMEOUT]: {
        message: 'Handler did not respond within timeout',
        retryable: true,
        suggestion: 'Handler is slow. Increase timeout or optimize handler performance.'
    },
    [ErrorCode.HANDLER_EXISTS]: {
        message: 'Handler already registered with this name',
        retryable: false,
        suggestion: 'Use different handler name or call bus.removeHandler() first.'
    },
    [ErrorCode.SEND_FAILED]: {
        message: 'Failed to send message to peer',
        retryable: true,
        suggestion: 'Check transport status. Target window may be closed or blocked.'
    },
    [ErrorCode.CHANNEL_FAILED]: {
        message: 'Failed to create direct channel',
        retryable: true,
        suggestion: 'Check browser support for MessageChannel. Retry after short delay.'
    },
    [ErrorCode.CHANNEL_CLOSED]: {
        message: 'Channel was closed unexpectedly',
        retryable: false,
        suggestion: 'Target context was destroyed. Check if iframe/worker still exists.'
    },
    [ErrorCode.MAX_PEERS]: {
        message: 'Maximum number of peers reached',
        retryable: false,
        suggestion: 'Increase maxPeers option or disconnect unused peers first.'
    },
    [ErrorCode.MAX_PENDING]: {
        message: 'Maximum pending requests reached',
        retryable: false,
        suggestion: 'Wait for pending requests to complete. Increase maxPendingRequests option.'
    },
    [ErrorCode.DESTROYED]: {
        message: 'CrossBus instance has been destroyed',
        retryable: false,
        suggestion: 'Create new CrossBus instance. Do not use bus after calling destroy().'
    },
    [ErrorCode.CIRCUIT_OPEN]: {
        message: 'Circuit breaker is open',
        retryable: false,
        suggestion: 'Too many failures. Wait for circuit to reset or call circuit.reset().'
    },
    [ErrorCode.PAYLOAD_TOO_LARGE]: {
        message: 'Payload exceeds maximum allowed size',
        retryable: false,
        suggestion: 'Reduce payload size or increase maxPayloadSize option. Consider using streaming for large data.'
    },
    [ErrorCode.RATE_LIMITED]: {
        message: 'Request rate limit exceeded',
        retryable: true,
        suggestion: 'Wait before retrying. Consider adding delay or using exponential backoff.'
    },
    [ErrorCode.UNAUTHORIZED]: {
        message: 'Peer is not authorized to call this handler',
        retryable: false,
        suggestion: 'Add peer to handler allowedPeers list or remove peer restrictions.'
    },
    [ErrorCode.INVALID_PAYLOAD]: {
        message: 'Payload validation failed',
        retryable: false,
        suggestion: 'Check payload structure against handler requirements.'
    }
});

/**
 * @fileoverview Utility functions shared across modules.
 * @module common/utils
 */


/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID() when available, falls back to manual generation.
 *
 * @returns {string} UUID v4 string.
 */
function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * @fileoverview Distributed tracing for CrossBus.
 * W3C Trace Context compatible for cross-context message tracing.
 * @module enterprise/tracing
 */


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
class Span {
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
class Tracer {
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
function tracingPlugin(tracer) {
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
const globalTracer = new Tracer('crossbus');

/**
 * @fileoverview Metrics and telemetry for CrossBus.
 * Provides counters, histograms, and event hooks for monitoring.
 * @module enterprise/metrics
 */

/**
 * @typedef {Object} MetricEvent
 * @property {string} name - Metric name
 * @property {string} type - 'counter' | 'histogram' | 'gauge'
 * @property {number} value - Metric value
 * @property {Object} [labels] - Metric labels
 * @property {number} timestamp - Unix timestamp in ms
 */

/**
 * @typedef {Object} HistogramBucket
 * @property {number} le - Less than or equal boundary
 * @property {number} count - Count in bucket
 */

/**
 * Simple histogram implementation for latency tracking.
 */
class Histogram {
    /** @type {number[]} */
    #boundaries;

    /** @type {number[]} */
    #buckets;

    /** @type {number} */
    #sum = 0;

    /** @type {number} */
    #count = 0;

    /**
     * @param {number[]} boundaries - Bucket boundaries (e.g., [0.005, 0.01, 0.025, 0.05, 0.1])
     */
    constructor(boundaries = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
        this.#boundaries = [...boundaries].sort((a, b) => a - b);
        this.#buckets = new Array(this.#boundaries.length + 1).fill(0);
    }

    /**
     * Records a value.
     * @param {number} value - Value to record (in seconds for latency)
     */
    observe(value) {
        this.#sum += value;
        this.#count++;

        // Find bucket
        for (let i = 0; i < this.#boundaries.length; i++) {
            if (value <= this.#boundaries[i]) {
                this.#buckets[i]++;
                return;
            }
        }
        // +Inf bucket
        this.#buckets[this.#buckets.length - 1]++;
    }

    /**
     * Gets histogram data.
     */
    getData() {
        const buckets = this.#boundaries.map((le, i) => ({
            le,
            count: this.#buckets[i]
        }));
        buckets.push({ le: Infinity, count: this.#buckets[this.#buckets.length - 1] });

        return {
            buckets,
            sum: this.#sum,
            count: this.#count
        };
    }

    /**
     * Calculates percentile.
     * @param {number} p - Percentile (0-1)
     */
    percentile(p) {
        if (this.#count === 0) return 0;

        const target = p * this.#count;
        let cumulative = 0;

        for (let i = 0; i < this.#buckets.length; i++) {
            cumulative += this.#buckets[i];
            if (cumulative >= target) {
                return i < this.#boundaries.length ? this.#boundaries[i] : Infinity;
            }
        }
        return Infinity;
    }

    reset() {
        this.#buckets.fill(0);
        this.#sum = 0;
        this.#count = 0;
    }
}

/**
 * Metrics collector for CrossBus.
 *
 * @example
 * const metrics = new Metrics();
 *
 * // Subscribe to metric events
 * metrics.on('metric', (event) => {
 *   console.log(event.name, event.value);
 * });
 *
 * // Use as CrossBus plugin
 * bus.addOutboundHook(metrics.outboundHook);
 * bus.addInboundHook(metrics.inboundHook);
 */
class Metrics {
    /** @type {Map<string, number>} */
    #counters = new Map();

    /** @type {Map<string, Histogram>} */
    #histograms = new Map();

    /** @type {Map<string, number>} */
    #gauges = new Map();

    /** @type {((event: MetricEvent) => void)[]} */
    #listeners = [];

    /** @type {string} */
    #prefix;

    /** @type {Map<string, number>} Request start times for latency tracking */
    #requestStarts = new Map();

    /**
     * Creates a new metrics collector.
     * @param {Object} [options={}] - Options
     * @param {string} [options.prefix='crossbus'] - Metric name prefix
     */
    constructor(options = {}) {
        this.#prefix = options.prefix ?? 'crossbus';

        // Initialize default histograms
        this.#histograms.set('latency', new Histogram());
    }

    // ─────────────────────────────────────────────────────────────────
    // Counter methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Increments a counter.
     * @param {string} name - Counter name
     * @param {number} [value=1] - Increment value
     * @param {Object} [labels={}] - Labels
     */
    increment(name, value = 1, labels = {}) {
        const key = this.#makeKey(name, labels);
        const current = this.#counters.get(key) ?? 0;
        this.#counters.set(key, current + value);

        this.#emit({
            name: `${this.#prefix}_${name}`,
            type: 'counter',
            value: current + value,
            labels,
            timestamp: Date.now()
        });
    }

    /**
     * Gets a counter value.
     * @param {string} name - Counter name
     * @param {Object} [labels={}] - Labels
     * @returns {number}
     */
    getCounter(name, labels = {}) {
        return this.#counters.get(this.#makeKey(name, labels)) ?? 0;
    }

    // ─────────────────────────────────────────────────────────────────
    // Histogram methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Records a histogram observation.
     * @param {string} name - Histogram name
     * @param {number} value - Value to record
     * @param {Object} [labels={}] - Labels
     */
    observe(name, value, labels = {}) {
        const key = this.#makeKey(name, labels);
        if (!this.#histograms.has(key)) {
            this.#histograms.set(key, new Histogram());
        }
        const histogram = this.#histograms.get(key);
        if (histogram) {
            histogram.observe(value);
        }

        this.#emit({
            name: `${this.#prefix}_${name}`,
            type: 'histogram',
            value,
            labels,
            timestamp: Date.now()
        });
    }

    /**
     * Gets histogram data.
     * @param {string} name - Histogram name
     * @param {Object} [labels={}] - Labels
     */
    getHistogram(name, labels = {}) {
        const histogram = this.#histograms.get(this.#makeKey(name, labels));
        return histogram?.getData() ?? { buckets: [], sum: 0, count: 0 };
    }

    // ─────────────────────────────────────────────────────────────────
    // Gauge methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Sets a gauge value.
     * @param {string} name - Gauge name
     * @param {number} value - Value
     * @param {Object} [labels={}] - Labels
     */
    set(name, value, labels = {}) {
        const key = this.#makeKey(name, labels);
        this.#gauges.set(key, value);

        this.#emit({
            name: `${this.#prefix}_${name}`,
            type: 'gauge',
            value,
            labels,
            timestamp: Date.now()
        });
    }

    /**
     * Gets a gauge value.
     * @param {string} name - Gauge name
     * @param {Object} [labels={}] - Labels
     * @returns {number}
     */
    getGauge(name, labels = {}) {
        return this.#gauges.get(this.#makeKey(name, labels)) ?? 0;
    }

    // ─────────────────────────────────────────────────────────────────
    // Event subscription
    // ─────────────────────────────────────────────────────────────────

    /**
     * Subscribes to metric events.
     * @param {'metric'} event - Event type
     * @param {(event: MetricEvent) => void} callback - Callback
     * @returns {() => void} Unsubscribe function
     */
    on(event, callback) {
        if (event === 'metric') {
            this.#listeners.push(callback);
            return () => {
                const idx = this.#listeners.indexOf(callback);
                if (idx !== -1) this.#listeners.splice(idx, 1);
            };
        }
        return () => { };
    }

    // ─────────────────────────────────────────────────────────────────
    // CrossBus hooks
    // ─────────────────────────────────────────────────────────────────

    /**
     * Outbound hook for CrossBus.
     * Tracks messages sent and request starts.
     */
    get outboundHook() {
        return (payload, context) => {
            this.increment('messages_sent_total', 1, { type: context.type });

            // Track request start time
            if (context.type === 'request' && payload?.id) {
                this.#requestStarts.set(payload.id, Date.now());
            }

            return payload;
        };
    }

    /**
     * Inbound hook for CrossBus.
     * Tracks messages received and response latency.
     */
    get inboundHook() {
        return (payload, context) => {
            this.increment('messages_received_total', 1, { type: context.type });

            // Track response latency
            if (context.type === 'response' && payload?.requestId) {
                const startTime = this.#requestStarts.get(payload.requestId);
                if (startTime) {
                    const latencyMs = Date.now() - startTime;
                    this.observe('latency_seconds', latencyMs / 1000);
                    this.#requestStarts.delete(payload.requestId);
                }
            }

            return payload;
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Export
    // ─────────────────────────────────────────────────────────────────

    /**
     * Exports all metrics in Prometheus text format.
     * @returns {string}
     */
    toPrometheus() {
        const lines = [];

        // Counters
        for (const [key, value] of this.#counters) {
            lines.push(`${this.#prefix}_${key} ${value}`);
        }

        // Gauges
        for (const [key, value] of this.#gauges) {
            lines.push(`${this.#prefix}_${key} ${value}`);
        }

        // Histograms
        for (const [key, histogram] of this.#histograms) {
            const data = histogram.getData();
            for (const bucket of data.buckets) {
                const le = bucket.le === Infinity ? '+Inf' : bucket.le;
                lines.push(`${this.#prefix}_${key}_bucket{le="${le}"} ${bucket.count}`);
            }
            lines.push(`${this.#prefix}_${key}_sum ${data.sum}`);
            lines.push(`${this.#prefix}_${key}_count ${data.count}`);
        }

        return lines.join('\n');
    }

    /**
     * Exports all metrics as JSON.
     * @returns {Object}
     */
    toJSON() {
        const counters = {};
        for (const [key, value] of this.#counters) {
            counters[key] = value;
        }

        const gauges = {};
        for (const [key, value] of this.#gauges) {
            gauges[key] = value;
        }

        const histograms = {};
        for (const [key, histogram] of this.#histograms) {
            histograms[key] = histogram.getData();
        }

        return {
            exportedAt: new Date().toISOString(),
            prefix: this.#prefix,
            counters,
            gauges,
            histograms
        };
    }

    /**
     * Resets all metrics.
     */
    reset() {
        this.#counters.clear();
        this.#gauges.clear();
        for (const histogram of this.#histograms.values()) {
            histogram.reset();
        }
        this.#requestStarts.clear();
    }

    // ─────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Creates a unique key from name and labels.
     */
    #makeKey(name, labels) {
        if (Object.keys(labels).length === 0) {
            return name;
        }
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }

    /**
     * Emits a metric event.
     */
    #emit(event) {
        for (const listener of this.#listeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[Metrics] Listener error:', e);
            }
        }
    }
}

/**
 * Default global metrics instance.
 */
const globalMetrics = new Metrics();

/**
 * @fileoverview Backpressure and flow control for CrossBus.
 * Prevents slow receivers from causing memory issues.
 * @module enterprise/backpressure
 */

/**
 * @typedef {'drop-oldest'|'drop-newest'|'reject'|'pause'} BackpressureStrategy
 */

/**
 * @typedef {Object} QueueStats
 * @property {number} size - Current queue size
 * @property {number} maxSize - Maximum queue size
 * @property {number} dropped - Messages dropped
 * @property {number} processed - Messages processed
 * @property {boolean} isPaused - Whether queue is paused
 */

/**
 * Per-peer message queue with backpressure support.
 */
class PeerQueue {
    /** @type {Object[]} */
    #queue = [];

    /** @type {number} */
    #maxSize;

    /** @type {BackpressureStrategy} */
    #strategy;

    /** @type {number} */
    #dropped = 0;

    /** @type {number} */
    #processed = 0;

    /** @type {boolean} */
    #paused = false;

    /** @type {((message: Object) => void)|null} */
    #sendFn = null;

    /** @type {string} */
    // #peerId;

    /**
     * @param {string} peerId - Peer ID
     * @param {Object} options - Queue options
     * @param {number} options.maxSize - Maximum queue size
     * @param {BackpressureStrategy} options.strategy - Backpressure strategy
     */
    constructor(peerId, options) {
        // this.#peerId = peerId;
        this.#maxSize = options.maxSize;
        this.#strategy = options.strategy;
    }

    /**
     * Sets the send function.
     * @param {(message: Object) => void} sendFn
     */
    setSendFn(sendFn) {
        this.#sendFn = sendFn;
    }

    /**
     * Enqueues a message.
     * @param {Object} message - Message to enqueue
     * @returns {{ success: boolean, queued: boolean, dropped: boolean }}
     */
    enqueue(message) {
        // If not paused and queue is empty, send immediately
        if (!this.#paused && this.#queue.length === 0 && this.#sendFn) {
            try {
                this.#sendFn(message);
                this.#processed++;
                return { success: true, queued: false, dropped: false };
            } catch {
                // Send failed, queue the message
            }
        }

        // Check if queue is full
        if (this.#queue.length >= this.#maxSize) {
            return this.#handleBackpressure(message);
        }

        // Add to queue
        this.#queue.push(message);
        return { success: true, queued: true, dropped: false };
    }

    /**
     * Handles backpressure when queue is full.
     */
    #handleBackpressure(message) {
        switch (this.#strategy) {
            case 'drop-oldest':
                this.#queue.shift();
                this.#queue.push(message);
                this.#dropped++;
                return { success: true, queued: true, dropped: true };

            case 'drop-newest':
                this.#dropped++;
                return { success: false, queued: false, dropped: true };

            case 'reject':
                return { success: false, queued: false, dropped: false };

            case 'pause':
                this.#paused = true;
                return { success: false, queued: false, dropped: false };

            default:
                return { success: false, queued: false, dropped: false };
        }
    }

    /**
     * Processes queued messages.
     * @param {number} [count] - Max messages to process (default: all)
     * @returns {number} Number of messages processed
     */
    flush(count) {
        if (!this.#sendFn) return 0;

        const toProcess = count ?? this.#queue.length;
        let processed = 0;

        for (let i = 0; i < toProcess && this.#queue.length > 0; i++) {
            const message = this.#queue.shift();
            try {
                this.#sendFn(message);
                processed++;
                this.#processed++;
            } catch {
                // Put back at front of queue
                this.#queue.unshift(message);
                break;
            }
        }

        return processed;
    }

    /**
     * Resumes a paused queue.
     */
    resume() {
        this.#paused = false;
        this.flush();
    }

    /**
     * Pauses the queue.
     */
    pause() {
        this.#paused = true;
    }

    /**
     * Clears the queue.
     */
    clear() {
        this.#queue = [];
    }

    /**
     * Gets queue statistics.
     * @returns {QueueStats}
     */
    getStats() {
        return {
            size: this.#queue.length,
            maxSize: this.#maxSize,
            dropped: this.#dropped,
            processed: this.#processed,
            isPaused: this.#paused
        };
    }
}

/**
 * Backpressure controller for CrossBus.
 * Manages per-peer message queues with configurable strategies.
 *
 * @example
 * const bp = new BackpressureController({
 *   maxQueueSize: 100,
 *   strategy: 'drop-oldest'
 * });
 *
 * // Wrap peer send functions
 * const wrappedSend = bp.wrap('widget-1', originalSendFn);
 *
 * // Check if peer is slow
 * if (bp.getStats('widget-1').size > 50) {
 *   console.warn('widget-1 is falling behind');
 * }
 */
class BackpressureController {
    /** @type {Map<string, PeerQueue>} */
    #queues = new Map();

    /** @type {number} */
    #defaultMaxSize;

    /** @type {BackpressureStrategy} */
    #defaultStrategy;

    /** @type {((peerId: string, stats: QueueStats) => void)[]} */
    #backpressureListeners = [];

    /** @type {number} */
    #checkInterval;

    /** @type {ReturnType<typeof setInterval>|null} */
    #intervalId = null;

    /**
     * Creates a new backpressure controller.
     * @param {Object} [options={}] - Options
     * @param {number} [options.maxQueueSize=100] - Default max queue size
     * @param {BackpressureStrategy} [options.strategy='drop-oldest'] - Default strategy
     * @param {number} [options.checkIntervalMs=1000] - Interval to check queues
     */
    constructor(options = {}) {
        this.#defaultMaxSize = options.maxQueueSize ?? 100;
        this.#defaultStrategy = options.strategy ?? 'drop-oldest';
        this.#checkInterval = options.checkIntervalMs ?? 1000;
    }

    /**
     * Wraps a peer's send function with backpressure control.
     * @param {string} peerId - Peer ID
     * @param {(message: Object) => void} sendFn - Original send function
     * @param {Object} [options={}] - Per-peer options
     * @param {number} [options.maxQueueSize] - Max queue size for this peer
     * @param {BackpressureStrategy} [options.strategy] - Strategy for this peer
     * @returns {(message: Object) => { success: boolean, queued: boolean, dropped: boolean }}
     */
    wrap(peerId, sendFn, options = {}) {
        const queue = new PeerQueue(peerId, {
            maxSize: options.maxQueueSize ?? this.#defaultMaxSize,
            strategy: options.strategy ?? this.#defaultStrategy
        });
        queue.setSendFn(sendFn);
        this.#queues.set(peerId, queue);

        this.#startMonitoring();

        return (message) => queue.enqueue(message);
    }

    /**
     * Configures backpressure for a specific peer.
     * @param {string} peerId - Peer ID
     * @param {Object} options - Options
     */
    configure(peerId, options) {
        let queue = this.#queues.get(peerId);
        if (!queue) {
            queue = new PeerQueue(peerId, {
                maxSize: options.maxQueueSize ?? this.#defaultMaxSize,
                strategy: options.strategy ?? this.#defaultStrategy
            });
            this.#queues.set(peerId, queue);
        }
    }

    /**
     * Flushes queued messages for a peer.
     * @param {string} peerId - Peer ID
     * @param {number} [count] - Max messages to flush
     * @returns {number} Messages processed
     */
    flush(peerId, count) {
        return this.#queues.get(peerId)?.flush(count) ?? 0;
    }

    /**
     * Flushes all queues.
     * @returns {number} Total messages processed
     */
    flushAll() {
        let total = 0;
        for (const queue of this.#queues.values()) {
            total += queue.flush();
        }
        return total;
    }

    /**
     * Pauses a peer's queue.
     * @param {string} peerId - Peer ID
     */
    pause(peerId) {
        this.#queues.get(peerId)?.pause();
    }

    /**
     * Resumes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    resume(peerId) {
        this.#queues.get(peerId)?.resume();
    }

    /**
     * Gets stats for a peer.
     * @param {string} peerId - Peer ID
     * @returns {QueueStats|null}
     */
    getStats(peerId) {
        return this.#queues.get(peerId)?.getStats() ?? null;
    }

    /**
     * Gets stats for all peers.
     * @returns {Object<string, QueueStats>}
     */
    getAllStats() {
        /** @type {Object<string, QueueStats>} */
        const stats = {};
        for (const [peerId, queue] of this.#queues) {
            stats[peerId] = queue.getStats();
        }
        return stats;
    }

    /**
     * Subscribes to backpressure events.
     * @param {(peerId: string, stats: QueueStats) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onBackpressure(callback) {
        this.#backpressureListeners.push(callback);
        return () => {
            const idx = this.#backpressureListeners.indexOf(callback);
            if (idx !== -1) this.#backpressureListeners.splice(idx, 1);
        };
    }

    /**
     * Removes a peer's queue.
     * @param {string} peerId - Peer ID
     */
    remove(peerId) {
        const queue = this.#queues.get(peerId);
        if (queue) {
            queue.clear();
            this.#queues.delete(peerId);
        }
    }

    /**
     * Clears all queues and stops monitoring.
     */
    destroy() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
        for (const queue of this.#queues.values()) {
            queue.clear();
        }
        this.#queues.clear();
        this.#backpressureListeners = [];
    }

    /**
     * Starts monitoring queues for backpressure.
     */
    #startMonitoring() {
        if (this.#intervalId) return;

        this.#intervalId = setInterval(() => {
            for (const [peerId, queue] of this.#queues) {
                const stats = queue.getStats();
                // Notify if queue is over 50% full or paused
                if (stats.size > stats.maxSize * 0.5 || stats.isPaused) {
                    for (const listener of this.#backpressureListeners) {
                        try {
                            listener(peerId, stats);
                        } catch (e) {
                            console.error('[Backpressure] Listener error:', e);
                        }
                    }
                }
            }
        }, this.#checkInterval);
    }
}

/**
 * @fileoverview Message versioning for CrossBus.
 * Supports schema evolution with migration functions.
 * @module enterprise/versioning
 */

/**
 * @typedef {Object} VersionedMessage
 * @property {number} _v - Message version
 * @property {Object} payload - Message payload
 */

/**
 * @typedef {(oldPayload: Object) => Object} MigrationFn
 */

/**
 * Message versioning system for CrossBus.
 * Handles schema evolution with automatic migrations.
 *
 * @example
 * const versioning = new MessageVersioning();
 *
 * // Register migrations
 * versioning.registerMigration('user:updated', 1, 2, (old) => ({
 *   ...old,
 *   fullName: `${old.firstName} ${old.lastName}`
 * }));
 *
 * // Migrate a message
 * const migrated = versioning.migrate('user:updated', oldPayload, 1, 2);
 */
class MessageVersioning {
    /** @type {Map<string, Map<string, MigrationFn>>} Type -> "from:to" -> migrator */
    #migrations = new Map();

    /** @type {Map<string, number>} Type -> current version */
    #currentVersions = new Map();

    /** @type {number} */
    #defaultVersion;

    /**
     * Creates a new versioning system.
     * @param {Object} [options={}] - Options
     * @param {number} [options.defaultVersion=1] - Default version for new messages
     */
    constructor(options = {}) {
        this.#defaultVersion = options.defaultVersion ?? 1;
    }

    /**
     * Registers a migration from one version to another.
     * @param {string} type - Message type (e.g., 'user:updated')
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @param {MigrationFn} migrateFn - Migration function
     */
    registerMigration(type, fromVersion, toVersion, migrateFn) {
        if (!this.#migrations.has(type)) {
            this.#migrations.set(type, new Map());
        }
        const typeMigrations = this.#migrations.get(type);
        if (typeMigrations) {
            typeMigrations.set(`${fromVersion}:${toVersion}`, migrateFn);
        }
    }

    /**
     * Sets the current version for a message type.
     * @param {string} type - Message type
     * @param {number} version - Current version
     */
    setCurrentVersion(type, version) {
        this.#currentVersions.set(type, version);
    }

    /**
     * Gets the current version for a message type.
     * @param {string} type - Message type
     * @returns {number}
     */
    getCurrentVersion(type) {
        return this.#currentVersions.get(type) ?? this.#defaultVersion;
    }

    /**
     * Migrates a payload from one version to another.
     * @param {string} type - Message type
     * @param {Object} payload - Payload to migrate
     * @param {number} fromVersion - Source version
     * @param {number} toVersion - Target version
     * @returns {Object} Migrated payload
     * @throws {Error} If no migration path exists
     */
    migrate(type, payload, fromVersion, toVersion) {
        if (fromVersion === toVersion) {
            return payload;
        }

        const migrations = this.#migrations.get(type);
        if (!migrations) {
            throw new Error(`No migrations registered for type: ${type}`);
        }

        // Find migration path
        let current = payload;
        let currentVersion = fromVersion;

        while (currentVersion !== toVersion) {
            const nextVersion = currentVersion < toVersion ? currentVersion + 1 : currentVersion - 1;
            const key = `${currentVersion}:${nextVersion}`;
            const migrateFn = migrations.get(key);

            if (!migrateFn) {
                throw new Error(`No migration path from v${currentVersion} to v${nextVersion} for type: ${type}`);
            }

            current = migrateFn(current);
            currentVersion = nextVersion;
        }

        return current;
    }

    /**
     * Checks if a message needs migration.
     * @param {string} type - Message type
     * @param {number} version - Message version
     * @returns {boolean}
     */
    needsMigration(type, version) {
        return version !== this.getCurrentVersion(type);
    }

    /**
     * Creates a versioned message.
     * @param {string} type - Message type
     * @param {Object} payload - Message payload
     * @param {number} [version] - Version (defaults to current)
     * @returns {VersionedMessage}
     */
    createMessage(type, payload, version) {
        return {
            _v: version ?? this.getCurrentVersion(type),
            ...payload
        };
    }

    /**
     * Extracts version from a message.
     * @param {Object} message - Message
     * @returns {number}
     */
    getVersion(message) {
        return message?._v ?? this.#defaultVersion;
    }

    /**
     * Creates a CrossBus hook for automatic version migration.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createInboundHook() {
        return (payload, context) => {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }

            const version = this.getVersion(payload);
            const type = context.handlerName || context.type;
            const currentVersion = this.getCurrentVersion(type);

            if (version !== currentVersion && this.#migrations.has(type)) {
                try {
                    const { _v, ...rest } = payload;
                    const migrated = this.migrate(type, rest, version, currentVersion);
                    return { _v: currentVersion, ...migrated };
                } catch (e) {
                    console.warn(`[Versioning] Migration failed for ${type}: ${e instanceof Error ? e.message : String(e)}`);
                    return payload;
                }
            }

            return payload;
        };
    }

    /**
     * Creates a CrossBus hook for automatic version stamping.
     * @returns {(payload: Object, context: Object) => Object}
     */
    createOutboundHook() {
        return (payload, context) => {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }

            // Don't overwrite existing version
            if (payload._v !== undefined) {
                return payload;
            }

            const type = context.handlerName || context.type;
            const version = this.getCurrentVersion(type);

            return { _v: version, ...payload };
        };
    }

    /**
     * Gets all registered migrations.
     * @returns {Object}
     */
    getMigrations() {
        const result = {};
        for (const [type, migrations] of this.#migrations) {
            result[type] = Array.from(migrations.keys());
        }
        return result;
    }

    /**
     * Clears all migrations.
     */
    clear() {
        this.#migrations.clear();
        this.#currentVersions.clear();
    }
}

/**
 * Default global versioning instance.
 */
const globalVersioning = new MessageVersioning();

export { BackpressureController, MessageVersioning, Metrics, Span, Tracer, globalMetrics, globalTracer, globalVersioning, tracingPlugin };
//# sourceMappingURL=enterprise.js.map
