import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../../',import.meta.url);
const arg = (name,fallback) => { const index=process.argv.indexOf(name); return index<0 ? fallback : process.argv[index+1]; };
const browserMode=process.argv.includes('--browser');
const artifact=arg('--artifact','dist/crossbus.min.js');
const suite='rpc-followup-workloads.js';
const output=arg('--output',`benchmarks/rpc-followup/${browserMode?'chrome':typeof Bun!=='undefined'?'bun':'node'}.json`);
const options={artifact:new URL(artifact,root).href,topology:process.argv.includes('--worker')?'worker':'local',filter:arg('--filter',undefined),samples:Number(arg('--samples','9')),iterations:Number(arg('--iterations','4096')),warmupCalls:Number(arg('--warmup','4096')),diagnosticBudget:process.argv.includes('--diagnostic-budget')};
if(!Number.isSafeInteger(options.iterations)||options.iterations<16||options.iterations%16||!Number.isSafeInteger(options.warmupCalls)||options.warmupCalls<16||options.warmupCalls%16||!Number.isSafeInteger(options.samples)||options.samples<1) throw Error('Use positive integer samples and positive multiples of 16 for iterations/warmup.');
const hashes={}, libraries={};
for(const name of ['comlink','birpc','penpal','nanoevents','mitt','eventemitter3']) libraries[name]=JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`,root),'utf8')).version;
for(const path of [artifact,artifact.replace(/[^/]+$/,'nano.min.js'),`tests/benchmarks/${suite}`,'tests/benchmarks/competitor-worker.js','tests/benchmarks/rpc-followup.js','tests/benchmarks/rpc-followup-isolated.js','node_modules/comlink/dist/esm/comlink.mjs','node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs','node_modules/nanoevents/index.js','node_modules/mitt/dist/mitt.mjs','node_modules/eventemitter3/dist/eventemitter3.esm.js']) hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const metadata={engineVersions:process.versions,bunRevision:typeof Bun!=='undefined'?Bun.revision:undefined,timestamp:new Date().toISOString(),platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,runtime:typeof Bun!=='undefined'?`Bun ${Bun.version}`:`Node ${process.version}`,libraries,hashes,
 gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim(),workingTreeDirty:execFileSync('git',['status','--porcelain'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim().length>0};
let result;
if(browserMode){
 const {createServer}=await import('node:http');
 const {launchBrowser,closeBrowser}=await import('../e2e/puppeteer-helper.js');
 const server=createServer(async(req,res)=>{
  try {
   const path=new URL(`.${new URL(req.url,'http://local').pathname}`,root);
   if(!path.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
   if(path.href===root.href){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>CrossBus performance study</title>');return;}
   res.setHeader('Content-Type','text/javascript');res.end(await readFile(path));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser,userDataDir;
 try{
  ({browser,userDataDir}=await launchBrowser('performance-study'));
  metadata.runtime=await browser.version();metadata.headless=true;
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  result=await page.evaluate(async({suite,options,artifact})=> (await import(`/tests/benchmarks/${suite}`)).runWorkloads({...options,artifact:`/${artifact}`}),{suite,options,artifact});
 }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
}else result=await(await import(`./${suite}`)).runWorkloads(options);
await mkdir(new URL('benchmarks/rpc-followup/',root),{recursive:true});
await writeFile(output,JSON.stringify({metadata,...result},null,2)+'\n');
console.table(result.results.map(row=>({case:row.library??row.workload,bytes:row.textBytes,concurrency:row.concurrency,'median ops/s':Math.round(row.opsPerSecond.median)})));
console.log(`Saved ${output}`);
