import { it,expect } from 'bun:test';
import { CrossBus,MessageChannelTransport } from '../../dist/crossbus.min.js';
import { GroupTransport,attachGrouped,requestGroup,GROUP_TYPE,REPLY_GROUP_TYPE } from '../../experiments/rpc-batching/group-transport.js';
function pair(){
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']}),b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel']});
 const base=new MessageChannelTransport(),remote=MessageChannelTransport.fromPort(base.remotePort);
 const left=attachGrouped(a,base,{peerId:'b'}),right=attachGrouped(b,remote,{peerId:'a'});
 return{a,b,left,right,close(){a.destroy();b.destroy();}};
}
it('sends one native request packet for a synchronous explicit group',async()=>{
 const p=pair();p.b.handle('echo',v=>v);
 try{
  const calls=Array.from({length:16},(_,n)=>({name:'echo',payload:{n}}));
  expect(await requestGroup(p.a,p.left,'b',calls)).toEqual(calls.map(c=>c.payload));
  expect(p.left.stats.sentPackets).toBe(1);expect(p.right.stats.sentPackets).toBe(1);
 }finally{p.close();}
});
it('captures inputs before returning and preserves bulk graph aliases deliberately',async()=>{
 const p=pair();let first;
 p.b.handle('seen',v=>{const same=first===v;first=v;return {n:v.n,same};});
 try{
  const data={n:7};const pending=requestGroup(p.a,p.left,'b',[{name:'seen',payload:data},{name:'seen',payload:data}]);
  data.n=99;expect(await pending).toEqual([{n:7,same:false},{n:7,same:true}]);
 }finally{p.close();}
});
it('keeps per-call timeout and error policies independent',async()=>{
 const p=pair();let seen=0;p.b.handle('echo',v=>{seen++;return v;});p.b.handle('wait',()=>new Promise(()=>{}));
 try{
  const error=await requestGroup(p.a,p.left,'b',[{name:'wait',payload:{},options:{timeout:15}},{name:'echo',payload:7}]).catch(e=>e);
  expect(error.code).toBe('ERR_RESPONSE_TIMEOUT');expect(seen).toBe(1);expect(p.a.healthCheck().pendingRequests).toBe(0);
 }finally{p.close();}
});
it('retains authorization, inbound hook failure and budget guards for every member',async()=>{
 const p=pair();let executed=0;
 p.b.addInboundHook(v=>{if(v?.blocked)throw Error('blocked');return v;});
 p.b.handle('protected',()=>{executed++;},{allowedPeers:['other']});p.b.handle('echo',v=>{executed++;return v;});
 try{
  const e=await requestGroup(p.a,p.left,'b',[{name:'protected',payload:{}},{name:'echo',payload:{blocked:true}}]).catch(e=>e);
  expect(e).toBeInstanceOf(Error);expect(executed).toBe(0);
  const large=await requestGroup(p.a,p.left,'b',[{name:'echo',payload:'x'.repeat(600000)}]).catch(e=>e);
  expect(large.code).toBe('ERR_PAYLOAD_TOO_LARGE');expect(executed).toBe(0);
 }finally{p.close();}
});
it('preserves asynchronous hooks even when their sends leave the group window',async()=>{
 const p=pair();p.a.addOutboundHook(async v=>{await Promise.resolve();return {...v,n:v.n+1};});p.b.handle('echo',v=>v);
 try{
  expect(await requestGroup(p.a,p.left,'b',[{name:'echo',payload:{n:1}},{name:'echo',payload:{n:2}}])).toEqual([{n:2},{n:3}]);
  expect(p.left.stats.sentPackets).toBe(2);
 }finally{p.close();}
});
it('cleans all pending work after a whole-group clone failure',async()=>{
 const p=pair();let seen=0;p.b.handle('echo',v=>{seen++;return v;});
 try{
  const error=await requestGroup(p.a,p.left,'b',[{name:'echo',payload:1},{name:'echo',payload:()=>{}}]).catch(e=>e);
  expect(error).toBeInstanceOf(Error);expect(p.a.healthCheck().pendingRequests).toBe(0);expect(seen).toBe(0);expect(p.a.peerCount).toBe(0);
 }finally{p.close();}
});
it('rejects malformed groups, nested groups and duplicate IDs atomically',()=>{
 let receive;const t=new GroupTransport({onMessage(fn){receive=fn;},send(){},offMessage(){},destroy(){}});let seen=0;t.onMessage(()=>{seen++;});
 const good={_cb:1,id:'r1',type:'req',payload:{name:'echo',data:7}};
 try{for(const messages of [[],[good,null],[good,good],Array(65).fill(good),[{...good,type:GROUP_TYPE}]])receive({_cb:1,id:'g',type:GROUP_TYPE,payload:{messages}},{origin:'channel'});expect(seen).toBe(0);}
 finally{t.destroy();}
});
it('does not retain a group queue after destruction',async()=>{
 const p=pair();p.b.handle('echo',v=>v);
 const pending=requestGroup(p.a,p.left,'b',[{name:'echo',payload:1},{name:'echo',payload:2}]).catch(e=>e);p.a.destroy();
 try{expect(await pending).toBeInstanceOf(Error);expect(p.left.stats.queued).toBe(0);}
 finally{p.close();}
});
it('cancels every member when a full 64-message packet cannot be cloned',async()=>{
 const p=pair();p.b.handle('echo',v=>v);
 try{
  const ops=Array.from({length:64},(_,n)=>({name:'echo',payload:n===63?()=>{}:n}));
  expect(await requestGroup(p.a,p.left,'b',ops).catch(e=>e)).toBeInstanceOf(Error);
  expect(p.a.healthCheck().pendingRequests).toBe(0);expect(p.a.peerCount).toBe(0);
 }finally{p.close();}
});
it('rejects a mismatched transport binding before creating requests',async()=>{
 const p=pair();
 try{
  expect(await requestGroup(p.a,p.right,'b',[{name:'echo',payload:7}]).catch(e=>e)).toBeInstanceOf(TypeError);
  expect(p.a.healthCheck().pendingRequests).toBe(0);expect(p.left.stats.sentPackets).toBe(0);
 }finally{p.close();}
});
it('reads operation descriptors once before creating requests',async()=>{
 const p=pair();p.b.handle('echo',v=>v);let reads=0;
 try{expect(await requestGroup(p.a,p.left,'b',[{get name(){if(++reads>1)throw Error('read twice');return 'echo';},payload:7}])).toEqual([7]);expect(reads).toBe(1);}
 finally{p.close();}
});
it('preserves aliases in a coalesced reply graph and releases reply bookkeeping',async()=>{
 const p=pair();const shared={n:7};p.b.handle('shared',()=>shared);
 try{
  const values=await requestGroup(p.a,p.left,'b',[{name:'shared'},{name:'shared'}]);
  expect(values[0]).toBe(values[1]);expect(p.right.stats.queued).toBe(0);expect(p.right.stats.replyMappings).toBe(0);
 }finally{p.close();}
});
it('does not hold ready responses behind slow group members',async()=>{
 const p=pair();let release;p.b.handle('slow',()=>new Promise(resolve=>{release=resolve;}));p.b.handle('echo',v=>v);
 let ready;
 const original=p.a.request.bind(p.a);p.a.request=(peer,name,data,options)=>{
  const value=original(peer,name,data,options);if(name==='echo')ready=value;return value;
 };
 try{
  const pending=requestGroup(p.a,p.left,'b',[{name:'slow',options:{timeout:500}},{name:'echo',payload:7}]);
  expect(await ready).toBe(7);expect(p.a.healthCheck().pendingRequests).toBe(1);
  release(9);expect(await pending).toEqual([9,7]);expect(p.right.stats.replyMappings).toBe(0);
 }finally{p.close();}
});
it('does not lose a success after an earlier synchronous error flushed the reply window',async()=>{
 const p=pair();p.b.handle('echo',v=>v);let good;
 const request=p.a.request.bind(p.a);p.a.request=(peer,name,data,options)=>{
  const pending=request(peer,name,data,options);if(name==='echo')good=pending.catch(e=>e);return pending;
 };
 try{
  const error=await requestGroup(p.a,p.left,'b',[{name:'missing'},{name:'echo',payload:7,options:{timeout:50}}]).catch(e=>e);
  expect(error.code).toBe('ERR_NO_HANDLER');expect(await good).toBe(7);expect(p.right.stats.queued).toBe(0);
 }finally{p.close();}
});
it('matches every reply to its bound peer even inside a reply container',async()=>{
 const p=pair();let release,readyResolve,requestId;
 const ready=new Promise(resolve=>{readyResolve=resolve;});
 p.b.handle('wait',()=>new Promise(resolve=>{release=resolve;readyResolve();}));
 const send=p.left.send.bind(p.left);p.left.send=m=>{requestId=m.id;send(m);};
 let receive;const other=attachGrouped(p.a,{onMessage(fn){receive=fn;},send(){},destroy(){},offMessage(){}},{peerId:'c'});
 try{
  const pending=p.a.request('b','wait',{});await ready;
  receive({_cb:1,id:'forged',type:REPLY_GROUP_TYPE,payload:{messages:[{_cb:1,id:'reply',type:'res',payload:{requestId,success:true,data:'forged'}}]}},{origin:'channel'});
  expect(p.a.healthCheck().pendingRequests).toBe(1);release(7);expect(await pending).toBe(7);expect(other.stats.queued).toBe(0);
 }finally{p.close();}
});
it('keeps receiver-side payload limits active and preserves a valid sibling result',async()=>{
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']});
 const b=new CrossBus({peerId:'b',allowedOrigins:['channel'],strictMode:true,maxPayloadSize:64});
 const base=new MessageChannelTransport(),left=attachGrouped(a,base,{peerId:'b'});
 attachGrouped(b,MessageChannelTransport.fromPort(base.remotePort),{peerId:'a'});
 let executed=0,good;b.handle('echo',v=>{executed++;return v;});
 const request=a.request.bind(a);a.request=(peer,name,data,options)=>{const pending=request(peer,name,data,options);if(data===7)good=pending;return pending;};
 try{
  const error=await requestGroup(a,left,'b',[{name:'echo',payload:'x'.repeat(100)},{name:'echo',payload:7}]).catch(e=>e);
  expect(error.code).toBe('ERR_PAYLOAD_TOO_LARGE');expect(await good).toBe(7);expect(executed).toBe(1);expect(a.healthCheck().pendingRequests).toBe(0);
 }finally{a.destroy();b.destroy();}
});
it('releases all mixed synchronous, asynchronous and error replies without bookkeeping leaks',async()=>{
 const p=pair();p.b.handle('echo',v=>v);p.b.handle('async',async v=>{await Promise.resolve();return v;});p.b.handle('fail',()=>{throw Error('expected');});
 const request=p.a.request.bind(p.a);let pending=[];
 p.a.request=(...args)=>{const value=request(...args);pending.push(value.then(value=>({ok:true,value}),error=>({ok:false,code:error.code})));return value;};
 try{
  for(let round=0;round<20;round++){
   pending=[];const names=['echo','async','fail','missing'];
   const operations=Array.from({length:16},(_,i)=>({name:names[(i+round)%4],payload:i,options:{timeout:500}}));
   await requestGroup(p.a,p.left,'b',operations).catch(()=>{});
   const replies=await Promise.all(pending);
   for(let i=0;i<operations.length;i++){
    if(['echo','async'].includes(operations[i].name))expect(replies[i]).toEqual({ok:true,value:i});
    else expect(replies[i].ok).toBe(false);
   }
   expect(p.a.healthCheck().pendingRequests).toBe(0);expect(p.right.stats.queued).toBe(0);expect(p.right.stats.replyMappings).toBe(0);
  }
 }finally{p.close();}
});
it('preserves automatic ArrayBuffer ownership transfer in explicit groups',async()=>{
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']}),b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel']});
 const base=new MessageChannelTransport({autoTransfer:true}),left=attachGrouped(a,base,{peerId:'b'});
 const right=attachGrouped(b,MessageChannelTransport.fromPort(base.remotePort,{autoTransfer:true}),{peerId:'a'});
 b.handle('echo',v=>v);
 // ArrayBuffers themselves are transferable; typed views are not transfer-list entries.
 const data=Array.from({length:16},(_,i)=>new Uint8Array(4096).fill(i).buffer),expected=data.map(v=>v.slice(0));
 try{
  const pending=requestGroup(a,left,'b',data.map(payload=>({name:'echo',payload})));
  for(const value of data)expect(value.byteLength).toBe(0);
  expect(await pending).toEqual(expected);expect(left.stats.sentPackets).toBe(1);expect(right.stats.sentPackets).toBe(1);
 }finally{a.destroy();b.destroy();}
});
it('retains per-handler rate limits across group members',async()=>{
 const p=pair();let executed=0;p.b.handle('limited',v=>{executed++;return v;},{rateLimit:1});p.b.handle('barrier',()=>7);
 try{
  const error=await requestGroup(p.a,p.left,'b',[{name:'limited',payload:1},{name:'limited',payload:2}]).catch(e=>e);
  expect(error.code).toBe('ERR_RATE_LIMITED');expect(await p.a.request('b','barrier')).toBe(7);
  expect(executed).toBe(1);expect(p.a.healthCheck().pendingRequests).toBe(0);
 }finally{p.close();}
});
it('does not lose a reentrant ordinary RPC triggered during native serialization',async()=>{
 const p=pair();p.b.handle('echo',v=>v);let reads=0,inner;
 const payload={get n(){if(++reads===2)inner=p.a.request('b','echo',42,{timeout:50}).catch(e=>e);return 7;}};
 try{
  expect(await requestGroup(p.a,p.left,'b',[{name:'echo',payload},{name:'echo',payload:1}])).toEqual([{n:7},1]);
  expect(await inner).toBe(42);expect(p.a.healthCheck().pendingRequests).toBe(0);
 }finally{p.close();}
});
it('captures a nested group before its helper returns',async()=>{
 const p=pair();p.b.handle('echo',v=>v);let reads=0,inner;
 const data={n:1};const payload={get n(){if(++reads===1){inner=requestGroup(p.a,p.left,'b',[{name:'echo',payload:data}]);data.n=2;}return 7;}};
 try{
  expect(await requestGroup(p.a,p.left,'b',[{name:'echo',payload},{name:'echo',payload:1}])).toEqual([{n:7},1]);
  expect(await inner).toEqual([{n:1}]);
 }finally{p.close();}
});
it('cancels pending calls after a nested group clone failure',async()=>{
 const p=pair();p.b.handle('echo',v=>v);let reads=0,inner;
 const payload={get n(){if(++reads===1)inner=requestGroup(p.a,p.left,'b',[{name:'echo',payload:()=>{}}]).catch(e=>e);return 7;}};
 try{
  expect(await requestGroup(p.a,p.left,'b',[{name:'echo',payload},{name:'echo',payload:1}]).catch(e=>e)).toBeInstanceOf(Error);
  expect(await inner).toBeInstanceOf(Error);expect(p.a.healthCheck().pendingRequests).toBe(0);expect(p.a.peerCount).toBe(0);
 }finally{p.close();}
});
