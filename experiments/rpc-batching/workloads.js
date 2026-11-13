import { pair } from './endpoints.js';
const stats=v=>{const a=[...v].sort((x,y)=>x-y);return{median:a[a.length>>>1],min:a[0],max:a.at(-1),samples:v};};
const percentile=(v,p)=>v[Math.min(v.length-1,Math.floor((v.length-1)*p))];
export async function run({order=0,samples=9,iterations=2048,warmup=2048,latencyGroups=128,packetCalls=1024,worker=false,hooks=false,sizes=[1024],concurrencies=[1,16,64],kinds=['stock','batch16','batch64','group','birpc','penpal']}={}) {
 const results=[];kinds=[...kinds.slice(order%kinds.length),...kinds.slice(0,order%kinds.length)];
 for(const concurrency of concurrencies)for(const textBytes of sizes){
  // Distinct objects per logical operation avoid cross-request object dedup.
  const payloads=Array.from({length:concurrency},()=>({value:7,text:'x'.repeat(textBytes)})),cases=[];
  const check=values=>{
   if(!Array.isArray(values)||values.length!==concurrency)throw Error('Wrong result count');
   for(const value of values)if(value.value!==7||value.text!==payloads[0].text)throw Error('Incorrect echoed value');
  };
  try{
   for(const kind of kinds)cases.push({kind,...await pair(kind,{worker,hooks}),rates:[]});
   const run=async(item,count,latencies)=>{
    const start=performance.now();
    for(let i=0;i<count;i+=concurrency){
     const t=latencies?performance.now():0;check(await item.callMany(payloads));
     if(latencies)latencies.push(performance.now()-t);
    }
    return count/(performance.now()-start)*1000;
   };
   for(const item of cases)await run(item,warmup);
   for(let round=0;round<samples;round++)for(let offset=0;offset<cases.length;offset++){
    const item=cases[(round+offset)%cases.length];item.rates.push(await run(item,iterations));
   }
   for(const item of cases){
    const latency=[];await run(item,latencyGroups*concurrency,latency);latency.sort((a,b)=>a-b);
    // Counting instrumentation is installed only after throughput and latency.
    await item.startCounting();await run(item,packetCalls);
    const local=item.localStats(),remote=await item.remoteStats();
    const expected=warmup+samples*iterations+latencyGroups*concurrency+packetCalls;
    if(remote.calls!==expected)throw Error('Remote handler invocation count mismatch');
    const serverPackets=remote.packets-1; // Exclude the counting-start acknowledgement.
    if(local.transport&&local.transport.queued!==0)throw Error('Queue not drained');
    if(['stock','birpc','penpal'].includes(item.kind)&&(local.packets!==packetCalls||serverPackets!==packetCalls))throw Error('Unbatched native-send count mismatch');
    if(item.kind.startsWith('batch')&&concurrency>1&&(local.packets>=packetCalls||serverPackets>=packetCalls))throw Error('Transparent batching did not reduce native sends');
    if(item.kind==='group'&&!hooks&&concurrency>1&&(local.packets!==packetCalls/concurrency||serverPackets!==packetCalls/concurrency))throw Error('Explicit-group native-send count mismatch');
    results.push({kind:item.kind,concurrency,textBytes,opsPerSecond:stats(item.rates),latencyMs:{p50:percentile(latency,.5),p95:percentile(latency,.95),p99:percentile(latency,.99),samples:latency},logicalCalls:expected,packetPhaseCalls:packetCalls,clientPackets:local.packets,serverPackets,transport:local.transport});
   }
  }finally{for(const item of cases)await item.close();}
 }
 return{methodology:{order,samples,iterations,warmup,latencyGroups,packetCalls,worker,hooks,sizes,concurrencies,kinds,snapshot:'Transparent batching clones every queued message immediately. Explicit groups snapshot one graph before returning, preserving aliases across members; already-ready responses may share a reply graph; slow responses stay independent.',latency:'separate group-completion phase after throughput; entire burst RTT, including grouping; quantization retained',instrumentation:'Native send counters installed only in an untimed validation phase; counting-start acknowledgement excluded',checks:'distinct payload objects per member; every result scalar/full text and exact remote echo count',comparators:'cached birpc default 60s timeout; cached Penpal 30s call timeout; CrossBus default guards/30s timeout; startup excluded',caution:'new opt-in experimental bulk API has group-graph semantics, not a drop-in independent-call replacement; no universal rank'},results};
}
