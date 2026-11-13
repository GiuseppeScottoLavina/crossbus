import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,platform,arch} from 'node:os';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url);
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const browserMode=process.argv.includes('--browser');
const output=arg('--output','benchmarks/rpc-batching/current.json');
const options={order:Number(arg('--order','0')),samples:Number(arg('--samples','9')),iterations:Number(arg('--iterations','2048')),warmup:Number(arg('--warmup','2048')),latencyGroups:Number(arg('--latency-groups','128')),packetCalls:Number(arg('--packet-calls','1024')),worker:process.argv.includes('--worker'),hooks:process.argv.includes('--hooks'),kinds:arg('--kinds','stock,batch16,batch64,group,birpc,penpal').split(','),sizes:arg('--sizes','1024').split(',').map(Number),concurrencies:arg('--concurrency','1,16,64').split(',').map(Number)};
for(const n of [options.samples,options.iterations,options.warmup,options.packetCalls,options.latencyGroups])if(!Number.isSafeInteger(n)||n<1)throw Error('Positive integer counts required');
for(const c of options.concurrencies)if(!Number.isSafeInteger(c)||c<1||c>64)throw Error('Concurrency must be 1..64');
for(const c of options.concurrencies)for(const n of [options.iterations,options.warmup,options.packetCalls])if(n%c)throw Error('Counts must be multiples of concurrency');
for(const kind of options.kinds)if(!['stock','batch16','batch64','group','birpc','penpal'].includes(kind))throw Error('Unknown kind');
for(const size of options.sizes)if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid size');
const hashes={};
for(const path of ['dist/crossbus.min.js','src/common/types.js','experiments/rpc-batching/transport.js','experiments/rpc-batching/group-transport.js','experiments/rpc-batching/endpoints.js','experiments/rpc-batching/worker.js','experiments/rpc-batching/workloads.js','experiments/rpc-batching/run.js','experiments/rpc-batching/isolated.js','tests/e2e/puppeteer-helper.js','node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs'])hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const metadata={timestamp:new Date().toISOString(),runtime:typeof Bun!=='undefined'?'Bun '+Bun.version:'Node '+process.version,bunRevision:typeof Bun!=='undefined'?Bun.revision:undefined,platform:platform(),arch:arch(),cpu:cpus()[0].model,hashes,libraries:{},gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0};
for(const name of ['birpc','penpal'])metadata.libraries[name]=JSON.parse(await readFile(new URL('node_modules/'+name+'/package.json',root))).version;
let report;
if(browserMode){
 const {createServer}=await import('node:http');
 const {launchBrowser,closeBrowser}=await import('../../tests/e2e/puppeteer-helper.js');
 const server=createServer(async(req,res)=>{
  try{
   const file=new URL('.'+new URL(req.url,'http://local').pathname,root);
   if(!file.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(file.href===root.href){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>RPC batching study</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('rpc-batching'));metadata.runtime=await browser.version();metadata.headless=true;
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  report=await page.evaluate(async options=>(await import('/experiments/rpc-batching/workloads.js')).run(options),options);
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
}else report=await(await import('./workloads.js')).run(options);
await mkdir(new URL('benchmarks/rpc-batching/',root),{recursive:true});await writeFile(output,JSON.stringify({metadata,...report})+'\n');
console.table(report.results.map(r=>({kind:r.kind,concurrency:r.concurrency,bytes:r.textBytes,ops:Math.round(r.opsPerSecond.median),p99ms:r.latencyMs.p99,clientPackets:r.clientPackets,serverPackets:r.serverPackets})));
