import { it,expect } from 'bun:test';
import { WebSocketTransport } from '../../src/transports/websocket.js';
import { PresenceManager } from '../../src/core/presence.js';
import { CrossBus } from '../../src/core/cross-bus.js';
async function withSocket(run){
 const previous=globalThis.WebSocket,instances=[];
 class Socket{
  static OPEN=1;readyState=0;sent=[];
  constructor(url,protocols){this.url=url;this.protocols=protocols;instances.push(this);}
  send(data){this.sent.push(data);}
  close(){this.readyState=3;this.onclose?.({});}
  open(){this.readyState=1;this.onopen?.({});}
 }
 globalThis.WebSocket=Socket;
 try{await run(instances);}finally{globalThis.WebSocket=previous;}
}
it('rejects a failed or prematurely closed WebSocket connection',()=>withSocket(async sockets=>{
 for(const event of ['onerror','onclose']){
  const transport=new WebSocketTransport({url:'ws://local',autoReconnect:false,heartbeatIntervalMs:0});
  const outcome=transport.connect().catch(error=>error);sockets.at(-1)[event]({});
  expect(await outcome).toBeInstanceOf(Error);transport.destroy();
 }
}));
it('shares one connection attempt and applies the requested subprotocols',()=>withSocket(async sockets=>{
 const transport=new WebSocketTransport({url:'ws://local',protocols:['crossbus.test'],heartbeatIntervalMs:0});
 const a=transport.connect(),b=transport.connect();expect(sockets.length).toBe(1);expect(a).toBe(b);
 expect(sockets[0].protocols).toEqual(['crossbus.test']);sockets[0].open();await a;expect(transport.isConnected).toBe(true);transport.destroy();
}));
it('disconnect cancels connection ownership and ignores late open callbacks',()=>withSocket(async sockets=>{
 const transport=new WebSocketTransport({url:'ws://local',heartbeatIntervalMs:0});
 const outcome=transport.connect().catch(error=>error),lateOpen=sockets[0].onopen;
 transport.disconnect();lateOpen();expect(await outcome).toBeInstanceOf(Error);expect(transport.state).toBe('disconnected');
 transport.destroy();expect(await transport.connect().catch(error=>error)).toBeInstanceOf(Error);
 expect(()=>transport.send({})).toThrow('destroyed');
}));
it('bounds offline queues and serializes snapshots before later caller mutation',()=>withSocket(async sockets=>{
 const transport=new WebSocketTransport({url:'ws://local',maxQueueSize:1,heartbeatIntervalMs:0});
 const payload={n:1};transport.send({payload});payload.n=999;
 expect(()=>transport.send({payload:7})).toThrow('queue limit');
 const connected=transport.connect();sockets[0].open();await connected;
 expect(JSON.parse(sockets[0].sent[0]).payload).toEqual({n:1});transport.destroy();
}));
it('retains the destroyed event notification while retiring listeners',async()=>{
 const bus=CrossBus.createSecure({peerId:'bus',allowedOrigins:['channel']});let received=0;
 const subscription=bus.on('destroyed',()=>{received++;},{mode:'sync'});
 bus.destroy();await Promise.resolve();expect(received).toBe(1);expect(subscription.active).toBe(false);
});
it('presence announces leave, releases subscriptions and cannot restart after destruction',()=>{
 const messages=[];const presence=new PresenceManager(message=>messages.push(message),{peerId:'self',autoStart:false});
 const subscription=presence.on('join',()=>{});presence.start();presence.destroy();
 expect(messages.map(message=>message.pt)).toEqual(['join','leave']);expect(subscription.active).toBe(false);
 expect(()=>presence.start()).toThrow('destroyed');
 presence.handleMessage({t:'presence',pt:'join'},'other');expect(presence.onlineCount).toBe(0);
});
it('WebSocket absence rejects asynchronously rather than throwing during connect',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'WebSocket');
 delete globalThis.WebSocket;
 const transport=new WebSocketTransport({url:'ws://local',autoReconnect:false});
 try{
  const pending=transport.connect();expect(pending).toBeInstanceOf(Promise);
  expect(await pending.catch(error=>error)).toBeInstanceOf(Error);
 }finally{transport.destroy();if(descriptor)Object.defineProperty(globalThis,'WebSocket',descriptor);}
});
