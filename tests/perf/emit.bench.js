/**
 * @fileoverview Performance benchmarks for signal() operations.
 * Measures throughput and latency of signal broadcasting.
 */

import { CrossBus } from '../../src/index.js';

// Benchmark utilities
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

async function benchmarkAsync(name, fn, iterations = 1000) {
    // Warmup
    for (let i = 0; i < Math.min(100, iterations / 10); i++) {
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

    return { name, iterations, totalMs, opsPerSec, latencyUs };
}

function printResult(result) {
    console.log(`  ${result.name}:`);
    console.log(`    ${formatNumber(result.opsPerSec)} ops/sec`);
    console.log(`    ${result.latencyUs.toFixed(3)} μs/op`);
}

// Setup
function createMockPeer(id) {
    return {
        messages: [],
        send(msg) {
            this.messages.push(msg);
        }
    };
}

function setupHub(peerCount) {
    const hub = new CrossBus({ isHub: true, peerId: 'hub' });
    const peers = [];

    for (let i = 0; i < peerCount; i++) {
        const peer = createMockPeer(`peer-${i}`);
        peers.push(peer);
        hub.addPeer(`peer-${i}`, (msg) => peer.send(msg));
    }

    return { hub, peers };
}

// Main benchmarks
async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('CrossBus signal() Performance Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. Signal to 1 peer
    {
        const { hub } = setupHub(1);
        const result = benchmark('signal.single_peer', () => {
            hub.signal('test', { value: 42 });
        }, 50000);
        printResult(result);
        results['signal.single_peer'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 2. Signal to 10 peers
    {
        const { hub } = setupHub(10);
        const result = benchmark('signal.10_peers', () => {
            hub.signal('test', { value: 42 });
        }, 20000);
        printResult(result);
        results['signal.10_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 3. Signal to 100 peers
    {
        const { hub } = setupHub(100);
        const result = benchmark('signal.100_peers', () => {
            hub.signal('test', { value: 42 });
        }, 5000);
        printResult(result);
        results['signal.100_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 4. Signal with exclude list
    {
        const { hub } = setupHub(10);
        const result = benchmark('signal.with_exclude', () => {
            hub.signal('test', { value: 42 }, { exclude: ['peer-0', 'peer-1', 'peer-2'] });
        }, 20000);
        printResult(result);
        results['signal.with_exclude'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 5. Large payload (10KB)
    {
        const { hub } = setupHub(2);
        const largePayload = { data: 'x'.repeat(10 * 1024) };
        const result = benchmark('signal.10kb_payload', () => {
            hub.signal('test', largePayload);
        }, 10000);
        printResult(result);
        results['signal.10kb_payload'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 6. Large payload (100KB)
    {
        const { hub } = setupHub(2);
        const hugePayload = { data: 'x'.repeat(100 * 1024) };
        const result = benchmark('signal.100kb_payload', () => {
            hub.signal('test', hugePayload);
        }, 2000);
        printResult(result);
        results['signal.100kb_payload'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

// Run
runBenchmarks().catch(console.error);
