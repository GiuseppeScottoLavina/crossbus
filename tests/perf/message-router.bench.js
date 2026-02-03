/**
 * @fileoverview Performance benchmarks for MessageRouter operations.
 * Measures routing overhead and peer lookup performance.
 */

import { MessageRouter } from '../../src/router/message-router.js';

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

function setupRouter(peerCount) {
    const router = new MessageRouter();
    for (let i = 0; i < peerCount; i++) {
        router.addPeer(`peer-${i}`, () => { });
    }
    return router;
}

async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('MessageRouter Performance Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. route() to single peer
    {
        const router = setupRouter(10);
        const result = benchmark('route.unicast', () => {
            router.route({ target: 'peer-5', payload: { value: 42 } });
        }, 50000);
        printResult(result);
        results['route.unicast'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 2. broadcast() to 10 peers
    {
        const router = setupRouter(10);
        const result = benchmark('broadcast.10_peers', () => {
            router.broadcast({ value: 42 });
        }, 20000);
        printResult(result);
        results['broadcast.10_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 3. broadcast() to 100 peers
    {
        const router = setupRouter(100);
        const result = benchmark('broadcast.100_peers', () => {
            router.broadcast({ value: 42 });
        }, 5000);
        printResult(result);
        results['broadcast.100_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 4. broadcast() with exclude
    {
        const router = setupRouter(10);
        const exclude = ['peer-0', 'peer-1', 'peer-2'];
        const result = benchmark('broadcast.with_exclude', () => {
            router.broadcast({ value: 42 }, { exclude });
        }, 20000);
        printResult(result);
        results['broadcast.with_exclude'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 5. getPeer() lookup
    {
        const router = setupRouter(100);
        let counter = 0;
        const result = benchmark('getPeer.lookup', () => {
            router.getPeer(`peer-${counter++ % 100}`);
        }, 100000);
        printResult(result);
        results['getPeer.lookup'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 6. getPeerIds() enumeration
    {
        const router = setupRouter(100);
        const result = benchmark('getPeerIds.enumerate', () => {
            router.getPeerIds();
        }, 50000);
        printResult(result);
        results['getPeerIds.enumerate'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 7. addPeer() registration
    {
        const router = new MessageRouter();
        let counter = 0;
        const result = benchmark('addPeer.register', () => {
            router.addPeer(`peer-${counter++}`, () => { });
        }, 20000);
        printResult(result);
        results['addPeer.register'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 8. removePeer() removal
    {
        const router = new MessageRouter();
        for (let i = 0; i < 20000; i++) {
            router.addPeer(`peer-${i}`, () => { });
        }
        let counter = 0;
        const result = benchmark('removePeer.remove', () => {
            router.removePeer(`peer-${counter++}`);
        }, 20000);
        printResult(result);
        results['removePeer.remove'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

runBenchmarks().catch(console.error);
