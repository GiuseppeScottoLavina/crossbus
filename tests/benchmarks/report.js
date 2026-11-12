// Regenerates the human-readable snapshot only from current, hash-matched reports.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(`benchmarks/${name}.json`, root), 'utf8'));
// Measurements are immutable historical evidence. A versioned archive keeps
// their exact bytes available after a release changes banners or runtime fixes.
const verifyFile = async (file, expected) => {
    const candidates = [file, `benchmarks/measured-0.1.1/${file}`];
    for (const candidate of candidates) {
        try {
            const hash = createHash('sha256').update(await readFile(new URL(candidate, root))).digest('hex');
            if (hash === expected) return;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    throw new Error(`Measured artifact unavailable or changed: ${file}`);
};
const verify = async report => {
    for (const [file, expected] of Object.entries(report.metadata.hashes)) await verifyFile(file, expected);
};

const median = list => [...list].sort((a,b) => a-b)[list.length >>> 1];
const runtimes = ['node', 'bun', 'chrome'];
const comparisons = [];
const verified = [], rpc = [];
for (const runtime of runtimes) {
    const report = await json(`verified-${runtime}`); await verify(report); verified.push(report);
    const echo = await json(`rpc-comparison-${runtime}`); await verify(echo); rpc.push(echo);
    const runs = [];
    for (let round = 1; round <= 3; round++) {
        const baseline = await json(`isolated-baseline-${runtime}-${round}`);
        const candidate = await json(`isolated-candidate-${runtime}-${round}`);
        await verify(baseline); await verify(candidate);
        runs.push({ baseline, candidate });
    }
    for (let index = 0; index < runs[0].baseline.results.length; index++) {
        const before = runs.map(run => run.baseline.results[index].opsPerSecond.median);
        const after = runs.map(run => run.candidate.results[index].opsPerSecond.median);
        const ratios = after.map((value, round) => value / before[round]);
        comparisons.push({ runtime, runtimeVersion: report.metadata.runtime,
            workload: runs[0].baseline.results[index].workload,
            baselineMedianOps: median(before), candidateMedianOps: median(after),
            medianRatio: median(ratios), minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios),
            baselineRuns: before, candidateRuns: after, ratios });
    }
}
await writeFile(new URL('benchmarks/optimization-summary.json', root), JSON.stringify({
    timestamp: new Date().toISOString(), methodology: 'three fresh baseline/candidate process pairs per runtime, nine samples per process; process order alternated; ranges are observed ratios, not confidence intervals', comparisons
}, null, 2) + '\n');
const sizes = await json('sizes');
for (const row of sizes.sizes) {
    const hash = createHash('sha256').update(await readFile(new URL(row.file, root))).digest('hex');
    if (hash !== row.sha256) throw new Error(`Stale size: ${row.file}`);
}
let output = `\n## Measured snapshot — 12 November 2026\n\nThese measurements were collected from the pre-release 0.1.1 working build. Its exact candidate bundles are preserved in benchmarks/measured-0.1.1/ and checked against the original hashes. Version 0.1.2 adds the Node 18 UUID fallback and retained license/version banners; this historical snapshot does not time that final archive. The separate 0.1.3 competitor study includes the exact published 0.1.2 runtime as its baseline. Size measurements below describe the build recorded in that snapshot.\n\n${verified[0].metadata.cpu}, ${verified[0].metadata.platform} ${verified[0].metadata.arch}. Local dispatch uses raw callbacks and preallocated payloads; values below are medians of nine samples, in millions of emits per second.\n\n| Runtime | CrossBus emitSync, 1 listener | nanoevents, 1 listener | CrossBus emitSync, 10 listeners | nanoevents, 10 listeners |\n|---|---:|---:|---:|---:|\n`;
for (const report of verified) {
    const rate = (library, workload) => (report.results.find(row => row.library === library && row.workload === workload).opsPerSecond.median / 1e6).toFixed(2);
    output += `| ${report.metadata.runtime} | ${rate('CrossBus emitSync', 'emit:1')} | ${rate('nanoevents', 'emit:1')} | ${rate('CrossBus emitSync', 'emit:10')} | ${rate('nanoevents', 'emit:10')} |\n`;
}
output += '\nFull JSON includes 0/100 listeners, registration/removal, CrossBus fast/nano, EventEmitter3 and mitt. This is a versioned workload comparison, not a universal ranking. The local emitter algorithm was retained after trial alternatives failed to show a stable advantage.\n';
output += '\n## Optimization before/after\n\nThe preserved pre-change bundles are in `benchmarks/before-optimization/`. Primary comparisons use **three pairs of fresh processes per runtime**, alternating process order; each process records nine samples after warmup. All payload limits, peer checks and hook behavior remain enabled. The summary is generated in `benchmarks/optimization-summary.json`.\n\n| Runtime | Workload | After / before, median | Observed range across process pairs |\n|---|---|---:|---:|\n';
for (const row of comparisons.filter(row => ['pending:create+resolve', 'signal:10-peers', 'rpc:direct', 'rpc:MessageChannel', 'rpc:MessageChannel+hooks'].includes(row.workload))) {
    output += `| ${row.runtimeVersion} | ${row.workload} | ${row.medianRatio.toFixed(2)}× | ${row.minRatio.toFixed(2)}–${row.maxRatio.toFixed(2)}× |\n`;
}
output += '\nThese are observed throughput ratios, not guarantees or statistical confidence intervals. `rpc:direct` uses synchronous in-memory forwarding and excludes structured cloning; MessageChannel tests use actual port delivery. The retained same-process paired diagnostic can show JIT identity bias even for identical nano code; it is not the primary improvement estimate. Unchanged emitter controls are present in the isolated-process reports.\n';
output += '\n## Versioned MessageChannel RPC comparison\n\nCrossBus and Comlink use identical structured-cloned echo payloads, 100 warmup calls and nine batches of 1,000 verified responses, rotating library order. Both port endpoints run in one event loop; this excludes worker/iframe startup and scheduling. Comlink is measured with ordinary proxy access and with its method cached. CrossBus keeps default request/payload limits. The APIs and guarantees differ.\n\nFor a 1,024-byte text field, medians of batch throughput:\n\n| Runtime | CrossBus, calls/s | Comlink, calls/s | Comlink cached method, calls/s |\n|---|---:|---:|---:|\n';
for (const report of rpc) {
    const rate = library => Math.round(report.results.find(row => row.textBytes === 1024 && row.library === library).opsPerSecond.median).toLocaleString('en-US');
    output += `| ${report.metadata.runtime} | ${rate('CrossBus')} | ${rate('Comlink')} | ${rate('Comlink cached method')} |\n`;
}
output += `\nComlink version: **${rpc[0].metadata.libraries.comlink}**. Reports include empty and 64 KiB text fields, raw samples, dependency versions and hashes. Method usage follows the [Comlink API](https://github.com/GoogleChromeLabs/comlink#api). No overall lead over every messaging library has been established.\n`;
output += '\n## RPC latency and bundle sizes\n\nActual sequential MessageChannel round trips with a 1,024-byte text field:\n\n| Runtime | p50, ms | p99, ms |\n|---|---:|---:|\n';
for (const report of verified) {
    const row = report.rpc.find(row => row.textBytes === 1024);
    const latency = value => value === 0 ? 'below timer resolution' : value.toFixed(3);
    output += `| ${report.metadata.runtime} | ${latency(row.latencyMs.p50)} | ${latency(row.latencyMs.p99)} |\n`;
}
output += '\nChrome timer quantization can produce zero-duration individual samples; these do not mean zero latency. The comparative RPC benchmark uses batch timing to avoid this per-call resolution limit. Whole-file sizes below use gzip level 9:\n\n| Artifact | Raw bytes | gzip bytes |\n|---|---:|---:|\n';
for (const row of sizes.sizes.filter(row => ['dist/crossbus.js','dist/crossbus.min.js','dist/crossbus.core.min.js','dist/nano.js','dist/nano.min.js'].includes(row.file))) {
    output += `| \`${row.file}\` | ${row.rawBytes.toLocaleString('en-US')} | ${row.gzipBytes.toLocaleString('en-US')} |\n`;
}
output += '\nThe export map selects `crossbus.js` and `nano.js`. Minified file sizes are not default export sizes. Consumer tree-shaking size was not measured.\n';
const memory = await json('memory-node');
await verifyFile('dist/crossbus.min.js', memory.metadata.bundleSha256);
output += `\n## Memory and pending-request lifecycle\n\nSeven measured rounds create 200 buses, each with ten peers and one unanswered request, after a warmup round. Every round cancelled all 200 requests and returned timeout resources from 200 to zero. Live cohort heap deltas ranged from ${Math.min(...memory.samples.map(row=>row.liveDeltaBytes)).toLocaleString('en-US')} to ${Math.max(...memory.samples.map(row=>row.liveDeltaBytes)).toLocaleString('en-US')} bytes. Post-cleanup deltas are retained in the JSON, including allocator/JIT noise; these are not exact per-object sizes or proof of universal absence of leaks.\n`;
const doc = new URL('docs/BENCHMARKS.md', root);
const existing = await readFile(doc, 'utf8');
await writeFile(doc, existing.split('\n## Measured snapshot')[0] + output);
console.log('Regenerated docs/BENCHMARKS.md and benchmarks/optimization-summary.json from hash-matched artifacts.');
