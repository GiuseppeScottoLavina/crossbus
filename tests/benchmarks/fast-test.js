/**
 * Test onFast vs on vs nanoevents
 */
import { EventEmitter } from '../../src/core/event-emitter.js';
import { createNanoEvents } from 'nanoevents';

const handler = () => { };
const ITERATIONS = 500000;

function benchmark(name, fn) {
    // Warmup
    for (let i = 0; i < 10000; i++) fn();

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) fn();
    const elapsed = performance.now() - start;

    const opsPerSec = (ITERATIONS / elapsed) * 1000;
    console.log(`${name}: ${(opsPerSec / 1000000).toFixed(2)}M ops/sec`);
    return opsPerSec;
}

console.log('=== on/off cycle comparison ===\n');

// CrossBus onFast
const sb = new EventEmitter();
benchmark('CrossBus onFast+off', () => {
    const off = sb.onFast('test', handler);
    off();
});

// CrossBus on (normal)
const sb2 = new EventEmitter();
benchmark('CrossBus on+unsubscribe', () => {
    const sub = sb2.on('test', handler);
    sub.unsubscribe();
});

// nanoevents
const nano = createNanoEvents();
benchmark('nanoevents on+unbind', () => {
    const unbind = nano.on('test', handler);
    unbind();
});

console.log('\n=== emit with 10 listeners ===\n');

// Setup 10 listeners
const sb10 = new EventEmitter();
const nano10 = createNanoEvents();
for (let i = 0; i < 10; i++) {
    sb10.onFast('event', handler);
    nano10.on('event', handler);
}

benchmark('CrossBus emitSync (10 listeners)', () => {
    sb10.emitSync('event', { x: 1 });
});

benchmark('nanoevents emit (10 listeners)', () => {
    nano10.emit('event', { x: 1 });
});
