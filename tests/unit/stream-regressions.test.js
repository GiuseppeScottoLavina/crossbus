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

/** Two managers joined by in-memory queues the test delivers. */
function linkedManagers() {
 const toReader=[],toWriter=[];
 const writer=new StreamManager((peer,frame)=>{toReader.push(structuredClone(frame));return Promise.resolve();});
 const reader=new StreamManager((peer,frame)=>{toWriter.push(structuredClone(frame));return Promise.resolve();});
 // Deliver until the channel has stayed empty for a few macrotasks.
 const pump=async()=>{for(let quiet=0,i=0;quiet<3&&i<200;i++){if(!toReader.length&&!toWriter.length)quiet++;else quiet=0;while(toReader.length)reader.handleMessage(toReader.shift(),'writer');while(toWriter.length)writer.handleMessage(toWriter.shift(),'reader');await new Promise(r=>setTimeout(r,0));}};
 return {writer,reader,toReader,toWriter,pump};
}
const settled=promise=>promise.then(value=>({value}),error=>({code:error.code,message:error.message}));

it('reports a remote stream error to the reader as ERR_STREAM_CANCELLED',async()=>{
 const {writer,reader,pump}=linkedManagers(); let stream;
 reader.onStream('up',s=>{stream=s;});
 const out=writer.createStream('up','reader',{flowControl:true});
 const writing=settled(out.write('partial'));
 await pump();
 const reading=settled(stream.collect());
 await writing;
 await out.abort('changed my mind'); await pump();
 expect(await reading).toEqual({code:'ERR_STREAM_CANCELLED',message:'changed my mind'});
 writer.destroy(); reader.destroy();
});

for (const side of ['reader','writer']) it(`tells the peer when the ${side} manager is destroyed`,async()=>{
 const managers=linkedManagers(); let stream;
 managers.reader.onStream('up',s=>{stream=s;});
 // Long deadlines: the other side must end because it was told, not by timing out.
 const out=managers.writer.createStream('up','reader',{flowControl:true,windowSize:1,ackTimeout:60000});
 const writing=settled((async()=>{await out.write('a');await out.write('b');await out.end();})());
 await managers.pump();
 // The writer now waits for credit; the reader holds 'a'.
 const reading=side==='writer'?settled(stream.collect()):null;
 managers[side].destroy();
 await managers.pump();
 expect(side==='reader'?await writing:await reading).toEqual({code:'ERR_STREAM_CANCELLED',message:'Stream manager destroyed'});
 expect(managers.writer.outgoingStreamCount+managers.reader.activeStreamCount).toBe(0);
 managers.writer.destroy(); managers.reader.destroy();
});
