// Independent runner: historical benchmark inputs/data are never overwritten.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url);
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const browserMode=process.argv.includes('--browser');
const artifact=arg('--artifact','dist/crossbus.min.js'),output=arg('--output','benchmarks/worker-rpc/current.json');
const options={artifact:new URL(artifact,root).href,topology:process.argv.includes('--worker')?'worker':'local',samples:Number(arg('--samples','9')),iterations:Number(arg('--iterations','4096')),warmup:Number(arg('--warmup','4096')),latencyGroups:Number(arg('--latency-groups','128')),concurrencies:arg('--concurrency','1,16,64').split(',').map(Number),sizes:arg('--sizes','1024').split(',').map(Number),order:Number(arg('--order','0'))};
if(process.argv.includes('--names'))options.names=arg('--names','').split(',');
const hashes={};
for(const file of [artifact,artifact.replace(/[^/]+$/,'nano.min.js'),'experiments/worker-rpc/workloads.js','experiments/worker-rpc/competitor-worker.js','experiments/worker-rpc/run.js','experiments/worker-rpc/isolated.js','package-lock.json','tests/e2e/puppeteer-helper.js','node_modules/puppeteer-core/package.json','node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs','node_modules/comlink/dist/esm/comlink.mjs'])hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
const metadata={timestamp:new Date().toISOString(),runtime:typeof Bun!=='undefined'?'Bun '+Bun.version:'Node '+process.version,bunRevision:typeof Bun!=='undefined'?Bun.revision:undefined,platform:platform(),arch:arch(),cpu:cpus()[0].model,hashes,libraries:{},artifact,artifactVersion:(await readFile(new URL(artifact,root),'utf8')).match(/CrossBus v([\d.]+)/)?.[1],gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0};
for(const name of ['comlink','birpc','penpal','puppeteer-core'])metadata.libraries[name]=JSON.parse(await readFile(new URL('node_modules/'+name+'/package.json',root))).version;
let report;
if(browserMode){
 const {createServer}=await import('node:http');
 const {launchBrowser,closeBrowser}=await import('../../tests/e2e/puppeteer-helper.js');
 const server=createServer(async(req,res)=>{
  try{
   const file=new URL('.'+new URL(req.url,'http://local').pathname,root);
   if(!file.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(file.href===root.href){res.end('<!doctype html><title>Worker RPC comparison</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('worker-rpc-comparison'));metadata.runtime=await browser.version();metadata.headless=true;
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  report=await page.evaluate(async({options,artifact})=>(await import('/experiments/worker-rpc/workloads.js')).runWorkloads({...options,artifact:'/'+artifact}),{options,artifact});
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
}else report=await(await import('./workloads.js')).runWorkloads(options);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify({metadata,...report})+'\n');
console.table(report.results.map(r=>({case:r.library,bytes:r.textBytes,concurrency:r.concurrency,ops:Math.round(r.opsPerSecond.median),p99ms:r.latencyMs.p99})));
