// Shared by Node, Bun and Chrome. Always benchmark the distribution artifacts.
import { EventEmitter, createFastEmitter, CrossBus, MessageChannelTransport } from '../../dist/crossbus.min.js';
import { createNanoEmitter } from '../../dist/nano.min.js';
import EventEmitter3 from '../../node_modules/eventemitter3/dist/eventemitter3.esm.js';
import mitt from '../../node_modules/mitt/dist/mitt.mjs';
import { createNanoEvents } from '../../node_modules/nanoevents/index.js';

const factories = {
    'CrossBus emitSync': () => {
        const emitter = new EventEmitter();
        emitter.setMaxListeners(0);
        return { on: (name, fn) => emitter.onFast(name, fn), emit: (name, data) => emitter.emitSync(name, data) };
    },
    'CrossBus fast': createFastEmitter,
    'CrossBus nano': createNanoEmitter,
    EventEmitter3: () => {
        const emitter = new EventEmitter3();
        return { on(name, fn) { emitter.on(name, fn); return () => emitter.off(name, fn); }, emit: (name, data) => emitter.emit(name, data) };
    },
    mitt: () => {
        const emitter = mitt();
        return { on(name, fn) { emitter.on(name, fn); return () => emitter.off(name, fn); }, emit: (name, data) => emitter.emit(name, data) };
    },
    nanoevents: createNanoEvents
};

function stats(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { median, min: sorted[0], max: sorted.at(-1), samples };
}

export async function runWorkloads({ samples = 9, minSampleMs = 60 } = {}) {
    const results = [];
    const definitions = [
        { name: 'emit:0', listeners: 0 }, { name: 'emit:1', listeners: 1 },
        { name: 'emit:10', listeners: 10 }, { name: 'emit:100', listeners: 100 },
        { name: 'emit:10KiB-reference', listeners: 1, blob: 'x'.repeat(10 * 1024) },
        { name: 'subscribe+unsubscribe', listeners: 0, churn: true }
    ];
    for (const definition of definitions) {
        const cases = Object.entries(factories).map(([library, create]) => {
            const emitter = create();
            let calls = 0;
            let checksum = 0;
            const handler = data => { calls++; checksum += data.value; };
            for (let i = 0; i < definition.listeners; i++) emitter.on('event', handler);
            const payload = { value: 7, blob: definition.blob };
            const fn = definition.churn ? () => emitter.on('event', handler)() : () => emitter.emit('event', payload);
            // Check exact listener count before any timing.
            emitter.emit('event', payload);
            if (calls !== definition.listeners) throw new Error(`${library}: incorrect listener count`);
            calls = 0; checksum = 0;
            const run = count => {
                const start = performance.now();
                for (let i = 0; i < count; i++) fn();
                return performance.now() - start;
            };
            let count = 16384;
            while (run(count) < minSampleMs && count < 16777216) count *= 2;
            calls = 0; checksum = 0;
            return { library, emitter, run, count, rates: [], iterations: 0,
                verify() {
                    if (calls !== this.iterations * definition.listeners || checksum !== calls * 7) throw new Error(`${library}: callback work was lost`);
                    if (definition.churn) { emitter.emit('event', payload); if (calls !== 0) throw new Error(`${library}: listener leak`); }
                }
            };
        });
        // Rotate order each round to distribute warmup, thermal and ordering effects.
        for (let round = 0; round < samples; round++) {
            for (let offset = 0; offset < cases.length; offset++) {
                const item = cases[(offset + round) % cases.length];
                const ms = item.run(item.count);
                item.iterations += item.count;
                item.rates.push(item.count / ms * 1000);
            }
        }
        for (const item of cases) {
            item.verify();
            results.push({ workload: definition.name, library: item.library, iterationsPerSample: item.count, opsPerSecond: stats(item.rates) });
        }
    }

    const rpc = [];
    for (const bytes of [0, 1024, 65536]) {
        const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
        const transport = new MessageChannelTransport();
        a.addTransport(transport, { peerId: 'b', origin: 'channel' });
        b.addTransport(MessageChannelTransport.fromPort(transport.remotePort), { peerId: 'a', origin: 'channel' });
        b.handle('echo', data => data);
        const payload = { value: 7, text: 'x'.repeat(bytes) };
        const latencies = [];
        try {
            for (let i = 0; i < 1100; i++) {
                const start = performance.now();
                const result = await a.request('b', 'echo', payload, { timeout: 5000 });
                const elapsed = performance.now() - start;
                if (result.value !== 7 || result.text.length !== bytes) throw new Error('RPC payload mismatch');
                if (i >= 100) latencies.push(elapsed);
            }
            const sorted = [...latencies].sort((x, y) => x - y);
            rpc.push({ transport: 'MessageChannel', textBytes: bytes, calls: latencies.length,
                latencyMs: { p50: sorted[500], p95: sorted[950], p99: sorted[990], samples: latencies },
                opsPerSecond: latencies.length / latencies.reduce((sum, value) => sum + value, 0) * 1000 });
        } finally { a.destroy(); b.destroy(); }
    }
    const routing = [];
    for (const peers of [1, 10, 100]) {
        const bus = new CrossBus({ peerId: 'sender', allowedOrigins: ['channel'] });
        let sends = 0;
        let checksum = 0;
        for (let i = 0; i < peers; i++) bus.addPeer(`peer-${i}`, message => {
            sends++;
            checksum += message.payload.data.value;
        });
        const iterations = 2000;
        const rates = [];
        try {
            for (let round = -1; round < samples; round++) {
                const before = sends;
                const start = performance.now();
                for (let i = 0; i < iterations; i++) {
                    const result = await bus.signal('tick', { value: 7 });
                    if (result.delivered !== peers || result.failed.length !== 0) throw new Error('Signal routing failed');
                }
                const elapsed = performance.now() - start;
                if (sends - before !== iterations * peers) throw new Error('Signal callback count mismatch');
                if (round >= 0) rates.push(iterations / elapsed * 1000);
            }
            if (checksum !== sends * 7) throw new Error('Signal checksum mismatch');
            routing.push({ workload: 'awaited signal to synchronous mock peers (no cross-context copy)', peers,
                iterationsPerSample: iterations, opsPerSecond: stats(rates) });
        } finally { bus.destroy(); }
    }
    return { methodology: { samples, minSampleMs, timer: 'performance.now',
        emitter: 'synchronous raw payload, exact listeners, callbacks increment counter and checksum',
        largePayload: 'reference dispatch only; no copying or serialization',
        rpc: 'sequential real MessageChannel round trips, structured clone, 100 warmup + 1000 measured' }, results, rpc, routing };
}
