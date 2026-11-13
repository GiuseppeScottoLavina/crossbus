// Derive scoped claims only after verifying all retained inputs and observations.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const root = new URL('../../', import.meta.url);
const directory = 'benchmarks/worker-rpc/';
const read = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => [...values].sort((a,b)=>a-b)[values.length >> 1];
const describe = values => ({median:median(values),min:Math.min(...values),max:Math.max(...values),samples:values});
const cache = new Map();
async function verifyHashes(hashes, mapping = {}) {
    assert.ok(Object.keys(hashes).length > 0);
    for (const [file, hash] of Object.entries(hashes)) {
        const path = mapping[file] ?? file;
        if (!cache.has(path)) cache.set(path, sha(await read(path)));
        assert.equal(cache.get(path),hash,'Measured input changed: '+path);
    }
}
const baseline = await json(directory+'baseline/manifest.json');
assert.equal(baseline.commit,'6f13d80641eb9731f7d39d1d5136cf0a4b8d3e93');
assert.equal(baseline.sha256['crossbus.min.js'],'a4cbc5b9610d41a4c0d73b7b3221f75084909f7e3e1c9da3613f40a72e5caff3');
for (const [file,hash] of Object.entries(baseline.sha256)) assert.equal(sha(await read(directory+'baseline/'+file)),hash);
const candidate = await json(directory+'candidate/manifest.json');
assert.equal(candidate.version,'0.1.4');
for (const [file,entry] of Object.entries(candidate.files)) {
    assert.equal(sha(await read(directory+'candidate/'+entry.snapshot)),entry.sha256);
    assert.equal(sha(await read(file)),entry.sha256,'Candidate source/output changed: '+file);
}

