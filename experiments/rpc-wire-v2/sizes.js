import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root='benchmarks/rpc-wire-v2',results=[];
for(const file of ['crossbus.js','crossbus.min.js','nano.min.js']){
 const row={file};
 for(const [variant,folder] of [['baseline','baseline'],['candidate','selected/candidate']]){
  const data=await readFile(root+'/'+folder+'/'+file);row[variant]={rawBytes:data.length,gzipBytes:gzipSync(data,{level:9}).length,brotliBytes:brotliCompressSync(data).length,sha256:createHash('sha256').update(data).digest('hex')};
 }
 results.push(row);
}
if(process.argv.includes('--write'))await writeFile(root+'/sizes.json',JSON.stringify({gzipLevel:9,results},null,2)+'\n');
else assert.deepEqual(JSON.parse(await readFile(root+'/sizes.json','utf8')).results,results);
console.table(results.map(r=>({file:r.file,baselineGzip:r.baseline.gzipBytes,candidateGzip:r.candidate.gzipBytes})));
