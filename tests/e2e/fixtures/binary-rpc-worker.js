import {CrossBus,MessageChannelTransport} from '/dist/crossbus.min.js';
self.onmessage=({data:{port,maxPayloadSize}})=>{
 const bus=CrossBus.createSecure({peerId:'worker',allowedOrigins:['channel'],maxPayloadSize});
 bus.addTransport(MessageChannelTransport.fromPort(port,{autoTransfer:true}),{peerId:'client',origin:'channel'});
 let calls=0,last;
 bus.handle('echo',value=>{calls++;last=value.bytes.buffer;return value;});
 bus.handle('calls',()=>calls);
 bus.handle('returnedOwnership',()=>last?.byteLength??-1);
 self.postMessage({ready:true});
};
