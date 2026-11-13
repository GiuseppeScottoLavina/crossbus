import {it,expect} from 'bun:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {launchBrowser,closeBrowser} from './puppeteer-helper.js';
const root=new URL('../../',import.meta.url);

it('moves complete typed-view storage through real Worker RPC and retains receiver budgets',async()=>{
 const server=createServer(async(req,res)=>{
  try{
   const file=new URL('.'+new URL(req.url,'http://local').pathname,root);
   if(!file.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(file.href===root.href){res.end('<!doctype html><title>Binary RPC conformance</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('binary-rpc'));
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const results=await page.evaluate(async()=>{
   const {CrossBus,MessageChannelTransport}=await import('/dist/crossbus.min.js');const results=[];
   for(const restricted of [false,true]){
    const worker=new Worker('/tests/e2e/fixtures/binary-rpc-worker.js',{type:'module'});
    const ready=new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.ready?resolve():reject(Error('not ready'));worker.onerror=e=>reject(Error(e.message));});
    const bus=CrossBus.createSecure({peerId:'client',allowedOrigins:['channel']});
    const transport=new MessageChannelTransport({autoTransfer:true});
    worker.postMessage({port:transport.remotePort,maxPayloadSize:restricted?64:undefined},[transport.remotePort]);
    bus.addTransport(transport,{peerId:'worker',origin:'channel'});await ready;
    try{
     const storage=new ArrayBuffer(restricted?4096:65536),unrelated=new ArrayBuffer(16);
     const all=new Uint8Array(storage);for(let i=0;i<all.length;i++)all[i]=(i*17)%251;
     const bytes=new Uint8Array(storage,8,restricted?8:65520);
     Object.defineProperty(bytes,'buffer',{value:unrelated});
     Object.defineProperty(bytes,'ignored',{enumerable:true,get(){throw Error('uncloned property');}});
     const pending=bus.request('worker','echo',{phase:7,bytes},{timeout:1000});
     const ownership={input:storage.byteLength,unrelated:unrelated.byteLength};
     if(restricted){
      const error=await pending.catch(e=>e.code);
      const calls=await bus.request('worker','calls',{}, {timeout:1000});results.push({restricted,error,calls,ownership});
     }else{
      const value=await pending;const result=new Uint8Array(value.bytes.buffer);let invalid=0;
      for(let i=0;i<result.length;i++)if(result[i]!==((i*17)%251))invalid++;
      results.push({restricted,phase:value.phase,offset:value.bytes.byteOffset,length:value.bytes.byteLength,storage:result.length,invalid,ownership,calls:await bus.request('worker','calls'),workerStorage:await bus.request('worker','returnedOwnership')});
     }
    }finally{bus.destroy();worker.terminate();}
   }
   return results;
  });
  expect(results[0]).toEqual({restricted:false,phase:7,offset:8,length:65520,storage:65536,invalid:0,ownership:{input:0,unrelated:16},calls:1,workerStorage:0});
  expect(results[1]).toEqual({restricted:true,error:'ERR_PAYLOAD_TOO_LARGE',calls:0,ownership:{input:0,unrelated:16}});
  expect(errors).toEqual([]);
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
},15000);
