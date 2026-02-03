/**
 * @fileoverview Performance benchmarks for request/response operations.
 * Measures request overhead and handle() registration.
 * 
 * Note: Full round-trip benchmarks require E2E tests.
 * These measure the internal overhead only.
 */

import { CrossBus } from '../../src/index.js';
import { PendingRequests } from '../../src/router/pending-requests.js';

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

    return { name, iterations, totalMs, opsPerSec, latencyUs };
}

function printResult(result) {
    console.log(`  ${result.name}:`);
    console.log(`    ${formatNumber(result.opsPerSec)} ops/sec`);
    console.log(`    ${result.latencyUs.toFixed(3)} μs/op`);
}

async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('CrossBus request() Overhead Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. handle() registration
    {
        const hub = new CrossBus({ isHub: true, peerId: 'hub' });

        const result = benchmark('handle.register', () => {
            const unhandle = hub.handle(`handler-${Math.random()}`, () => ({}));
            unhandle();
        }, 50000);
        printResult(result);
        results['handle.register'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 2. hasHandler() lookup
    {
        const hub = new CrossBus({ isHub: true, peerId: 'hub' });
        hub.handle('existing', () => ({}));

        const result = benchmark('handle.lookup', () => {
            hub.hasHandler('existing');
        }, 100000);
        printResult(result);
        results['handle.lookup'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 3. PendingRequests create/cancel
    {
        const pending = new PendingRequests();

        const result = benchmark('pending.create_cancel', () => {
            const { promise, requestId } = pending.create('peer', 'handler', 5000);
            promise.catch(() => { }); // Prevent unhandled rejection
            pending.cancel(requestId);
        }, 50000);
        printResult(result);
        results['pending.create_cancel'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 4. PendingRequests create only (fast path)
    {
        const pending = new PendingRequests();
        const promises = [];

        const result = benchmark('pending.create', () => {
            const { promise } = pending.create('peer', 'handler', 60000);
            promises.push(promise.catch(() => { })); // Collect for cleanup
        }, 30000);
        printResult(result);
        results['pending.create'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };

        pending.cancelAll();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

runBenchmarks().catch(console.error);
