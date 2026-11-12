import { CrossBus, NativeBridgeTransport, MessageChannelTransport, StreamManager, EventEmitter } from 'crossbus';
import { CrossBus as Core } from 'crossbus/core';
import { createNanoEmitter } from 'crossbus/nano';
import { withSchemaValidation } from 'crossbus/plugins/schema-validation';
import { withRetry } from 'crossbus/plugins/retry';
import { CircuitBreaker } from 'crossbus/plugins/circuit-breaker';
import { createConnectedMocks } from 'crossbus/testing';
import { Metrics } from 'crossbus/enterprise';

const bus: CrossBus = new Core({ allowedOrigins: ['channel'] });
bus.addPeer('manual', message => { void message.payload; });
const emitter = new EventEmitter();
emitter.onFast('event', (data: { value: number }) => { data.value.toFixed(); });
const nano = createNanoEmitter();
nano.on('event', (value: number) => value.toFixed());
const native = new NativeBridgeTransport({ callbackName: '__custom__', maxQueueSize: 10 });
const valid = withSchemaValidation({ type: 'string' }, (data: string) => data.toUpperCase());
void [bus, native, valid, withRetry, CircuitBreaker, createConnectedMocks, Metrics];

const compact = new MessageChannelTransport({ wireFormat: 'compact' });
const selected: 'standard' | 'compact' = compact.wireFormat;
new StreamManager(async () => {}).destroy();
void selected;
