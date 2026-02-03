/**
 * @fileoverview Comparative Benchmarks - CrossBus vs Competitors
 * 
 * Tests REAL performance of:
 * - CrossBus EventEmitter
 * - EventEmitter3 (popular alternative)
 * - mitt (minimalist)
 * - nanoevents (tiny footprint)
 * 
 * All tests use identical methodology for fair comparison.
 */

import { EventEmitter as CrossBusEmitter } from '../../src/core/event-emitter.js';
import EventEmitter3 from 'eventemitter3';
import mitt from 'mitt';
import { createNanoEvents } from 'nanoevents';

// ============================================================================
// Utilities
// ============================================================================

function formatNumber(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    return n.toFixed(2);
}

function benchmark(name, fn, iterations = 1_000_000) {
    // Warmup
    for (let i = 0; i < 10000; i++) fn();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;

    const opsPerSec = (iterations / elapsed) * 1000;

    return {
        name,
        iterations,
        totalMs: elapsed.toFixed(2),
        opsPerSec: formatNumber(opsPerSec),
        opsPerSecRaw: opsPerSec
    };
}

// ============================================================================
// Test Setup
// ============================================================================

let counter = 0;
const handler = () => { counter++; };
const payload = { x: 1, y: 2, z: 3 };

// CrossBus
const crossBus = new CrossBusEmitter();
crossBus.on('test', handler);

// EventEmitter3
const ee3 = new EventEmitter3();
ee3.on('test', handler);

// mitt
const mittEmitter = mitt();
mittEmitter.on('test', handler);

// nanoevents
const nano = createNanoEvents();
nano.on('test', handler);

// ============================================================================
// Benchmarks
// ============================================================================

