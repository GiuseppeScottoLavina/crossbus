/**
 * @fileoverview Comprehensive CrossBus Benchmarks
 * 
 * Measures:
 * - Memory usage (heap snapshots)
 * - Throughput (ops/sec)
 * - Latency (p50, p95, p99)
 * - Scaling behavior
 */

import { CrossBus } from '../../src/index.js';
import { EventEmitter } from '../../src/core/event-emitter.js';
import { MessageRouter } from '../../src/router/message-router.js';
import { PendingRequests } from '../../src/router/pending-requests.js';
import { OriginValidator } from '../../src/security/origin-validator.js';

// ============================================================================
// Utility Functions
// ============================================================================

function formatNumber(n) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    return n.toFixed(2);
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
}

function getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage();
        return {
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            rss: mem.rss
        };
    }
    return null;
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

async function benchmark(name, fn, { warmup = 1000, iterations = 100000 } = {}) {
    // Warmup
    for (let i = 0; i < warmup; i++) {
        await fn();
    }

    // Force GC if available
    if (global.gc) global.gc();

    const memBefore = getMemoryUsage();
    const times = [];

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        await fn();
        times.push(performance.now() - t0);
    }
    const totalTime = performance.now() - start;

    const memAfter = getMemoryUsage();

    const opsPerSec = (iterations / totalTime) * 1000;

    return {
        name,
        iterations,
        totalTime: totalTime.toFixed(2) + 'ms',
        opsPerSec: formatNumber(opsPerSec),
        opsPerSecRaw: opsPerSec,
        latency: {
            p50: (percentile(times, 50) * 1000).toFixed(2) + 'μs',
            p95: (percentile(times, 95) * 1000).toFixed(2) + 'μs',
            p99: (percentile(times, 99) * 1000).toFixed(2) + 'μs',
            avg: ((times.reduce((a, b) => a + b, 0) / times.length) * 1000).toFixed(2) + 'μs'
        },
        memory: memBefore && memAfter ? {
            heapDelta: formatBytes(memAfter.heapUsed - memBefore.heapUsed),
            heapUsed: formatBytes(memAfter.heapUsed)
        } : null
    };
}

// ============================================================================
// Benchmark Suites
// ============================================================================

const results = {
    metadata: {
        timestamp: new Date().toISOString(),
        runtime: typeof Bun !== 'undefined' ? `Bun ${Bun.version}` :
            typeof process !== 'undefined' ? `Node ${process.version}` : 'Unknown',
        platform: typeof process !== 'undefined' ? `${process.platform} ${process.arch}` : 'Unknown'
    },
    benchmarks: {}
};

