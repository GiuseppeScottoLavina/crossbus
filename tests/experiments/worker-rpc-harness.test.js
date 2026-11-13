import {it,expect} from 'bun:test';
import {runWorkloads} from '../../experiments/worker-rpc/workloads.js';

it('checks all RPC results and exact phase counts for both frozen variants and controls',async()=>{
 for(const artifact of ['../../benchmarks/worker-rpc/baseline/crossbus.min.js','../../dist/crossbus.min.js']){
  const report=await runWorkloads({artifact,samples:1,iterations:64,warmup:64,latencyGroups:4,concurrencies:[1,16,64],sizes:[16]});
  expect(report.results.length).toBe(18);
  for(const result of report.results){
   expect(result.opsPerSecond.samples.length).toBe(1);
   expect(result.opsPerSecond.median).toBeGreaterThan(0);
   expect(result.latencyMs.samples.length).toBe(4);
   expect(result.checkedCalls).toBe(128+4*result.concurrency);
  }
 }
},10000);

it('rejects unknown cases and invalid counts instead of reporting an empty benchmark',async()=>{
 await expect(runWorkloads({names:['unknown']})).rejects.toThrow();
 await expect(runWorkloads({iterations:3,concurrencies:[16]})).rejects.toThrow();
 await expect(runWorkloads({samples:0})).rejects.toThrow();
});
