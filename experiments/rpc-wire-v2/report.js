// Verify preserved inputs and correctness ledgers before emitting any claims.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const parent='benchmarks/rpc-wire-v2',initial=process.argv.includes('--initial'),dir=initial?parent:parent+'/selected';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const manifest=await json(dir+'/manifest.json');
try{const seal=await json(dir+'/evidence.json');for(const [path,sha] of Object.entries(seal.sha256))assert.equal(await hash(path),sha,path);}catch(error){if(error.code!=='ENOENT'||!process.argv.includes('--write'))throw error;}
for(const record of Object.values(manifest.inputs))assert.equal(await hash(dir+'/'+record.snapshot),record.sha256);
for(const [path,sha] of Object.entries(manifest.artifacts))assert.equal(await hash(path),sha,path);
if(process.argv.includes('--check-current')){
 for(const [path,record] of Object.entries(manifest.inputs))assert.equal(await hash(path),record.sha256,path);
 for(const file of ['crossbus.js','crossbus.min.js','nano.min.js'])assert.equal(await hash('dist/'+file),manifest.artifacts[dir+'/candidate/'+file],file);
}
const median=values=>[...values].sort((a,b)=>a-b)[values.length>>1];
const close=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);
const stats=(value,count)=>{assert.equal(value.samples.length,count);assert.ok(value.samples.every(n=>n>0&&Number.isFinite(n)));close(value.median,median(value.samples));close(value.min,Math.min(...value.samples));close(value.max,Math.max(...value.samples));};
const key=r=>[r.library,r.concurrency,r.textBytes].join('|');
let checkedCalls=0;
const reports=new Map();
function verifyRows(report){
 const m=report.methodology;
 assert.equal(report.results.length,m.names.length*m.concurrencies.length*m.sizes.length);
 assert.equal(new Set(report.results.map(key)).size,report.results.length);
 for(const r of report.results){
  assert.ok(m.names.includes(r.library));assert.ok(m.concurrencies.includes(r.concurrency));assert.ok(m.sizes.includes(r.textBytes));
  assert.equal(r.callsPerSample,m.iterations);assert.equal(r.checkedCalls,m.warmupCalls+m.samples*m.iterations+m.latencyGroups*r.concurrency);stats(r.opsPerSecond,m.samples);
  const samples=r.latencyMs.samples;assert.equal(samples.length,m.latencyGroups);assert.ok(samples.every(n=>n>=0&&Number.isFinite(n)));assert.deepEqual(samples,[...samples].sort((a,b)=>a-b));
  for(const [name,p] of [['p50',.5],['p95',.95],['p99',.99]])close(r.latencyMs[name],samples[Math.floor((samples.length-1)*p)]);
 }
}
for(const file of await readdir(dir+'/data')){
 const match=file.match(/^(wire|guard)-(node|bun|chrome-worker|chrome)-(baseline|candidate)-([123])\.json$/);assert.ok(match,file);
 const [,profile,,variant]=match;assert.ok(profile!=='wire'||variant==='candidate');
 const report=await json(dir+'/data/'+file),m=report.methodology;
 const artifact=variant==='baseline'?parent+'/baseline/crossbus.min.js':dir+'/candidate/crossbus.min.js';assert.equal(report.metadata.artifact,artifact);
 for(const [path,sha] of Object.entries(report.metadata.hashes))assert.equal(sha,manifest.artifacts[path]??manifest.inputs[path]?.sha256,path);
 assert.equal(m.samples,7);assert.equal(m.iterations,4096);assert.equal(m.warmupCalls,8192);assert.equal(m.latencyGroups,64);assert.deepEqual(m.sizes,[0,1024,65536]);assert.deepEqual(m.concurrencies,[1,64]);assert.equal(m.names.length,profile==='wire'?8:6);
 verifyRows(report);checkedCalls+=report.results.reduce((sum,r)=>sum+r.checkedCalls,0);reports.set(file,report);
}
assert.equal(reports.size,36);
const tables=[];
const aggregate=(pairs)=>{
 const ratios=pairs.map(p=>p.candidate/p.baseline);return{baseline:median(pairs.map(p=>p.baseline)),candidate:median(pairs.map(p=>p.candidate)),ratio:median(ratios),minRatio:Math.min(...ratios),maxRatio:Math.max(...ratios),pairs};
};
for(const runtime of ['node','bun','chrome','chrome-worker']){
 const wire=[1,2,3].map(round=>reports.get(`wire-${runtime}-candidate-${round}.json`));assert.ok(wire.every(Boolean));
 const row=(d,name,c,s)=>{const found=d.results.find(r=>r.library===name&&r.concurrency===c&&r.textBytes===s);assert.ok(found);return found;};
 const wireRows=[];
 for(const size of [0,1024,65536])for(const concurrency of [1,64])for(const hooks of [false,true]){
  const old=hooks?'CrossBus compact + hooks':'CrossBus compact wire',next=hooks?'CrossBus compact v2 + hooks':'CrossBus compact v2';
  wireRows.push({textBytes:size,concurrency,hooks,...aggregate(wire.map(d=>({baseline:row(d,old,concurrency,size).opsPerSecond.median,candidate:row(d,next,concurrency,size).opsPerSecond.median})))});
 }
 const guard=[1,2,3].map(round=>{const baseline=reports.get(`guard-${runtime}-baseline-${round}.json`),candidate=reports.get(`guard-${runtime}-candidate-${round}.json`);assert.ok(baseline&&candidate);assert.deepEqual(baseline.methodology,candidate.methodology);assert.equal(baseline.metadata.runtime,candidate.metadata.runtime);assert.deepEqual(baseline.metadata.libraries,candidate.metadata.libraries);return{baseline,candidate};});
 const guardRows=guard[0].baseline.results.map(sample=>({case:key(sample),...aggregate(guard.map(pair=>({baseline:row(pair.baseline,sample.library,sample.concurrency,sample.textBytes).opsPerSecond.median,candidate:row(pair.candidate,sample.library,sample.concurrency,sample.textBytes).opsPerSecond.median})))}));
 const rates=wire[0].results.map(sample=>({case:key(sample),rate:median(wire.map(d=>row(d,sample.library,sample.concurrency,sample.textBytes).opsPerSecond.median))}));
 tables.push({runtime,runtimeVersion:wire[0].metadata.runtime,libraries:wire[0].metadata.libraries,wireRows,guardRows,rates});
}
const summary={status:initial?'initial prototype; not selected':'selected unpublished compact-v2 with standard-object decoder shortcut',datasets:36,checkedCalls,scope:'Three fresh wire processes per runtime; within-process v2/v1 ratios. Separate three alternating process pairs compare existing formats with the previous 0.1.6 snapshot. Observed ranges are not confidence intervals.',tables};
if(!initial){
 const worker=[];
 for(let round=1;round<=3;round++){
  const d=await json(parent+'/worker-followup/round-'+round+'.json');verifyRows(d);assert.equal(d.methodology.samples,9);assert.deepEqual(d.methodology.sizes,[65536]);assert.deepEqual(d.methodology.concurrencies,[1]);
  for(const [path,sha] of Object.entries(d.metadata.hashes))assert.equal(sha,manifest.artifacts[path]??manifest.inputs[path]?.sha256,path);
  worker.push(d);checkedCalls+=d.results.reduce((sum,r)=>sum+r.checkedCalls,0);
 }
 summary.workerFollowup=['standard','compact'].map(mode=>({mode,...aggregate(worker.map(d=>({baseline:d.results.find(r=>r.library===`CrossBus baseline ${mode} + hooks`).opsPerSecond.median,candidate:d.results.find(r=>r.library===`CrossBus current ${mode} + hooks`).opsPerSecond.median})))}));
 summary.mainDatasets=36;summary.followupDatasets=3;summary.datasets=39;summary.checkedCalls=checkedCalls;
}
if(!initial){
 const probes=[];let probeCalls=0;
 for(let round=1;round<=3;round++){
  const pair={};
  for(const variant of ['baseline','dispatch']){
   const d=await json(parent+'/dispatch-followup/dispatch-node-'+variant+'-'+round+'.json');verifyRows(d);assert.equal(d.methodology.samples,9);assert.equal(d.methodology.iterations,8192);assert.equal(d.methodology.warmupCalls,8192);
   for(const [path,sha] of Object.entries(d.metadata.hashes)){
    const alias=path.startsWith('artifacts/rpc-wire-v2/dispatch/')?parent+'/dispatch-followup/'+path.split('/').at(-1):null;
    assert.equal(sha,alias?await hash(alias):manifest.artifacts[path]??manifest.inputs[path]?.sha256,path);
   }
   probeCalls+=d.results.reduce((sum,r)=>sum+r.checkedCalls,0);pair[variant]=d;
  }
  probes.push(pair);
 }
 summary.dispatchProbe={datasets:6,checkedCalls:probeCalls,rows:probes[0].baseline.results.map(sample=>({case:key(sample),...aggregate(probes.map(pair=>({baseline:pair.baseline.results.find(r=>key(r)===key(sample)).opsPerSecond.median,candidate:pair.dispatch.results.find(r=>key(r)===key(sample)).opsPerSecond.median})))}))};
}
if(!initial){
 const inputs=await json(dir+'/qualification/inputs.json');
 for(const name of ['chrome','firefox','safari']){
  const q=await json(dir+'/qualification/'+name+'.json');assert.equal(q.checkedCases,11);assert.equal(q.cases.length,11);assert.ok(q.cases.some(c=>c.name.startsWith('compact-v2 RPC')));assert.ok(q.cases.every(c=>c.passed===true&&c.elapsedMs>=0&&Number.isFinite(c.elapsedMs)));
  for(const [path,sha] of Object.entries(q.hashes))assert.equal(sha,path==='dist/crossbus.min.js'?manifest.artifacts[dir+'/candidate/crossbus.min.js']:manifest.inputs[path]?.sha256??createHash('sha256').update(inputs[path]).digest('hex'),path);
 }
 const packed=await json(dir+'/qualification/npm-package.json');assert.equal(packed.version,'0.1.6');assert.equal(packed.status,'unpublished local candidate');
 for(const version of ['18','24']){
  const q=await json(dir+'/qualification/node'+version+'-consumer.json');assert.equal(q.version,'0.1.6');assert.ok(q.runtime.startsWith('v'+version+'.'));assert.equal(q.exports,12);assert.equal(q.archiveSha256,packed.archiveSha256);assert.equal(q.artifactSha256,manifest.artifacts[dir+'/candidate/crossbus.min.js']);assert.equal(q.testInputSha256,createHash('sha256').update(inputs['tests/package/consumer-smoke.mjs']).digest('hex'));
  for(const flag of ['esm','commonjs','minifiedRpc','compactRpc','compactV2Rpc','schemaValidation','nativeSources','nativeSdkConfiguration','boundedBinaryStreams'])assert.equal(q[flag],true,flag);
 }
}
if(process.argv.includes('--write')){
 await writeFile(dir+'/summary.json',JSON.stringify(summary,null,2)+'\n');
 let md='# RPC wire v2 '+(initial?'initial prototype':'selected development snapshot')+'\n\n'+summary.scope+`\n\n${summary.datasets} datasets; ${summary.checkedCalls.toLocaleString('en-US')} verified echo calls.\n`;
 for(const t of tables){md+=`\n## ${t.runtime} / ${t.runtimeVersion}\n\n### V2 against v1 within the candidate\n\n| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |\n|---|---:|---|---:|---:|---:|---|\n`;for(const r of t.wireRows)md+=`| ${r.textBytes} | ${r.concurrency} | ${r.hooks} | ${r.baseline.toFixed(1)} | ${r.candidate.toFixed(1)} | ${r.ratio.toFixed(3)}x | ${r.minRatio.toFixed(3)}–${r.maxRatio.toFixed(3)}x |\n`;
 md+='\n### Existing-codec and unchanged competitor controls\n\n| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |\n|---|---:|---:|---:|---|\n';for(const r of t.guardRows)md+=`| ${r.case.replaceAll('|',' / ')} | ${r.baseline.toFixed(1)} | ${r.candidate.toFixed(1)} | ${r.ratio.toFixed(3)}x | ${r.minRatio.toFixed(3)}–${r.maxRatio.toFixed(3)}x |\n`;}
 if(summary.workerFollowup){md+='\n## Directed Worker follow-up\n\nOld and new endpoints alternate within each process; 64 KiB, concurrency 1, hooks, nine samples, three fresh processes.\n\n| Mode | Current / previous | Observed ratios |\n|---|---:|---|\n';for(const r of summary.workerFollowup)md+=`| ${r.mode} | ${r.ratio.toFixed(3)}x | ${r.pairs.map(p=>(p.candidate/p.baseline).toFixed(3)).join(', ')} |\n`;}
 await writeFile(dir+'/RESULTS.md',md);
}else assert.deepEqual(await json(dir+'/summary.json'),summary);
console.log(`Verified ${summary.datasets} datasets and ${summary.checkedCalls} checked RPC calls (${initial?'initial':'selected'}).`);
