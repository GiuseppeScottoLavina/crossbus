// Confirm stock/group gains in isolated fresh processes with unchanged controls.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const arg=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const runtime=arg('--runtime','node'),worker=process.argv.includes('--worker');
if(!['node','bun','chrome'].includes(runtime)||worker&&runtime!=='chrome')throw Error('Invalid runtime');
const script='experiments/rpc-batching/paired.js',digest=createHash('sha256').update(await readFile(new URL('./paired.js',import.meta.url))).digest('hex');
for(let round=1;round<=3;round++)for(const variant of round%2?['stock','group']:['group','stock']){
 const output='benchmarks/rpc-batching/isolated-'+runtime+(worker?'-worker':'')+'-'+variant+'-'+round+'.json';
 const args=['experiments/rpc-batching/run.js','--samples','9','--iterations','4096','--warmup','4096','--sizes','1024','--concurrency','16,64','--kinds',variant+',birpc,penpal','--order',String(round-1),'--output',output,...(runtime==='chrome'?['--browser']:[]),...(worker?['--worker']:[])];
 console.log('Starting',output);
 const result=spawnSync(runtime==='bun'?'bun':'node',args,{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
 const report=JSON.parse(await readFile(output,'utf8'));report.metadata.hashes[script]=digest;
 await writeFile(output,JSON.stringify(report)+'\n');
}
