import {it, expect} from 'bun:test';
import {encodeCompact, decodeCompact} from '../../src/common/compact-wire.js';
import {createRequestMessage,createResponseMessage,createSignalMessage} from '../../src/core/message-types.js';
import {CrossBus} from '../../src/core/cross-bus.js';
import {MessageChannelTransport} from '../../src/transports/message-channel.js';
const graph={text:'Unicode 🦾'};graph.self=graph;graph.alias=graph;
const messages=[createRequestMessage('echo',graph,'a','b','req'),createSignalMessage('progress',graph,'a'),
 ...[true,false].flatMap(success=>[null,undefined,{code:'ERR_TEST',message:'denied'},false].map(error=>({
  ...createResponseMessage('req',graph,'b',success),payload:{requestId:'req',data:graph,source:'b',success,error}
 })))];
for(const [index,message] of messages.entries())it(`v2 preserves every envelope field and application aliases ${index}`,()=>{
 const v1=encodeCompact(message),v2=encodeCompact(message,true);
 expect(Array.isArray(v2)).toBe(true);expect(typeof v2[0]).toBe('number');expect(v2.length).toBeLessThan(v1.length);
 const decoded=decodeCompact(structuredClone(v2));expect(decoded).toEqual(message);
 expect(decoded.payload.data.self).toBe(decoded.payload.data);expect(decoded.payload.data.alias).toBe(decoded.payload.data);
});
it('v2 retains extensions and nonempty metadata through standard fallback',()=>{
 const base=createRequestMessage('echo',7,'a','b','req');
 for(const message of [{...base,extension:7},{...base,meta:{trace:7}},{...base,payload:{...base.payload,extension:7}},{...base,payload:{...base.payload,dest:undefined}}])expect(encodeCompact(message,true)).toBe(message);
});
it('v2 rejects malformed tagged packets instead of synthesizing valid envelopes',()=>{
 for(const message of messages){
  const packet=encodeCompact(message,true);
  for(const malformed of [[...packet,7],packet.slice(0,-1),[packet[0],7,...packet.slice(2)],[...packet.slice(0,2),'time',...packet.slice(3)],[...packet.slice(0,3),7,...packet.slice(4)],[...packet.slice(0,5),7,...packet.slice(6)]])expect(decodeCompact(malformed)).toBeNull();
 }
});
for(const leftFormat of ['standard','compact','compact-v2'])for(const rightFormat of ['standard','compact','compact-v2'])it(`new endpoints retain RPC/hook guards with ${leftFormat}/${rightFormat}`,async()=>{
 const left=CrossBus.createSecure({peerId:'left',allowedOrigins:['channel'],maxPayloadSize:256,requestTimeout:1000});
 const right=CrossBus.createSecure({peerId:'right',allowedOrigins:['channel'],maxPayloadSize:256,requestTimeout:1000});
 const channel=new MessageChannelTransport({wireFormat:leftFormat});
 left.addTransport(channel,{peerId:'right'});
 right.addTransport(MessageChannelTransport.fromPort(channel.remotePort,{wireFormat:rightFormat}),{peerId:'left'});
 let calls=0;right.addInboundHook(value=>{if(value.blocked)throw Error('blocked');return value;});
 right.handle('echo',value=>{calls++;return value;});left.handle('echo',value=>value);
 try{
  expect(await left.request('right','echo',{value:7})).toEqual({value:7});
  expect(await right.request('left','echo',{value:9})).toEqual({value:9});
  const blocked=await left.request('right','echo',{blocked:true}).catch(error=>error);
  expect(blocked).toBeInstanceOf(Error);expect(blocked.message).toBe('blocked');
  const oversized=await left.request('right','echo','x'.repeat(256)).catch(error=>error);
  expect(oversized).toBeInstanceOf(Error);expect(oversized.code).toBe('ERR_PAYLOAD_TOO_LARGE');
  expect(calls).toBe(1);expect(left.healthCheck().pendingRequests).toBe(0);
 }finally{left.destroy();right.destroy();}
});
it('v2 moves only explicitly transferred binary storage and preserves data aliases',async()=>{
 const channel=new MessageChannelTransport({wireFormat:'compact-v2'}),remote=MessageChannelTransport.fromPort(channel.remotePort);
 const buffer=new ArrayBuffer(8);new Uint8Array(buffer)[0]=71;
 const data={first:buffer,second:buffer};const delivered=new Promise(resolve=>remote.onMessage(resolve));
 try{channel.send(createSignalMessage('bytes',data,'left'),[buffer]);expect(buffer.byteLength).toBe(0);
  const received=(await delivered).payload.data;expect(received.first).toBe(received.second);expect(new Uint8Array(received.first)[0]).toBe(71);
 }finally{channel.destroy();remote.destroy();}
});
it('v2 rejects serializer combinations before opening a channel',()=>{
 expect(()=>new MessageChannelTransport({wireFormat:'compact-v2',contentType:'text/plain'})).toThrow(TypeError);
});
it('v2 cannot settle a request through a different authenticated peer by spoofing source',async()=>{
 const client=CrossBus.createSecure({peerId:'client',allowedOrigins:['channel'],requestTimeout:1000});
 const server=CrossBus.createSecure({peerId:'server',allowedOrigins:['channel'],requestTimeout:1000});
 const channel=new MessageChannelTransport({wireFormat:'compact-v2'});
 const attackerChannel=new MessageChannelTransport({wireFormat:'compact-v2'});
 const attacker=MessageChannelTransport.fromPort(attackerChannel.remotePort,{wireFormat:'compact-v2'});
 client.addTransport(channel,{peerId:'server'});
 server.addTransport(MessageChannelTransport.fromPort(channel.remotePort,{wireFormat:'compact-v2'}),{peerId:'client'});
 client.addTransport(attackerChannel,{peerId:'attacker'});
 let receive,release;
 const received=new Promise(resolve=>{receive=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 server.handle('echo',async(value,context)=>{receive(context.requestId);await gate;return value;});
 const marker=new Promise(resolve=>client.on('probe:processed',resolve));
 let settled=false;
 const pending=client.request('server','echo','real');pending.then(()=>{settled=true;},()=>{settled=true;});
 try{
  const id=await received;
  attacker.send(createResponseMessage(id,'forged','server'));
  attacker.send(createSignalMessage('probe:processed',null,'server'));
  await marker;
  expect(settled).toBe(false);expect(client.healthCheck().pendingRequests).toBe(1);
  release();expect(await pending).toBe('real');
 }finally{release();attacker.destroy();client.destroy();server.destroy();}
});
