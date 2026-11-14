import { it,expect } from 'bun:test';
import { readFile,mkdtemp,rm,mkdir,writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve,dirname,relative } from 'node:path';
import { tmpdir } from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url));
it('ships documentation link targets and excludes native build caches',async()=>{
 const cache=await mkdtemp(resolve(tmpdir(),'crossbus-pack-docs-'));
 let fixture;
 try{
  const artifacts=resolve(root,'native/android/artifacts');
  await mkdir(artifacts,{recursive:true});
  fixture=await mkdtemp(resolve(artifacts,'pack-regression-'));
  await writeFile(resolve(fixture,'private-build-cache.bin'),'local build cache must not ship');
  const {stdout}=await promisify(execFile)('npm',['pack','--dry-run','--ignore-scripts','--json','--offline','--no-update-notifier','--cache',cache],{cwd:root,timeout:10000,maxBuffer:1024*1024});
  const files=new Set(JSON.parse(stdout)[0].files.map(file=>file.path)),broken=[];
  expect([...files].filter(path=>/^native\/android\/(?:artifacts|build|\.gradle)\//.test(path))).toEqual([]);
  for(const file of files){
   if(!file.endsWith('.md'))continue;
   const source=(await readFile(resolve(root,file),'utf8')).replace(/```[\s\S]*?```/g,'');
   for(const match of source.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){
    const link=match[1];if(/^(?:https?:|mailto:|#)/.test(link))continue;
    const target=relative(root,resolve(root,dirname(file),decodeURIComponent(link.split('#')[0])));
    if(!files.has(target)&&![...files].some(path=>path.startsWith(target+'/')))broken.push(`${file}: ${link}`);
   }
  }
  expect(files.has('native/ios/CrossBusBridge.swift')).toBe(true);
  expect(files.has('examples/quickstart/server.js')).toBe(true);
  expect(broken).toEqual([]);
 }finally{
  if(fixture)await rm(fixture,{recursive:true,force:true});
  await rm(cache,{recursive:true,force:true});
 }
},15000);
