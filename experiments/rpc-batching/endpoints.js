// Stock and experimental adapters use the exact same compiled CrossBus runtime.
import { CrossBus,MessageChannelTransport } from '../../dist/crossbus.min.js';
import { attachBatched } from './transport.js';
import { attachGrouped,requestGroup } from './group-transport.js';
import { createBirpc } from '../../node_modules/birpc/dist/index.mjs';
import { connect,PortMessenger,CallOptions } from '../../node_modules/penpal/dist/penpal.mjs';

export async function endpoint(kind,port,peerId,remoteId,{hooks=false}={}) {
 let calls=0,packets=0,transport;
 const nativePost=port.postMessage.bind(port);
 const startCount=()=>{packets=0;port.postMessage=(...args)=>{nativePost(...args);packets++;};return true;};
 const methods={echo:function(value){if(arguments.length!==1)throw Error('Echo requires exactly one logical argument');calls++;return value;},stats:()=>({calls,packets,transport:transport?.stats}),startCount};
 const localStats=()=>({packets,transport:transport?.stats});
 if(kind==='stock'||kind==='group'||kind.startsWith('batch')){
  const bus=CrossBus.createSecure({peerId,allowedOrigins:['channel']});
  const base=MessageChannelTransport.fromPort(port);
  transport=kind==='stock'?base:kind==='group'?attachGrouped(bus,base,{peerId:remoteId}):attachBatched(bus,base,{peerId:remoteId,maxMessages:Number(kind.slice(5))});
  if(kind==='stock')bus.addTransport(base,{peerId:remoteId,origin:'channel'});
  for(const [name,fn] of Object.entries(methods))bus.handle(name,name==='echo'?value=>fn(value):fn);
  if(hooks){bus.addInboundHook(async v=>v);bus.addOutboundHook(async v=>v);}
  const call=v=>bus.request(remoteId,'echo',v);
  return{call,callMany:kind==='group'?values=>requestGroup(bus,transport,remoteId,values.map(payload=>({name:'echo',payload}))):values=>Promise.all(values.map(value=>call(value))),
   remoteStats:()=>bus.request(remoteId,'stats'),async startCounting(){await bus.request(remoteId,'startCount');startCount();},localStats,close:()=>bus.destroy()};
 }
 if(kind==='birpc'){
  const rpc=createBirpc(methods,{post:data=>port.postMessage(data),on:fn=>{port.onmessage=e=>fn(e.data);},off:()=>{port.onmessage=null;}});
  const call=rpc.echo,stats=rpc.stats,start=rpc.startCount;
  return{call,callMany:values=>Promise.all(values.map(value=>call(value))),remoteStats:stats,async startCounting(){await start();startCount();},localStats,close(){rpc.$close();port.close();}};
 }
 if(kind==='penpal'){
  const connection=connect({messenger:new PortMessenger({port}),methods,timeout:5000});
  const rpc=await connection.promise,echo=rpc.echo,stats=rpc.stats,start=rpc.startCount,options=new CallOptions({timeout:30000});
  const call=v=>echo(v,options);
  return{call,callMany:values=>Promise.all(values.map(value=>call(value))),remoteStats:()=>stats(options),async startCounting(){await start(options);startCount();},localStats,close:()=>connection.destroy()};
 }
 throw Error('Unknown endpoint kind');
}
export async function pair(kind,{worker=false,hooks=false}={}) {
 const {port1,port2}=new MessageChannel();
 if(!worker){
  const [a,b]=await Promise.all([endpoint(kind,port1,'a','b',{hooks}),endpoint(kind,port2,'b','a',{hooks})]);
  return{...a,async close(){a.close();b.close();}};
 }
 const WorkerClass=typeof Worker!=='undefined'?Worker:(await import('node:worker_threads')).Worker;
 const child=new WorkerClass(new URL('./worker.js',import.meta.url),{type:'module'});
 const ready=new Promise((resolve,reject)=>{
  const handle=data=>data.error?reject(Error(data.error)):resolve();
  if(child.addEventListener){child.addEventListener('message',e=>handle(e.data),{once:true});child.addEventListener('error',e=>reject(Error(e.message)),{once:true});}
  else {child.once('message',handle);child.once('error',reject);}
 });
 child.postMessage({kind,port:port2,hooks},[port2]);
 let a;
 try{a=await endpoint(kind,port1,'a','b',{hooks});await ready;}
 catch(error){a?.close();port1.close();await child.terminate();throw error;}
 return{...a,async close(){a.close();await child.terminate();}};
}
