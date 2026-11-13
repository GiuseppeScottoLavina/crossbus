// Validate the complete retained study before deriving any performance claim.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const directory = 'benchmarks/rpc-batching/';
const runtimes = ['node', 'bun', 'chrome', 'chrome-worker'];
const kinds = ['stock', 'batch16', 'batch64', 'group', 'birpc', 'penpal'];
const cache = new Map();
const measured = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await read(path));
const median = values => [...values].sort((a, b) => a - b)[values.length >>> 1];
const describe = samples => ({ median: median(samples), min: Math.min(...samples), max: Math.max(...samples), samples });
const finite = value => assert.ok(Number.isFinite(value) && value >= 0);
const sameSet = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
const expectedCore = 'a4cbc5b9610d41a4c0d73b7b3221f75084909f7e3e1c9da3613f40a72e5caff3';
assert.equal(digest(await read(directory + 'runtime/crossbus.min.js')), expectedCore);
assert.equal((await json(directory + 'runtime/manifest.json')).sha256, expectedCore);

async function verifyHashes(report) {
    assert.equal(report.metadata.hashes['dist/crossbus.min.js'], expectedCore);
    for (const [file, hash] of Object.entries(report.metadata.hashes)) {
        if (!cache.has(file)) cache.set(file, digest(await read(file)));
        assert.equal(cache.get(file), hash, 'Measured input changed: ' + file);
    }
}

