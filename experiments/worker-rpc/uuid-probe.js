// Isolated UUID diagnostic only. End-to-end RPC measurements decide adoption.
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launchBrowser, closeBrowser} from '../../tests/e2e/puppeteer-helper.js';
const root=new URL('../../',import.meta.url);
async function probe(createUuidPool) {
    let draws=0;
    const pooled=createUuidPool(bytes=>{crypto.getRandomValues(bytes);draws++;});
    const methods=[['native',()=>crypto.randomUUID()],['pooled',pooled]],results=[];
    for(const [,fn] of methods)for(let i=0;i<10000;i++)fn();
    for(let sample=0;sample<9;sample++)for(let offset=0;offset<2;offset++){
        const [kind,fn]=methods[(sample+offset)%2];let checksum=0;
        const start=performance.now();
        for(let i=0;i<100000;i++){
            const id=fn();
            if(id.length!==36||id[14]!=='4'||!'89ab'.includes(id[19]))throw Error('Malformed UUID');
            checksum+=id.charCodeAt(i%36);
        }
        const elapsed=performance.now()-start;
        if(checksum<=0)throw Error('UUID calls not consumed');
        results.push({sample,kind,opsPerSecond:100000/elapsed*1000,checksum});
    }
    if(draws!==Math.ceil(910000/128))throw Error('Entropy call count mismatch');
    return{warmup:10000,iterations:100000,samples:9,draws,results};
}
let runtime=typeof Bun!=='undefined'?'Bun '+Bun.version:process.version,results;
const browserMode=process.argv.includes('--browser');
if(!browserMode){results={local:await probe((await import('../../src/common/uuid-pool.js')).createUuidPool)};}
else{
    const server=createServer(async(req,res)=>{
        try{
            const url=new URL('.'+new URL(req.url,'http://local').pathname,root);
            if(!url.href.startsWith(root.href)){res.writeHead(403);res.end();return;}
            if(url.href===root.href){res.end('<!doctype html><title>UUID diagnostic</title>');return;}
            res.setHeader('Content-Type','text/javascript');res.end(await readFile(url));
        }catch{res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser,userDataDir;
    try{
        ({browser,userDataDir}=await launchBrowser('uuid-diagnostic'));runtime=await browser.version();
        const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
        const source=probe.toString();
        const local=await page.evaluate(async source=>{
            const {createUuidPool}=await import('/src/common/uuid-pool.js');return await (0,eval)('('+source+')')(createUuidPool);
        },source);
        const created=new Promise(resolve=>page.once('workercreated',resolve));
        await page.evaluate(()=>{window.probeWorker=new Worker('/experiments/worker-rpc/profile-worker.js',{type:'module'});});
        const worker=await(await created).evaluate(async source=>{
            const {createUuidPool}=await import('/src/common/uuid-pool.js');return await(0,eval)('('+source+')')(createUuidPool);
        },source);
        results={local,worker};
    }finally{await closeBrowser(browser,userDataDir);await new Promise(resolve=>server.close(resolve));}
}
const hashes={};
for(const file of ['src/common/uuid-pool.js','experiments/worker-rpc/uuid-probe.js'])hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('benchmarks/worker-rpc/uuid-'+(browserMode?'chrome':typeof Bun!=='undefined'?'bun':'node')+'.json',root),JSON.stringify({runtime,hashes,caution:'UUID-only diagnostic, includes format/checksum checks; not RPC throughput.',...results},null,2)+'\n');
for(const [context,result] of Object.entries(results))for(const kind of ['native','pooled']){
    const values=result.results.filter(r=>r.kind===kind).map(r=>r.opsPerSecond).sort((a,b)=>a-b);
    console.log(runtime,context,kind,Math.round(values[4]),'UUID/s');
}
