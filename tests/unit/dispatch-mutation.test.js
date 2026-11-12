import { it, expect } from 'bun:test';
import { EventEmitter, createFastEmitter } from '../../src/core/event-emitter.js';
import { createNanoEmitter } from '../../src/nano.js';
const factories={nano:createNanoEmitter,fast:createFastEmitter,emitSync:()=>{
 const emitter=new EventEmitter();return {on:(name,fn)=>emitter.onFast(name,fn),emit:(name,data)=>emitter.emitSync(name,data)};
}};
for(const [name,create] of Object.entries(factories)){
 it(`${name}: single listener removal, resubscription and recursive dispatch`,()=>{
  const emitter=create(),calls=[];
  const off=emitter.on('event',()=>{calls.push('old');off();emitter.on('event',()=>calls.push('new'));emitter.emit('event');});
  emitter.emit('event');expect(calls).toEqual(['old','new']);
  off();emitter.emit('event');expect(calls).toEqual(['old','new','new']);
 });
 it(`${name}: removing one of multiple selected callbacks preserves current dispatch`,()=>{
  const emitter=create(),calls=[];let remove;
  emitter.on('event',()=>{calls.push('first');remove();});
  remove=emitter.on('event',()=>calls.push('second'));
  emitter.emit('event');emitter.emit('event');expect(calls).toEqual(['first','second','first']);
 });
}