async function load(name, runtime, plan) {
    const file = directory + name + '.json';
    const report = await json(file);
    await verifyHashes(report);
    const m = report.methodology;
    for (const field of ['samples', 'iterations', 'warmup', 'hooks']) assert.equal(m[field], plan[field], file + ': ' + field);
    assert.equal(m.latencyGroups, 128);
    assert.equal(m.packetCalls, 1024);
    assert.equal(m.worker, runtime === 'chrome-worker');
    sameSet(m.kinds, plan.kinds);
    sameSet(m.sizes, plan.sizes);
    sameSet(m.concurrencies, plan.concurrencies);
    assert.equal(report.metadata.platform, 'darwin');
    assert.equal(report.metadata.arch, 'arm64');
    assert.equal(report.metadata.cpu, 'Apple M1 Max');
    assert.equal(report.metadata.libraries.birpc, '4.2.0');
    assert.equal(report.metadata.libraries.penpal, '8.0.1');
    assert.match(report.metadata.runtime, runtime.startsWith('chrome') ? /^HeadlessChrome\// : runtime === 'bun' ? /^Bun / : /^Node /);
    const expected = new Set(plan.kinds.flatMap(kind => plan.concurrencies.flatMap(c => plan.sizes.map(size => `${kind}/${c}/${size}`))));
    assert.equal(report.results.length, expected.size);
    for (const r of report.results) {
        assert.ok(expected.delete(`${r.kind}/${r.concurrency}/${r.textBytes}`), 'Duplicate or unexpected result');
        assert.equal(r.opsPerSecond.samples.length, m.samples);
        for (const value of r.opsPerSecond.samples) { finite(value); assert.ok(value > 0); }
        assert.equal(r.opsPerSecond.median, median(r.opsPerSecond.samples));
        assert.equal(r.opsPerSecond.min, Math.min(...r.opsPerSecond.samples));
        assert.equal(r.opsPerSecond.max, Math.max(...r.opsPerSecond.samples));
        assert.equal(r.latencyMs.samples.length, m.latencyGroups);
        const ordered = [...r.latencyMs.samples].sort((a, b) => a - b);
        assert.deepEqual(r.latencyMs.samples, ordered);
        for (const value of ordered) finite(value);
        for (const [field, p] of [['p50', .5], ['p95', .95], ['p99', .99]]) assert.equal(r.latencyMs[field], ordered[Math.floor((ordered.length - 1) * p)]);
        assert.equal(r.logicalCalls, m.warmup + m.samples * m.iterations + m.latencyGroups * r.concurrency + m.packetCalls);
        assert.equal(r.packetPhaseCalls, m.packetCalls);
        if (r.transport) { assert.equal(r.transport.queued, 0); if ('replyMappings' in r.transport) assert.equal(r.transport.replyMappings, 0); }
        const grouped = r.kind === 'group' && !m.hooks;
        if (!r.kind.startsWith('batch')) {
            const count = grouped ? m.packetCalls / r.concurrency : m.packetCalls;
            assert.equal(r.clientPackets, count);
            assert.equal(r.serverPackets, count);
        } else {
            assert.ok(Number.isInteger(r.clientPackets) && Number.isInteger(r.serverPackets));
            assert.ok(r.clientPackets > 0 && r.serverPackets > 0);
            if (r.concurrency === 1) assert.equal(r.clientPackets, m.packetCalls);
            else assert.ok(r.clientPackets < m.packetCalls && r.serverPackets < m.packetCalls);
        }
    }
    assert.equal(expected.size, 0);
    measured.push({ file, sha256: digest(await read(file)), runtime, report });
    return report;
}

const plans = {
    primary: { samples: 9, iterations: 4096, warmup: 4096, hooks: false, sizes: [1024], concurrencies: [1, 16, 64], kinds },
    guard: { samples: 5, iterations: 2048, warmup: 2048, hooks: false, sizes: [0, 65536], concurrencies: [1, 64], kinds: kinds.filter(k => k !== 'batch64') },
    hooks: { samples: 9, iterations: 2048, warmup: 2048, hooks: true, sizes: [1024], concurrencies: [16, 64], kinds: ['stock', 'group'] }
};
const data = {};
for (const [profile, plan] of Object.entries(plans)) {
    data[profile] = {};
    for (const runtime of profile === 'hooks' ? ['node', 'chrome-worker'] : runtimes) {
        data[profile][runtime] = [];
        for (let n = 1; n <= 3; n++) data[profile][runtime].push(await load(`${profile}-${runtime}-${n}`, runtime, plan));
    }
}
const paired = {};
for (const runtime of runtimes) {
    paired[runtime] = [];
    for (let n = 1; n <= 3; n++) {
        const pair = {};
        for (const variant of ['stock', 'group']) pair[variant] = await load(`isolated-${runtime}-${variant}-${n}`, runtime, { ...plans.primary, concurrencies: [16, 64], kinds: [variant, 'birpc', 'penpal'] });
        paired[runtime].push(pair);
    }
}
assert.equal(measured.length, 54);
const lifecycleFile = directory + 'lifecycle-node.json';
const lifecycle = await json(lifecycleFile);
await verifyHashes(lifecycle);
assert.equal(lifecycle.methodology.rounds, 7);
assert.equal(lifecycle.methodology.warmupRounds, 1);
assert.equal(lifecycle.methodology.pairsPerRound, 20);
assert.equal(lifecycle.methodology.pendingPerPair, 16);
assert.equal(lifecycle.results.length, 21);
const rounds = new Set();
for (const r of lifecycle.results) {
    assert.ok(['stock', 'batch16', 'group'].includes(r.kind));
    assert.ok(Number.isInteger(r.round) && r.round >= 0 && r.round < 7);
    assert.ok(!rounds.has(`${r.kind}/${r.round}`)); rounds.add(`${r.kind}/${r.round}`);
    assert.equal(r.cancelled, 320);
    for (const field of ['timeoutResources', 'pendingAfter', 'queuedAfter']) assert.equal(r[field], 0);
}

const result = (report, kind, c, size = 1024) => report.results.find(r => r.kind === kind && r.concurrency === c && r.textBytes === size);
const rates = (reports, kind, c, size = 1024) => describe(reports.map(d => result(d, kind, c, size).opsPerSecond.median));
const ratio = (reports, kind, c, size = 1024) => describe(reports.map(d => result(d, kind, c, size).opsPerSecond.median / result(d, 'stock', c, size).opsPerSecond.median));
const pairedSummary = runtimes.flatMap(runtime => [16, 64].map(concurrency => ({
    runtime, concurrency,
    throughputRatio: describe(paired[runtime].map(p => result(p.group, 'group', concurrency).opsPerSecond.median / result(p.stock, 'stock', concurrency).opsPerSecond.median)),
    controls: Object.fromEntries(['birpc', 'penpal'].map(k => [k, describe(paired[runtime].map(p => result(p.group, k, concurrency).opsPerSecond.median / result(p.stock, k, concurrency).opsPerSecond.median))])),
    latencyMs: Object.fromEntries(['stock', 'group'].map(k => [k, Object.fromEntries(['p50', 'p95', 'p99'].map(q => [q, describe(paired[runtime].map(p => result(p[k], k, concurrency).latencyMs[q]))]))]))
})));
const summary = {
    scope: 'Opt-in research outside npm exports; explicit bulk graph semantics differ from independent calls.',
    verifiedFiles: [...measured.map(({ file, sha256 }) => ({ file, sha256 })), { file: lifecycleFile, sha256: digest(await read(lifecycleFile)) }],
    reportScriptSha256: digest(await read('experiments/rpc-batching/report.js')),
    coreSha256: expectedCore,
    provenance: Object.fromEntries(runtimes.map(rt => [rt, data.primary[rt][0].metadata])),
    checkedLogicalCalls: measured.reduce((total, d) => total + d.report.results.reduce((t, r) => t + r.logicalCalls, 0), 0),
    paired: pairedSummary,
    primary: runtimes.flatMap(runtime => [1, 16, 64].map(concurrency => ({ runtime, concurrency, rates: Object.fromEntries(kinds.map(k => [k, rates(data.primary[runtime], k, concurrency)])) }))),
    guards: runtimes.flatMap(runtime => [0, 65536].flatMap(textBytes => [1, 64].map(concurrency => ({ runtime, textBytes, concurrency, groupRatio: ratio(data.guard[runtime], 'group', concurrency, textBytes) })))),
    hooks: ['node', 'chrome-worker'].flatMap(runtime => [16, 64].map(concurrency => ({ runtime, concurrency, groupRatio: ratio(data.hooks[runtime], 'group', concurrency) }))),
    lifecycle
};
await writeFile(new URL(directory + 'summary.json', root), JSON.stringify(summary, null, 2) + '\n');
const x = value => value.toFixed(2) + '×';
const range = d => x(d.min) + '–' + x(d.max);
const ratioCell = d => x(d.median) + ' (' + range(d) + ')';
const ms = value => value.toFixed(3);
const table = (headers, rows) => '| ' + headers.join(' | ') + ' |\n| ' + headers.map(() => '---').join(' | ') + ' |\n' + rows.map(row => '| ' + row.join(' | ') + ' |').join('\n');
const gh = 'https://github.com/GiuseppeScottoLavina/crossbus/blob/perf/rpc-batching/';
const text = `# Explicit RPC grouping research — 13 November 2026

This is an opt-in prototype outside the npm package and export map. It does not change the approved 0.1.3 runtime, its default wire format, or the existing batch-signals plugin. The exact approved runtime is archived with SHA-256 \`${expectedCore}\`. Both endpoints must opt into the adapter. There is no automatic capability negotiation.

Explicit groups improve some concurrent echo workloads. Single-call performance does not improve consistently; real Worker gains are smaller and variable. These measurements do not establish a universal performance lead. Competitor results below use individual RPCs; equivalent bulk methods in those libraries were not implemented or measured.

## Why a separate explicit operation

The strict transparent control (batch16/batch64) snapshots each request independently before postponing its native send. That preserves independent-call object graphs, but adds structured clones. Fewer postMessage calls do not necessarily make it faster; the throughput table retains these negative results.

The explicit operation sends 1–64 normal CrossBus request envelopes in one native structured-clone graph, and can group replies already ready in the first microtask checkpoint. Slow replies are sent separately and do not block ready replies. Shared references between group inputs remain shared remotely. Some ready reply graphs may also share references, while later replies do not: applications must not depend on inter-result identity. This is a new value-oriented contract, not a transparent replacement for independent calls.

Each member still uses normal bus payload/pending limits, handler authorization, rate limits, hooks, timeout and transport-bound peer checks. Asynchronous outbound hooks may miss the synchronous grouping window and fall back to individual sends. A native clone failure closes the binding and cancels pending requests to that peer. Groups are not transactions and do not roll back executed handlers.

See the [prototype contract and runnable demo](${gh}experiments/rpc-batching/README.md), [implementation](${gh}experiments/rpc-batching/group-transport.js), and [regression tests](${gh}tests/experiments/rpc-group.test.js). These files are deliberately excluded from npm; no documented package API for grouping is claimed.

## Primary evidence: separate process pairs

Apple M1 Max, macOS arm64; ${data.primary.node[0].metadata.runtime}, ${data.primary.bun[0].metadata.runtime}, ${data.primary.chrome[0].metadata.runtime}. Chrome is headless. The non-Worker topology uses two real MessagePorts in one process/page; Worker results use an actual module Worker. Payloads contain a 1 KiB ASCII text field, excluding envelope overhead, with distinct preallocated objects per operation.

Three fresh stock/group process pairs per runtime alternate which variant runs first. Each process also measures unchanged birpc/Penpal controls. Within each process: 4,096 warmup calls per case, nine samples of 4,096 calls, rotating library order; cached remote methods, startup excluded. Ratios below divide each paired process's throughput medians; the reported median and range span three pairs. They are observed ranges, not confidence intervals. Controls expose process variation and are not used to normalize away unfavorable results.

${table(['Runtime', 'Concurrent calls', 'Group / stock (range)', 'Unchanged birpc ratio (range)', 'Unchanged Penpal ratio (range)'], pairedSummary.map(r => [r.runtime, r.concurrency, ratioCell(r.throughputRatio), ratioCell(r.controls.birpc), ratioCell(r.controls.penpal)]))}

In the Worker case with 16 concurrent calls, at least one process pair regressed. The 64-call Worker ratios are close enough to observed control movement that they should not be treated as a robust universal acceleration. Node/Bun and same-page Chrome gains are more consistent within this retained sample.

## Complete primary throughput, including negative controls

These separate mixed-configuration processes warm all six cases, rather than isolating stock/group. Each entry is the median of three process medians, in thousands of completed logical RPCs per second. CrossBus cases use standard MessageChannel encoding, default secure bus guards and 30 s timeouts. birpc 4.2.0 uses its default 60 s timeout; Penpal 8.0.1 uses explicit 30 s call timeouts. All receive exactly one application argument and return the same verified echo. Their broader APIs and validation work differ; this is not a claim of equivalent full feature sets or equivalent bulk APIs.

${table(['Runtime', 'Calls', 'Stock kRPC/s', 'Strict16', 'Strict64', 'Explicit group', 'birpc', 'Penpal'], summary.primary.map(r => [r.runtime, r.concurrency, ...kinds.map(k => (r.rates[k].median / 1000).toFixed(1))]))}

## Burst completion latency

Separate from throughput: 128 burst completion RTT samples per condition/process, including grouping and full result verification. Values below are medians of three paired-process percentiles, in milliseconds. They measure the entire group, not an individual request's latency. The JSON summary retains observed ranges and all raw files retain the samples. Browser clock quantization is preserved; sub-millisecond tails are exploratory rather than production latency guarantees.

${table(['Runtime', 'Calls', 'Stock p50 / p95 / p99 ms', 'Group p50 / p95 / p99 ms'], pairedSummary.map(r => [r.runtime, r.concurrency, ...['stock', 'group'].map(k => ['p50', 'p95', 'p99'].map(q => ms(r.latencyMs[k][q].median)).join(' / '))]))}

## Native sends, correctness and lifecycle

Counting starts only after timed throughput and latency, avoiding a batching advantage from reduced instrumentation overhead. In the untimed phase, for 1,024 logical calls with this immediate echo handler, all retained no-hook group cases sent exactly:

${table(['Concurrent calls', 'Stock client / server sends', 'Group client / server sends'], [1, 16, 64].map(c => [c, '1,024 / 1,024', (1024 / c) + ' / ' + (1024 / c)]))}

The reduction in sends is not an equal multiplier in throughput: serialization, Promise settlement, timers, validation and scheduling remain. Every result's scalar/full text, result count and exact remote invocation count were checked. ${summary.checkedLogicalCalls.toLocaleString('en-US')} logical echo calls were checked across the 54 timing datasets. All 55 datasets' current source/runtime/dependency hashes and sample/count invariants are verified by [the report generator](${gh}experiments/rpc-batching/report.js).

The Node lifecycle study performs one warmup and seven measured rounds for stock/strict16/group. Each measured round destroys 20 pairs with 16 pending requests each: all 320 requests cancel, pending/queued work is zero, and timeout resources return to zero after the event-loop checkpoint. This covers the measured teardown path, not universal leak freedom. The 40 prototype tests separately cover malformed/nested packets, failed hooks, wrong peers, budgets/rates, snapshot isolation, mixed slow/error replies, full groups, clone failure, direct ArrayBuffer ownership transfer, serialization-getter reentrancy and nested groups. Core source line coverage does not include these experimental files.

## Payload and hook guard conditions

Guard runs use five samples of 2,048 calls after 2,048 warmup calls in each of three fresh processes. Ratios are explicit group / stock, median and observed range. Empty text still includes the scalar/object envelope; 65,536 bytes describes ASCII text only. Large-payload and serial regressions remain visible.

${table(['Runtime', 'Text bytes', 'Calls', 'Group / stock (range)'], summary.guards.map(r => [r.runtime, r.textBytes, r.concurrency, ratioCell(r.groupRatio)]))}

One asynchronous no-op inbound and outbound hook per CrossBus endpoint is enabled in the hook runs (nine samples of 2,048 calls after 2,048 warmup calls). These calls retain the hooks and use ordinary sends: exactly 1,024 client and 1,024 server posts for the validation phase. The prototype does not optimize this asynchronous pipeline.

${table(['Runtime', 'Calls', 'Group / stock with hooks (range)'], summary.hooks.map(r => [r.runtime, r.concurrency, ratioCell(r.groupRatio)]))}

## Reproduction and limits

Run after building, one timing command at a time with other workloads stopped. The full retained matrix is:

\`\`\`sh
for runtime in node bun chrome; do
  node experiments/rpc-batching/isolated.js --runtime "$runtime"
  node experiments/rpc-batching/isolated.js --runtime "$runtime" --profile guard
  node experiments/rpc-batching/paired.js --runtime "$runtime"
done
node experiments/rpc-batching/isolated.js --runtime chrome --worker
node experiments/rpc-batching/isolated.js --runtime chrome --worker --profile guard
node experiments/rpc-batching/paired.js --runtime chrome --worker
node experiments/rpc-batching/isolated.js --runtime node --profile hooks
node experiments/rpc-batching/isolated.js --runtime chrome --worker --profile hooks
node experiments/rpc-batching/lifecycle.js
bun run bench:batch:report
\`\`\`

Raw samples, timestamps, dependency versions, workload hashes, all rates and latency percentiles are retained under [benchmarks/rpc-batching](${gh}benchmarks/rpc-batching). The tree was dirty while recording because the tested prototype was uncommitted; its exact inputs are identified by hashes. Earlier provisional measurements from before the final reentrancy fixes are excluded. The measured core matches the archived approved master runtime; src/ and public exports are unchanged.

The original [competitor study](COMPETITOR_ANALYSIS.md) covers the approved runtime. This bulk experiment does not replace it. No Safari/Firefox, physical iOS/Android WebView, network, interaction/rendering or native bridge performance is established here. The experimental adapters do not yet provide protocol negotiation or a reviewed public bulk API. Further work must explicitly design those contracts and equivalent competitor bulk controls before making broader comparisons.
`;
await writeFile(new URL('docs/RPC_BATCHING.md', root), text);
console.log('Verified 55 datasets; ' + summary.checkedLogicalCalls + ' logical echo calls. Wrote summary.json and docs/RPC_BATCHING.md.');
