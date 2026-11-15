import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory=process.argv.includes('--initial')?'benchmarks/rpc-wire-v2':'benchmarks/rpc-wire-v2/selected';
const sha256={};
async function scan(path){for(const entry of await readdir(path,{withFileTypes:true})){
 if(entry.name==='evidence.json'||directory==='benchmarks/rpc-wire-v2'&&entry.name==='selected')continue;
 const file=path+'/'+entry.name;if(entry.isDirectory())await scan(file);else sha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
}}
await scan(directory);await writeFile(directory+'/evidence.json',JSON.stringify({scope:'Preserved study files; not independent certification',sha256},null,2)+'\n',{flag:'wx'});
