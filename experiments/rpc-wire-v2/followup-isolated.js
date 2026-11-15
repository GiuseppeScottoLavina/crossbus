// Same-process old/new Worker check used to investigate large-payload variability.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
for(let round=1;round<=3;round++){
 const output=`benchmarks/rpc-wire-v2/worker-followup/round-${round}.json`;if(existsSync(output))throw Error('Use a fresh campaign directory; refusing overwrite '+output);
 const r=spawnSync('node',['experiments/rpc-wire-v2/followup-run.js','--artifact','benchmarks/rpc-wire-v2/selected/candidate/crossbus.min.js','--browser','--worker','--samples','9','--iterations','4096','--warmup','8192','--latency-groups','64','--sizes','65536','--concurrency','1','--names','CrossBus baseline standard + hooks,CrossBus current standard + hooks,CrossBus baseline compact + hooks,CrossBus current compact + hooks,birpc cached,Penpal cached + timeout','--order',String(round-1),'--output',output],{stdio:'inherit'});
 if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);
}
