import {it,expect} from 'bun:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {launchBrowser,closeBrowser} from './puppeteer-helper.js';
const root=new URL('../../',import.meta.url);

it('decodes window JSON messages with exact origin/source binding and fail-closed hooks',async()=>{
 const server=createServer(async(req,res)=>{
  try{
   const file=new URL('.'+new URL(req.url,'http://local').pathname,root);
   if(!file.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(file.href===root.href){res.end('<!doctype html><title>Window codec conformance</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('window-codec'));
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const result=await page.evaluate(async()=>{
   const origin=location.origin,frame=document.createElement('iframe');
   const ready=new Promise(resolve=>{
    const handler=event=>{if(event.source===frame.contentWindow&&event.data?.ready){removeEventListener('message',handler);resolve();}};
    addEventListener('message',handler);
   });
   frame.srcdoc=`<script type="module">
    import {CrossBus,PostMessageTransport} from ${JSON.stringify(origin+'/dist/crossbus.min.js')};
    const origin=${JSON.stringify(origin)};
    const bus=CrossBus.createSecure({peerId:'child',allowedOrigins:[origin]});
    bus.addTransport(new PostMessageTransport(parent,{targetOrigin:origin,allowedOrigins:[origin]}),{peerId:'parent'});
    let echoCalls=0,protectedCalls=0;
    bus.handle('echo',v=>{echoCalls++;return v;});
    bus.handle('protected',()=>{protectedCalls++;},{allowedPeers:['someone-else']});
    bus.handle('stats',()=>({echoCalls,protectedCalls}));
    bus.addInboundHook(v=>{if(v?.blocked)throw Error('blocked');return v;});
    parent.postMessage({ready:true},origin);
   </script>`;
   document.body.append(frame);await ready;
   const {CrossBus,PostMessageTransport}=await import('/dist/crossbus.min.js');
   const bus=CrossBus.createSecure({peerId:'parent',allowedOrigins:[origin]});
   const transport=new PostMessageTransport(frame.contentWindow,{targetOrigin:origin,allowedOrigins:[origin],contentType:'application/json; charset=utf-8',autoTransfer:true});
   bus.addTransport(transport,{peerId:'child'});
   try{
    const explicitBuffer=new ArrayBuffer(8),automaticBuffer=new ArrayBuffer(8);let transferError;
    try{transport.send({_cb:1,id:'explicit-json',type:'sig',payload:{name:'ignored',data:{buffer:explicitBuffer}}},[explicitBuffer]);}catch(e){transferError=e.name;}
    transport.send({_cb:1,id:'auto-json',type:'sig',payload:{name:'ignored',data:{buffer:automaticBuffer}}});
    const ownership={transferError,explicit:explicitBuffer.byteLength,automatic:automaticBuffer.byteLength};
    const value=await bus.request('child','echo',{n:7,text:'window 🐟'},{timeout:1000});
    const denied=await bus.request('child','protected',{}, {timeout:1000}).catch(e=>e.code);
    const blocked=await bus.request('child','echo',{blocked:true},{timeout:1000}).catch(e=>e.message);
    frame.contentWindow.postMessage('{invalid JSON',origin);
    const attacker=document.createElement('iframe');
    const loaded=new Promise(resolve=>{attacker.onload=resolve;});
    const forged=JSON.stringify({_cb:1,id:'forged',type:'req',payload:{name:'echo',data:999,source:'parent'}});
    attacker.srcdoc=`<script>parent.frames[0].postMessage(${JSON.stringify(forged)},${JSON.stringify(origin)});</script>`;
    document.body.append(attacker);await loaded;
    const stats=await bus.request('child','stats',{}, {timeout:1000});
    attacker.remove();return{value,denied,blocked,stats,ownership};
   }finally{bus.destroy();frame.remove();}
  });
  expect(result.value).toEqual({n:7,text:'window 🐟'});
  expect(result.denied).toBe('ERR_UNAUTHORIZED');expect(result.blocked).toBe('blocked');
  expect(result.stats).toEqual({echoCalls:1,protectedCalls:0});expect(errors).toEqual([]);
  expect(result.ownership).toEqual({transferError:'TypeError',explicit:8,automatic:8});
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
},15000);
