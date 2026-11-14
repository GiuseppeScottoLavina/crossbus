import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const directory = 'benchmarks/next-release/';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
const describe = (values) => ({
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    samples: values
});
const inputs = await json(directory + 'inputs.json');
const baseline = await json(directory + 'baseline/manifest.json');
const candidate = await json(directory + 'candidate/manifest.json');
assert.equal(baseline.version, '0.1.4');
assert.equal(baseline.sourceCommit, '309b040f2e48d52d88a21cbe34c005d479f89077');
assert.equal(
    baseline.sha256['crossbus.min.js'],
    'b333dcdef51a41da7e4717efaaf537d9710c02679724ce338366882085c2a562'
);
assert.equal(candidate.version, '0.1.5');
assert.equal(sha(await readFile(directory + 'inputs.json')), candidate.inputsSha256);
for (const [variant, manifest] of Object.entries({ baseline, candidate }))
    for (const [file, hash] of Object.entries(manifest.sha256))
        assert.equal(
            sha(await readFile(directory + variant + '/' + file)),
            hash,
            variant + '/' + file
        );
if (process.argv.includes('--check-current')) {
    for (const [path, source] of Object.entries(inputs))
        assert.equal(sha(await readFile(path)), sha(source), path);
    for (const file of ['crossbus.min.js', 'nano.min.js'])
        assert.equal(sha(await readFile('dist/' + file)), candidate.sha256[file], file);
}
const runtimes = ['node', 'bun', 'chrome', 'chrome-worker'];
const names = [
    'CrossBus',
    'CrossBus + async hooks',
    'CrossBus compact wire',
    'CrossBus compact + hooks',
    'birpc cached',
    'Penpal cached + timeout'
];
const datasets = [];
for (const profile of ['primary', 'guard'])
    for (const runtime of runtimes)
        for (let round = 1; round <= 3; round++)
            for (const variant of ['baseline', 'candidate']) {
                const file = `${directory}${profile}-${runtime}-${variant}-${round}.json`;
                const data = await json(file),
                    m = data.methodology,
                    meta = data.metadata;
                const selected =
                    profile === 'primary' ? names : [names[0], names[1], names[4], names[5]];
                const artifact = directory + variant + '/crossbus.min.js';
                const expected = [
                    artifact,
                    directory + variant + '/nano.min.js',
                    'experiments/worker-rpc/workloads.js',
                    'experiments/worker-rpc/competitor-worker.js',
                    'experiments/worker-rpc/run.js',
                    'experiments/worker-rpc/isolated.js',
                    'package-lock.json',
                    'tests/e2e/puppeteer-helper.js',
                    'node_modules/puppeteer-core/package.json',
                    'node_modules/birpc/dist/index.mjs',
                    'node_modules/penpal/dist/penpal.mjs',
                    'node_modules/comlink/dist/esm/comlink.mjs'
                ];
                assert.deepEqual(Object.keys(meta.hashes).sort(), expected.sort());
                for (const [path, hash] of Object.entries(meta.hashes))
                    assert.equal(
                        inputs[path] === undefined ? sha(await readFile(path)) : sha(inputs[path]),
                        hash,
                        'Measured input ' + path
                    );
                assert.equal(meta.artifact, artifact);
                assert.equal(meta.artifactVersion, variant === 'baseline' ? '0.1.4' : '0.1.5');
                assert.equal(meta.platform, 'darwin');
                assert.equal(meta.arch, 'arm64');
                assert.equal(meta.cpu, 'Apple M1 Max');
                assert.equal(
                    meta.runtime,
                    runtime === 'node'
                        ? 'Node v24.15.0'
                        : runtime === 'bun'
                          ? 'Bun 1.3.14'
                          : 'HeadlessChrome/155.0.8059.79'
                );
                assert.equal(meta.libraries.birpc, '4.2.0');
                assert.equal(meta.libraries.penpal, '8.0.1');
                assert.equal(meta.libraries.comlink, '4.4.2');
                assert.equal(meta.libraries['puppeteer-core'], '25.17.0');
                if (runtime.startsWith('chrome')) assert.equal(meta.headless, true);
                assert.equal(m.samples, profile === 'primary' ? 9 : 5);
                assert.equal(m.iterations, profile === 'primary' ? 4096 : 2048);
                assert.equal(m.warmupCalls, m.iterations);
                assert.equal(m.latencyGroups, 128);
                assert.deepEqual(m.concurrencies, profile === 'primary' ? [1, 16, 64] : [1, 64]);
                assert.deepEqual(m.sizes, profile === 'primary' ? [1024] : [0, 65536]);
                assert.deepEqual(m.names, selected);
                assert.equal(m.topology.includes('real Worker'), runtime === 'chrome-worker');
                const rotated = [...selected.slice(round - 1), ...selected.slice(0, round - 1)];
                assert.deepEqual(
                    data.results.map((r) => [r.concurrency, r.textBytes, r.library]),
                    m.concurrencies.flatMap((c) =>
                        m.sizes.flatMap((s) => rotated.map((n) => [c, s, n]))
                    )
                );
                for (const row of data.results) {
                    assert.equal(row.callsPerSample, m.iterations);
                    assert.equal(
                        row.checkedCalls,
                        m.warmupCalls + m.samples * m.iterations + 128 * row.concurrency
                    );
                    assert.equal(row.opsPerSecond.samples.length, m.samples);
                    assert.ok(row.opsPerSecond.samples.every((v) => Number.isFinite(v) && v > 0));
                    const summary = describe(row.opsPerSecond.samples);
                    for (const field of ['median', 'min', 'max'])
                        assert.equal(row.opsPerSecond[field], summary[field]);
                    const latency = row.latencyMs.samples;
                    assert.equal(latency.length, 128);
                    assert.ok(latency.every((v) => Number.isFinite(v) && v >= 0));
                    assert.deepEqual(
                        latency,
                        [...latency].sort((a, b) => a - b)
                    );
                    for (const [name, p] of [
                        ['p50', 0.5],
                        ['p95', 0.95],
                        ['p99', 0.99]
                    ])
                        assert.equal(row.latencyMs[name], latency[Math.floor(127 * p)]);
                }
                datasets.push({ profile, runtime, round, variant, data, file });
            }
