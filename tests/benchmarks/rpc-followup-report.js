// Publish complete comparisons only after validating all measured inputs.
import { readFile,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const root=new URL('../../',import.meta.url),prefix='benchmarks/rpc-followup/';
const read=path=>readFile(new URL(path,root));
const json=async path=>JSON.parse(await read(path));
const hash=data=>createHash('sha256').update(data).digest('hex');
const median=v=>[...v].sort((a,b)=>a-b)[v.length>>>1];
const stats=v=>({median:median(v),min:Math.min(...v),max:Math.max(...v),values:v});
const manifests={},sizes=[];
for(const variant of ['baseline','candidate']){
 const manifest=await json(`${prefix}${variant}/manifest.json`);manifests[variant]=manifest;
 for(const [file,expected] of Object.entries(manifest.sha256)){
  const data=await read(`${prefix}${variant}/${file}`);if(hash(data)!==expected)throw Error('Frozen bundle changed');
  if(variant==='candidate'&&hash(await read(`dist/${file}`))!==expected)throw Error('Current build differs from measured candidate');
  sizes.push({variant,file,rawBytes:data.length,gzipBytes:gzipSync(data,{level:9}).length,sha256:expected});
 }
 if(variant==='candidate')for(const [file,expected] of Object.entries(manifest.sourceSha256))if(hash(await read(file))!==expected)throw Error(`Source changed: ${file}`);
}
const approved=execFileSync('git',['show','3a3c6bbfeaa2a09169fcd4781b6be85b7c16b807:dist/crossbus.min.js'],{cwd:root});
if(hash(approved)!==manifests.baseline.sha256['crossbus.min.js'])throw Error('Baseline differs from approved master snapshot');
const environments=[],comparisons=[],ablation=[],controls=[];
const match=(row,name,c,n)=>row.library===name&&row.concurrency===c&&row.textBytes===n;
for(const [kind,runtime] of [['rpc','node'],['rpc','bun'],['rpc','chrome'],['worker','chrome']]){
 const pairs=[];
 for(let round=1;round<=3;round++){
  const pair={};
  for(const variant of ['baseline','candidate']){
   const report=await json(`${prefix}${kind}-${variant}-${runtime}-${round}.json`);
   if(report.metadata.hashes[`${prefix}${variant}/crossbus.min.js`]!==manifests[variant].sha256['crossbus.min.js'])throw Error('Report variant does not match its frozen bundle');
   for(const [file,expected] of Object.entries(report.metadata.hashes))if(hash(await read(file))!==expected)throw Error(`Changed measured input: ${file}`);
   if(report.methodology.samples!==9||report.methodology.iterations!==4096||report.methodology.warmupCalls!==4096)throw Error('Incomplete sample plan');
   if(Boolean(report.methodology.diagnosticBudget)!==(kind==='rpc'))throw Error('Unexpected diagnostic conditions');
   for(const row of report.results)if(row.opsPerSecond.samples.length!==9||row.opsPerSecond.samples.some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid rate samples');
   pair[variant]=report;
  }
  pairs.push(pair);
 }
 environments.push({kind,runtime,metadata:pairs[0].candidate.metadata,methodology:pairs[0].candidate.methodology});
 const rates=(variant,name,c,n)=>pairs.map(pair=>{
  const row=pair[variant].results.find(row=>match(row,name,c,n));if(!row)throw Error('Missing matching workload');return row.opsPerSecond.median;
 });
 for(const c of [1,16])for(const n of [0,1024,65536]){
  for(const name of ['CrossBus','CrossBus + async hooks','CrossBus compact wire','CrossBus compact + hooks']){
   const before=rates('baseline',name,c,n),after=rates('candidate',name,c,n);
   comparisons.push({kind,runtime,library:name,concurrency:c,textBytes:n,before:stats(before),after:stats(after),ratio:stats(after.map((v,i)=>v/before[i]))});
  }
  for(const name of ['Comlink cached','birpc cached','Penpal cached + timeout']){
   const before=rates('baseline',name,c,n),after=rates('candidate',name,c,n);
   controls.push({kind,runtime,library:name,concurrency:c,textBytes:n,before:stats(before),after:stats(after),ratio:stats(after.map((v,i)=>v/before[i]))});
  }
  if(kind==='rpc')for(const variant of ['baseline','candidate'])for(const [normal,diagnostic] of [['CrossBus','CrossBus no budget (diagnostic)'],['CrossBus compact wire','CrossBus compact no budget (diagnostic)']]){
   const enabled=rates(variant,normal,c,n),disabled=rates(variant,diagnostic,c,n);
   ablation.push({runtime,variant,library:normal,concurrency:c,textBytes:n,disabledOverEnabled:stats(disabled.map((v,i)=>v/enabled[i]))});
  }
 }
}
const memory={};
for(const variant of ['baseline','candidate']){
 const report=await json(`${prefix}memory-${variant}-node.json`);
 if(report.metadata.bundleSha256!==manifests[variant].sha256['crossbus.min.js']||report.metadata.scriptSha256!==hash(await read('tests/benchmarks/memory.js')))throw Error('Memory source/build changed');
 if(report.samples.length!==7||report.samples.some(s=>s.cancelledRequests!==200||s.liveTimeouts!==200||s.afterTimeouts!==0))throw Error('Memory lifecycle failure');
 memory[variant]={liveHeapDeltaBytes:stats(report.samples.map(s=>s.liveDeltaBytes)),afterHeapDeltaBytes:stats(report.samples.map(s=>s.afterDeltaBytes)),cancelledRequestsPerRound:200,rounds:7,afterTimeouts:0};
}
const profile=await json(prefix+'profile-node.json');
if(profile.metadata.bundleSha256!==hash(await read(profile.metadata.bundle))||
 profile.metadata.scriptSha256!==hash(await read('tests/benchmarks/rpc-followup-profile.js'))||
 profile.metadata.profileSha256!==hash(await read(prefix+'current-node.cpuprofile')))throw Error('Profile inputs changed');
const summary={profile,generatedAt:new Date().toISOString(),manifests,environments,comparisons,controls,ablation,memory,sizes};
await writeFile(new URL(prefix+'summary.json',root),JSON.stringify(summary)+'\n');
for(const file of await readdir(new URL(prefix,root)))if(/^(?:rpc|worker|memory)-(?:baseline|candidate)-.*\.json$/.test(file))await writeFile(new URL(prefix+file,root),JSON.stringify(await json(prefix+file))+'\n');
const fmt=n=>Math.round(n).toLocaleString('en-US');
const ratio=r=>`${r.median.toFixed(2)}× (${r.min.toFixed(2)}–${r.max.toFixed(2)})`;
let doc=`# RPC optimization follow-up — 13 November 2026\n\nThis study compares the approved 0.1.3 snapshot in master commit 3a3c6bb with the subsequent internal RPC candidate. These are two **different builds of the unreleased 0.1.3 candidate**, identified by frozen bundle and source hashes. This is separate from the [12 November comparison against published 0.1.2](COMPETITOR_ANALYSIS.md).\n\n`;
doc+='The 1 KiB Node standard path moved only about 1% in the paired medians, inside observed variation. Some Bun improvements are also seen in unchanged comparator controls. Large Chrome Worker payloads regress in several candidate cases. These measurements do not justify promoting this combined experiment as a general performance improvement or claiming a theoretical limit.\n\n';
const env=environments[0].metadata;
doc+=`${env.cpu}, ${env.platform} ${env.arch}. Runtimes: ${[...new Set(environments.map(e=>e.metadata.runtime))].join(', ')}; Bun revision ${environments.find(e=>e.runtime==='bun').metadata.bunRevision}. Chrome is headless.\n\n`;
doc+='## Changes under evaluation\n\n- RPC packets use the live peer binding directly, retaining connected-state checks and send-error behavior while avoiding unneeded routing-input/result/failed-array allocations. Signals and the public MessageRouter API retain their behavior.\n- Inbound processing snapshots the payload property once and reuses it for normalization, validation and response settlement. Standard/legacy forms, asynchronous hooks, destruction checks and response-peer matching remain covered.\n- The default MessageChannel send method has a short direct path; optional codecs, compact encoding and automatic transferable discovery use the general path. The original graph and explicit transfer lists are preserved.\n- Compact encoding checks canonical builder field order with linear comparisons, falling back to the complete set check for reordered records. Extensions still use standard encoding; the wire format is unchanged.\n\nThis is an **unmerged experiment, not a selected release build**: the results include regressions and do not establish a general speedup. The approved master snapshot remains separate. There are no new public methods/options or protocol changes. Payload budgets, request limits, immutable envelopes, origins, hook failure behavior and bound-peer checks remain enabled in all normal-guard comparison rows. Record-type shortcuts, origin memoization and a separate response-dispatch branch were trialled and discarded after mixed runtime results.\n\n';
doc+='## Method and reproduction\n\nRun one runtime at a time, with other tests/benchmarks stopped:\n\n```sh\nbun run build\nbun run bench:rpc-followup\nbun run bench:rpc-followup:bun\nbun run bench:rpc-followup:browser\nbun run bench:rpc-followup:workers\nbun run bench:rpc-followup:memory\nbun run bench:rpc-followup:profile\nbun run bench:rpc-followup:report\n```\n\nThree fresh baseline/candidate process pairs alternate process order. Each case has 4,096 warm-up calls and nine batches of 4,096 checked calls, rotating library order. Cases cover 0/1,024/65,536-byte ASCII text fields and 1/16 in-flight calls. Every response scalar/full text is verified; an extra untimed stats RPC verifies the exact remote handler invocation count. Real Chrome module Workers include scheduling and exclude startup/handshake. The payload-budget ablation is local-only and separately labelled; it is excluded from normal-guard rankings.\n\nThe comparator methods are cached: Comlink 4.4.2, birpc 4.2.0, Penpal 8.0.1 with a 30-second per-call timeout. Comlink has no default per-call timeout; birpc defaults to 60 seconds. Features differ. Installed implementation hashes, runtime versions, dirty-tree state, exact raw samples and frozen bundles are retained in [rpc-followup artifacts](https://github.com/GiuseppeScottoLavina/crossbus/tree/perf/rpc-followup/benchmarks/rpc-followup). The generator verifies them before writing this report.\n\n';
doc+='## RPC with standard guards enabled\n\nAfter/before ratios are medians of the three paired process-median ratios; parentheses show observed process-pair ranges, not confidence intervals. Ratios below 1 are regressions.\n\n| Runtime/topology | Text bytes | In flight | Standard | Standard + hooks | Compact | Compact + hooks |\n|---|---:|---:|---:|---:|---:|---:|\n';
for(const [kind,runtime] of [['rpc','node'],['rpc','bun'],['rpc','chrome'],['worker','chrome']])for(const c of [1,16])for(const n of [0,1024,65536]){
 const rows=['CrossBus','CrossBus + async hooks','CrossBus compact wire','CrossBus compact + hooks'].map(name=>comparisons.find(r=>r.kind===kind&&r.runtime===runtime&&r.library===name&&r.concurrency===c&&r.textBytes===n));
 doc+=`| ${runtime}${kind==='worker'?' Worker':''} | ${n} | ${c} | ${rows.map(r=>ratio(r.ratio)).join(' | ')} |\n`;
}
doc+='\n## Competitor rates and unchanged-code controls\n\nCalls/s for 1 KiB, median of three process medians. These pooled medians do not necessarily produce the paired ratios above when divided. All ordinary production CrossBus values keep the guards enabled. Comparator source bytes are identical between variants; their process ratios help expose environmental/JIT variation.\n\n| Runtime/topology | In flight | Previous standard | New standard | New compact | Comlink cached | birpc cached | Penpal cached, 30s |\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
for(const [kind,runtime] of [['rpc','node'],['rpc','bun'],['rpc','chrome'],['worker','chrome']])for(const c of [1,16]){
 const match=r=>r.kind===kind&&r.runtime===runtime&&r.concurrency===c&&r.textBytes===1024;
 const standard=comparisons.find(r=>match(r)&&r.library==='CrossBus'),compact=comparisons.find(r=>match(r)&&r.library==='CrossBus compact wire');
 const values=[standard.before.median,standard.after.median,compact.after.median,...['Comlink cached','birpc cached','Penpal cached + timeout'].map(name=>controls.find(r=>match(r)&&r.library===name).after.median)];
 doc+=`| ${runtime}${kind==='worker'?' Worker':''} | ${c} | ${values.map(fmt).join(' | ')} |\n`;
}
doc+='\nThe complete summary includes process ratios for unchanged comparator code, all text sizes, both encodings and hook cases. No universal fastest-library claim follows from these results.\n\n## Isolating the payload-budget cost\n\nThese diagnostic cases disable **only** maxPayloadSize on controlled test data; all other guards remain. Values below are throughput with budget disabled / enabled for standard encoding and the 1 KiB field, median and observed range across three processes. They are counterfactual diagnostics, not the production candidate or a recommended unsafe configuration. They do not assign the entire competitor gap to validation or establish a precise CPU-time percentage.\n\n| Runtime | In flight | Previous snapshot | New candidate |\n|---|---:|---:|---:|\n';
for(const runtime of ['node','bun','chrome'])for(const c of [1,16]){
 const find=variant=>ablation.find(r=>r.runtime===runtime&&r.variant===variant&&r.library==='CrossBus'&&r.concurrency===c&&r.textBytes===1024).disabledOverEnabled;
 doc+=`| ${runtime} | ${c} | ${ratio(find('baseline'))} | ${ratio(find('candidate'))} |\n`;
}
doc+='\n## Size and lifecycle tradeoffs\n\nWhole minified file sizes, including banners, gzip level 9; package exports select unminified entry files and consumer tree-shaking was not measured.\n\n| Snapshot/file | Raw bytes | gzip bytes |\n|---|---:|---:|\n';
for(const row of sizes)doc+=`| ${row.variant}/${row.file} | ${fmt(row.rawBytes)} | ${fmt(row.gzipBytes)} |\n`;
doc+=`\nBoth builds completed seven measured lifecycle rounds, cancelling all 200 pending requests per round and returning timeout resources from 200 to zero. Median live cohort heap deltas: ${fmt(memory.baseline.liveHeapDeltaBytes.median)} bytes before and ${fmt(memory.candidate.liveHeapDeltaBytes.median)} after. Raw post-cleanup deltas retain allocator/JIT noise, including negative values; this is not proof of exact object size or universal absence of leaks.\n\nSafari/Firefox, physical WebViews and network transports were not measured. The source/code inspection identifies costs but does not establish their exact individual contribution to the remaining gap.\n`;
doc+='\n## CPU sampling diagnostic\n\nA separate Node Inspector profile samples the current **unminified ESM** after 4,096 warm-up calls, during 131,072 checked sequential 1 KiB standard RPC calls without hooks and with default guards. It is excluded from throughput rankings. Repository URLs are rewritten to repo:/ for privacy; sample ticks and call frames are retained. This samples one runtime/path and does not quantify each feature\'s causal share of the competitor gap or establish a maximum.\n\nLargest exclusive sampled frames (including native/idle/GC frames when present):\n\n| Frame | Sampled milliseconds |\n|---|---:|\n';
for(const row of profile.exclusive.slice(0,12))doc+=`| ${row.name||'(anonymous)'} | ${(row.microseconds/1000).toFixed(1)} |\n`;
doc+='\nThe full sanitized profile and summary are retained with the study artifacts. Inclusive frame times overlap and must not be added together.\n';
await writeFile(new URL('docs/RPC_FOLLOWUP.md',root),doc);
console.log('Verified all RPC follow-up inputs and regenerated the report and compact raw evidence.');
