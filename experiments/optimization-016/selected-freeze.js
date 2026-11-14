import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
const directory='benchmarks/optimization-016/selected';
await mkdir(directory+'/candidate',{recursive:true});await mkdir(directory+'/inputs',{recursive:true});
for(const file of ['crossbus.js','crossbus.min.js','nano.min.js'])await copyFile('dist/'+file,directory+'/candidate/'+file);
const inputs={};
async function record(path){const data=await readFile(path),sha256=createHash('sha256').update(data).digest('hex'),snapshot='inputs/'+sha256+'-'+basename(path);await writeFile(directory+'/'+snapshot,data);inputs[path]={sha256,snapshot};}
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.js'))await record(file);}}
await walk('src');
for(const path of ['package.json','package-lock.json','rollup.config.js','experiments/optimization-016/stream-workloads.js','experiments/optimization-016/selected-stream-run.js','experiments/optimization-016/selected-isolated.js','experiments/optimization-016/selected-freeze.js','experiments/worker-rpc/workloads.js','experiments/worker-rpc/competitor-worker.js','experiments/worker-rpc/run.js','experiments/worker-rpc/isolated.js','tests/e2e/puppeteer-helper.js','node_modules/puppeteer-core/package.json','node_modules/birpc/dist/index.mjs','node_modules/penpal/dist/penpal.mjs','node_modules/comlink/dist/esm/comlink.mjs'])await record(path);
const artifacts={};for(const variant of ['baseline','candidate'])for(const file of ['crossbus.js','crossbus.min.js','nano.min.js']){const path=directory+'/'+variant+'/'+file;artifacts[path]=createHash('sha256').update(await readFile(path)).digest('hex');}
await writeFile(directory+'/manifest.json',JSON.stringify({baselineVersion:'0.1.5',candidateVersion:'0.1.6-unreleased',inputs,artifacts},null,2)+'\n',{flag:'wx'});
