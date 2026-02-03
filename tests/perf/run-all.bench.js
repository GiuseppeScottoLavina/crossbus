/**
 * @fileoverview All-in-one performance benchmark runner.
 * Runs all performance benchmarks and generates a baseline JSON file.
 */

import { CrossBus } from '../../src/index.js';
import { EventEmitter } from '../../src/core/event-emitter.js';
import { MessageRouter } from '../../src/router/message-router.js';
import { PendingRequests } from '../../src/router/pending-requests.js';
import fs from 'fs';
import path from 'path';

function formatNumber(n) {
    return n.toLocaleString('en-US');
}

function benchmark(name, fn, iterations = 10000) {
    // Warmup
    for (let i = 0; i < Math.min(1000, iterations / 10); i++) {
        fn();
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = performance.now();

    const totalMs = end - start;
    const opsPerSec = Math.round((iterations / totalMs) * 1000);
    const latencyUs = (totalMs / iterations) * 1000;

    return { name, opsPerSec, latencyUs };
}

async function benchmarkAsync(name, fn, iterations = 10000) {
    // Warmup
    for (let i = 0; i < Math.min(1000, iterations / 10); i++) {
        await fn();
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        await fn();
    }
    const end = performance.now();

    const totalMs = end - start;
    const opsPerSec = Math.round((iterations / totalMs) * 1000);
    const latencyUs = (totalMs / iterations) * 1000;

    return { name, opsPerSec, latencyUs };
}

async function runAllBenchmarks() {
    console.log('='.repeat(60));
    console.log('CrossBus Complete Performance Benchmark Suite');
    console.log('='.repeat(60));
    console.log();

    const results = {
        version: '1.0.3',
        timestamp: new Date().toISOString(),
        benchmarks: {}
    };

    // ============ SIGNAL ============
    console.log('📡 SIGNAL BENCHMARKS');
    {
        const { hub } = (() => {
            const hub = new CrossBus({ isHub: true, peerId: 'hub' });
            for (let i = 0; i < 10; i++) hub.addPeer(`peer-${i}`, () => { });
            return { hub };
        })();

        let r = benchmark('signal.10_peers', () => hub.signal('test', { v: 42 }), 20000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['signal.10_peers'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
        hub.destroy();
    }

    // ============ ROUTER ============
    console.log('🧭 ROUTER BENCHMARKS');
    {
        const router = new MessageRouter();
        for (let i = 0; i < 100; i++) router.addPeer(`peer-${i}`, () => { });

        let r = benchmark('route.unicast', () => router.route({ target: 'peer-50', payload: { v: 42 } }), 50000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['route.unicast'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };

        r = benchmark('getPeer.lookup', () => router.getPeer('peer-50'), 100000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['getPeer.lookup'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
    }

    // ============ EVENT EMITTER ============
    console.log('📢 EVENT EMITTER BENCHMARKS');
    {
        const emitter = new EventEmitter();
        emitter.on('test', () => { });

        let r = await benchmarkAsync('emit.1_listener', async () => await emitter.emit('test', { v: 42 }), 50000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['emit.1_listener'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };

        const emitter10 = new EventEmitter();
        for (let i = 0; i < 10; i++) emitter10.on('test', () => { });
        r = await benchmarkAsync('emit.10_listeners', async () => await emitter10.emit('test', { v: 42 }), 20000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['emit.10_listeners'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };

        r = benchmark('on.register', () => emitter.on(`e-${Math.random()}`, () => { }), 50000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['on.register'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
    }

    // ============ PENDING REQUESTS ============
    console.log('⏱️  PENDING REQUESTS BENCHMARKS');
    {
        const pending = new PendingRequests();

        let r = benchmark('pending.create_cancel', () => {
            const { promise, requestId } = pending.create('peer', 'handler', 5000);
            promise.catch(() => { });
            pending.cancel(requestId);
        }, 30000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['pending.create_cancel'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
    }

    // ============ HANDLE ============
    console.log('🔧 HANDLE BENCHMARKS');
    {
        const hub = new CrossBus({ isHub: true, peerId: 'hub' });

        let r = benchmark('handle.register', () => {
            const un = hub.handle(`h-${Math.random()}`, () => ({}));
            un();
        }, 50000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['handle.register'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };

        hub.handle('lookup-target', () => ({}));
        r = benchmark('handle.lookup', () => hub.hasHandler('lookup-target'), 100000);
        console.log(`  ${r.name}: ${formatNumber(r.opsPerSec)} ops/sec`);
        results.benchmarks['handle.lookup'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };

        hub.destroy();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const [key, val] of Object.entries(results.benchmarks)) {
        console.log(`  ${key.padEnd(25)} ${formatNumber(val.ops_sec).padStart(12)} ops/sec`);
    }

    // Save baseline
    const baselinePath = path.join(import.meta.dir, 'baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(results, null, 2));
    console.log(`\n✅ Baseline saved to ${baselinePath}`);

    return results;
}

runAllBenchmarks().catch(console.error);
