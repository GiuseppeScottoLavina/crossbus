/**
 * @fileoverview Memory footprint benchmarks for CrossBus.
 * Measures memory usage scaling with peers and listeners.
 */

import { CrossBus } from '../../src/index.js';
import { EventEmitter } from '../../src/core/event-emitter.js';
import { MessageRouter } from '../../src/router/message-router.js';

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getHeapUsed() {
    if (typeof Bun !== 'undefined' && Bun.gc) {
        Bun.gc(true); // Force GC
    }
    return process.memoryUsage().heapUsed;
}

function measureMemory(name, setupFn, count) {
    // Force GC and get baseline
    const baseline = getHeapUsed();

    // Create instances
    const instances = setupFn(count);

    // Measure after creation
    const afterCreate = getHeapUsed();
    const totalBytes = afterCreate - baseline;
    const perInstanceBytes = Math.round(totalBytes / count);

    console.log(`  ${name}:`);
    console.log(`    Total: ${formatBytes(totalBytes)} for ${count} instances`);
    console.log(`    Per instance: ${formatBytes(perInstanceBytes)}`);

    // Cleanup
    if (Array.isArray(instances)) {
        instances.forEach(i => i.destroy?.() || i.clear?.() || i.clearPeers?.());
    }

    return { name, count, total_bytes: totalBytes, per_instance_bytes: perInstanceBytes };
}

async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('CrossBus Memory Footprint Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. Idle CrossBus (no peers)
    {
        const result = measureMemory('crossbus.idle', (count) => {
            return Array.from({ length: count }, () =>
                new CrossBus({ isHub: true, peerId: `hub-${Math.random()}` })
            );
        }, 100);
        results['crossbus.idle'] = result;
    }

    // 2. CrossBus with 10 peers each
    {
        const result = measureMemory('crossbus.10_peers', (count) => {
            return Array.from({ length: count }, (_, i) => {
                const hub = new CrossBus({ isHub: true, peerId: `hub-${i}` });
                for (let j = 0; j < 10; j++) {
                    hub.addPeer(`peer-${i}-${j}`, () => { });
                }
                return hub;
            });
        }, 50);
        results['crossbus.10_peers'] = result;
    }

    // 3. Idle EventEmitter
    {
        const result = measureMemory('eventemitter.idle', (count) => {
            return Array.from({ length: count }, () => new EventEmitter());
        }, 1000);
        results['eventemitter.idle'] = result;
    }

    // 4. EventEmitter with 100 listeners
    {
        const result = measureMemory('eventemitter.100_listeners', (count) => {
            return Array.from({ length: count }, () => {
                const emitter = new EventEmitter();
                for (let i = 0; i < 100; i++) {
                    emitter.on(`event-${i}`, () => { });
                }
                return emitter;
            });
        }, 100);
        results['eventemitter.100_listeners'] = result;
    }

    // 5. Idle MessageRouter
    {
        const result = measureMemory('messagerouter.idle', (count) => {
            return Array.from({ length: count }, () => new MessageRouter());
        }, 1000);
        results['messagerouter.idle'] = result;
    }

    // 6. MessageRouter with 100 peers
    {
        const result = measureMemory('messagerouter.100_peers', (count) => {
            return Array.from({ length: count }, (_, i) => {
                const router = new MessageRouter();
                for (let j = 0; j < 100; j++) {
                    router.addPeer(`peer-${i}-${j}`, () => { });
                }
                return router;
            });
        }, 50);
        results['messagerouter.100_peers'] = result;
    }

    // 7. Single peer overhead
    {
        const baseline = getHeapUsed();
        const hub = new CrossBus({ isHub: true, peerId: 'hub' });
        const afterHub = getHeapUsed();

        for (let i = 0; i < 1000; i++) {
            hub.addPeer(`peer-${i}`, () => { });
        }
        const after1000Peers = getHeapUsed();

        const hubOverhead = afterHub - baseline;
        const perPeerOverhead = Math.round((after1000Peers - afterHub) / 1000);

        console.log(`  peer.overhead:`);
        console.log(`    Hub base: ${formatBytes(hubOverhead)}`);
        console.log(`    Per peer: ${formatBytes(perPeerOverhead)}`);

        results['peer.overhead'] = {
            hub_base_bytes: hubOverhead,
            per_peer_bytes: perPeerOverhead
        };

        hub.destroy();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

runBenchmarks().catch(console.error);
