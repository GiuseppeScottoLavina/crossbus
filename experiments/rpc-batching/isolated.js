// Run runtimes sequentially. Each process rotates all configured cases.
import { spawnSync } from 'node:child_process';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const runtime=arg('--runtime','node'),profile=arg('--profile','primary'),worker=process.argv.includes('--worker');
if(!['node','bun','chrome'].includes(runtime)||worker&&runtime!=='chrome'||!['primary','guard','hooks'].includes(profile))throw Error('Invalid study configuration');
const plan=profile==='primary'?['--samples','9','--iterations','4096','--warmup','4096','--sizes','1024']:
 profile==='guard'?['--samples','5','--iterations','2048','--warmup','2048','--sizes','0,65536','--concurrency','1,64','--kinds','stock,batch16,group,birpc,penpal']:
 ['--samples','9','--iterations','2048','--warmup','2048','--sizes','1024','--concurrency','16,64','--kinds','stock,group','--hooks'];
for(let round=1;round<=3;round++){
 const output='benchmarks/rpc-batching/'+profile+'-'+runtime+(worker?'-worker':'')+'-'+round+'.json';
 console.log('Starting',output);
 const result=spawnSync(runtime==='bun'?'bun':'node',['experiments/rpc-batching/run.js',...plan,'--output',output,'--order',String((round-1)*2),...(runtime==='chrome'?['--browser']:[]),...(worker?['--worker']:[])],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
