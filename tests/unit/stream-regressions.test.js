import { it, expect } from 'bun:test';
import { WritableSignalStream, StreamManager } from '../../src/core/stream.js';
for (const chunkSize of [0,-1,NaN,Infinity,0.5]) it(`rejects invalid stream chunk size ${chunkSize}`,()=>{
 expect(()=>new WritableSignalStream(()=>{},'upload',{chunkSize})).toThrow(RangeError);
});
for (const size of [0,1,5,17]) it(`round-trips binary chunks at size ${size} with non-base64-aligned boundaries`,async()=>{
 const manager = new StreamManager(()=>{});
 let collected;
 manager.onStream('upload', async stream=>{collected=stream.collect();});
 const writer=new WritableSignalStream(message=>manager.handleMessage(message,'trusted'),'upload',{chunkSize:5});
 const bytes=Uint8Array.from({length:size},(_,i)=>(i*37)%256);
 await writer.write(bytes); await writer.end();
 expect(await collected).toEqual(bytes);
 expect(manager.activeStreamCount).toBe(0);
});
it('binds active streams to their source peer and rejects duplicate opens',async()=>{
 const manager=new StreamManager(()=>{}); let reader,result,calls=0;
 manager.onStream('upload',async stream=>{calls++; reader=stream; result=stream.collect();});
 const open={t:'stream',sid:'same-id',st:'open',name:'upload'};
 manager.handleMessage(open,'owner');
 manager.handleMessage(open,'other');
 manager.handleMessage({t:'stream',sid:'same-id',st:'data',d:'forged'},'other');
 manager.handleMessage({t:'stream',sid:'same-id',st:'end'},'other');
 expect(calls).toBe(1); expect(reader.ended).toBe(false);
 manager.handleMessage({t:'stream',sid:'same-id',st:'data',d:'verified'},'owner');
 manager.handleMessage({t:'stream',sid:'same-id',st:'end'},'owner');
 expect(await result).toBe('verified'); expect(manager.activeStreamCount).toBe(0);
});
it('rejects a stream reader on manager destruction and releases state',async()=>{
 const manager=new StreamManager(()=>{}); let result;
 manager.onStream('upload',async stream=>{result=stream.collect();});
 manager.handleMessage({t:'stream',sid:'id',st:'open',name:'upload'},'owner');
 const outcome=result.catch(error=>error);
 manager.destroy();
 expect((await outcome).message).toContain('destroyed');
 expect(manager.activeStreamCount).toBe(0);
 expect(()=>manager.createStream('upload','owner')).toThrow('destroyed');
});
it('drains a large buffered stream in order while allowing pushes during reads',async()=>{
 const { ReadableSignalStream }=await import('../../src/core/stream.js');
 // Reserve the intended large-queue workload explicitly; the new default cap
 // is tested separately rather than bypassed in this compaction regression.
 const stream=new ReadableSignalStream('buffered','data',{}, {maxBufferedChunks:4096});
 for(let i=0;i<2500;i++)stream.push({d:String(i)+','});
 const chunks=[];
 for await(const chunk of stream){
  chunks.push(chunk);
  if(chunks.length===1){stream.push({d:'tail'});stream.end();}
 }
 expect(chunks.join('')).toBe(Array.from({length:2500},(_,i)=>String(i)+',').join('')+'tail');
});
it('stale stream handler cleanup leaves the current registration intact',()=>{
 const manager=new StreamManager(()=>{});let calls=0;
 const handler=async()=>{calls++;};
 const old=manager.onStream('data',handler);manager.onStream('data',handler);old();
 manager.handleMessage({t:'stream',st:'open',sid:'id',name:'data'},'owner');
 expect(calls).toBe(1);manager.destroy();
});
