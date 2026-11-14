// Investigate the high-concurrency regressions seen in the first complete matrix.
import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
const directory='benchmarks/optimization-016/followup';mkdirSync(directory,{recursive:true});
const variants={baseline:'benchmarks/optimization-016/baseline/crossbus.min.js',stream:'benchmarks/optimization-016/rejected/default-options/baseline/crossbus.min.js',candidate:'benchmarks/optimization-016/candidate/crossbus.min.js'};
for(const runtime of ['node','chrome-worker'])for(let round=1;round<=3;round++){
 const order=round===1?['baseline','stream','candidate']:round===2?['candidate','stream','baseline']:['stream','baseline','candidate'];
 for(const variant of order){
  const output=`${directory}/${runtime}-${variant}-${round}.json`;if(existsSync(output))throw Error('Refusing overwrite '+output);
  console.log('Starting',output);
  const result=spawnSync('node',['experiments/worker-rpc/run.js','--artifact',variants[variant],'--output',output,'--samples','9','--iterations','16384','--warmup','8192','--concurrency','64','--sizes','1024','--order',String(round-1),...(runtime==='chrome-worker'?['--browser','--worker']:[])],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
 }
}
