// Diagnostic CPU sampling; these rates are never used as throughput evidence.
import { Session } from 'node:inspector';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { runWorkloads } from '../worker-rpc/workloads.js';
import { runStreams } from '../next-release/stream-workloads.js';
const root=new URL('../../',import.meta.url);
const artifact='benchmarks/optimization-016/baseline/crossbus.js';
const output=new URL('artifacts/optimization-016/profiles/',root);
await mkdir(output,{recursive:true});
const hashes={};
for(const path of [artifact,'experiments/optimization-016/profile.js','experiments/worker-rpc/workloads.js','experiments/next-release/stream-workloads.js','node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs','package-lock.json'])
    hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const records=[];
async function sample(name,warm,run){
    await warm();
    const session=new Session();session.connect();const post=promisify(session.post).bind(session);
    try{
        await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:100});
        await post('Profiler.start');const checked=await run();const {profile}=await post('Profiler.stop');
        const times=new Map();for(let i=0;i<profile.samples.length;i++)times.set(profile.samples[i],(times.get(profile.samples[i])??0)+profile.timeDeltas[i]);
        for(const node of profile.nodes)node.callFrame.url=node.callFrame.url.replace(root.href,'repo:/');
        const frames=profile.nodes.map(node=>({name:node.callFrame.functionName||'(anonymous)',url:node.callFrame.url,line:node.callFrame.lineNumber+1,selfUs:times.get(node.id)??0})).sort((a,b)=>b.selfUs-a.selfUs);
        await writeFile(new URL(name+'.cpuprofile',output),JSON.stringify(profile)+'\n');
        records.push({name,checked,frames:frames.slice(0,30)});console.log(name,JSON.stringify(frames.slice(0,8)));
    }finally{session.disconnect();}
}
await sample('node-base64-stream',()=>runStreams(new URL(artifact,root).href,'baseline'),()=>runStreams(new URL(artifact,root).href,'baseline'));
for(const name of ['CrossBus','CrossBus compact wire','birpc cached','Penpal cached + timeout'])for(const concurrency of [1,64]){
    const options={artifact:new URL(artifact,root).href,names:[name],samples:1,concurrencies:[concurrency],sizes:[1024],warmup:4096,latencyGroups:128};
    await sample(name.replaceAll(/[^a-z\d]/gi,'-')+'-'+concurrency,
        ()=>runWorkloads({...options,iterations:4096}),()=>runWorkloads({...options,iterations:65536}));
}
await writeFile(new URL('summary.json',output),JSON.stringify({runtime:process.version,cpu:cpus()[0].model,hashes,scope:'100us Inspector sampling after a full workload warmup; new pair/setup and GC/idle included. Not benchmark rates or exact causal native-operation costs.',records},null,2)+'\n');
