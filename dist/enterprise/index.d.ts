/**
 * @fileoverview Enterprise features for CrossBus.
 * Barrel export for all enterprise modules.
 * @module enterprise
 */
export { Tracer, Span, tracingPlugin, globalTracer } from './tracing.js';
export { Metrics, globalMetrics } from './metrics.js';
export { BackpressureController } from './backpressure.js';
export { MessageVersioning, globalVersioning } from './versioning.js';
