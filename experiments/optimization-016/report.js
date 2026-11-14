// Offline verification of preserved inputs, correctness ledgers and process pairs.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='benchmarks/optimization-016';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const manifest=await json(dir+'/manifest.json');
const sealPath=dir+'/evidence.json';
try {const seal=await json(sealPath);for(const [path,sha] of Object.entries(seal.sha256))assert.equal(await hash(path),sha,path);}catch(error){if(error.code!=='ENOENT')throw error;if(!process.argv.includes('--write'))throw error;}
for(const record of Object.values(manifest.inputs))assert.equal(await hash(dir+'/'+record.snapshot),record.sha256);
for(const [path,sha] of Object.entries(manifest.artifacts))assert.equal(await hash(path),sha);
if(process.argv.includes('--check-current'))for(const file of ['crossbus.js','crossbus.min.js','nano.min.js'])assert.equal(await hash('dist/'+file),manifest.artifacts[dir+'/candidate/'+file]);
if(process.argv.includes('--check-current'))for(const [path,record] of Object.entries(manifest.inputs))assert.equal(await hash(path),record.sha256,path);
const median=values=>[...values].sort((a,b)=>a-b)[values.length>>1];
const close=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);
const verifyStats=(stats,count)=>{
 assert.equal(stats.samples.length,count);for(const n of stats.samples)assert.ok(Number.isFinite(n)&&n>0);
 close(stats.median,median(stats.samples));close(stats.min,Math.min(...stats.samples));close(stats.max,Math.max(...stats.samples));
};
const reports=new Map();let checkedCalls=0,checkedTransfers=0;
const key=r=>[r.library??r.mode,r.concurrency??r.bytes,r.textBytes??''].join('|');
for(const file of (await readdir(dir+'/data')).filter(file=>file.endsWith('.json'))){
 const report=await json(dir+'/data/'+file),m=report.methodology;
 const match=file.match(/^(stream|rpc)-(primary|guard)-(node|bun|chrome|chrome-worker)-(baseline|candidate)-([123])\.json$/);assert.ok(match,file);
 const variant=match[4],artifact=`${dir}/${variant}/crossbus.min.js`;
 assert.equal(report.metadata.hashes[artifact],manifest.artifacts[artifact]);
 if(match[1]==='stream'){assert.equal(report.metadata.variant,variant);assert.equal(report.metadata.round,Number(match[5]));}
 else assert.equal(report.metadata.artifact,artifact);
 for(const [path,sha] of Object.entries(report.metadata.hashes))assert.equal(sha,manifest.artifacts[path]??manifest.inputs[path]?.sha256,path);
 assert.ok(report.metadata.runtime);assert.equal(new Set(report.results.map(key)).size,report.results.length);
 if(file.startsWith('stream-')){
  assert.equal(report.results.length,8);assert.equal(m.samples,7);assert.equal(m.iterations,4);assert.equal(m.warmup,2);
  for(const r of report.results){
   assert.ok([1048576,4194304].includes(r.bytes));assert.ok(['base64','native','native-flow','native-flow-transfer'].includes(r.mode));
   assert.equal(r.checkedTransfers,m.warmup+m.samples*m.iterations);assert.equal(r.frames.length,r.checkedTransfers);
   assert.equal(r.elapsedMs.length,m.samples+1);assert.equal(r.checksums.length,m.samples+1);
   verifyStats(r.mebibytesPerSecond,m.samples);
   for(let i=0;i<r.elapsedMs.length;i++){
    const count=i===0?m.warmup:m.iterations;assert.ok(r.elapsedMs[i]>0);assert.equal(r.checksums[i],r.bytes*127.5*count);
    if(i)close(r.mebibytesPerSecond.samples[i-1],r.bytes/1048576*count/r.elapsedMs[i]*1000);
   }
   for(const frame of r.frames){const flow=r.mode.includes('flow'),chunks=Math.ceil(r.bytes/m.chunkSize);assert.deepEqual(frame,flow?{'open-flow':1,data:chunks,end:1,ack:chunks+2}:{open:1,data:chunks,end:1});}
   checkedTransfers+=r.checkedTransfers;
  }
 }else{
  assert.equal(report.results.length,m.names.length*m.concurrencies.length*m.sizes.length);
  for(const r of report.results){
   assert.ok(m.names.includes(r.library));assert.ok(m.concurrencies.includes(r.concurrency));assert.ok(m.sizes.includes(r.textBytes));
   assert.equal(r.callsPerSample,m.iterations);assert.equal(r.checkedCalls,m.warmupCalls+m.samples*m.iterations+m.latencyGroups*r.concurrency);
   verifyStats(r.opsPerSecond,m.samples);assert.equal(r.latencyMs.samples.length,m.latencyGroups);
   const lat=r.latencyMs.samples;assert.deepEqual(lat,[...lat].sort((a,b)=>a-b));for(const n of lat)assert.ok(n>=0&&Number.isFinite(n));
   for(const [p,f] of [['p50',.5],['p95',.95],['p99',.99]])close(r.latencyMs[p],lat[Math.floor((lat.length-1)*f)]);
   checkedCalls+=r.checkedCalls;
  }
 }
 reports.set(file,report);
}
// Rejected default-options pilot: preserve failures and controls as well as gains.
const rejected=dir+'/rejected/default-options';
for(const runtime of ['node','bun','chrome'])for(const variant of ['baseline','candidate'])for(let round=1;round<=3;round++){
 const report=await json(`${rejected}/options-pilot-${runtime}-${variant}-${round}.json`),m=report.methodology;
 const artifact=variant==='baseline'?'artifacts/optimization-016/variants/compact-stream/crossbus.min.js':'dist/crossbus.min.js';
 assert.equal(report.metadata.artifact,artifact);assert.equal(report.results.length,12);
 for(const [path,sha] of Object.entries(report.metadata.hashes)){
  const expected=path===artifact?await hash(`${rejected}/${variant}/crossbus.min.js`):path===artifact.replace(/[^/]+$/,'nano.min.js')?await hash(`${rejected}/${variant}/nano.min.js`):manifest.inputs[path]?.sha256;
  assert.equal(sha,expected,path);
 }
 for(const r of report.results){verifyStats(r.opsPerSecond,m.samples);assert.equal(r.checkedCalls,m.warmupCalls+m.samples*m.iterations+m.latencyGroups*r.concurrency);}
}
const cpu=await json(dir+'/profiles/summary.json'),cpuInputs=await json(dir+'/profiles/inputs.json');
for(const [path,sha] of Object.entries(cpu.hashes))assert.equal(createHash('sha256').update(cpuInputs[path]).digest('hex'),sha,path);
for(const record of cpu.records){
 const profile=await json(dir+'/profiles/'+record.name+'.cpuprofile'),times=new Map();
 assert.equal(profile.samples.length,profile.timeDeltas.length);
 for(let i=0;i<profile.samples.length;i++)times.set(profile.samples[i],(times.get(profile.samples[i])??0)+profile.timeDeltas[i]);
 const frames=profile.nodes.map(node=>({name:node.callFrame.functionName||'(anonymous)',url:node.callFrame.url,line:node.callFrame.lineNumber+1,selfUs:times.get(node.id)??0})).sort((a,b)=>b.selfUs-a.selfUs).slice(0,30);
 assert.deepEqual(record.frames,frames);
}
const tables=[];
for(const kind of ['stream','rpc'])for(const runtime of kind==='stream'?['node','bun','chrome']:['node','bun','chrome','chrome-worker'])for(const profile of kind==='stream'?['primary']:['primary','guard']){
 const pairs=[];
 for(let round=1;round<=3;round++){
  const get=variant=>reports.get(`${kind}-${profile}-${runtime}-${variant}-${round}.json`);
  const baseline=get('baseline'),candidate=get('candidate');assert.ok(baseline&&candidate,`Missing ${kind}/${runtime}/${profile}/${round}`);
  assert.deepEqual(baseline.methodology,candidate.methodology);assert.equal(baseline.metadata.runtime,candidate.metadata.runtime);
  pairs.push({baseline,candidate});
 }
 const rows=[];
 for(const sample of pairs[0].baseline.results){
  const rates=pairs.map(pair=>Object.fromEntries(['baseline','candidate'].map(variant=>{
   const record=pair[variant].results.find(r=>key(r)===key(sample));assert.ok(record);return [variant,(record.opsPerSecond??record.mebibytesPerSecond).median];
  })));
  const ratios=rates.map(r=>r.candidate/r.baseline);
  rows.push({case:key(sample),baseline:median(rates.map(r=>r.baseline)),candidate:median(rates.map(r=>r.candidate)),ratio:median(ratios),minRatio:Math.min(...ratios),maxRatio:Math.max(...ratios),pairs:rates});
 }
 tables.push({kind,runtime,profile,runtimeVersion:pairs[0].baseline.metadata.runtime,rows});
}
assert.equal(reports.size,66);
const followupTables=[];
for(const runtime of ['node','chrome-worker']){
 const triples=[];
 for(let round=1;round<=3;round++){
  const triple={};
  for(const variant of ['baseline','stream','candidate']){
   const report=await json(`${dir}/followup/${runtime}-${variant}-${round}.json`),m=report.methodology;
   const artifact=variant==='stream'?`${rejected}/baseline/crossbus.min.js`:`${dir}/${variant}/crossbus.min.js`;
   assert.equal(report.metadata.artifact,artifact);assert.equal(report.metadata.hashes[artifact],await hash(artifact));
   for(const [path,sha] of Object.entries(report.metadata.hashes))assert.equal(sha,path.startsWith(rejected+'/baseline/')?await hash(path):manifest.artifacts[path]??manifest.inputs[path]?.sha256,path);
   assert.equal(report.results.length,6);assert.equal(m.samples,9);assert.equal(m.iterations,16384);assert.equal(m.warmupCalls,8192);assert.deepEqual(m.concurrencies,[64]);assert.deepEqual(m.sizes,[1024]);
   for(const r of report.results){verifyStats(r.opsPerSecond,m.samples);assert.equal(r.checkedCalls,m.warmupCalls+m.samples*m.iterations+m.latencyGroups*r.concurrency);assert.equal(r.concurrency,64);assert.equal(r.textBytes,1024);checkedCalls+=r.checkedCalls;}
   triple[variant]=report;
  }
  assert.deepEqual(triple.baseline.methodology,triple.candidate.methodology);assert.deepEqual(triple.baseline.methodology,triple.stream.methodology);
  assert.equal(triple.baseline.metadata.runtime,triple.candidate.metadata.runtime);assert.equal(triple.baseline.metadata.runtime,triple.stream.metadata.runtime);
  triples.push(triple);
 }
 const rows=[];
 for(const sample of triples[0].baseline.results){
  const rates=triples.map(triple=>Object.fromEntries(['baseline','stream','candidate'].map(variant=>[variant,triple[variant].results.find(r=>key(r)===key(sample)).opsPerSecond.median])));
  const candidateRatios=rates.map(r=>r.candidate/r.baseline),streamRatios=rates.map(r=>r.stream/r.baseline),ablationRatios=rates.map(r=>r.candidate/r.stream);
  rows.push({case:key(sample),candidateRatio:median(candidateRatios),streamRatio:median(streamRatios),ablationRatio:median(ablationRatios),candidateRatios,streamRatios,ablationRatios,pairs:rates});
 }
 followupTables.push({runtime,runtimeVersion:triples[0].baseline.metadata.runtime,rows});
}

