import { it,expect } from 'bun:test';
import * as previous from '../../benchmarks/optimization-study/baseline/crossbus.min.js';
import * as candidate from '../../dist/crossbus.min.js';
it('exchanges RPC in both directions with the preserved 0.1.2 implementation',async()=>{
 const a=new previous.CrossBus({peerId:'previous',allowedOrigins:['channel']});
 const b=new candidate.CrossBus({peerId:'candidate',allowedOrigins:['channel']});
 const transport=new previous.MessageChannelTransport();
 a.addTransport(transport,{peerId:'candidate',origin:'channel'});
 b.addTransport(candidate.MessageChannelTransport.fromPort(transport.remotePort),{peerId:'previous',origin:'channel'});
 a.handle('echo',value=>value);b.handle('echo',value=>value);
 try{
  expect(await a.request('candidate','echo',{text:'old → new',n:1})).toEqual({text:'old → new',n:1});
  expect(await b.request('previous','echo',{text:'new → old',n:2})).toEqual({text:'new → old',n:2});
 }finally{a.destroy();b.destroy();}
});
