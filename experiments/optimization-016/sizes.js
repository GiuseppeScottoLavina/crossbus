import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const directory='benchmarks/optimization-016';
const baseline=JSON.parse(await readFile(directory+'/baseline/sizes.json','utf8'));
const results=[];
for(const row of baseline.sizes){
 const file=row.file.slice('dist/'.length),sizes={file};
 for(const variant of ['baseline','candidate']){
  const data=await readFile(`${directory}/${variant}/${file}`);
  sizes[variant]={rawBytes:data.length,gzipBytes:gzipSync(data,{level:9}).length,brotliBytes:brotliCompressSync(data).length,sha256:createHash('sha256').update(data).digest('hex')};
 }
 for(const key of ['rawBytes','gzipBytes','brotliBytes','sha256'])assert.equal(sizes.baseline[key],row[key]);
 results.push(sizes);
}
if(process.argv.includes('--write'))await writeFile(directory+'/sizes.json',JSON.stringify({runtime:process.version,gzipLevel:9,results},null,2)+'\n');
else assert.deepEqual(JSON.parse(await readFile(directory+'/sizes.json','utf8')).results,results);
console.table(results.map(row=>({file:row.file,baselineGzip:row.baseline.gzipBytes,candidateGzip:row.candidate.gzipBytes,deltaGzip:row.candidate.gzipBytes-row.baseline.gzipBytes})));
