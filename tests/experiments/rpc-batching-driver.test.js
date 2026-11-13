import { it,expect } from 'bun:test';
import { pair } from '../../experiments/rpc-batching/endpoints.js';
for(const kind of ['stock','batch16','batch64','group','birpc','penpal'])it('delivers one logical argument per '+kind+' benchmark call',async()=>{
 const item=await pair(kind);
 try{
  const values=Array.from({length:64},(_,n)=>({n}));
  expect(await item.callMany(values)).toEqual(values);
 }finally{await item.close();}
});
