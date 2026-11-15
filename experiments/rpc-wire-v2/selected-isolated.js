import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
const runtime=process.argv[2],profile=process.argv[3];
if(!['node','bun','chrome','chrome-worker'].includes(runtime)||!['wire','guard'].includes(profile))throw Error('Select runtime and wire/guard profile');
const root='benchmarks/rpc-wire-v2/selected/data';mkdirSync(root,{recursive:true});
for(let round=1;round<=3;round++)for(const variant of profile==='wire'?['candidate']:round%2?['baseline','candidate']:['candidate','baseline']){
 const output=`${root}/${profile}-${runtime}-${variant}-${round}.json`;if(existsSync(output))throw Error('Refusing overwrite '+output);
 const artifact=variant==='baseline'?'benchmarks/rpc-wire-v2/baseline/crossbus.min.js':'benchmarks/rpc-wire-v2/selected/candidate/crossbus.min.js';
 const args=['experiments/rpc-wire-v2/run.js','--artifact',artifact,'--samples','7','--iterations','4096','--warmup','8192','--latency-groups','64','--sizes','0,1024,65536','--concurrency','1,64','--order',String(round-1),'--output',output];
 if(profile==='guard')args.push('--names','CrossBus,CrossBus + async hooks,CrossBus compact wire,CrossBus compact + hooks,birpc cached,Penpal cached + timeout');
 if(runtime.startsWith('chrome'))args.push('--browser');if(runtime==='chrome-worker')args.push('--worker');
 const result=spawnSync(runtime==='bun'?'bun':'node',args,{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
