import { it,expect } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { PeerStatus } from '../../src/common/types.js';

it('rejects disconnected RPC peers without sending or retaining pending requests',async()=>{
 const bus=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 let sent=0;
 bus.addPeer('b',()=>{sent++;});
 bus.getPeer('b').status=PeerStatus.DISCONNECTED;
 try{
  const error=await bus.request('b','echo',7).catch(error=>error);
  expect(error.code).toBe('ERR_SEND_FAILED');expect(sent).toBe(0);
  expect(bus.healthCheck().pendingRequests).toBe(0);
 }finally{bus.destroy();}
});

it('uses the replacement peer binding after an asynchronous outbound hook',async()=>{
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 const b=CrossBus.createSecure({peerId:'b',allowedOrigins:['trusted']});
 let stale=0,live=0;
 a.addPeer('b',()=>{stale++;});
 b.addPeer('a',message=>{void a.handleMessage(message,'trusted','b');});
 b.handle('echo',value=>value);
 a.addOutboundHook(async value=>{
  await Promise.resolve();a.removePeer('b');
  a.addPeer('b',message=>{live++;void b.handleMessage(message,'trusted','a');});
  return value;
 });
 try{
  expect(await a.request('b','echo',7)).toBe(7);
  expect(stale).toBe(0);expect(live).toBe(1);
 }finally{a.destroy();b.destroy();}
});

it('settles an RPC whose peer was removed by an outbound hook',async()=>{
 const bus=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 bus.addPeer('b',()=>{throw Error('Retired peer must not send');});
 bus.addOutboundHook(value=>{bus.removePeer('b');return value;});
 try{
  const error=await bus.request('b','echo',7).catch(error=>error);
  expect(error.code).toBe('ERR_SEND_FAILED');expect(bus.healthCheck().pendingRequests).toBe(0);
 }finally{bus.destroy();}
});

it('preserves frozen RPC envelopes and the registered send function receiver',async()=>{
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['trusted']});
 const b=CrossBus.createSecure({peerId:'b',allowedOrigins:['trusted']});
 let calls=0;
 function send(receiver,sender) {
  return function(message){
   expect(this).toBe(sender.getPeer(this.peerId));
   expect(Object.isFrozen(message)).toBe(true);
   expect(Object.isFrozen(message.payload)).toBe(true);calls++;
   void receiver.handleMessage(message,'trusted',sender.peerId);
  };
 }
 a.addPeer('b',send(b,a));b.addPeer('a',send(a,b));b.handle('echo',value=>value);
 try{expect(await a.request('b','echo',7)).toBe(7);expect(calls).toBe(2);}
 finally{a.destroy();b.destroy();}
});
