/**
 * @fileoverview Chrome-based performance benchmarks using Puppeteer.
 * Runs benchmarks in real V8/Chrome for accurate measurements.
 */

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Inline benchmark HTML
const BENCHMARK_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>CrossBus Chrome Benchmark</title>
    <script type="module">
        import { CrossBus, EventEmitter, MessageRouter } from '/src/index.js';
        
        function benchmark(name, fn, iterations = 10000) {
            // Warmup
            for (let i = 0; i < Math.min(1000, iterations / 10); i++) fn();
            
            const start = performance.now();
            for (let i = 0; i < iterations; i++) fn();
            const end = performance.now();
            
            const totalMs = end - start;
            const opsPerSec = Math.round((iterations / totalMs) * 1000);
            const latencyUs = (totalMs / iterations) * 1000;
            
            return { name, opsPerSec, latencyUs };
        }
        
        async function benchmarkAsync(name, fn, iterations = 10000) {
            // Warmup
            for (let i = 0; i < Math.min(1000, iterations / 10); i++) await fn();
            
            const start = performance.now();
            for (let i = 0; i < iterations; i++) await fn();
            const end = performance.now();
            
            const totalMs = end - start;
            const opsPerSec = Math.round((iterations / totalMs) * 1000);
            const latencyUs = (totalMs / iterations) * 1000;
            
            return { name, opsPerSec, latencyUs };
        }
        
        async function runBenchmarks() {
            const results = {};
            
            // Signal benchmark
            {
                const hub = new CrossBus({ isHub: true, peerId: 'hub' });
                for (let i = 0; i < 10; i++) hub.addPeer(\`peer-\${i}\`, () => {});
                const r = benchmark('signal.10_peers', () => hub.signal('test', { v: 42 }), 20000);
                results['signal.10_peers'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
                hub.destroy();
            }
            
            // Router benchmark
            {
                const router = new MessageRouter();
                for (let i = 0; i < 100; i++) router.addPeer(\`peer-\${i}\`, () => {});
                
                let r = benchmark('route.unicast', () => router.route({ target: 'peer-50', payload: { v: 42 } }), 50000);
                results['route.unicast'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
                
                r = benchmark('getPeer.lookup', () => router.getPeer('peer-50'), 100000);
                results['getPeer.lookup'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
            }
            
            // EventEmitter benchmark
            {
                const emitter = new EventEmitter();
                emitter.on('test', () => {});
                
                let r = await benchmarkAsync('emit.1_listener', async () => await emitter.emit('test', { v: 42 }), 50000);
                results['emit.1_listener'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
                
                // Ultra-fast sync emit (target: 50M+ ops/sec)
                let rSync = benchmark('emitSync.1_listener', () => emitter.emitSync('test', { v: 42 }), 200000);
                results['emitSync.1_listener'] = { ops_sec: rSync.opsPerSec, latency_us: rSync.latencyUs };
                
                const emitter10 = new EventEmitter();
                for (let i = 0; i < 10; i++) emitter10.on('test', () => {});
                r = await benchmarkAsync('emit.10_listeners', async () => await emitter10.emit('test', { v: 42 }), 20000);
                results['emit.10_listeners'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
                
                r = benchmark('on.register', () => emitter.on(\`e-\${Math.random()}\`, () => {}), 50000);
                results['on.register'] = { ops_sec: r.opsPerSec, latency_us: r.latencyUs };
            }
            
            window.__BENCHMARK_RESULTS__ = results;
            console.log('Benchmarks complete:', JSON.stringify(results, null, 2));
        }
        
        runBenchmarks();
    </script>
</head>
<body>
    <h1>CrossBus Chrome Benchmark</h1>
    <p>Check console for results...</p>
</body>
</html>
`;

async function runChromeBenchmark() {
    // Create HTTP server
    const server = createServer((req, res) => {
        let filePath = req.url === '/' ? '/benchmark.html' : req.url;

        if (filePath === '/benchmark.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(BENCHMARK_HTML);
            return;
        }

        // Serve source files
        try {
            const fullPath = resolve(ROOT, filePath.slice(1));
            const content = readFileSync(fullPath, 'utf-8');
            const ext = filePath.split('.').pop();
            const contentType = ext === 'js' ? 'application/javascript' : 'text/html';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } catch (e) {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    await new Promise(resolve => server.listen(3456, resolve));
    console.log('Server running on http://localhost:3456');

    // Launch Chrome
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Capture console output
    page.on('console', msg => console.log('[Chrome]', msg.text()));

    await page.goto('http://localhost:3456/');

    // Wait for benchmarks to complete
    await page.waitForFunction(() => window.__BENCHMARK_RESULTS__, { timeout: 60000 });

    const results = await page.evaluate(() => window.__BENCHMARK_RESULTS__);

    console.log('\n' + '='.repeat(60));
    console.log('Chrome V8 Benchmark Results');
    console.log('='.repeat(60));

    for (const [key, val] of Object.entries(results)) {
        console.log(`  ${key.padEnd(25)} ${val.ops_sec.toLocaleString().padStart(12)} ops/sec`);
    }

    await browser.close();
    server.close();

    return results;
}

runChromeBenchmark().catch(console.error);