const runtimes = ['node','bun','chrome','chrome-worker'];
const mainNames = ['CrossBus','CrossBus + async hooks','CrossBus compact wire','CrossBus compact + hooks','birpc cached','Penpal cached + timeout'];
const guardNames = ['CrossBus','CrossBus + async hooks','birpc cached','Penpal cached + timeout'];
const datasets = [];
const finite = value => assert.ok(Number.isFinite(value) && value >= 0);
for (const profile of ['primary','guard']) for (const runtime of runtimes) for (let round=1;round<=3;round++) for (const variant of ['baseline','candidate']) {
    const file=directory+`${profile}-${runtime}-${variant}-${round}.json`;
    const data=await json(file), m=data.methodology, meta=data.metadata;
    const expectedInputs=[directory+variant+'/crossbus.min.js',directory+variant+'/nano.min.js',
        'experiments/worker-rpc/workloads.js','experiments/worker-rpc/competitor-worker.js','experiments/worker-rpc/run.js','experiments/worker-rpc/isolated.js',
        'package-lock.json','tests/e2e/puppeteer-helper.js','node_modules/puppeteer-core/package.json',
        'node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs','node_modules/comlink/dist/esm/comlink.mjs'];
    assert.deepEqual(Object.keys(meta.hashes).sort(),expectedInputs.sort());
    await verifyHashes(meta.hashes);
    assert.equal(meta.artifact, directory+variant+'/crossbus.min.js');
    assert.equal(meta.artifactVersion,variant==='baseline'?'0.1.3':'0.1.4');
    assert.equal(meta.cpu,'Apple M1 Max');
    assert.equal(meta.platform,'darwin');assert.equal(meta.arch,'arm64');
    if(runtime.startsWith('chrome')){assert.equal(meta.runtime,'HeadlessChrome/155.0.8059.79');assert.equal(meta.headless,true);}
    else assert.ok(meta.runtime.startsWith(runtime==='node'?'Node v24.15.0':'Bun 1.3.14'));
    assert.equal(meta.libraries.birpc,'4.2.0');assert.equal(meta.libraries.penpal,'8.0.1');
    assert.equal(meta.libraries.comlink,'4.4.2');assert.equal(meta.libraries['puppeteer-core'],'25.17.0');
    assert.equal(m.samples,profile==='primary'?9:5);
    assert.equal(m.iterations,profile==='primary'?4096:2048);
    assert.equal(m.warmupCalls,profile==='primary'?4096:2048);
    assert.equal(m.latencyGroups,128);
    assert.deepEqual(m.names,profile==='primary'?mainNames:guardNames);
    assert.deepEqual(m.concurrencies,profile==='primary'?[1,16,64]:[1,64]);
    assert.deepEqual(m.sizes,profile==='primary'?[1024]:[0,65536]);
    assert.equal(m.order,'Rotate library order each round; repeat this suite in fresh processes');
    // The harness records the order policy under `order`; verify the actual
    // process rotation from the ordered result rows, rather than inventing a
    // numeric metadata field which the retained observations do not contain.
    const rotation=round-1;
    const orderedNames=[...m.names.slice(rotation),...m.names.slice(0,rotation)];
    assert.deepEqual(data.results.map(row=>[row.concurrency,row.textBytes,row.library]),
        m.concurrencies.flatMap(c=>m.sizes.flatMap(size=>orderedNames.map(name=>[c,size,name]))));
    assert.equal(m.topology.includes('real Worker'),runtime==='chrome-worker');
    assert.equal(data.results.length,m.names.length*m.concurrencies.length*m.sizes.length);
    const keys = new Set();
    for (const row of data.results) {
        assert.ok(m.names.includes(row.library));assert.ok(m.concurrencies.includes(row.concurrency));assert.ok(m.sizes.includes(row.textBytes));
        const key=[row.library,row.concurrency,row.textBytes].join('/');assert.ok(!keys.has(key));keys.add(key);
        assert.equal(row.callsPerSample,m.iterations);
        assert.equal(row.checkedCalls,m.warmupCalls+m.samples*m.iterations+128*row.concurrency);
        assert.equal(row.opsPerSecond.samples.length,m.samples);
        for(const value of row.opsPerSecond.samples){finite(value);assert.ok(value>0);}
        for(const field of ['median','min','max'])assert.equal(row.opsPerSecond[field],describe(row.opsPerSecond.samples)[field]);
        const latencies=row.latencyMs.samples;
        assert.equal(latencies.length,128);latencies.forEach(finite);
        assert.deepEqual(latencies,[...latencies].sort((a,b)=>a-b));
        for(const [name,p] of [['p50',.5],['p95',.95],['p99',.99]])assert.equal(row.latencyMs[name],latencies[Math.floor(127*p)]);
    }
    datasets.push({file,profile,runtime,round,variant,data});
}
assert.equal(datasets.length,48);

const profiles = await json(directory+'profiles/summary.json');
await verifyHashes(profiles.hashes,{'package-lock.json':directory+'baseline/package-lock.json'});
assert.equal(profiles.results.length,24);
for(const row of profiles.results){
    const profile=await json(directory+'profiles/'+row.filename);
    assert.equal(profile.samples.length,profile.timeDeltas.length);
    assert.equal(profile.timeDeltas.reduce((a,b)=>a+b,0),row.sampledUs);
    assert.equal(row.checked,32768);
    assert.ok(profile.nodes.every(node=>!node.callFrame.url.includes('127.0.0.1')));
}
const uuid = {};
for(const runtime of ['node','bun','chrome']){
    const data=await json(directory+'uuid-'+runtime+'.json');await verifyHashes(data.hashes);
    uuid[runtime]={};
    for(const context of runtime==='chrome'?['local','worker']:['local']){
        const row=data[context];assert.equal(row.samples,9);assert.equal(row.iterations,100000);assert.equal(row.warmup,10000);assert.equal(row.draws,Math.ceil(910000/128));
        assert.equal(row.results.length,18);
        uuid[runtime][context]={};
        for(const kind of ['native','pooled']){
            const samples=row.results.filter(r=>r.kind===kind);assert.equal(samples.length,9);
            assert.deepEqual(samples.map(r=>r.sample),[0,1,2,3,4,5,6,7,8]);
            for(const r of samples){assert.ok(r.checksum>0);finite(r.opsPerSecond);}
            uuid[runtime][context][kind]=describe(samples.map(r=>r.opsPerSecond));
        }
    }
}

