import { it,expect } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { MessageType } from '../../src/common/types.js';
import { PendingRequests } from '../../src/router/pending-requests.js';
it('keeps inbound handling Promise-based and classifies broadcast hooks as signals',async()=>{
 const bus=CrossBus.createSecure({peerId:'receiver',allowedOrigins:['trusted']});
 const contexts=[]; let seen;
 bus.addInboundHook((value,ctx)=>{contexts.push(ctx.type);return value;});
 bus.on('tick',event=>{seen=event.data.payload;},{mode:'sync'});
 try{
  const handled=bus.handleMessage({type:MessageType.BROADCAST,payload:{name:'tick',data:7}},'trusted','sender');
  expect(handled).toBeInstanceOf(Promise); await handled;
  expect(seen).toBe(7);expect(contexts).toEqual(['signal']);
  expect(bus.handleMessage(null,'trusted','sender')).toBeInstanceOf(Promise);
 }finally{bus.destroy();}
});
it('does not execute a handler after an in-flight inbound hook is destroyed',async()=>{
 const bus=CrossBus.createSecure({peerId:'receiver',allowedOrigins:['trusted']});
 let release,called=false;
 const wait=new Promise(resolve=>{release=resolve;});
 bus.addInboundHook(async value=>{await wait;return value;});
 bus.handle('protected',()=>{called=true;});
 const handled=bus.handleMessage({id:'id',type:'req',payload:{name:'protected',data:7}},'trusted','sender');
 bus.destroy();release();await handled;expect(called).toBe(false);
});
it('settles only the pending request bound to the replying peer',async()=>{
 const pending=new PendingRequests();const request=pending.create('owner','echo');
 expect(pending.resolve(request.requestId,{success:true,data:'forged'},'other')).toBe(false);
 expect(pending.size).toBe(1);
 expect(pending.resolve(request.requestId,{success:true,data:'verified'},'owner')).toBe(true);
 expect(await request.promise).toBe('verified');expect(pending.size).toBe(0);
});
it('stale RPC cleanup cannot remove a newer registration or its security policy',async()=>{
 const bus=CrossBus.createSecure({peerId:'receiver',allowedOrigins:['trusted']});
 const handler=()=>7;
 const old=bus.handle('echo',handler);bus.unhandle('echo');
 bus.handle('echo',handler,{allowedPeers:['owner']});
 expect(old()).toBe(false);expect(bus.hasHandler('echo')).toBe(true);
 let response;
 await bus.handleMessage({id:'id',type:'req',payload:{name:'echo',data:null}},'trusted','other',message=>{response=message;});
 expect(response.payload.error.code).toBe('ERR_UNAUTHORIZED');bus.destroy();
});
it('routes both request and response for an explicitly empty peer ID without broadcasting',async()=>{
 const a=new CrossBus({peerId:'',allowedOrigins:['trusted']}),b=new CrossBus({peerId:'b',allowedOrigins:['trusted']});
 a.addPeer('b',message=>{void b.handleMessage(message,'trusted','');});
 b.addPeer('',message=>{void a.handleMessage(message,'trusted','b');});
 a.handle('echo',value=>value);b.handle('echo',value=>value);
 try{
  expect(await a.request('b','echo',7)).toBe(7);expect(await b.request('','echo',8)).toBe(8);
 }finally{a.destroy();b.destroy();}
});
it('missing origins do not become implicit trust in a runtime without location',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
 delete globalThis.location;
 const { OriginValidator }=await import('../../src/security/origin-validator.js');
 try{expect(new OriginValidator().isAllowed(undefined)).toBe(false);}
 finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);}
});
