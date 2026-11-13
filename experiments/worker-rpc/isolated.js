// Three fresh process pairs, alternating variant order; run runtimes sequentially.
import {spawnSync} from 'node:child_process';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const runtime=arg('--runtime','node'),profile=arg('--profile','primary'),worker=process.argv.includes('--worker');
if(!['node','bun','chrome'].includes(runtime)||worker&&runtime!=='chrome'||!['primary','guard'].includes(profile))throw Error('Invalid matrix selection');
const plan=profile==='primary'?['--samples','9','--iterations','4096','--warmup','4096','--sizes','1024','--concurrency','1,16,64']:
 ['--samples','5','--iterations','2048','--warmup','2048','--sizes','0,65536','--concurrency','1,64','--names','CrossBus,CrossBus + async hooks,birpc cached,Penpal cached + timeout'];
for(let round=1;round<=3;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
 const output='benchmarks/worker-rpc/'+profile+'-'+runtime+(worker?'-worker':'')+'-'+variant+'-'+round+'.json';
 const artifact='benchmarks/worker-rpc/'+variant+'/crossbus.min.js';
 console.log('Starting',output);
 const result=spawnSync(runtime==='bun'?'bun':'node',['experiments/worker-rpc/run.js','--artifact',artifact,...plan,'--order',String(round-1),'--output',output,...(runtime==='chrome'?['--browser']:[]),...(worker?['--worker']:[])],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