const comparisons = [];
for (const profile of ['primary', 'guard'])
    for (const runtime of runtimes)
        for (const name of profile === 'primary' ? names : [names[0], names[1], names[4], names[5]])
            for (const concurrency of profile === 'primary' ? [1, 16, 64] : [1, 64])
                for (const textBytes of profile === 'primary' ? [1024] : [0, 65536]) {
                    const observations = (variant) =>
                        [1, 2, 3].map((round) =>
                            datasets
                                .find(
                                    (d) =>
                                        d.profile === profile &&
                                        d.runtime === runtime &&
                                        d.round === round &&
                                        d.variant === variant
                                )
                                .data.results.find(
                                    (r) =>
                                        r.library === name &&
                                        r.concurrency === concurrency &&
                                        r.textBytes === textBytes
                                )
                        );
                    const base = observations('baseline'),
                        next = observations('candidate');
                    comparisons.push({
                        profile,
                        runtime,
                        library: name,
                        concurrency,
                        textBytes,
                        throughputRatio: describe(
                            next.map((r, i) => r.opsPerSecond.median / base[i].opsPerSecond.median)
                        ),
                        baselineOps: describe(base.map((r) => r.opsPerSecond.median)),
                        candidateOps: describe(next.map((r) => r.opsPerSecond.median)),
                        baselineP99Ms: describe(base.map((r) => r.latencyMs.p99)),
                        candidateP99Ms: describe(next.map((r) => r.latencyMs.p99))
                    });
                }
const sizes = {};
for (const variant of ['baseline', 'candidate']) {
    const bytes = await readFile(directory + variant + '/crossbus.min.js');
    sizes[variant] = {
        raw: bytes.length,
        gzip9: gzipSync(bytes, { level: 9 }).length,
        sha256: sha(bytes)
    };
}
const summary = {
    datasets: datasets.length,
    checkedCalls: datasets.reduce(
        (n, d) => n + d.data.results.reduce((s, r) => s + r.checkedCalls, 0),
        0
    ),
    reportScriptSha256: sha(await readFile('experiments/next-release/report.js')),
    sizes,
    comparisons
};
assert.equal(summary.datasets, 48);
assert.equal(summary.checkedCalls, 25503744);
await writeFile(directory + 'summary.json', JSON.stringify(summary, null, 2) + '\n');
const ratio = (r) => `${r.median.toFixed(2)} (${r.min.toFixed(2)}–${r.max.toFixed(2)})`;
let markdown =
    '# 0.1.5 candidate RPC observations\n\nGenerated by `node experiments/next-release/report.js` after verifying all 48 datasets and input hashes. Ratios are candidate/baseline paired-process medians and observed ranges, not confidence intervals. Includes unchanged controls and unfavorable cases. See [method and interpretation](../../docs/NEXT_RELEASE.md).\n\n';
for (const profile of ['primary', 'guard']) {
    markdown += `## ${profile}\n\n| Runtime | Library | Concurrent | Text bytes | Throughput ratio | Candidate calls/s | Burst p99 baseline → candidate ms |\n|---|---|---:|---:|---:|---:|---:|\n`;
    for (const c of comparisons.filter((c) => c.profile === profile))
        markdown += `| ${c.runtime} | ${c.library} | ${c.concurrency} | ${c.textBytes} | ${ratio(c.throughputRatio)} | ${Math.round(c.candidateOps.median).toLocaleString('en-US')} | ${c.baselineP99Ms.median.toFixed(2)} → ${c.candidateP99Ms.median.toFixed(2)} |\n`;
    markdown += '\n';
}
await writeFile(directory + 'RESULTS.md', markdown.trimEnd() + '\n');
console.log(
    'Verified',
    summary.datasets,
    'datasets;',
    summary.checkedCalls,
    'checked RPCs;',
    sizes
);
console.table(
    comparisons
        .filter((c) => c.profile === 'primary' && c.concurrency === 64)
        .map((c) => ({
            runtime: c.runtime,
            library: c.library,
            ratio: ratio(c.throughputRatio),
            ops: Math.round(c.candidateOps.median)
        }))
);