const summary={scope:'Rejected literal-inlining trial; these are not the selected runtime measurements. Three alternating fresh-process pairs; medians of process medians and paired ratios. Observed ratio ranges are not confidence intervals. Streaming includes full receiver validation. RPC semantics differ across libraries; controls are not exact substitutes.',datasets:reports.size+18,mainDatasets:reports.size,followupDatasets:18,checkedCalls,checkedTransfers,tables,followupTables};
const output=JSON.stringify(summary,null,2)+'\n';
if(process.argv.includes('--write')){
 await writeFile(dir+'/summary.json',output);
 let md='# Rejected 0.1.6 literal-inlining trial against published 0.1.5\n\n'+summary.scope+'\n\n'+`${summary.datasets} datasets (${reports.size} main and 18 follow-up); ${checkedCalls.toLocaleString('en-US')} checked RPC calls; ${checkedTransfers.toLocaleString('en-US')} checked stream transfers.\n`;
 for(const table of tables){md+=`\n## ${table.kind} / ${table.runtimeVersion} / ${table.runtime} / ${table.profile}\n\nRates: ${table.kind==='stream'?'MiB/s':'calls/s'}. Case keys: ${table.kind==='stream'?'mode | bytes':'library | concurrency | text bytes'}.\n\n| Case | 0.1.5 | Candidate | Paired ratio | Observed range |\n|---|---:|---:|---:|---:|\n`;for(const r of table.rows)md+=`| ${r.case.replaceAll('|',' / ')} | ${r.baseline.toFixed(1)} | ${r.candidate.toFixed(1)} | ${r.ratio.toFixed(3)}x | ${r.minRatio.toFixed(3)}–${r.maxRatio.toFixed(3)}x |\n`;}
 for(const table of followupTables){md+=`\n## Longer RPC follow-up / ${table.runtimeVersion} / ${table.runtime}\n\n1 KiB, concurrency 64, warmup 8,192, nine samples of 16,384 calls, three fresh-process triples. All ratios are medians of paired process ratios.\n\n| Case | Candidate / 0.1.5 | Stream-only / 0.1.5 | Candidate / stream-only | Candidate ratios |\n|---|---:|---:|---:|---|\n`;for(const r of table.rows)md+=`| ${r.case.replaceAll('|',' / ')} | ${r.candidateRatio.toFixed(3)}x | ${r.streamRatio.toFixed(3)}x | ${r.ablationRatio.toFixed(3)}x | ${r.candidateRatios.map(v=>v.toFixed(3)).join(', ')} |\n`;}
 await writeFile(dir+'/RESULTS.md',md);
}else assert.deepEqual(await json(dir+'/summary.json'),summary);
console.log(`Verified ${summary.datasets} datasets, ${checkedCalls} RPC calls, ${checkedTransfers} transfers.`);
