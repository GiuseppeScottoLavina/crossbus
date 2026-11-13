import {it, expect} from 'bun:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {launchBrowser, closeBrowser} from './puppeteer-helper.js';
const root=new URL('../../',import.meta.url);

it('uses fresh Web Crypto entropy for browser and Worker UUIDs with fewer provider calls',async()=>{
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL('.'+new URL(req.url,'http://local').pathname,root);
   if(!path.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(path.href===root.href){res.end('<!doctype html><title>UUID conformance</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('uuid-conformance'));
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const verify=async()=>{
   const native=crypto.getRandomValues.bind(crypto),oldUuid=crypto.randomUUID.bind(crypto);let draws=0,nativeIds=0;
   crypto.getRandomValues=bytes=>{draws++;return native(bytes);};
   crypto.randomUUID=()=>{nativeIds++;return oldUuid();};
   const {uuid}=await import('/dist/crossbus.min.js');const ids=Array.from({length:4097},()=>uuid());
   return{draws,nativeIds,unique:new Set(ids).size,valid:ids.every(v=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))};
  };
  const source=verify.toString();
  const local=await page.evaluate(source=>(0,eval)('('+source+')')(),source);
  const workerReady=new Promise(resolve=>page.once('workercreated',resolve));
  await page.evaluate(()=>{window.uuidWorker=new Worker('/tests/e2e/fixtures/uuid-worker.js',{type:'module'});});
  const worker=await(await workerReady).evaluate(source=>(0,eval)('('+source+')')(),source);
  for(const result of [local,worker]){
   expect(result.unique).toBe(4097);expect(result.valid).toBe(true);expect(result.nativeIds).toBe(0);
   expect(result.draws).toBe(33);
  }
  const errorCase=await page.evaluate(async()=>{
   const native=crypto.getRandomValues.bind(crypto);let weakCalls=0;
   const oldRandom=Math.random;Math.random=()=>{weakCalls++;return oldRandom();};
   crypto.getRandomValues=()=>{throw Error('entropy failed');};
   const {uuid}=await import('/dist/crossbus.min.js?entropy-failure');let error;
   try{uuid();}catch(e){error=e.message;}
   crypto.getRandomValues=native;
   const recovered=uuid();return{error,weakCalls,recovered};
  });
  expect(errorCase.error).toBe('entropy failed');expect(errorCase.weakCalls).toBe(0);
  expect(errorCase.recovered).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
},15000);
