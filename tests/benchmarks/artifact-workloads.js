import { createNanoEvents } from '../../node_modules/nanoevents/index.js';
import mitt from '../../node_modules/mitt/dist/mitt.mjs';
import EventEmitter3 from '../../node_modules/eventemitter3/dist/eventemitter3.esm.js';
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{median:sorted[sorted.length>>>1],min:sorted[0],max:sorted.at(-1),samples:values};};
export async function runWorkloads({artifact='../../dist/crossbus.min.js',samples=9,filter}={}){
 const lib=await import(artifact),nano=await import(new URL('nano.min.js',new URL(artifact,import.meta.url)));
 const definitions=[
  ['CrossBus emitSync',()=>{const emitter=new lib.EventEmitter();emitter.setMaxListeners(0);return{on:(n,fn)=>emitter.onFast(n,fn),emit:(n,d)=>emitter.emitSync(n,d)};}],
  ['CrossBus fast',lib.createFastEmitter],['CrossBus nano',nano.createNanoEmitter],
  ['nanoevents',createNanoEvents],['mitt',()=>{const e=mitt();return{on:(n,fn)=>{e.on(n,fn);return()=>e.off(n,fn);},emit:(n,d)=>e.emit(n,d)};}],['EventEmitter3',()=>{const e=new EventEmitter3();return{on:(n,fn)=>{e.on(n,fn);return()=>e.off(n,fn);},emit:(n,d)=>e.emit(n,d)};}]
 ].filter(([name])=>!filter||name.includes(filter));
 const results=[];
 for(const listeners of [1,10,100]){
  const cases=definitions.map(([library,create])=>{
   const e=create();let calls=0,checksum=0,total=0;const data={value:7};
   for(let i=0;i<listeners;i++) e.on('tick',v=>{calls++;checksum+=v.value;});
   let iterations=listeners===100?131072:1048576;
   const run=()=>{const t=performance.now();for(let i=0;i<iterations;i++)e.emit('tick',data);total+=iterations;return iterations/(performance.now()-t)*1000;};
   return{library,run,iterations,rates:[],check(){if(calls!==total*listeners||checksum!==calls*7)throw Error('Emitter work lost');}};
  });
  for(const item of cases)item.run();
  for(let r=0;r<samples;r++)for(let i=0;i<cases.length;i++){const item=cases[(i+r)%cases.length];item.rates.push(item.run());}
  for(const item of cases){item.check();results.push({library:item.library,workload:'emit',listeners,iterationsPerSample:item.iterations,opsPerSecond:stats(item.rates)});}
 }
 const churn=definitions.map(([library,create])=>{const e=create();let calls=0;const callback=()=>{calls++;};let rates=[];return{library,rates,run(){const start=performance.now();for(let i=0;i<262144;i++)e.on('tick',callback)();return 262144/(performance.now()-start)*1000;},check(){let called=false;e.emit('tick',{});if(calls!==0)throw Error('Churn leaked subscriptions');const off=e.on('check',()=>{called=true;});off();e.emit('check',{});if(called)throw Error('Churn left a listener');}};});
 for(const c of churn)c.run();for(let r=0;r<samples;r++)for(let i=0;i<churn.length;i++){const c=churn[(r+i)%churn.length];c.rates.push(c.run());}
 for(const c of churn){c.check();results.push({library:c.library,workload:'subscribe+unsubscribe',listeners:0,iterationsPerSample:262144,opsPerSecond:stats(c.rates)});}
 if(!filter||'CrossBus stream'.includes(filter)) {
  const rates=[],count=16384,expected='abcd'.repeat(count);
  for(let round=-1;round<samples;round++){
   const start=performance.now(),stream=new lib.ReadableSignalStream('study','text');
   for(let i=0;i<count;i++)stream.push({d:'abcd'});
   stream.end();const value=await stream.collect();
   const elapsed=performance.now()-start;
   if(value!==expected)throw Error('Buffered stream lost data');
   if(round>=0)rates.push(count/elapsed*1000);
  }
  results.push({library:'CrossBus stream',workload:'buffered text chunks',iterationsPerSample:count,opsPerSecond:stats(rates)});
 }
 return{methodology:{samples,order:'one warmup, rotate library order per sample; repeat in fresh processes',callbacks:'observable counter/checksum, identical callback semantics; local reference dispatch',warning:'not serialization, byte throughput or cross-context RPC'},results};
}
