import { it,expect } from 'bun:test';
import { MessageChannelTransport } from '../../src/transports/message-channel.js';
import { createSignalMessage } from '../../src/core/message-types.js';

it('preserves envelope graph aliases in standard MessageChannel delivery',async()=>{
 const channel=new MessageChannelTransport();
 const remote=MessageChannelTransport.fromPort(channel.remotePort);
 const received=new Promise(resolve=>remote.onMessage(resolve));
 const data={};const message=createSignalMessage('alias',data,'sender');data.envelope=message;
 try{
  channel.send(message);const copy=await received;
  expect(copy.payload.data.envelope).toBe(copy);
 }finally{channel.destroy();remote.destroy();}
});

it('honors explicit transfer lists on the standard MessageChannel path',async()=>{
 const channel=new MessageChannelTransport();
 const remote=MessageChannelTransport.fromPort(channel.remotePort);
 const received=new Promise(resolve=>remote.onMessage(resolve));
 const buffer=new ArrayBuffer(8);new Uint8Array(buffer)[0]=42;
 try{
  channel.send(createSignalMessage('bytes',buffer,'sender'),[buffer]);
  expect(buffer.byteLength).toBe(0);
  expect(new Uint8Array((await received).payload.data)[0]).toBe(42);
 }finally{channel.destroy();remote.destroy();}
});
