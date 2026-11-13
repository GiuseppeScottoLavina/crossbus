import { it,expect } from 'bun:test';
import { encodeCompact, decodeCompact } from '../../src/common/compact-wire.js';
import { createSignalMessage,createRequestMessage,createResponseMessage } from '../../src/core/message-types.js';
import { CrossBus } from '../../src/core/cross-bus.js';
import { MessageChannelTransport } from '../../src/transports/message-channel.js';
for(const message of [createSignalMessage('tick',{n:7},'a'),createRequestMessage('echo',{n:7},'a','b','req-id'),createResponseMessage('req-id',{n:7},'b'),createResponseMessage('req-id',null,'b',false,{code:'FAILED',message:'test'})]){
 it(`round-trips the complete ${message.type} envelope`,()=>{
  const packet=encodeCompact(message);expect(Array.isArray(packet)).toBe(true);
  expect(decodeCompact(structuredClone(packet))).toEqual(message);
 });
}
it('preserves extensions, metadata and unknown formats through the standard fallback',()=>{
 const base=createRequestMessage('echo',7,'a','b','id');
 for(const message of [Object.freeze({...base,extra:7}),{...base,extra:7},{...base,meta:{trace:'id'}},{...base,payload:{...base.payload,extra:7}},{...base,payload:{...base.payload,dest:undefined}},{...base,meta:new Map([['trace',7]])}]){
  expect(encodeCompact(message)).toBe(message);expect(decodeCompact(message)).toBe(message);
 }
});
it('ignores malformed compact packets without producing protocol messages',()=>{
 const packet=encodeCompact(createRequestMessage('echo',7,'a','b','id'));
 for(const bad of [[...packet,7],[...packet.slice(0,4),7,...packet.slice(5)],[packet[0],'unknown',...packet.slice(2)],[packet[0],packet[1],7,...packet.slice(3)]]) expect(decodeCompact(bad)).toBeNull();
});
for(const peerFormat of ['standard','compact']) it(`compact RPC and hooks interoperate with a ${peerFormat} sender`,async()=>{
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel'],maxPayloadSize:128});
 const b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel'],maxPayloadSize:128});
 const channel=new MessageChannelTransport({wireFormat:'compact'});
 a.addTransport(channel,{peerId:'b',origin:'channel'});
 b.addTransport(MessageChannelTransport.fromPort(channel.remotePort,{wireFormat:peerFormat}),{peerId:'a',origin:'channel'});
 let handled=0;
 b.addInboundHook(value=>{if(value.blocked)throw new Error('Blocked');return value;});
 b.handle('echo',value=>{handled++;return value;});
 a.handle('echo',value=>value);
 try{
  expect(await a.request('b','echo',{n:7})).toEqual({n:7});
  expect(await b.request('a','echo',{n:8})).toEqual({n:8});
  const blocked=await a.request('b','echo',{blocked:true}).catch(error=>error);
  expect(blocked.message).toBe('Blocked');
  const oversized=await a.request('b','echo','x'.repeat(100)).catch(error=>error);
  expect(oversized.code).toBe('ERR_PAYLOAD_TOO_LARGE');
  expect(handled).toBe(1);expect(a.healthCheck().pendingRequests).toBe(0);
 }finally{a.destroy();b.destroy();}
});
it('keeps binary ownership and detaches explicit transfer lists in compact mode',async()=>{
 const channel=new MessageChannelTransport({wireFormat:'compact'}), remote=MessageChannelTransport.fromPort(channel.remotePort);
 const delivered=new Promise(resolve=>remote.onMessage(resolve));
 const buffer=new ArrayBuffer(8);new Uint8Array(buffer)[0]=7;
 channel.send(createSignalMessage('bytes',buffer,'a'),[buffer]);
 try{expect(buffer.byteLength).toBe(0);expect(new Uint8Array((await delivered).payload.data)[0]).toBe(7);}
 finally{channel.destroy();remote.destroy();}
});
it('rejects invalid wire modes before allocating channel resources',()=>{
 expect(()=>new MessageChannelTransport({wireFormat:'unknown'})).toThrow(TypeError);
 expect(()=>new MessageChannelTransport({wireFormat:'compact',contentType:'other'})).toThrow(TypeError);
});
it('preserves cyclic application data and reads scalar envelope getters only once',()=>{
 let reads=0;const data={n:7};data.self=data;
 const message={_cb:1,version:1,id:'id',type:'sig',timestamp:1,meta:{},payload:{name:'tick',get data(){reads++;return data;},source:'a',dest:null}};
 const result=decodeCompact(structuredClone(encodeCompact(message)));
 expect(reads).toBe(1);expect(result.payload.data.self).toBe(result.payload.data);expect(result.payload.data.n).toBe(7);
});
it('preserves compact packets for reordered fields and retains enumerable extensions',()=>{
 const message=createRequestMessage('echo',7,'a','b','id');
 const reverse=value=>Object.fromEntries(Object.entries(value).reverse());
 const reordered=reverse({...message,payload:reverse(message.payload)});
 expect(decodeCompact(structuredClone(encodeCompact(reordered)))).toEqual(message);
 const nonenumerable={...message,extra:true};
 Object.defineProperty(nonenumerable,'id',{value:'id',enumerable:false});
 expect(encodeCompact(nonenumerable)).toBe(nonenumerable);
});
