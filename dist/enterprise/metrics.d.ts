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
    /**
     * Creates a new metrics collector.
     * @param {Object} [options={}] - Options
     * @param {string} [options.prefix='crossbus'] - Metric name prefix
     */
    constructor(options?: {
        prefix?: string | undefined;
    });
    /**
     * Increments a counter.
     * @param {string} name - Counter name
     * @param {number} [value=1] - Increment value
     * @param {Object} [labels={}] - Labels
     */
    increment(name: string, value?: number, labels?: any): void;
    /**
     * Gets a counter value.
     * @param {string} name - Counter name
     * @param {Object} [labels={}] - Labels
     * @returns {number}
     */
    getCounter(name: string, labels?: any): number;
    /**
     * Records a histogram observation.
     * @param {string} name - Histogram name
     * @param {number} value - Value to record
     * @param {Object} [labels={}] - Labels
     */
    observe(name: string, value: number, labels?: any): void;
    /**
     * Gets histogram data.
     * @param {string} name - Histogram name
     * @param {Object} [labels={}] - Labels
     */
    getHistogram(name: string, labels?: any): {
        buckets: {
            le: number;
            count: number;
        }[];
        sum: number;
        count: number;
    };
    /**
     * Sets a gauge value.
     * @param {string} name - Gauge name
     * @param {number} value - Value
     * @param {Object} [labels={}] - Labels
     */
    set(name: string, value: number, labels?: any): void;
    /**
     * Gets a gauge value.
     * @param {string} name - Gauge name
     * @param {Object} [labels={}] - Labels
     * @returns {number}
     */
    getGauge(name: string, labels?: any): number;
    /**
     * Subscribes to metric events.
     * @param {'metric'} event - Event type
     * @param {(event: MetricEvent) => void} callback - Callback
     * @returns {() => void} Unsubscribe function
     */
    on(event: "metric", callback: (event: MetricEvent) => void): () => void;
    /**
     * Outbound hook for CrossBus.
     * Tracks messages sent and request starts.
     */
    get outboundHook(): (payload: any, context: any) => any;
    /**
     * Inbound hook for CrossBus.
     * Tracks messages received and response latency.
     */
    get inboundHook(): (payload: any, context: any) => any;
    /**
     * Exports all metrics in Prometheus text format.
     * @returns {string}
     */
    toPrometheus(): string;
    /**
     * Exports all metrics as JSON.
     * @returns {Object}
     */
    toJSON(): any;
    /**
     * Resets all metrics.
     */
    reset(): void;
    #private;
}
/**
 * Default global metrics instance.
 */
export const globalMetrics: Metrics;
export type MetricEvent = {
    /**
     * - Metric name
     */
    name: string;
    /**
     * - 'counter' | 'histogram' | 'gauge'
     */
    type: string;
    /**
     * - Metric value
     */
    value: number;
    /**
     * - Metric labels
     */
    labels?: any;
    /**
     * - Unix timestamp in ms
     */
    timestamp: number;
};
export type HistogramBucket = {
    /**
     * - Less than or equal boundary
     */
    le: number;
    /**
     * - Count in bucket
     */
    count: number;
};
