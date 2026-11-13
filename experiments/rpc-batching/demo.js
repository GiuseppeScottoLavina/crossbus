import {CrossBus,MessageChannelTransport} from '../../dist/crossbus.min.js';
import {attachGrouped,requestGroup} from './group-transport.js';
const client=CrossBus.createSecure({peerId:'client',allowedOrigins:['channel']});
const service=CrossBus.createSecure({peerId:'service',allowedOrigins:['channel']});
const channel=new MessageChannelTransport();
const group=attachGrouped(client,channel,{peerId:'service'});
attachGrouped(service,MessageChannelTransport.fromPort(channel.remotePort),{peerId:'client'});
service.handle('sum',({a,b})=>a+b);
try{
 const values=await requestGroup(client,group,'service',[
  {name:'sum',payload:{a:2,b:3}},
  {name:'sum',payload:{a:4,b:5}}
 ]);
 console.log(JSON.stringify(values)); // [5,9]
}finally{client.destroy();service.destroy();}
