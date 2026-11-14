import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const manifest = await json(directory + 'candidate/manifest.json');
assert.equal(sha(await readFile(directory + 'inputs.json')), manifest.inputsSha256);
const datasets = [];
for (const runtime of ['node', 'bun', 'chrome'])
    for (let round = 1; round <= 3; round++)
        for (const variant of ['baseline', 'candidate']) {
            const file = `${directory}stream-${runtime}-${variant}-${round}.json`;
            const data = await json(file),
                m = data.methodology,
                meta = data.metadata;
            assert.equal(meta.variant, variant);
            assert.equal(meta.round, round);
            assert.equal(meta.cpu, 'Apple M1 Max');
            assert.equal(
                meta.runtime,
                runtime === 'node'
                    ? 'Node v24.15.0'
                    : runtime === 'bun'
                      ? 'Bun 1.3.14'
                      : 'HeadlessChrome/155.0.8059.79'
            );
            const expected = [
                directory + variant + '/crossbus.min.js',
                'package-lock.json',
                'experiments/next-release/stream-workloads.js',
                'experiments/next-release/stream-run.js',
                'experiments/next-release/stream-isolated.js',
                'tests/e2e/puppeteer-helper.js'
            ];
            assert.deepEqual(Object.keys(meta.hashes).sort(), expected.sort());
            for (const [path, hash] of Object.entries(meta.hashes))
                assert.equal(
                    inputs[path] === undefined ? sha(await readFile(path)) : sha(inputs[path]),
                    hash,
                    path
                );
            assert.equal(m.samples, 7);
            assert.equal(m.iterations, 4);
            assert.equal(m.warmup, 2);
            assert.equal(m.chunkSize, 64000);
            assert.equal(m.order, round - 1);
            assert.equal(m.nativeBase64Encode, runtime !== 'node');
            assert.equal(m.nativeBase64Decode, runtime !== 'node');
            const modes =
                variant === 'baseline'
                    ? ['base64']
                    : ['base64', 'native', 'native-flow', 'native-flow-transfer'];
            assert.deepEqual(
                data.results.map((r) => [r.bytes, r.mode]),
                [1048576, 4194304].flatMap((bytes) => modes.map((mode) => [bytes, mode]))
            );
            for (const row of data.results) {
                const total = m.warmup + m.samples * m.iterations,
                    flow = row.mode.includes('flow');
                assert.equal(row.checkedTransfers, total);
                assert.equal(row.frames.length, total);
                assert.deepEqual(row.checksums, [
                    row.bytes * 127.5 * m.warmup,
                    ...Array(m.samples).fill(row.bytes * 127.5 * m.iterations)
                ]);
                const chunks = Math.ceil(row.bytes / m.chunkSize);
                for (const ledger of row.frames)
                    assert.deepEqual(
                        ledger,
                        flow
                            ? { 'open-flow': 1, ack: chunks + 2, data: chunks, end: 1 }
                            : { open: 1, data: chunks, end: 1 }
                    );
                const rates = row.mebibytesPerSecond;
                assert.equal(rates.samples.length, m.samples);
                assert.ok(rates.samples.every((v) => Number.isFinite(v) && v > 0));
                const checked = describe(rates.samples);
                for (const field of ['median', 'min', 'max'])
                    assert.equal(rates[field], checked[field]);
            }
            datasets.push({ runtime, round, variant, file, data });
        }
const comparisons = [];
for (const runtime of ['node', 'bun', 'chrome'])
    for (const bytes of [1048576, 4194304]) {
        const observations = (variant, mode) =>
            [1, 2, 3].map(
                (round) =>
                    datasets
                        .find(
                            (d) =>
                                d.runtime === runtime && d.round === round && d.variant === variant
                        )
                        .data.results.find((r) => r.bytes === bytes && r.mode === mode)
                        .mebibytesPerSecond.median
            );
        const baseline = observations('baseline', 'base64');
        for (const mode of ['base64', 'native', 'native-flow', 'native-flow-transfer']) {
            const candidate = observations('candidate', mode);
            comparisons.push({
                runtime,
                bytes,
                mode,
                baselineMiBps: describe(baseline),
                candidateMiBps: describe(candidate),
                throughputRatio: describe(candidate.map((n, i) => n / baseline[i]))
            });
        }
    }
const summary = {
    datasets: datasets.length,
    checkedTransfers: datasets.reduce(
        (n, d) => n + d.data.results.reduce((s, r) => s + r.checkedTransfers, 0),
        0
    ),
    checkedBytes: datasets.reduce(
        (n, d) => n + d.data.results.reduce((s, r) => s + r.checkedTransfers * r.bytes, 0),
        0
    ),
    reportScriptSha256: sha(await readFile('experiments/next-release/stream-report.js')),
    comparisons
};
assert.equal(summary.datasets, 18);
assert.equal(summary.checkedTransfers, 2700);
assert.equal(summary.checkedBytes, 7077888000);
await writeFile(directory + 'stream-summary.json', JSON.stringify(summary, null, 2) + '\n');
let markdown =
    '# 0.1.5 one-way binary stream observations\n\nThree fresh process pairs; raw MessageChannel in one event loop. Every received byte, exact frame/handler ledger and original ownership is checked. Ratios are paired-process medians and observed ranges, not confidence intervals. Base64 is the compatible default comparison; native and flow/transfer modes change encoding/delivery semantics. See [method and limits](../../docs/NEXT_RELEASE.md).\n\n| Runtime | MiB | Candidate mode | Baseline MiB/s | Candidate MiB/s | Ratio |\n|---|---:|---|---:|---:|---:|\n';
for (const r of comparisons) {
    const q = r.throughputRatio;
    markdown += `| ${r.runtime} | ${r.bytes / 1048576} | ${r.mode} | ${r.baselineMiBps.median.toFixed(1)} | ${r.candidateMiBps.median.toFixed(1)} | ${q.median.toFixed(2)} (${q.min.toFixed(2)}–${q.max.toFixed(2)}) |\n`;
}
await writeFile(directory + 'STREAM_RESULTS.md', markdown);
console.log(
    'Verified',
    summary.datasets,
    'stream datasets;',
    summary.checkedTransfers,
    'transfers;',
    summary.checkedBytes,
    'bytes'
);
console.table(
    comparisons.map((r) => ({
        runtime: r.runtime,
        MiB: r.bytes / 1048576,
        mode: r.mode,
        MiBps: Math.round(r.candidateMiBps.median),
        ratio: r.throughputRatio.median.toFixed(2)
    }))
);
