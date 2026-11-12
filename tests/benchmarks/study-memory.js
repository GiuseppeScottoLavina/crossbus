// Reuse the lifecycle workload in an isolated fixture so historical evidence is not overwritten.
import { mkdtemp,mkdir,copyFile,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=new URL('../../',import.meta.url);
for(const variant of ['baseline','candidate']){
 const fixture=await mkdtemp(join(tmpdir(),'crossbus-memory-study-'));
 try{
  for(const path of ['dist','tests/benchmarks','benchmarks'])await mkdir(join(fixture,path),{recursive:true});
  await writeFile(join(fixture,'package.json'),'{"type":"module"}\n');
  await copyFile(new URL(`benchmarks/optimization-study/${variant}/crossbus.min.js`,root),join(fixture,'dist/crossbus.min.js'));
  await copyFile(new URL('tests/benchmarks/memory.js',root),join(fixture,'tests/benchmarks/memory.js'));
  const result=spawnSync('node',['--expose-gc',join(fixture,'tests/benchmarks/memory.js')],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)throw Error('Memory lifecycle correctness check failed');
  const report=JSON.parse(await readFile(join(fixture,'benchmarks/memory-node.json'),'utf8'));
  await writeFile(new URL(`benchmarks/optimization-study/memory-${variant}-node.json`,root),JSON.stringify(report,null,2)+'\n');
 }finally{await rm(fixture,{recursive:true,force:true});}
}
