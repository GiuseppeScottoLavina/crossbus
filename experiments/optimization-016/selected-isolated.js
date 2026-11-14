// Sequential fresh-process pairs. Never overwrite retained study results.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
const kind=process.argv[2],runtime=process.argv[3],profile=process.argv[4]??'primary';
if(!['stream','rpc'].includes(kind)||!['node','bun','chrome','chrome-worker'].includes(runtime)||kind==='stream'&&runtime==='chrome-worker'||!['primary','guard'].includes(profile))throw Error('Invalid matrix selection');
const directory='benchmarks/optimization-016/selected/data';mkdirSync(directory,{recursive:true});
for(let round=1;round<=3;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
 const output=`${directory}/${kind}-${profile}-${runtime}-${variant}-${round}.json`;
 if(existsSync(output))throw Error('Refusing overwrite '+output);
 const browser=runtime.startsWith('chrome'),worker=runtime==='chrome-worker';
 const plan=profile==='primary'?['--samples','9','--iterations','4096','--warmup','4096','--sizes','1024','--concurrency','1,16,64']:
 ['--samples','5','--iterations','2048','--warmup','2048','--sizes','0,65536','--concurrency','1,64','--names','CrossBus,CrossBus + async hooks,CrossBus compact wire,CrossBus compact + hooks,birpc cached,Penpal cached + timeout'];
 const args=kind==='stream'?['experiments/optimization-016/selected-stream-run.js',variant,String(round),output]:
 ['experiments/worker-rpc/run.js','--artifact',`benchmarks/optimization-016/selected/${variant}/crossbus.min.js`,'--output',output,'--order',String(round-1),...plan];
 if(browser)args.push('--browser');if(worker)args.push('--worker');
 console.log('Starting',output);
 const child=spawnSync(runtime==='bun'?'bun':'node',args,{stdio:'inherit'});
 if(child.error)throw child.error;if(child.status!==0)process.exit(child.status??1);
}
