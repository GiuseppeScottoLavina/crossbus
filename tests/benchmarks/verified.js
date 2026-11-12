import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const browserMode = process.argv.includes('--browser');
const paired = process.argv.includes('--paired');
const variantArg = process.argv.indexOf('--variant');
const variant = variantArg >= 0 ? process.argv[variantArg + 1] : undefined;
if (variant && !['baseline', 'candidate'].includes(variant)) throw new Error('Invalid variant');
const rpcCompare = process.argv.includes('--rpc-compare');
const workload = paired ? 'paired-workloads.js' : rpcCompare ? 'rpc-comparison.js' : 'workloads.js';
const outputArg = process.argv.indexOf('--output');
const output = outputArg >= 0 ? process.argv[outputArg + 1] : `benchmarks/${paired ? (variant ? `isolated-${variant}` : 'paired') : rpcCompare ? 'rpc-comparison' : 'verified'}-${browserMode ? 'chrome' : typeof Bun !== 'undefined' ? 'bun' : 'node'}.json`;
const hashes = {};
for (const file of ['dist/crossbus.min.js', 'dist/nano.min.js', `tests/benchmarks/${workload}`, ...(paired ? ['benchmarks/before-optimization/crossbus.min.js', 'benchmarks/before-optimization/nano.min.js'] : []), ...(rpcCompare ? ['node_modules/comlink/dist/esm/comlink.mjs'] : [])]) {
    hashes[file] = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex');
}
const libraries = {};
for (const name of ['eventemitter3', 'mitt', 'nanoevents', 'comlink']) libraries[name] = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), 'utf8')).version;
const metadata = { timestamp: new Date().toISOString(), platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, runtime: typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node ${process.version}`,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim(),
    workingTreeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim().length > 0,
    hashes, libraries, ...(variant ? { variant } : {}) };
let result;
if (browserMode) {
    const { createServer } = await import('node:http');
    const { launchBrowser, closeBrowser } = await import('../e2e/puppeteer-helper.js');
    const server = createServer(async (req, res) => {
        try {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>CrossBus benchmark</title>'); return; }
            const path = new URL(`.${pathname}`, root);
            if (!path.href.startsWith(root.href)) { res.writeHead(403); res.end(); return; }
            res.setHeader('Content-Type', 'application/javascript');
            res.end(await readFile(path));
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser, userDataDir;
    try {
        ({ browser, userDataDir } = await launchBrowser('verified-benchmark'));
        metadata.runtime = await browser.version();
        metadata.headless = true;
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        result = await page.evaluate(async ({ module, variant }) => (await import(`/tests/benchmarks/${module}`)).runWorkloads({ variant }), { module: workload, variant });
    } finally { await closeBrowser(browser, userDataDir); await new Promise(resolve => server.close(resolve)); }
} else result = await (await import(`./${workload}`)).runWorkloads({ variant });
await mkdir(new URL('benchmarks/', root), { recursive: true });
await writeFile(output, JSON.stringify({ metadata, ...result }, null, 2) + '\n');
if (paired && variant) console.table(result.results.map(row => ({ workload: row.workload, variant, 'median ops/s': Math.round(row.opsPerSecond.median) })));
else if (paired) console.table(result.results.map(row => ({ workload: row.workload,
    'before ops/s': Math.round(row.baselineOps.median), 'after ops/s': Math.round(row.candidateOps.median), ratio: row.ratio.toFixed(2) })));
else if (rpcCompare) console.table(result.results.map(row => ({ library: row.library, bytes: row.textBytes,
    'median ops/s': Math.round(row.opsPerSecond.median), 'mean ms/call': row.meanMsPerCall.median.toFixed(4) })));
else {
console.table(result.results.map(row => ({ workload: row.workload, library: row.library,
    'median M ops/s': (row.opsPerSecond.median / 1e6).toFixed(2),
    'min M': (row.opsPerSecond.min / 1e6).toFixed(2), 'max M': (row.opsPerSecond.max / 1e6).toFixed(2) })));
console.table(result.rpc.map(row => ({ bytes: row.textBytes, p50ms: row.latencyMs.p50.toFixed(3), p99ms: row.latencyMs.p99.toFixed(3) })));
}
console.log(`Saved ${output}`);
