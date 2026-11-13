import { it,expect } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';

it('uses one payload snapshot for request normalization and execution',async()=>{
 const bus=CrossBus.createSecure({peerId:'b',allowedOrigins:['trusted']});
 const payload={name:'echo',data:7};let reads=0,response;
 bus.handle('echo',value=>value);
 try{
  await bus.handleMessage({id:'request',type:'req',get payload(){reads++;return reads===1?payload:{name:'unexpected',data:99};}},'trusted','a',message=>{response=message;});
  expect(response.payload.data).toBe(7);expect(reads).toBe(1);
 }finally{bus.destroy();}
});

it('uses one payload snapshot to validate and settle a response',async()=>{
 const bus=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 let request,reads=0;
 bus.addPeer('b',message=>{request=message;});
 const pending=bus.request('b','echo',7);
 try{
  const payload={requestId:request.id,success:true,data:7,error:null};
  await bus.handleMessage({id:'response',type:'res',get payload(){reads++;return payload;}},'trusted','b');
  expect(await pending).toBe(7);expect(reads).toBe(1);
 }finally{bus.destroy();}
});

for(const format of ['standard','legacy','outer-status']) it(`retains ${format} response status and request matching`,async()=>{
 const bus=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 let request;bus.addPeer('b',message=>{request=message;});
 const pending=bus.request('b','echo',7);
 try{
  const message=format==='legacy'?{t:'res',id:request.id,success:true,p:7}:
   format==='outer-status'?{type:'res',id:'reply',success:true,payload:{requestId:request.id,data:7}}:
   {type:'res',id:'reply',payload:{requestId:request.id,success:true,data:7,error:null}};
  await bus.handleMessage(message,'trusted','b');
  expect(await pending).toBe(7);expect(bus.healthCheck().pendingRequests).toBe(0);
 }finally{bus.destroy();}
});
