// Node-only CPU diagnostic, excluded from throughput rankings.
import { Session } from 'node:inspector';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CrossBus,MessageChannelTransport } from '../../dist/crossbus.js';
const root=new URL('../../',import.meta.url);
const session=new Session();session.connect();
const post=(name)=>new Promise((resolve,reject)=>session.post(name,(error,result)=>error?reject(error):resolve(result)));
const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']});
const b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel']});
const channel=new MessageChannelTransport();
a.addTransport(channel,{peerId:'b',origin:'channel'});
b.addTransport(MessageChannelTransport.fromPort(channel.remotePort),{peerId:'a',origin:'channel'});
let calls=0;
b.handle('echo',value=>{calls++;return value;});
const payload={value:7,text:'x'.repeat(1024)},warmup=4096,iterations=131072;
async function run(count){
 for(let i=0;i<count;i++){
  const value=await a.request('b','echo',payload);
  if(value.value!==7||value.text!==payload.text)throw Error('Profile workload returned incorrect data');
 }
}
try{
 await run(warmup);await post('Profiler.enable');await post('Profiler.start');
 await run(iterations);
 const {profile}=await post('Profiler.stop');
 if(calls!==warmup+iterations)throw Error('Profile workload lost handler calls');
 for(const node of profile.nodes)node.callFrame.url=node.callFrame.url.replace(root.href,'repo:/');
 const byId=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();
 for(const node of profile.nodes)for(const child of node.children??[])parents.set(child,node.id);
 const exclusive=new Map(),inclusive=new Map();
 for(let i=0;i<profile.samples.length;i++){
  const id=profile.samples[i],us=profile.timeDeltas[i];exclusive.set(id,(exclusive.get(id)??0)+us);
  for(let ancestor=id;ancestor!==undefined;ancestor=parents.get(ancestor))inclusive.set(ancestor,(inclusive.get(ancestor)??0)+us);
 }
 const rows=map=>[...map].map(([id,microseconds])=>({name:byId.get(id).callFrame.functionName,url:byId.get(id).callFrame.url,line:byId.get(id).callFrame.lineNumber+1,microseconds})).sort((a,b)=>b.microseconds-a.microseconds).slice(0,30);
 const bundle=await readFile(new URL('dist/crossbus.js',root));
 const raw=JSON.stringify(profile)+'\n';
 const metadata={timestamp:new Date().toISOString(),runtime:process.version,bundle:'dist/crossbus.js',bundleSha256:createHash('sha256').update(bundle).digest('hex'),scriptSha256:createHash('sha256').update(await readFile(new URL('./rpc-followup-profile.js',import.meta.url))).digest('hex'),profileSha256:createHash('sha256').update(raw).digest('hex')};
 const report={metadata,methodology:{warmup,iterations,textBytes:1024,concurrency:1,wireFormat:'standard',hooks:0,guards:'default enabled',warning:'Inspector CPU sampling of unminified ESM; this is not a throughput ranking or a causal attribution of the competitor gap.'},sampledMicroseconds:profile.timeDeltas.reduce((a,b)=>a+b,0),exclusive:rows(exclusive),inclusive:rows(inclusive)};
 await mkdir(new URL('benchmarks/rpc-followup/',root),{recursive:true});
 await writeFile(new URL('benchmarks/rpc-followup/current-node.cpuprofile',root),raw);
 await writeFile(new URL('benchmarks/rpc-followup/profile-node.json',root),JSON.stringify(report)+'\n');
 console.table(report.exclusive.slice(0,12));
}finally{a.destroy();b.destroy();session.disconnect();}
