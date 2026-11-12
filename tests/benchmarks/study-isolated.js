// Run one runtime at a time, with no simultaneous benchmarks or test workloads.
import { spawnSync } from 'node:child_process';
const option=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const runtime=option('--runtime','node'),worker=process.argv.includes('--worker');
if(!['node','bun','chrome'].includes(runtime))throw Error('runtime must be node, bun or chrome');
if(worker&&runtime!=='chrome')throw Error('The retained cross-thread study uses Chrome; study.js also supports Node workers.');
const root='benchmarks/optimization-study';
for(let round=1;round<=3;round++)for(const variant of round%2?['baseline','candidate']:['candidate','baseline']){
 const suites=worker?['competitor-workloads.js']:['competitor-workloads.js','artifact-workloads.js'];
 for(const suite of suites){
  const label=suite.startsWith('competitor')?(worker?'worker':'rpc'):'local';
  const output=`${root}/${label}-${variant}-${runtime}-${round}.json`;
  console.log(`Starting ${runtime} ${label} ${variant}, process pair ${round}/3`);
  const result=spawnSync(runtime==='bun'?'bun':'node',['tests/benchmarks/study.js','--suite',suite,'--artifact',`${root}/${variant}/crossbus.min.js`,'--output',output,...(runtime==='chrome'?['--browser']:[]),...(worker?['--worker']:[])],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
 }
}
