/**
 * @fileoverview CrossBus - Cross-context messaging library.
 * Main entry point for the library.
 * @module crossbus
 */

// Core
export { CrossBus } from './core/cross-bus.js';
export { EventEmitter, createFastEmitter } from './core/event-emitter.js';
export { WritableSignalStream, ReadableSignalStream, StreamManager } from './core/stream.js';
export { PresenceManager, createPresence } from './core/presence.js';

// Common
export {
    MessageType,
    HandshakePhase,
    PeerStatus,
    PeerType,
    DeliveryStatus,
    PROTOCOL_MARKER,
    PROTOCOL_VERSION
} from './common/types.js';

export {
    CrossBusError,
    ErrorCode,
    isCrossBusError,
    isRetryable
} from './common/errors.js';

export {
    uuid,
    deferred,
    sleep,
    withTimeout,
    isCloneable,
    detectPeerType,
    timestamp
} from './common/utils.js';

// Transports
export { PostMessageTransport } from './transports/postmessage.js';
export { BroadcastChannelTransport } from './transports/broadcast-channel.js';
export { MessageChannelTransport } from './transports/message-channel.js';
export { SharedWorkerTransport } from './transports/shared-worker.js';
export { ServiceWorkerTransport } from './transports/service-worker.js';
export { NativeBridgeTransport } from './transports/native-bridge.js';
export { WebSocketTransport } from './transports/websocket.js';

// Security
export { OriginValidator, OriginValidatorPresets } from './security/origin-validator.js';
export { Handshake } from './security/handshake.js';

// Router
export { MessageRouter } from './router/message-router.js';
export { PendingRequests } from './router/pending-requests.js';

// Ordering (causal consistency for multi-context sync)
export { VectorClock } from './ordering/vector-clock.js';
export { CausalOrderer } from './ordering/causal-orderer.js';

// NOTE: The following are NOT in main bundle for tree-shaking:
//   import { withRetry } from 'crossbus/plugins/retry';
//   import { CircuitBreaker } from 'crossbus/plugins/circuit-breaker';
//   import { createNanoEmitter } from 'crossbus/nano';
//
// Enterprise features (opt-in, reduces bundle by ~40%):
//   import { Tracer, Metrics, BackpressureController } from 'crossbus/enterprise';
//
// Testing utilities:
//   import { MockTransport, createConnectedMocks } from 'crossbus/testing';
