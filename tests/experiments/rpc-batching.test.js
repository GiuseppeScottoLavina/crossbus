import { it,expect } from 'bun:test';
import { CrossBus,MessageChannelTransport } from '../../dist/crossbus.min.js';
import { BatchTransport,attachBatched,BATCH_TYPE } from '../../experiments/rpc-batching/transport.js';

function pair(options={}) {
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']}),b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel']});
 const base=new MessageChannelTransport(),remote=MessageChannelTransport.fromPort(base.remotePort);
 const left=attachBatched(a,base,{peerId:'b',...options}),right=attachBatched(b,remote,{peerId:'a',...options});
 return {a,b,left,right,close(){a.destroy();b.destroy();}};
}
it('runs burst RPCs with fewer native sends and exact results',async()=>{
 const p=pair();p.b.handle('echo',value=>value);
 try{
  expect(await Promise.all(Array.from({length:32},(_,n)=>p.a.request('b','echo',{n})))).toEqual(Array.from({length:32},(_,n)=>({n})));
  expect(p.left.stats.sentMessages).toBe(32);expect(p.left.stats.sentPackets).toBeLessThan(32);
  expect(p.left.stats.maxBatch).toBeLessThanOrEqual(16);expect(p.left.stats.queued).toBe(0);
 }finally{p.close();}
});
it('snapshots every queued message synchronously and isolates shared inputs',async()=>{
 const p=pair();p.b.handle('echo',value=>{const n=value.n;value.n=999;return n;});
 try{
  const data={n:1};const calls=[p.a.request('b','echo',data)];
  data.n=2;calls.push(p.a.request('b','echo',data));
  data.n=3;calls.push(p.a.request('b','echo',data));data.n=4;
  expect(await Promise.all(calls)).toEqual([1,2,3]);
 }finally{p.close();}
});
it('rejects uncloneable queued input immediately without losing valid queued calls',async()=>{
 const p=pair();p.b.handle('echo',value=>value);
 try{
  const good=p.a.request('b','echo',1),queued=p.a.request('b','echo',2);
  const bad=p.a.request('b','echo',()=>{}).catch(error=>error);
  expect((await bad).code).toBe('ERR_SEND_FAILED');
  expect(await Promise.all([good,queued])).toEqual([1,2]);
  expect(p.a.healthCheck().pendingRequests).toBe(0);
 }finally{p.close();}
});
it('retains handler permissions, hook rejection and size limits per logical RPC',async()=>{
 const p=pair();let called=0;
 p.b.addInboundHook(value=>{if(value.blocked)throw Error('blocked');return value;});
 p.b.handle('protected',value=>{called++;return value;},{allowedPeers:['someone-else']});
 p.b.handle('echo',value=>{called++;return value;});
 try{
  const values=await Promise.all([
   p.a.request('b','protected',{}).catch(e=>e),p.a.request('b','echo',{blocked:true}).catch(e=>e),
   p.a.request('b','echo','x'.repeat(600000)).catch(e=>e),p.a.request('b','echo',{n:7})
  ]);
  expect(values[0].code).toBe('ERR_UNAUTHORIZED');expect(values[1].message).toBe('blocked');
  expect(values[2].code).toBe('ERR_PAYLOAD_TOO_LARGE');expect(values[3]).toEqual({n:7});expect(called).toBe(1);
 }finally{p.close();}
});
it('retains independent per-call timeouts',async()=>{
 const p=pair();p.b.handle('wait',()=>new Promise(()=>{}));p.b.handle('echo',v=>v);
 try{
  const waiting=p.a.request('b','wait',{}, {timeout:15}).catch(e=>e);
  expect(await p.a.request('b','echo',7)).toBe(7);
  expect((await waiting).code).toBe('ERR_RESPONSE_TIMEOUT');expect(p.a.healthCheck().pendingRequests).toBe(0);
 }finally{p.close();}
});
it('flushes older queued messages before immediate binary transfer and preserves ownership',async()=>{
 const base=new MessageChannelTransport(),remote=MessageChannelTransport.fromPort(base.remotePort);
 const sent=new BatchTransport(base),received=new BatchTransport(remote);const values=[];
 const complete=new Promise(resolve=>received.onMessage(msg=>{values.push(msg.payload);if(values.length===3)resolve();}));
 const buffer=new ArrayBuffer(8);new Uint8Array(buffer)[0]=42;
 try{
  sent.send({_cb:1,id:'1',type:'sig',payload:1});sent.send({_cb:1,id:'2',type:'sig',payload:2});
  sent.send({_cb:1,id:'3',type:'sig',payload:buffer},[buffer]);
  expect(buffer.byteLength).toBe(0);await complete;expect(values.slice(0,2)).toEqual([1,2]);expect(new Uint8Array(values[2])[0]).toBe(42);
 }finally{sent.destroy();received.destroy();}
});
it('rejects malformed, nested and oversized batch containers before delivering any member',()=>{
 let receive;const base={onMessage(fn){receive=fn;},send(){},destroy(){},offMessage(){}};
 const t=new BatchTransport(base);let calls=0;t.onMessage(()=>{calls++;});
 const valid={_cb:1,id:'1',type:'sig',payload:7};
 for(const messages of [[],[valid,null],[{_cb:1,id:'nested',type:BATCH_TYPE,payload:{messages:[valid]}}],Array(65).fill(valid)])
  receive({_cb:1,id:'batch',type:BATCH_TYPE,payload:{messages}},{origin:'channel'});
 expect(calls).toBe(0);t.destroy();
});
it('cancels pending calls and discards queued work on destruction',async()=>{
 const p=pair();p.b.handle('echo',v=>v);
 const pending=Array.from({length:4},()=>p.a.request('b','echo',7).catch(e=>e));
 p.a.destroy();await Promise.resolve();
 try{for(const error of await Promise.all(pending))expect(error).toBeInstanceOf(Error);expect(p.left.stats.queued).toBe(0);expect(p.left.stats.sentPackets).toBe(1);}
 finally{p.close();}
});
it('closes a failed asynchronous flush and cancels the bound peer',async()=>{
 const a=CrossBus.createSecure({allowedOrigins:['channel']});let sends=0,closed=false;
 const base={onMessage(){},offMessage(){},send(){if(++sends>1)throw Error('flush failed');},destroy(){closed=true;}};
 const transport=attachBatched(a,base,{peerId:'b'});
 const pending=Array.from({length:3},()=>a.request('b','echo',7).catch(e=>e));
 try{for(const error of await Promise.all(pending))expect(error.code).toBe('ERR_PEER_DISCONNECTED');expect(closed).toBe(true);expect(transport.stats.queued).toBe(0);expect(a.peerCount).toBe(0);}
 finally{a.destroy();}
});
it('rejects invalid batching options',()=>{
 for(const maxMessages of [0,-1,1.5,65,NaN])expect(()=>new BatchTransport({}, {maxMessages})).toThrow(RangeError);
});
it('continues with independent logical messages after an observer throws',()=>{
 let receive;const base={onMessage(fn){receive=fn;},send(){},destroy(){},offMessage(){}};
 const t=new BatchTransport(base);let calls=0;t.onMessage(()=>{if(++calls===1)throw Error('observer failed');});
 try{
  receive({_cb:1,id:'batch',type:BATCH_TYPE,payload:{messages:[{_cb:1,id:'1',type:'sig'},{_cb:1,id:'2',type:'sig'}]}},{origin:'channel'});
  expect(calls).toBe(2);
 }finally{t.destroy();}
});
it('does not accept a batched response from another bound peer',async()=>{
 const p=pair();let release,readyResolve,requestId;
 const ready=new Promise(resolve=>{readyResolve=resolve;});
 p.b.handle('wait',()=>new Promise(resolve=>{release=resolve;readyResolve();}));
 const send=p.left.send.bind(p.left);p.left.send=message=>{requestId=message.id;send(message);};
 let receive;const other=new BatchTransport({onMessage(fn){receive=fn;},send(){},destroy(){},offMessage(){}});
 p.a.addTransport(other,{peerId:'c',origin:'channel'});
 try{
  const pending=p.a.request('b','wait',{});await ready;
  const forged={_cb:1,id:'forged',type:'res',payload:{requestId,success:true,data:'forged'}};
  receive({_cb:1,id:'batch',type:BATCH_TYPE,payload:{messages:[forged,forged]}},{origin:'channel'});
  expect(p.a.healthCheck().pendingRequests).toBe(1);release(7);expect(await pending).toBe(7);
 }finally{p.close();}
});
