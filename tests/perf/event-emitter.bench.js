/**
 * @fileoverview Performance benchmarks for EventEmitter operations.
 * Measures emit, on, off, and wildcard matching performance.
 */

import { EventEmitter } from '../../src/core/event-emitter.js';

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

    return { name, iterations, totalMs, opsPerSec, latencyUs };
}

function printResult(result) {
    console.log(`  ${result.name}:`);
    console.log(`    ${formatNumber(result.opsPerSec)} ops/sec`);
    console.log(`    ${result.latencyUs.toFixed(3)} μs/op`);
}

async function runBenchmarks() {
    console.log('='.repeat(60));
    console.log('EventEmitter Performance Benchmarks');
    console.log('='.repeat(60));
    console.log();

    const results = {};

    // 1. emit() with 1 listener
    {
        const emitter = new EventEmitter();
        emitter.on('test', () => { });

        const result = await benchmarkAsync('emit.1_listener', async () => {
            await emitter.emit('test', { value: 42 });
        }, 50000);
        printResult(result);
        results['emit.1_listener'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 2. emit() with 10 listeners
    {
        const emitter = new EventEmitter();
        for (let i = 0; i < 10; i++) {
            emitter.on('test', () => { });
        }

        const result = await benchmarkAsync('emit.10_listeners', async () => {
            await emitter.emit('test', { value: 42 });
        }, 20000);
        printResult(result);
        results['emit.10_listeners'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 3. emit() with 100 listeners
    {
        const emitter = new EventEmitter();
        for (let i = 0; i < 100; i++) {
            emitter.on('test', () => { });
        }

        const result = await benchmarkAsync('emit.100_listeners', async () => {
            await emitter.emit('test', { value: 42 });
        }, 5000);
        printResult(result);
        results['emit.100_listeners'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 4. emit() with wildcard matcher (*)
    {
        const emitter = new EventEmitter();
        emitter.on('*', () => { });

        const result = await benchmarkAsync('emit.wildcard_star', async () => {
            await emitter.emit('test:event', { value: 42 });
        }, 30000);
        printResult(result);
        results['emit.wildcard_star'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 5. emit() with namespace wildcard (namespace:*)
    {
        const emitter = new EventEmitter();
        emitter.on('user:*', () => { });

        const result = await benchmarkAsync('emit.wildcard_namespace', async () => {
            await emitter.emit('user:login', { value: 42 });
        }, 30000);
        printResult(result);
        results['emit.wildcard_namespace'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 6. emit() with no listeners (miss)
    {
        const emitter = new EventEmitter();
        emitter.on('other', () => { });

        const result = await benchmarkAsync('emit.no_match', async () => {
            await emitter.emit('test', { value: 42 });
        }, 50000);
        printResult(result);
        results['emit.no_match'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 7. on() registration
    {
        const emitter = new EventEmitter();
        let counter = 0;

        const result = benchmark('on.register', () => {
            emitter.on(`event-${counter++}`, () => { });
        }, 50000);
        printResult(result);
        results['on.register'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 8. off() removal
    {
        const handlers = [];
        const emitter = new EventEmitter();

        // Pre-register handlers (more than we'll remove to account for warmup)
        for (let i = 0; i < 15000; i++) {
            const handler = () => { };
            handlers.push({ name: `event-${i}`, handler });
            emitter.on(`event-${i}`, handler);
        }

        let counter = 0;
        const result = benchmark('off.remove', () => {
            if (counter >= handlers.length) return;
            const { name, handler } = handlers[counter++];
            emitter.off(name, handler);
        }, 10000);
        printResult(result);
        results['off.remove'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    // 9. once() single-fire listener
    {
        const emitter = new EventEmitter();

        const result = await benchmarkAsync('once.fire', async () => {
            emitter.once('oneshot', () => { });
            await emitter.emit('oneshot', {});
        }, 20000);
        printResult(result);
        results['once.fire'] = { ops_sec: result.opsPerSec, latency_us: result.latencyUs };
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Results JSON:');
    console.log(JSON.stringify(results, null, 2));

    return results;
}

runBenchmarks().catch(console.error);
