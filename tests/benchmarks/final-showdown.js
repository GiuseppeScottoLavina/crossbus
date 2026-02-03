/**
 * Test createFastEmitter vs nanoevents
 */
import { createFastEmitter } from '../../src/core/event-emitter.js';
import { createNanoEvents } from 'nanoevents';

const ITERATIONS = 500000;
const handler = () => { };

function bench(name, fn) {
    for (let i = 0; i < 10000; i++) fn();
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) fn();
    const elapsed = performance.now() - start;
    const ops = (ITERATIONS / elapsed) * 1000;
    console.log(`${name}: ${(ops / 1000000).toFixed(2)}M ops/sec`);
    return ops;
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log('        createFastEmitter vs nanoevents FINAL SHOWDOWN             ');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Create emitters
const crossBus = createFastEmitter();
const nano = createNanoEvents();

console.log('=== on/off cycle ===\n');

const sbOnOff = bench('CrossBus createFastEmitter', () => {
    const off = crossBus.on('test', handler);
    off();
});

const nanoOnOff = bench('nanoevents', () => {
    const off = nano.on('test', handler);
    off();
});

console.log(`\n→ Winner: ${sbOnOff > nanoOnOff ? '🏆 CrossBus' : 'nanoevents'} (${(Math.max(sbOnOff, nanoOnOff) / Math.min(sbOnOff, nanoOnOff)).toFixed(2)}x faster)\n`);

console.log('=== emit (10 listeners) ===\n');

// Setup 10 listeners
const sb10 = createFastEmitter();
const nano10 = createNanoEvents();
for (let i = 0; i < 10; i++) {
    sb10.on('event', handler);
    nano10.on('event', handler);
}

const sbEmit = bench('CrossBus emit (10 listeners)', () => {
    sb10.emit('event', { x: 1 });
});

const nanoEmit = bench('nanoevents emit (10 listeners)', () => {
    nano10.emit('event', { x: 1 });
});

console.log(`\n→ Winner: ${sbEmit > nanoEmit ? '🏆 CrossBus' : 'nanoevents'} (${(Math.max(sbEmit, nanoEmit) / Math.min(sbEmit, nanoEmit)).toFixed(2)}x faster)\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('                         FINAL SCORE                               ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`on/off: CrossBus ${(sbOnOff / 1000000).toFixed(2)}M vs nanoevents ${(nanoOnOff / 1000000).toFixed(2)}M`);
console.log(`emit(10): CrossBus ${(sbEmit / 1000000).toFixed(2)}M vs nanoevents ${(nanoEmit / 1000000).toFixed(2)}M`);
