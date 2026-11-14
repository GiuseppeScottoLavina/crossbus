// Seal the exact retained study files; reports independently verify their ledgers.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory=process.argv[2];
if(!['benchmarks/optimization-016','benchmarks/optimization-016/selected'].includes(directory))throw Error('Select a study directory');
const sha256={};
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){
 const file=path+'/'+entry.name;
 if(entry.name==='evidence.json'||directory==='benchmarks/optimization-016'&&entry.name==='selected')continue;
 if(entry.isDirectory())await walk(file);else sha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
}}
await walk(directory);
await writeFile(directory+'/evidence.json',JSON.stringify({scope:'Immutable retained study files, not an independent certification',sha256},null,2)+'\n',{flag:'wx'});