function observation(profile,runtime,variant,round,name,concurrency,size){
    const d=datasets.find(d=>d.profile===profile&&d.runtime===runtime&&d.variant===variant&&d.round===round);
    return d.data.results.find(r=>r.library===name&&r.concurrency===concurrency&&r.textBytes===size);
}
const comparisons=[];
for(const profile of ['primary','guard'])for(const runtime of runtimes)for(const name of profile==='primary'?mainNames:guardNames)for(const concurrency of profile==='primary'?[1,16,64]:[1,64])for(const size of profile==='primary'?[1024]:[0,65536]){
    const base=[],next=[];
    for(let round=1;round<=3;round++){
        base.push(observation(profile,runtime,'baseline',round,name,concurrency,size));
        next.push(observation(profile,runtime,'candidate',round,name,concurrency,size));
    }
    comparisons.push({profile,runtime,library:name,concurrency,textBytes:size,
        throughputRatio:describe(next.map((r,i)=>r.opsPerSecond.median/base[i].opsPerSecond.median)),
        baselineOps:describe(base.map(r=>r.opsPerSecond.median)),candidateOps:describe(next.map(r=>r.opsPerSecond.median)),
        baselineP99Ms:describe(base.map(r=>r.latencyMs.p99)),candidateP99Ms:describe(next.map(r=>r.latencyMs.p99))});
}
const sizes={};
for(const variant of ['baseline','candidate']){
    const bytes=await read(directory+variant+'/crossbus.min.js');
    sizes[variant]={raw:bytes.length,gzip9:gzipSync(bytes,{level:9}).length,sha256:sha(bytes)};
}
const summary={datasets:48,checkedCalls:datasets.reduce((total,d)=>total+d.data.results.reduce((sum,r)=>sum+r.checkedCalls,0),0),
    reportScriptSha256:sha(await read('experiments/worker-rpc/report.js')),sizes,uuid,comparisons};