console.log('═══════════════════════════════════════════════════════════════════');
console.log('        COMPARATIVE BENCHMARK: CrossBus vs Competitors            ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('Libraries tested:');
console.log('  - CrossBus EventEmitter (our implementation)');
console.log('  - EventEmitter3 v5.0.4 (popular alternative)');
console.log('  - mitt v3.0.1 (minimalist, 200 bytes)');
console.log('  - nanoevents v9.1.0 (tiny footprint)');
console.log('');
console.log('Methodology: 10,000 warmup, 1M iterations, sync emit');
console.log('');

const results = [];

// Test 1: Emit with 1 listener
console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│ Test 1: emit() with 1 listener                                  │');
console.log('└─────────────────────────────────────────────────────────────────┘');

results.push({
    test: 'emit (1 listener)',
    crossBus: benchmark('CrossBus emitSync', () => crossBus.emitSync('test', payload)),
    ee3: benchmark('EventEmitter3', () => ee3.emit('test', payload)),
    mitt: benchmark('mitt', () => mittEmitter.emit('test', payload)),
    nano: benchmark('nanoevents', () => nano.emit('test', payload))
});

console.log(`  CrossBus emitSync: ${results[0].crossBus.opsPerSec} ops/sec`);
console.log(`  EventEmitter3:      ${results[0].ee3.opsPerSec} ops/sec`);
console.log(`  mitt:               ${results[0].mitt.opsPerSec} ops/sec`);
console.log(`  nanoevents:         ${results[0].nano.opsPerSec} ops/sec`);
console.log('');

// Test 2: Emit with 10 listeners
console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│ Test 2: emit() with 10 listeners                                │');
console.log('└─────────────────────────────────────────────────────────────────┘');

// Add more listeners
for (let i = 0; i < 9; i++) {
    crossBus.on('test10', handler);
    ee3.on('test10', handler);
    mittEmitter.on('test10', handler);
    nano.on('test10', handler);
}

results.push({
    test: 'emit (10 listeners)',
    crossBus: benchmark('CrossBus emitSync', () => crossBus.emitSync('test10', payload), 500_000),
    ee3: benchmark('EventEmitter3', () => ee3.emit('test10', payload), 500_000),
    mitt: benchmark('mitt', () => mittEmitter.emit('test10', payload), 500_000),
    nano: benchmark('nanoevents', () => nano.emit('test10', payload), 500_000)
});

console.log(`  CrossBus emitSync: ${results[1].crossBus.opsPerSec} ops/sec`);
console.log(`  EventEmitter3:      ${results[1].ee3.opsPerSec} ops/sec`);
console.log(`  mitt:               ${results[1].mitt.opsPerSec} ops/sec`);
console.log(`  nanoevents:         ${results[1].nano.opsPerSec} ops/sec`);
console.log('');

// Test 3: Add/Remove listeners
console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│ Test 3: on() + off() (subscribe/unsubscribe cycle)              │');
console.log('└─────────────────────────────────────────────────────────────────┘');

const tempHandler = () => { };

results.push({
    test: 'on + off cycle',
    crossBus: benchmark('CrossBus', () => {
        const sub = crossBus.on('temp', tempHandler);
        sub.unsubscribe();
    }, 500_000),
    ee3: benchmark('EventEmitter3', () => {
        ee3.on('temp', tempHandler);
        ee3.off('temp', tempHandler);
    }, 500_000),
    mitt: benchmark('mitt', () => {
        mittEmitter.on('temp', tempHandler);
        mittEmitter.off('temp', tempHandler);
    }, 500_000),
    nano: benchmark('nanoevents', () => {
        const unbind = nano.on('temp', tempHandler);
        unbind();
    }, 500_000)
});

console.log(`  CrossBus:     ${results[2].crossBus.opsPerSec} ops/sec`);
console.log(`  EventEmitter3: ${results[2].ee3.opsPerSec} ops/sec`);
console.log(`  mitt:          ${results[2].mitt.opsPerSec} ops/sec`);
console.log(`  nanoevents:    ${results[2].nano.opsPerSec} ops/sec`);
console.log('');

// Test 4: Emit with large payload
console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│ Test 4: emit() with 10KB payload                                │');
console.log('└─────────────────────────────────────────────────────────────────┘');

const largePayload = { data: 'x'.repeat(10000), meta: { size: 10000 } };

results.push({
    test: 'emit (10KB payload)',
    crossBus: benchmark('CrossBus emitSync', () => crossBus.emitSync('test', largePayload), 100_000),
    ee3: benchmark('EventEmitter3', () => ee3.emit('test', largePayload), 100_000),
    mitt: benchmark('mitt', () => mittEmitter.emit('test', largePayload), 100_000),
    nano: benchmark('nanoevents', () => nano.emit('test', largePayload), 100_000)
});

console.log(`  CrossBus emitSync: ${results[3].crossBus.opsPerSec} ops/sec`);
console.log(`  EventEmitter3:      ${results[3].ee3.opsPerSec} ops/sec`);
console.log(`  mitt:               ${results[3].mitt.opsPerSec} ops/sec`);
console.log(`  nanoevents:         ${results[3].nano.opsPerSec} ops/sec`);
console.log('');

// ============================================================================
// Summary Table
// ============================================================================

console.log('═══════════════════════════════════════════════════════════════════');
console.log('                           SUMMARY                                  ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('| Test                | CrossBus   | EE3         | mitt        | nanoevents  |');
console.log('|---------------------|-------------|-------------|-------------|-------------|');

for (const r of results) {
    const sb = r.crossBus.opsPerSec.padEnd(11);
    const e3 = r.ee3.opsPerSec.padEnd(11);
    const mt = r.mitt.opsPerSec.padEnd(11);
    const ne = r.nano.opsPerSec.padEnd(11);
    console.log(`| ${r.test.padEnd(19)} | ${sb} | ${e3} | ${mt} | ${ne} |`);
}

console.log('');

// Calculate winner per test
console.log('Winners per test:');
for (const r of results) {
    const all = [
        { name: 'CrossBus', ops: r.crossBus.opsPerSecRaw },
        { name: 'EE3', ops: r.ee3.opsPerSecRaw },
        { name: 'mitt', ops: r.mitt.opsPerSecRaw },
        { name: 'nanoevents', ops: r.nano.opsPerSecRaw }
    ].sort((a, b) => b.ops - a.ops);

    const winner = all[0];
    const ratio = (winner.ops / all[1].ops).toFixed(2);
    console.log(`  ${r.test}: ${winner.name} (${ratio}x faster than #2)`);
}

console.log('');

// Save results
const fs = await import('fs');
fs.writeFileSync('benchmarks/comparison-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    runtime: `Bun ${Bun.version}`,
    libraries: {
        crossbus: 'local',
        eventemitter3: '5.0.4',
        mitt: '3.0.1',
        nanoevents: '9.1.0'
    },
    results
}, null, 2));

console.log('Results saved to benchmarks/comparison-results.json');
