import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';
const root = new URL('../../',import.meta.url);
let server,docsServer,browser,userDataDir,page;
const pageErrors=[];
describe('actual browser playground',()=>{
 beforeAll(async()=>{
  server=createServer(async(req,res)=>{
   try{
    const path=new URL(`.${new URL(req.url,'http://local').pathname}`,root);
    if(!path.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
    const type=path.pathname.endsWith('.js')?'text/javascript':path.pathname.endsWith('.png')?'image/png':'text/html';
    res.setHeader('Content-Type',type);res.end(await readFile(path));
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  docsServer=createServer(async(req,res)=>{
   try{
    const source=new URL(`docs${new URL(req.url,'http://local').pathname}`,root);
    if(!source.href.startsWith(new URL('docs/',root).href)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',source.pathname.endsWith('.js')?'text/javascript':'text/html');
    res.end(await readFile(source));
   }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>docsServer.listen(0,'127.0.0.1',resolve));
  ({browser,userDataDir}=await launchBrowser('playground'));
  page=await browser.newPage();
  page.on('pageerror', error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error') console.error('Playground console:',message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/docs/playground.html`);
  await page.waitForFunction(()=>document.querySelector('#client-console').textContent.includes('RPC round trip verified'));
 },15000);
 afterEach(()=>{expect(pageErrors.splice(0)).toEqual([]);});
 afterAll(async()=>{await closeBrowser(browser,userDataDir);await Promise.all([server,docsServer].map(item=>new Promise(resolve=>item.close(resolve))));});
 it('delivers signals and RPC results through CrossBus and renders data as text',async()=>{
  await page.$eval('#listen-pattern',el=>{el.value='chat:*';});
  await page.click('button[onclick="updateListener()"]');
  await page.$eval('#signal-name',el=>{el.value='chat:message';});
  await page.$eval('#signal-data',el=>{el.value=JSON.stringify({text:'<img src=x onerror="window.injected=true">'});});
  await page.click('button[onclick="sendSignal()"]');
  await page.waitForFunction(()=>document.querySelector('#agent-console').textContent.includes('<img'));
  expect(await page.$eval('#agent-console',el=>el.querySelector('img'))).toBeNull();
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  await page.click('[data-demo="request"]');
  await page.select('#rpc-handler','calculate');
  await page.$eval('#rpc-data',el=>{el.value='{"a":2,"b":3}';});
  await page.click('button[onclick="sendRequest()"]');
  await page.waitForFunction(()=>document.querySelector('#client-console').textContent.includes('"sum":5,"product":6'));
  expect(await page.$eval('#server-console',el=>el.textContent)).toContain('Handling calculate');
 });
 it('computes in an actual Worker and reconnects after restart',async()=>{
  await page.click('[data-demo="worker"]');
  await page.waitForFunction(()=>document.querySelector('#worker-status').classList.contains('connected'));
  await page.$eval('#compute-value',el=>{el.value='10000';});
  await page.click('button[onclick="computeInWorker()"]');
  await page.waitForFunction(()=>document.querySelector('#main-console').textContent.includes('"sum":50005000,"workerContext":true'));
  await page.click('button[onclick="initWorker()"]');
  await page.waitForFunction(()=>document.querySelector('#main-console').textContent.split('Worker connected').length===3);
  await page.$eval('#compute-value',el=>{el.value='10';});
  await page.click('button[onclick="computeInWorker()"]');
  await page.waitForFunction(()=>document.querySelector('#main-console').textContent.includes('"sum":55,"workerContext":true'));
 });
 it('forwards between two iframe CrossBus endpoints through the hub',async()=>{
  await page.click('[data-demo="iframe"]');
  const a=await(await page.$('#iframe-a')).contentFrame(), b=await(await page.$('#iframe-b')).contentFrame();
  await Promise.all([a.waitForFunction(()=>document.querySelector('button')?.disabled===false),b.waitForFunction(()=>document.querySelector('button')?.disabled===false)]);
  await a.$eval('input',el=>{el.value='verified iframe delivery';});
  await a.click('button');
  await b.waitForFunction(()=>document.querySelector('#log').textContent==='Received: verified iframe delivery');
  await a.waitForFunction(()=>document.querySelector('#log').textContent==='Delivered');
  expect(await page.$eval('#iframe-hub-console',el=>el.textContent)).toContain('widget-a → widget-b');
 });
it('runs with only the docs directory published and an identical distribution bundle',async()=>{
 expect((await readFile(new URL('docs/assets/crossbus.min.js',root))).equals(await readFile(new URL('dist/crossbus.min.js',root)))).toBe(true);
 const isolated=await browser.newPage();
 try{
  await isolated.goto(`http://127.0.0.1:${docsServer.address().port}/playground.html`);
  await isolated.waitForFunction(()=>document.querySelector('#client-console').textContent.includes('RPC round trip verified'));
  await isolated.waitForFunction(()=>document.querySelector('#worker-status').classList.contains('connected'));
  expect(await isolated.$eval('#main-console',el=>el.textContent)).toContain('Worker connected');
 }finally{await isolated.close();}
});
it('restricts documentation paths and renders with the vendored parser',async()=>{
 const requested=[]; const track=request=>requested.push(request.url());page.on('request',track);
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/docs/doc.html?file=${encodeURIComponent('https://attacker.invalid/<img src=x onerror=alert(1)>')}`);
  await page.waitForFunction(()=>document.querySelector('#content h1')?.textContent==='Getting started');
  expect(requested.some(url=>url.includes('attacker.invalid')&&!url.includes('/docs/doc.html?'))).toBe(false);
  expect(await page.$eval('#content',el=>el.querySelector('a').href)).toContain('github.com/GiuseppeScottoLavina/crossbus/blob/master/README.md');
 }finally{page.off('request',track);}
});

});