await writeFile(new URL(directory+'summary.json',root),JSON.stringify(summary)+'\n');
const find=(profile,runtime,name,c,size=1024)=>comparisons.find(r=>r.profile===profile&&r.runtime===runtime&&r.library===name&&r.concurrency===c&&r.textBytes===size);
const ratio=row=>`${row.throughputRatio.median.toFixed(2)}× (${row.throughputRatio.min.toFixed(2)}–${row.throughputRatio.max.toFixed(2)})`;
const integer=n=>Math.round(n).toLocaleString('en-US');
const gh='https://github.com/giuseppescottolavina/crossbus/tree/master/';
let text=`# Worker RPC optimization — 0.1.4 development candidate

This study compares a frozen 0.1.3 runtime with the unreleased 0.1.4 candidate. It measures individual RPCs with the existing default security/resource checks. It does not establish a universal performance lead or qualify iOS/Android, Safari or Firefox. Both exact bundles and source snapshots are retained under [benchmarks/worker-rpc](${gh}benchmarks/worker-rpc).

At 64 concurrent 1 KiB calls, standard Chrome Worker throughput has a paired median ratio of ${ratio(find('primary','chrome-worker','CrossBus',64))}; compact has ${ratio(find('primary','chrome-worker','CrossBus compact wire',64))}. Same-page standard Chrome improves across the three tested concurrency levels. Worker standard plus async hooks at 64 calls is mixed (${ratio(find('primary','chrome-worker','CrossBus + async hooks',64))}). Node/Bun show no general gain, and the guard matrix retains a Bun empty-payload regression and a Chrome Worker 64 KiB regression. Tail latency also worsens in some cases. The candidate increases minified gzip size by ${integer(sizes.candidate.gzip9-sizes.baseline.gzip9)} bytes. These tradeoffs rule out a blanket speedup claim.

## Changes and CPU evidence

Baseline CPU profiles cover a real Chrome module Worker, 1/16/64 concurrent calls, 1/64 KiB text and synchronous/asynchronous-hook configurations. Each case warms up 4,096 checked calls and samples another 32,768. Both endpoint profiles retain idle and GC samples. At 1 KiB / 64 calls, native UUID generation is a visible cost; the monolithic message-handler frame also includes native lazy deserialization. Self-time samples are diagnostic, not exact native-operation costs or uninstrumented throughput.

The candidate consumes 16 fresh Web Crypto bytes per UUID from 2,048-byte refills and builds canonical UUID v4 strings from numeric code units. The initial concatenating-string formatter showed mixed RPC results and was replaced before this study; those provisional timings are excluded. Node/Bun keep their native UUID path. A separate [UUID diagnostic](${gh}experiments/worker-rpc/uuid-probe.js) measures formatting/checksum overhead too; it cannot substitute for RPC measurements.

The same candidate fixes serialized MessageChannel/PostMessage input, transfer-list ownership in JSON mode, typed-view transfer discovery and shadowed buffer-budget properties. Default transport encoding remains structured clone with automatic transfer disabled. Timed text workloads do not measure binary transfer performance, the JSON fallback or a change in ownership semantics. Regression tests exercise those fixes separately with valid RPCs, rejected protected handlers and real Chrome Workers/windows.

Inspection of the pinned competitor sources explains some remaining costs: birpc creates a 21-character Math.random-based call ID and returns a short record containing the same ID; Penpal generates one UUID for a call and reuses it for the reply. CrossBus uses a counter/timestamp request ID and generates a fresh UUID for the response envelope, in addition to carrying the original request ID. It builds immutable envelopes and enforces payload/pending budgets, bound-peer response matching and handler checks. Pooling removes repeated Web Crypto provider calls but keeps that protocol and those checks. Native cloning, timers, Promise settlement and Worker scheduling remain. This source-level diagnosis does not assign an exact fraction of the speed gap to each feature; all compared module hashes are recorded in the datasets.

## Method

Apple M1 Max, macOS arm64. ${datasets.find(d=>d.runtime==='node').data.metadata.runtime}; ${datasets.find(d=>d.runtime==='bun').data.metadata.runtime}; ${datasets.find(d=>d.runtime==='chrome').data.metadata.runtime} (headless). Node/Bun and same-page Chrome use two real MessagePorts in one event loop. Worker rows use an actual module Worker; startup is excluded and scheduling is included.

Three fresh baseline/candidate process pairs per runtime alternate variant order. Primary cases: 4,096 warmup calls, nine samples of 4,096 checked calls and 128 separately sampled burst-completion RTTs per case. Guard cases: 2,048 warmup calls, five samples of 2,048 and the same RTT sample count. Library order rotates across samples/process pairs. Distinct preallocated member objects carry an ASCII text field (sizes exclude the envelope). Every scalar/full text, response count and exact remote invocation count is checked. ${integer(summary.checkedCalls)} calls were checked across 48 datasets.

Ratios below are candidate/baseline paired process medians, then median and observed range across three pairs. Ranges are not confidence intervals. Unchanged controls expose process/JIT variation and do not normalize away unfavorable results. Latency is completion of the whole concurrent burst, not a single-call percentile. Chrome clock quantization and only 128 latency samples limit tail precision; raw p50/p95/p99 values are retained. No profiler, build or test ran concurrently with these timings.

CrossBus uses createSecure(), default payload/pending limits, transport-bound peers and 30-second request timeouts. Comparators are birpc 4.2.0 with its default 60-second timeout and Penpal 8.0.1 with cached methods and an explicit 30-second timeout. Their authorization/validation APIs differ. Both controls use individual calls, native structured clone and the same payload checks in the harness. These are application comparisons, not equivalent security-feature implementations. Comlink 4.4.2 is installed and supported by the harness but is not timed in this matrix; see the earlier [competitor study](COMPETITOR_ANALYSIS.md) for its measured configurations.

## Primary throughput ratios: 1 KiB text

| Runtime | Concurrent | Standard | Standard + async hooks | Compact | Compact + async hooks |
|---|---:|---:|---:|---:|---:|
`;
for(const runtime of runtimes)for(const c of [1,16,64])text+=`| ${runtime} | ${c} | ${mainNames.slice(0,4).map(name=>ratio(find('primary',runtime,name,c))).join(' | ')} |\n`;
text+=`\n## Candidate absolute throughput: 64 concurrent, 1 KiB\n\nMedian across three candidate process medians, checked calls/second. Feature differences above still apply.\n\n| Runtime | Standard | Compact | birpc cached | Penpal + timeout |\n|---|---:|---:|---:|---:|\n`;
for(const runtime of runtimes)text+=`| ${runtime} | ${['CrossBus','CrossBus compact wire','birpc cached','Penpal cached + timeout'].map(name=>integer(find('primary',runtime,name,64).candidateOps.median)).join(' | ')} |\n`;
text+=`\n## Unchanged controls: primary throughput ratios\n\n| Runtime | Concurrent | birpc | Penpal + timeout |\n|---|---:|---:|---:|\n`;
for(const runtime of runtimes)for(const c of [1,16,64])text+=`| ${runtime} | ${c} | ${ratio(find('primary',runtime,'birpc cached',c))} | ${ratio(find('primary',runtime,'Penpal cached + timeout',c))} |\n`;
text+=`\n## Guards: empty and 64 KiB text\n\nAll cases and negative ratios are retained. These cases use fewer samples; compare their control ranges before attributing changes to the candidate.\n\n| Runtime | Text bytes | Concurrent | Standard | Standard + hooks | birpc control | Penpal control |\n|---|---:|---:|---:|---:|---:|---:|\n`;
for(const runtime of runtimes)for(const size of [0,65536])for(const c of [1,64])text+=`| ${runtime} | ${size} | ${c} | ${guardNames.map(name=>ratio(find('guard',runtime,name,c,size))).join(' | ')} |\n`;
text+=`\n## Primary burst p99: 64 concurrent, 1 KiB\n\nMedian of each process's observed p99, milliseconds. These three-process summaries do not pool latency distributions.\n\n| Runtime | Standard baseline → candidate | Hooks baseline → candidate |\n|---|---:|---:|\n`;
for(const runtime of runtimes)text+=`| ${runtime} | ${['CrossBus','CrossBus + async hooks'].map(name=>{const r=find('primary',runtime,name,64);return r.baselineP99Ms.median.toFixed(2)+' → '+r.candidateP99Ms.median.toFixed(2);}).join(' | ')} |\n`;
text+=`\n## Size and reproducibility\n\nMinified main bundle: ${integer(sizes.baseline.raw)} → ${integer(sizes.candidate.raw)} bytes raw; ${integer(sizes.baseline.gzip9)} → ${integer(sizes.candidate.gzip9)} bytes gzip level 9. These are minified artifacts; package root imports resolve to the unminified ESM/CJS entries. Bundle size is not transport throughput.\n\nRun each command sequentially, on an otherwise idle machine:\n\n\`\`\`sh
bun run build
node experiments/worker-rpc/isolated.js --runtime chrome --worker --profile primary
node experiments/worker-rpc/isolated.js --runtime chrome --profile primary
node experiments/worker-rpc/isolated.js --runtime node --profile primary
node experiments/worker-rpc/isolated.js --runtime bun --profile primary
# Repeat all four selections with --profile guard.
node experiments/worker-rpc/report.js
\`\`\`\n\nThe coordinator deliberately measures the frozen baseline/candidate snapshots, not whichever dist was most recently built. To measure new code, explicitly replace the candidate snapshot and manifest, collect a complete new matrix and rerun the verifier. The [report generator](${gh}experiments/worker-rpc/report.js) verifies artifact/source/dependency hashes, counts, raw samples, latency percentiles, all 48 timing datasets, 24 diagnostic profiles and three UUID diagnostics. Baseline profiles map their historical lockfile to an archived copy. Dirty-tree metadata reflects uncommitted measured inputs; exact bytes are identified by SHA-256. Published v0.1.3 and its npm archive are unchanged.\n`;
await writeFile(new URL('docs/WORKER_RPC.md',root),text);
console.log(`Verified 48 datasets, 24 profiles, 3 UUID diagnostics; ${summary.checkedCalls} checked calls.`);
