import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CrossBus,MessageChannelTransport} from '../../dist/crossbus.min.js';
import {attachBatched} from './transport.js';
import {attachGrouped} from './group-transport.js';
const root=new URL('../../',import.meta.url),results=[];
for(const kind of ['stock','batch16','group'])for(let round=-1;round<7;round++){
 let cancelled=0;
 for(let i=0;i<20;i++){
  const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']}),b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel']});
  const base=new MessageChannelTransport(),remote=MessageChannelTransport.fromPort(base.remotePort);
  let left,right;
  if(kind==='stock'){a.addTransport(base,{peerId:'b',origin:'channel'});b.addTransport(remote,{peerId:'a',origin:'channel'});}
  else{
   const attach=kind==='group'?attachGrouped:attachBatched;
   left=attach(a,base,{peerId:'b'});right=attach(b,remote,{peerId:'a'});
  }
  b.handle('echo',v=>v);
  const createPending=()=>Array.from({length:16},()=>a.request('b','echo',7).then(()=>{throw Error('Call completed before synchronous destruction');},()=>{cancelled++;}));
  const pending=kind==='group'?left.group(createPending):createPending();
  if(kind==='group'){assert.equal(left.stats.sentPackets,1);assert.equal(left.stats.sentMessages,16);}
  a.destroy();b.destroy();await Promise.all(pending);
  assert.equal(a.healthCheck().pendingRequests,0);
  for(const t of [left,right])if(t){assert.equal(t.stats.queued,0);assert.equal(t.stats.replyMappings??0,0);}
 }
 await new Promise(resolve=>setImmediate(resolve));
 const timeoutResources=process.getActiveResourcesInfo().filter(v=>v==='Timeout').length;
 assert.equal(cancelled,320);assert.equal(timeoutResources,0);
 if(round>=0)results.push({kind,round,cancelled,timeoutResources,pendingAfter:0,queuedAfter:0});
}
const hashes={};
for(const file of ['dist/crossbus.min.js','experiments/rpc-batching/transport.js','experiments/rpc-batching/group-transport.js','experiments/rpc-batching/lifecycle.js'])hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('benchmarks/rpc-batching/lifecycle-node.json',root),JSON.stringify({metadata:{timestamp:new Date().toISOString(),runtime:process.version,hashes},methodology:{rounds:7,warmupRounds:1,pairsPerRound:20,pendingPerPair:16,scope:'synchronous destruction and timer/queue cleanup; not universal leak freedom'},results})+'\n');
console.log('All lifecycle rounds cancelled 320 requests and returned timeout resources to zero.');
