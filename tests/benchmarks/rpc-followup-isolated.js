// Alternate three fresh process pairs; never run different runtimes concurrently.
import { spawnSync } from 'node:child_process';
const index=process.argv.indexOf('--runtime');
const runtime=index<0?'node':process.argv[index+1];
const worker=process.argv.includes('--worker');
if(!['node','bun','chrome'].includes(runtime)||worker&&runtime!=='chrome')throw Error('Use node, bun or chrome; retained Workers use Chrome.');
for(let round=1;round<=3;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
 const kind=worker?'worker':'rpc';
 console.log(`Starting ${kind} ${runtime} ${variant}, pair ${round}/3`);
 const args=['tests/benchmarks/rpc-followup.js','--artifact',`benchmarks/rpc-followup/${variant}/crossbus.min.js`,'--output',`benchmarks/rpc-followup/${kind}-${variant}-${runtime}-${round}.json`,
  ...(runtime==='chrome'?['--browser']:[]),...(worker?['--worker']:['--diagnostic-budget'])];
 const result=spawnSync(runtime==='bun'?'bun':'node',args,{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
