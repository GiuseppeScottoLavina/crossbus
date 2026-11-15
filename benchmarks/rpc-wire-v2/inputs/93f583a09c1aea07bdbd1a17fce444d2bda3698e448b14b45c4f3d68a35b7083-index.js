/**
 * @fileoverview Enterprise features for CrossBus.
 * Barrel export for all enterprise modules.
 * @module enterprise
 */

// Distributed Tracing
export { Tracer, Span, tracingPlugin, globalTracer } from './tracing.js';

// Metrics & Telemetry
export { Metrics, globalMetrics } from './metrics.js';

// Backpressure / Flow Control
export { BackpressureController } from './backpressure.js';

// Message Versioning
export { MessageVersioning, globalVersioning } from './versioning.js';
