// Generate claims only from complete, hash-matched, correctness-checked runs.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
const root=new URL('../../',import.meta.url), prefix='benchmarks/optimization-study/';
const read=path=>readFile(new URL(path,root));
const json=async path=>JSON.parse(await read(path));
const hash=data=>createHash('sha256').update(data).digest('hex');
const median=values=>[...values].sort((a,b)=>a-b)[values.length>>>1];
const range=values=>({median:median(values),min:Math.min(...values),max:Math.max(...values),values});
const verify=async report=>{
 for(const [path,expected] of Object.entries(report.metadata.hashes))if(hash(await read(path))!==expected)throw Error(`Changed measured input: ${path}`);
 if(report.methodology.samples!==9)throw Error('Nine samples required');
 for(const row of report.results)if(row.opsPerSecond.samples.length!==9||row.opsPerSecond.samples.some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid samples');
};
const manifests={};
for(const variant of ['baseline','candidate']){
 const manifest=await json(`${prefix}${variant}/manifest.json`);manifests[variant]=manifest;
 for(const [path,expected] of Object.entries(manifest.sha256))if(hash(await read(`${prefix}${variant}/${path}`))!==expected)throw Error('Frozen bundle changed');
 if(variant==='candidate'){
  // Historical 0.1.3 evidence is verified against its frozen sources. Current
  // dist/src may belong to a newer version and must not relabel these timings.
  const sources=await json(`${prefix}candidate/source.json`);
  if(JSON.stringify(Object.keys(sources).sort())!==JSON.stringify(Object.keys(manifest.sourceSha256).sort()))throw Error('Historical source set changed');
  for(const [path,expected] of Object.entries(manifest.sourceSha256))if(hash(sources[path])!==expected)throw Error(`Archived source changed: ${path}`);
 }
}
const comparisons=[],environments=[],competitors=[];
const key=row=>JSON.stringify([row.library,row.workload,row.listeners,row.textBytes,row.concurrency]);
for(const [kind,runtime] of [['rpc','node'],['local','node'],['rpc','bun'],['local','bun'],['rpc','chrome'],['local','chrome'],['worker','chrome']]){
 const pairs=[];
 for(let round=1;round<=3;round++){
  const pair={};
  for(const variant of ['baseline','candidate']){
   const report=await json(`${prefix}${kind}-${variant}-${runtime}-${round}.json`);await verify(report);
   if(kind!=='local'&&(report.methodology.iterations!==1024||report.methodology.warmupCalls!==256))throw Error('RPC sample size changed');
   pair[variant]=report;
  }
  pairs.push(pair);
 }
 environments.push({kind,runtime,metadata:pairs[0].candidate.metadata,methodology:pairs[0].candidate.methodology});
 const rates=(variant,example)=>pairs.map(pair=>{
  const row=pair[variant].results.find(row=>key(row)===key(example));
  if(!row)throw Error('Missing matching workload');return row.opsPerSecond.median;
 });
 for(const row of pairs[0].candidate.results){
  const current=rates('candidate',row);
  if(!row.library.startsWith('CrossBus')){
   competitors.push({kind,runtime,library:row.library,workload:row.workload,listeners:row.listeners,textBytes:row.textBytes,concurrency:row.concurrency,opsPerSecond:range(current)});continue;
  }
  const baseRow=row.library.startsWith('CrossBus compact')?{...row,library:row.library.includes('hooks')?'CrossBus + async hooks':'CrossBus'}:row;
  const before=rates('baseline',baseRow);
  comparisons.push({kind,runtime,library:row.library,workload:row.workload,listeners:row.listeners,textBytes:row.textBytes,concurrency:row.concurrency,
   baselineOps:range(before),candidateOps:range(current),ratio:range(current.map((value,i)=>value/before[i]))});
 }
}
const memory={};
for(const variant of ['baseline','candidate']){
 const report=await json(`${prefix}memory-${variant}-node.json`);
 if(report.metadata.bundleSha256!==manifests[variant].sha256['crossbus.min.js']||report.metadata.scriptSha256!==hash(await read('tests/benchmarks/memory.js')))throw Error('Memory inputs changed');
 if(report.samples.length!==7||report.samples.some(s=>s.cancelledRequests!==200||s.liveTimeouts!==200||s.afterTimeouts!==0))throw Error('Lifecycle check incomplete');
 memory[variant]={liveHeapDeltaBytes:range(report.samples.map(s=>s.liveDeltaBytes)),afterHeapDeltaBytes:range(report.samples.map(s=>s.afterDeltaBytes)),rounds:7,cancelledRequestsPerRound:200,timeoutResourcesAfter:0};
}
const sizes=[];
for(const variant of ['baseline','candidate'])for(const file of ['crossbus.min.js','nano.min.js']){
 const data=await read(`${prefix}${variant}/${file}`);
 sizes.push({variant,file,rawBytes:data.length,gzipBytes:gzipSync(data,{level:9}).length,brotliBytes:brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length,sha256:hash(data)});
}
const summary={generatedAt:new Date().toISOString(),methodology:'Three fresh baseline/candidate process pairs, alternating order; nine samples per process. Ratios pair process medians. Observed ranges are not confidence intervals.',manifests,environments,comparisons,competitors,memory,sizes};
// Keep every value/sample, with compact machine-readable JSON so evidence does
// not exceed GitHub's whole-PR diff limit and obscure the actual source review.
await writeFile(new URL(`${prefix}summary.json`,root),JSON.stringify(summary)+'\n');
for(const name of await readdir(new URL(prefix,root))) {
 if(!/^(?:rpc|local|worker|memory)-(?:baseline|candidate)-.*\.json$/.test(name))continue;
 const path=new URL(prefix+name,root);
 await writeFile(path,JSON.stringify(JSON.parse(await readFile(path,'utf8')))+'\n');
}
const f=value=>Math.round(value).toLocaleString('en-US');
const ratio=row=>`${row.ratio.median.toFixed(2)}× (${row.ratio.min.toFixed(2)}–${row.ratio.max.toFixed(2)})`;
let output='\n## Measured results\n\n'+`${environments[0].metadata.cpu}; ${environments[0].metadata.platform} ${environments[0].metadata.arch}. `;
output+='Collected on '+environments[0].metadata.timestamp.slice(0,10)+'. Runtime versions: '+[...new Set(environments.map(e=>e.metadata.runtime))].join(', ')+'. Bun revision: '+environments.find(e=>e.runtime==='bun').metadata.bunRevision+'. Chrome is headless.\n\n';
output+='The frozen candidate is version **0.1.3**, unreleased at measurement time and subsequently published. These are historical results, not measurements of the current development version; see the [0.1.4 Worker RPC study](WORKER_RPC.md) for the next comparison. The baseline is byte-identical to the minified runtime/nano files in the published 0.1.2 archive. The summary and all process samples are in [optimization-study](https://github.com/GiuseppeScottoLavina/crossbus/tree/perf/verified-0.1.3/benchmarks/optimization-study). The verifier checks the frozen candidate source archive against its original source hashes, rather than requiring a later checkout to equal 0.1.3. Metadata records the previous HEAD and dirty status rather than pretending these files were committed at measurement time.\n\n';
output+='### Interpretation\n\nFor the 1 KiB text field, the standard RPC path improved on Node/Bun. Chrome showed mixed results, including regressions; optional compact encoding was particularly unfavorable for large payloads in the real-Worker test. This candidate does not establish a browser RPC speedup or an overall lead over the competitors. Additional lifecycle/security fixes and the larger bundle are explicit tradeoffs. The stream-buffer workload improved across the measured engines, with a much larger effect on Node; it is a local enqueue/collect result.\n\n';
output+='### RPC before/after\n\nCandidate/baseline throughput; median of three paired process ratios, with the observed minimum–maximum in parentheses. Compact is compared with baseline standard encoding. Every row uses the same echo data and concurrency.\n\n| Runtime/topology | Text bytes | In flight | Standard | Standard + hooks | Compact | Compact + hooks |\n|---|---:|---:|---:|---:|---:|---:|\n';
for(const [kind,runtime] of [['rpc','node'],['rpc','bun'],['rpc','chrome'],['worker','chrome']])for(const concurrency of [1,16])for(const textBytes of [0,1024,65536]){
 const rows=['CrossBus','CrossBus + async hooks','CrossBus compact wire','CrossBus compact + hooks'].map(library=>comparisons.find(r=>r.kind===kind&&r.runtime===runtime&&r.library===library&&r.concurrency===concurrency&&r.textBytes===textBytes));
 output+=`| ${runtime}${kind==='worker'?' Worker':''} | ${textBytes} | ${concurrency} | ${rows.map(ratio).join(' | ')} |\n`;
}
output+='\n### Competitor throughput\n\nCalls/s for the 1,024-byte field, median of three process medians. A ratio of these medians can differ from the median of paired process ratios above. All payload sizes and ordinary/cached proxy variants remain in the raw JSON; this table uses the cached competitors and includes Penpal with and without a per-call timeout. CrossBus uses its default limits and 30-second request timeout. These are measured API paths with different features, not interchangeable products.\n\n| Runtime/topology | In flight | 0.1.2 standard | 0.1.3 standard | 0.1.3 compact | Comlink cached | birpc cached | Penpal cached | Penpal + timeout |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const [kind,runtime] of [['rpc','node'],['rpc','bun'],['rpc','chrome'],['worker','chrome']])for(const concurrency of [1,16]){
 const match=r=>r.kind===kind&&r.runtime===runtime&&r.textBytes===1024&&r.concurrency===concurrency;
 const standard=comparisons.find(r=>match(r)&&r.library==='CrossBus'),compact=comparisons.find(r=>match(r)&&r.library==='CrossBus compact wire');
 const rates=[standard.baselineOps.median,standard.candidateOps.median,compact.candidateOps.median,...['Comlink cached','birpc cached','Penpal cached','Penpal cached + timeout'].map(library=>competitors.find(r=>match(r)&&r.library===library).opsPerSecond.median)];
 output+=`| ${runtime}${kind==='worker'?' Worker':''} | ${concurrency} | ${rates.map(f).join(' | ')} |\n`;
}
output+='\n### Local emitter and stream workloads\n\nCandidate/baseline throughput ratios. Emission passes object references and executes observable callbacks; buffered stream results measure enqueue/collect in memory, not transport or byte-copy throughput.\n\n| Runtime | API/workload | Listeners | After/before, median (range) |\n|---|---|---:|---:|\n';
for(const row of comparisons.filter(r=>r.kind==='local'))output+=`| ${row.runtime} | ${row.library}: ${row.workload} | ${row.listeners??'—'} | ${ratio(row)} |\n`;
output+='\nFull competitor emitter results, including 1/10/100 listeners and subscribe/unsubscribe, are retained in the summary and raw reports. Subsample millisecond timing and JIT variation can affect very fast loops; a changed ratio alone does not identify its cause.\n\n### Sizes and lifecycle\n\nWhole minified file sizes; gzip level 9 and Brotli quality 11. These include version/license banners and all exports in the file. The package export map selects unminified main/nano files; consumer tree-shaking sizes were not measured.\n\n| Version/file | Raw bytes | gzip bytes | Brotli bytes |\n|---|---:|---:|---:|\n';
for(const row of sizes)output+=`| ${manifests[row.variant].version}/${row.file} | ${f(row.rawBytes)} | ${f(row.gzipBytes)} | ${f(row.brotliBytes)} |\n`;
output+='\nEach version completed seven measured memory rounds of 200 buses × ten peers × one pending request. All 200 requests were cancelled each round; timeout resources returned from 200 to zero. Live cohort heap delta medians: '+f(memory.baseline.liveHeapDeltaBytes.median)+' bytes (0.1.2), '+f(memory.candidate.liveHeapDeltaBytes.median)+' bytes (0.1.3). Raw post-cleanup deltas, including negative noise, remain in JSON. This does not establish exact object sizes or absence of every leak.\n\nCompact wire is a choice for compatible MessageChannel endpoints. Larger bundles and additional lifecycle/security bookkeeping are visible tradeoffs. Results do not establish a universal fastest library, and competitors can remain ahead for particular runtime/payload/concurrency combinations. Physical iOS/Android WebViews and Safari/Firefox were not measured.\n';
const path=new URL('docs/COMPETITOR_ANALYSIS.md',root),existing=await readFile(path,'utf8');
await writeFile(path,existing.split('\n## Measured results')[0]+output);
console.log('Verified all retained measurements and regenerated optimization-study/summary.json and competitor analysis.');
