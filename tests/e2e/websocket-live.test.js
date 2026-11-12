import { it,expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { CrossBus } from '../../src/core/cross-bus.js';
import { launchBrowser,closeBrowser } from './puppeteer-helper.js';
it('queues a real WebSocket RPC, negotiates subprotocols and rejects denied handshakes',async()=>{
 let protocolReceived=false;
 const server=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(request,instance){
  const path=new URL(request.url).pathname;
  if(path==='/rpc'){
   protocolReceived=request.headers.get('sec-websocket-protocol')==='crossbus.test';
   if(instance.upgrade(request,{data:{bus:null},headers:{'Sec-WebSocket-Protocol':'crossbus.test'}}))return;
   return new Response('Upgrade required',{status:426});
  }
  if(path==='/reject')return new Response('Denied',{status:403});
  if(path==='/dist/crossbus.js')return new Response(await readFile(new URL('../../dist/crossbus.js',import.meta.url)),{headers:{'Content-Type':'text/javascript'}});
  return new Response('<!doctype html><title>WebSocket integration</title>',{headers:{'Content-Type':'text/html'}});
 },websocket:{
  open(socket){
   const bus=new CrossBus({peerId:'backend',allowedOrigins:['socket']});socket.data.bus=bus;
   bus.addPeer('browser',message=>socket.send(JSON.stringify(message)));bus.handle('echo',value=>value);
  },
  message(socket,data){void socket.data.bus.handleMessage(JSON.parse(String(data)),'socket','browser');},
  close(socket){socket.data.bus?.destroy();}
 }});
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('websocket-live'));
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
   const {CrossBus,WebSocketTransport}=await import('/dist/crossbus.js');
   const endpoint=location.origin.replace('http:','ws:');
   const transport=new WebSocketTransport({url:endpoint+'/rpc',protocols:['crossbus.test'],autoReconnect:false,heartbeatIntervalMs:0,maxQueueSize:2});
   const bus=CrossBus.createSecure({peerId:'browser',allowedOrigins:['backend-socket']});
   bus.addTransport(transport,{peerId:'backend',origin:'backend-socket'});
   try{
    const pending=bus.request('backend','echo',{text:'queued RPC',n:7});
    await transport.connect();
    const response=await pending;
    const denied=new WebSocketTransport({url:endpoint+'/reject',autoReconnect:false,heartbeatIntervalMs:0});
    let rejected;
    try{await denied.connect();}catch(error){rejected=error.message;}finally{denied.destroy();}
    return{response,rejected};
   }finally{bus.destroy();}
  });
  expect(result.response).toEqual({text:'queued RPC',n:7});expect(protocolReceived).toBe(true);
  expect(result.rejected).toMatch(/failed|closed/);
 }finally{await closeBrowser(browser,userDataDir);await server.stop(true);}
},15000);
