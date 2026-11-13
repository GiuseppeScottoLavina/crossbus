import {it, expect} from 'bun:test';
import {CrossBus} from '../../src/core/cross-bus.js';
import {MessageChannelTransport} from '../../src/transports/message-channel.js';

function pair(options={}){
 const a=CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']}),b=CrossBus.createSecure({peerId:'b',allowedOrigins:['channel'],...options});
 // Non-default content types already use the existing JSON serializer fallback.
 const left=new MessageChannelTransport({contentType:'application/json; charset=utf-8'}),port=left.remotePort;
 const right=MessageChannelTransport.fromPort(port);
 a.addTransport(left,{peerId:'b',origin:'channel'});b.addTransport(right,{peerId:'a',origin:'channel'});
 return{a,b,port,close(){a.destroy();b.destroy();}};
}

it('decodes the existing serialized JSON content-type fallback in both directions',async()=>{
 const p=pair();p.a.handle('echo',v=>v);p.b.handle('echo',v=>v);
 try{
  expect(await p.a.request('b','echo',{n:7,text:'serialized 🐟'}, {timeout:100})).toEqual({n:7,text:'serialized 🐟'});
  expect(await p.b.request('a','echo',{n:9}, {timeout:100})).toEqual({n:9});
 }finally{p.close();}
});

it('rejects explicit transfer lists for JSON strings before detaching ownership',()=>{
 const transport=new MessageChannelTransport({contentType:'application/json; charset=utf-8'}),buffer=new ArrayBuffer(8);
 try{
  expect(()=>transport.send({_cb:1,id:'transfer',type:'sig',payload:{buffer}},[buffer])).toThrow(TypeError);
  expect(buffer.byteLength).toBe(8);
 }finally{transport.destroy();}
});

it('does not auto-transfer buffers that are absent from the encoded JSON string',()=>{
 const transport=new MessageChannelTransport({contentType:'application/json; charset=utf-8',autoTransfer:true}),buffer=new ArrayBuffer(8);
 try{
  transport.send({_cb:1,id:'json',type:'sig',payload:{buffer}});
  expect(buffer.byteLength).toBe(8);
 }finally{transport.destroy();}
});

it('applies receiver-side payload limits to decoded JSON before running the handler',async()=>{
 const p=pair({maxPayloadSize:64});let called=0;p.b.handle('echo',v=>{called++;return v;});
 try{
  await expect(p.a.request('b','echo',{text:'x'.repeat(128)},{timeout:100})).rejects.toMatchObject({code:'ERR_PAYLOAD_TOO_LARGE'});
  expect(called).toBe(0);expect(await p.a.request('b','echo',7,{timeout:100})).toBe(7);expect(called).toBe(1);
 }finally{p.close();}
});

it('retains inbound validation and handler authorization after JSON decoding',async()=>{
 const p=pair();let called=0;
 p.b.addInboundHook(v=>{if(v?.blocked)throw Error('blocked');return v;});
 p.b.handle('protected',()=>{called++;},{allowedPeers:['someone-else']});
 p.b.handle('echo',v=>{called++;return v;});
 try{
  await expect(p.a.request('b','protected',{}, {timeout:100})).rejects.toMatchObject({code:'ERR_UNAUTHORIZED'});
  await expect(p.a.request('b','echo',{blocked:true}, {timeout:100})).rejects.toThrow('blocked');
  expect(called).toBe(0);
  expect(await p.a.request('b','echo',7,{timeout:100})).toBe(7);expect(called).toBe(1);
 }finally{p.close();}
});

it('ignores malformed JSON and non-protocol strings without breaking later messages',async()=>{
 const p=pair();p.a.handle('echo',v=>v);let delivered=0;p.b.handle('echo',v=>{delivered++;return v;});
 try{
  p.port.postMessage('{not JSON');p.port.postMessage(JSON.stringify({unrelated:true}));
  expect(await p.b.request('a','echo',7,{timeout:100})).toBe(7);
  expect(await p.a.request('b','echo',9,{timeout:100})).toBe(9);expect(delivered).toBe(1);
 }finally{p.close();}
});
