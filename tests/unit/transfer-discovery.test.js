import {it,expect} from 'bun:test';
import {findTransferables} from '../../src/common/types.js';
import {assertPayloadSize} from '../../src/common/utils.js';
import {MessageChannelTransport} from '../../src/transports/message-channel.js';

it('discovers one actual backing buffer for aliased typed arrays and DataViews',()=>{
 const buffer=new ArrayBuffer(64),fake=new ArrayBuffer(8),a=new Uint8Array(buffer,8,16),b=new DataView(buffer,4,12);
 Object.defineProperty(a,'buffer',{value:fake});
 expect(findTransferables({a,b})).toEqual([buffer]);
});

it('does not enumerate typed-array indices or custom fields ignored by structured clone',()=>{
 const view=new Uint8Array(65536);
 Object.defineProperty(view,'ignored',{enumerable:true,get(){throw Error('uncloned property');}});
 expect(()=>structuredClone(view)).not.toThrow();
 expect(findTransferables(view)).toEqual([view.buffer]);
});

it('retains Map/Set discovery order, handles cycles and deep graphs without recursion',()=>{
 const a=new ArrayBuffer(8),b=new ArrayBuffer(8),c=new ArrayBuffer(8),d=new ArrayBuffer(8);
 const map=new Map([[a,c],[b,d]]);expect(findTransferables(map)).toEqual([a,b,c,d]);
 const root={};let current=root;
 for(let i=0;i<20000;i++){current.next={};current=current.next;}
 current.values=new Set([root,a,new Uint8Array(a)]);
 expect(findTransferables(root)).toEqual([a]);
});

it('preserves Node Buffer ownership and excludes SharedArrayBuffer from transfers',()=>{
 const bytes=Buffer.from([1,2,3]);expect(findTransferables(bytes)).toEqual([]);
 const shared=new SharedArrayBuffer(32);expect(findTransferables(new Uint8Array(shared))).toEqual([]);
});

it('charges actual backing storage even when buffer/byteLength properties are shadowed',()=>{
 const buffer=new ArrayBuffer(4096),view=new Uint8Array(buffer,0,8);
 Object.defineProperty(view,'buffer',{value:new ArrayBuffer(8)});
 Object.defineProperty(buffer,'byteLength',{value:8});
 expect(()=>assertPayloadSize(view,64)).toThrow();
 expect(()=>assertPayloadSize(buffer,64)).toThrow();
});

it('honors autoTransfer for typed-array message storage without detaching unrelated buffers',async()=>{
 const sender=new MessageChannelTransport({autoTransfer:true}),receiver=MessageChannelTransport.fromPort(sender.remotePort);
 const actual=new ArrayBuffer(32),unrelated=new ArrayBuffer(16),view=new Uint8Array(actual,4,8);view.fill(7);
 Object.defineProperty(view,'buffer',{value:unrelated});
 const received=new Promise(resolve=>receiver.onMessage(resolve));
 try{
  sender.send({_cb:1,id:'typed',type:'sig',payload:{view}});
  expect(actual.byteLength).toBe(0);expect(unrelated.byteLength).toBe(16);
  const message=await received;
  expect(message.payload.view).toEqual(new Uint8Array(8).fill(7));
  expect(message.payload.view.buffer.byteLength).toBe(32);
 }finally{sender.destroy();receiver.destroy();}
});
