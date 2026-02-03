/**
 * @fileoverview Performance benchmarks for broadcastRequest operations.
 * Measures broadcast request collection performance.
 */

import { CrossBus } from '../../src/index.js';

function formatNumber(n) {
    return n.toLocaleString('en-US');
}

async function benchmarkAsync(name, fn, iterations = 100) {
    // Warmup
    for (let i = 0; i < Math.min(10, iterations / 10); i++) {
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

function setupHubWithResponders(peerCount) {
    const hub = new CrossBus({ isHub: true, peerId: 'hub' });

    for (let i = 0; i < peerCount; i++) {
        const peerId = `peer-${i}`;
        hub.addPeer(peerId, (msg) => {
            if (msg.p?.t === 'req') {
                const response = {
                    t: 'env',
                    source: peerId,
                    target: 'hub',
                    p: {
                        t: 'res',
                        id: msg.p.id,
                        success: true,
                        data: { from: peerId, value: i }
                    }
                };
                queueMicrotask(() => {
                    hub.handleMessage(response, '*', peerId);
                });
            }
        });
    }

    return hub;
}

async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('CrossBus broadcastRequest() Performance Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. Broadcast to 5 peers
    {
        const hub = setupHubWithResponders(5);
        const result = await benchmarkAsync('broadcastRequest.5_peers', async () => {
            await hub.broadcastRequest('getStatus', {}, { timeout: 5000 });
        }, 500);
        printResult(result);
        results['broadcastRequest.5_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 2. Broadcast to 10 peers
    {
        const hub = setupHubWithResponders(10);
        const result = await benchmarkAsync('broadcastRequest.10_peers', async () => {
            await hub.broadcastRequest('getStatus', {}, { timeout: 5000 });
        }, 300);
        printResult(result);
        results['broadcastRequest.10_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 3. Broadcast to 50 peers
    {
        const hub = setupHubWithResponders(50);
        const result = await benchmarkAsync('broadcastRequest.50_peers', async () => {
            await hub.broadcastRequest('getStatus', {}, { timeout: 5000 });
        }, 100);
        printResult(result);
        results['broadcastRequest.50_peers'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    // 4. Broadcast with large payload
    {
        const hub = setupHubWithResponders(5);
        const largePayload = { data: 'x'.repeat(10 * 1024) };
        const result = await benchmarkAsync('broadcastRequest.10kb_payload', async () => {
            await hub.broadcastRequest('echo', largePayload, { timeout: 5000 });
        }, 200);
        printResult(result);
        results['broadcastRequest.10kb_payload'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
        hub.destroy();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

runBenchmarks().catch(console.error);