async function runBenchmarks() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   CrossBus Benchmark Suite                    ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Runtime: ${results.metadata.runtime}`);
    console.log(`Platform: ${results.metadata.platform}`);
    console.log('');

    // ========================================================================
    // 1. EventEmitter Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 1. EventEmitter Performance                                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const emitter = new EventEmitter();
    let counter = 0;
    emitter.on('test', () => { counter++; });

    // emitSync - synchronous, no allocation
    results.benchmarks.emitSync = await benchmark(
        'emitSync (1 listener)',
        () => emitter.emitSync('test', { x: 1 }),
        { iterations: 1_000_000 }
    );
    console.log(`  emitSync (1 listener): ${results.benchmarks.emitSync.opsPerSec} ops/sec`);

    // emitSync with payload
    results.benchmarks.emitSyncPayload = await benchmark(
        'emitSync (10KB payload)',
        () => emitter.emitSync('test', { data: 'x'.repeat(10000) }),
        { iterations: 100_000 }
    );
    console.log(`  emitSync (10KB payload): ${results.benchmarks.emitSyncPayload.opsPerSec} ops/sec`);

    // emit - async with envelope
    results.benchmarks.emit = await benchmark(
        'emit (async)',
        async () => await emitter.emit('test', { x: 1 }),
        { iterations: 100_000 }
    );
    console.log(`  emit (async): ${results.benchmarks.emit.opsPerSec} ops/sec`);

    // Multiple listeners
    const multiEmitter = new EventEmitter();
    for (let i = 0; i < 10; i++) {
        multiEmitter.on('test', () => { counter++; });
    }
    results.benchmarks.emitSync10Listeners = await benchmark(
        'emitSync (10 listeners)',
        () => multiEmitter.emitSync('test', { x: 1 }),
        { iterations: 500_000 }
    );
    console.log(`  emitSync (10 listeners): ${results.benchmarks.emitSync10Listeners.opsPerSec} ops/sec`);

    // Wildcard matching
    const wildcardEmitter = new EventEmitter();
    wildcardEmitter.on('user:*', () => { counter++; });
    results.benchmarks.emitWildcard = await benchmark(
        'emit with wildcard',
        async () => await wildcardEmitter.emit('user:login', { x: 1 }),
        { iterations: 50_000 }
    );
    console.log(`  emit (wildcard match): ${results.benchmarks.emitWildcard.opsPerSec} ops/sec`);

    console.log('');

    // ========================================================================
    // 2. CrossBus Core Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 2. CrossBus Core Operations                                │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const bus = new CrossBus({ isHub: true, peerId: 'bench-hub' });

    // signal() without peers
    results.benchmarks.signalNoPeers = await benchmark(
        'signal (no peers)',
        async () => bus.signal('test', { x: 1 }),
        { iterations: 100_000 }
    );
    console.log(`  signal (no peers): ${results.benchmarks.signalNoPeers.opsPerSec} ops/sec`);

    // Add mock peers
    for (let i = 0; i < 10; i++) {
        bus.addPeer(`peer-${i}`, (msg) => { /* mock send */ });
    }

    results.benchmarks.signalWith10Peers = await benchmark(
        'signal (10 peers)',
        async () => bus.signal('test', { x: 1 }),
        { iterations: 50_000 }
    );
    console.log(`  signal (10 peers): ${results.benchmarks.signalWith10Peers.opsPerSec} ops/sec`);

    // Handler registration
    results.benchmarks.handleRegister = await benchmark(
        'handle registration',
        () => {
            const unhandle = bus.handle(`handler-${Math.random()}`, () => ({}));
            unhandle();
        },
        { iterations: 50_000 }
    );
    console.log(`  handle/unhandle: ${results.benchmarks.handleRegister.opsPerSec} ops/sec`);

    bus.destroy();
    console.log('');

    // ========================================================================
    // 3. MessageRouter Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 3. MessageRouter Performance                                │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const router = new MessageRouter();

    // Peer lookup (empty)
    results.benchmarks.peerLookupEmpty = await benchmark(
        'getPeer (empty router)',
        () => router.getPeer('nonexistent'),
        { iterations: 1_000_000 }
    );
    console.log(`  getPeer (empty): ${results.benchmarks.peerLookupEmpty.opsPerSec} ops/sec`);

    // Add 100 peers
    for (let i = 0; i < 100; i++) {
        router.addPeer(`peer-${i}`, () => { });
    }

    results.benchmarks.peerLookup100 = await benchmark(
        'getPeer (100 peers)',
        () => router.getPeer('peer-50'),
        { iterations: 1_000_000 }
    );
    console.log(`  getPeer (100 peers): ${results.benchmarks.peerLookup100.opsPerSec} ops/sec`);

    // Route unicast
    results.benchmarks.routeUnicast = await benchmark(
        'route unicast',
        () => router.route({ target: 'peer-50', payload: { x: 1 } }),
        { iterations: 500_000 }
    );
    console.log(`  route unicast: ${results.benchmarks.routeUnicast.opsPerSec} ops/sec`);

    // Broadcast to 100 peers
    results.benchmarks.broadcast100 = await benchmark(
        'broadcast (100 peers)',
        () => router.broadcast({ x: 1 }),
        { iterations: 10_000 }
    );
    console.log(`  broadcast (100 peers): ${results.benchmarks.broadcast100.opsPerSec} ops/sec`);

    router.clearPeers();
    console.log('');

    // ========================================================================
    // 4. PendingRequests Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 4. PendingRequests Performance                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const pending = new PendingRequests({ defaultTimeout: 60000 });

    // Create + immediate resolve
    results.benchmarks.requestCreateResolve = await benchmark(
        'create + resolve',
        () => {
            const { requestId, promise } = pending.create('peer', 'handler');
            promise.catch(() => { }); // Prevent unhandled
            pending.resolve(requestId, { success: true, data: {} });
        },
        { iterations: 50_000 }
    );
    console.log(`  create + resolve: ${results.benchmarks.requestCreateResolve.opsPerSec} ops/sec`);

    // Lookup under load
    for (let i = 0; i < 500; i++) {
        const { promise } = pending.create(`peer-${i}`, 'handler');
        promise.catch(() => { });
    }

    results.benchmarks.requestLookup500 = await benchmark(
        'has() with 500 pending',
        () => pending.has('req_250'),
        { iterations: 500_000 }
    );
    console.log(`  has() (500 pending): ${results.benchmarks.requestLookup500.opsPerSec} ops/sec`);

    pending.cancelAll();
    console.log('');

    // ========================================================================
    // 5. OriginValidator Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 5. OriginValidator Performance                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const validatorExact = new OriginValidator({
        allowed: ['https://example.com', 'https://trusted.com']
    });

    results.benchmarks.originExact = await benchmark(
        'exact origin match',
        () => validatorExact.isAllowed('https://example.com'),
        { iterations: 1_000_000 }
    );
    console.log(`  exact match: ${results.benchmarks.originExact.opsPerSec} ops/sec`);

    const validatorWildcard = new OriginValidator({
        allowed: ['https://*.example.com']
    });

    results.benchmarks.originWildcard = await benchmark(
        'wildcard origin match',
        () => validatorWildcard.isAllowed('https://subdomain.example.com'),
        { iterations: 500_000 }
    );
    console.log(`  wildcard match: ${results.benchmarks.originWildcard.opsPerSec} ops/sec`);

    // ReDoS resistance test (should still be fast with crafted input)
    const longSubdomain = 'a'.repeat(200) + '.example.com';
    results.benchmarks.originReDoS = await benchmark(
        'ReDoS-resistant (200 char subdomain)',
        () => validatorWildcard.isAllowed(`https://${longSubdomain}`),
        { iterations: 100_000 }
    );
    console.log(`  ReDoS-resistant: ${results.benchmarks.originReDoS.opsPerSec} ops/sec`);

    console.log('');

    // ========================================================================
    // 6. Memory Usage Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 6. Memory Usage                                             │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    if (global.gc) {
        global.gc();
        const baseline = getMemoryUsage();

        // CrossBus instance memory
        const buses = [];
        for (let i = 0; i < 100; i++) {
            buses.push(new CrossBus({ peerId: `bus-${i}` }));
        }
        global.gc();
        const afterBuses = getMemoryUsage();
        const perBusMemory = (afterBuses.heapUsed - baseline.heapUsed) / 100;
        results.benchmarks.memoryPerBus = {
            name: 'Memory per CrossBus instance',
            value: formatBytes(perBusMemory),
            raw: perBusMemory
        };
        console.log(`  Per CrossBus instance: ${formatBytes(perBusMemory)}`);

        // Cleanup
        buses.forEach(b => b.destroy());
        global.gc();

        // Per-peer memory
        const hubForPeers = new CrossBus({ isHub: true, peerId: 'hub' });
        const beforePeers = getMemoryUsage();
        for (let i = 0; i < 1000; i++) {
            hubForPeers.addPeer(`peer-${i}`, () => { });
        }
        global.gc();
        const afterPeers = getMemoryUsage();
        const perPeerMemory = (afterPeers.heapUsed - beforePeers.heapUsed) / 1000;
        results.benchmarks.memoryPerPeer = {
            name: 'Memory per peer',
            value: formatBytes(perPeerMemory),
            raw: perPeerMemory
        };
        console.log(`  Per peer: ${formatBytes(perPeerMemory)}`);

        hubForPeers.destroy();
        global.gc();

        // Per-handler memory
        const hubForHandlers = new CrossBus({ isHub: true, peerId: 'hub2' });
        const beforeHandlers = getMemoryUsage();
        const unhandlers = [];
        for (let i = 0; i < 1000; i++) {
            unhandlers.push(hubForHandlers.handle(`handler-${i}`, () => ({})));
        }
        global.gc();
        const afterHandlers = getMemoryUsage();
        const perHandlerMemory = (afterHandlers.heapUsed - beforeHandlers.heapUsed) / 1000;
        results.benchmarks.memoryPerHandler = {
            name: 'Memory per handler',
            value: formatBytes(perHandlerMemory),
            raw: perHandlerMemory
        };
        console.log(`  Per handler: ${formatBytes(perHandlerMemory)}`);

        unhandlers.forEach(u => u());
        hubForHandlers.destroy();
        global.gc();

        // Per-listener memory
        const emitterForMem = new EventEmitter();
        const beforeListeners = getMemoryUsage();
        for (let i = 0; i < 1000; i++) {
            emitterForMem.on(`event-${i}`, () => { });
        }
        global.gc();
        const afterListeners = getMemoryUsage();
        const perListenerMemory = (afterListeners.heapUsed - beforeListeners.heapUsed) / 1000;
        results.benchmarks.memoryPerListener = {
            name: 'Memory per listener',
            value: formatBytes(perListenerMemory),
            raw: perListenerMemory
        };
        console.log(`  Per listener: ${formatBytes(perListenerMemory)}`);

    } else {
        console.log('  (Run with --expose-gc for memory metrics)');
    }

    console.log('');

    // ========================================================================
    // 7. Scaling Benchmarks
    // ========================================================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 7. Scaling Behavior                                         │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const scalingResults = [];
    for (const peerCount of [1, 10, 50, 100]) {
        const scalingBus = new CrossBus({ isHub: true, peerId: 'scale-hub' });
        for (let i = 0; i < peerCount; i++) {
            scalingBus.addPeer(`peer-${i}`, () => { });
        }

        const result = await benchmark(
            `broadcast to ${peerCount} peers`,
            async () => scalingBus.signal('test', { x: 1 }),
            { iterations: Math.min(50000, 500000 / peerCount), warmup: 100 }
        );

        scalingResults.push({
            peers: peerCount,
            opsPerSec: result.opsPerSecRaw,
            formatted: result.opsPerSec
        });

        console.log(`  ${peerCount} peers: ${result.opsPerSec} ops/sec`);
        scalingBus.destroy();
    }
    results.benchmarks.scaling = scalingResults;

    console.log('');

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                         Summary                                ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Performance Highlights:');
    console.log(`  • emitSync:        ${results.benchmarks.emitSync.opsPerSec} ops/sec`);
    console.log(`  • Peer lookup:     ${results.benchmarks.peerLookup100.opsPerSec} ops/sec`);
    console.log(`  • Origin validate: ${results.benchmarks.originExact.opsPerSec} ops/sec`);
    console.log(`  • Route unicast:   ${results.benchmarks.routeUnicast.opsPerSec} ops/sec`);
    console.log('');
    console.log('Latency (p99):');
    console.log(`  • emitSync:        ${results.benchmarks.emitSync.latency.p99}`);
    console.log(`  • emit (async):    ${results.benchmarks.emit.latency.p99}`);
    console.log('');
    if (results.benchmarks.memoryPerBus) {
        console.log('Memory:');
        console.log(`  • Per CrossBus:   ${results.benchmarks.memoryPerBus.value}`);
        console.log(`  • Per peer:        ${results.benchmarks.memoryPerPeer.value}`);
        console.log(`  • Per handler:     ${results.benchmarks.memoryPerHandler.value}`);
        console.log(`  • Per listener:    ${results.benchmarks.memoryPerListener.value}`);
    }
    console.log('');

    return results;
}

// Run and export results
const finalResults = await runBenchmarks();

// Save to file
const fs = await import('fs');
fs.writeFileSync(
    'tests/benchmarks/results.json',
    JSON.stringify(finalResults, null, 2)
);
console.log('Results saved to tests/benchmarks/results.json');
