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
export class Metrics {
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
export const globalMetrics = new Metrics();
