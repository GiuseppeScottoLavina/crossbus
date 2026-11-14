import {CrossBus,NativeBridgeTransport} from '/assets/crossbus.min.js';
const checks=[];
const check=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const control=value=>{
 console.log('CROSSBUS_QUAL:'+JSON.stringify(value));
 window.webkit?.messageHandlers?.qualification?.postMessage(value);
};
const raw=value=>{
 if(window.CrossBus?.postMessage)window.CrossBus.postMessage(typeof value==='string'?value:JSON.stringify(value));
 else window.webkit?.messageHandlers?.crossbus?.postMessage(value);
};
let bus;
try{
 const reload=new URL(location.href).searchParams.has('reload');
 const transport=new NativeBridgeTransport({heartbeatInterval:0,initTimeout:3000});
 bus=CrossBus.createSecure({peerId:'web',allowedOrigins:['native']});
 bus.addTransport(transport,{peerId:'native',origin:'native'});await transport.ready;
 bus.handle('fromNative',v=>({received:v.n+1,text:v.text}));
 const payload={n:7,text:'Ciao 🐟 "quotes" \\ slash </script> \u2028\u2029 ");globalThis.__crossbusInjected=true;//'};
 const result=await bus.request('native','echo',payload,{timeout:3000});
 check('native echo preserves scalar and Unicode',result.n===7&&result.text===payload.text&&globalThis.__crossbusInjected===undefined);
 const noHandler=await bus.request('native','missing',{}, {timeout:3000}).then(()=>null,e=>e.code);
 check('native handler error propagates',noHandler==='ERR_NO_HANDLER');
 await bus.signal('native:probe',{n:40,text:'native 🐟'});
 let stats;const deadline=performance.now()+3000;
 do{stats=await bus.request('native','stats',{}, {timeout:3000});if(stats.nativeReplies>0)break;await pause(20);}while(performance.now()<deadline);
 check('native-initiated RPC returns through actual bridge',stats.nativeReplies>0&&stats.nativeReplyValid===true);
 if(!reload){
  raw('{invalid json');raw({_cb:2,id:'bad',type:'req',payload:{name:'protected'}});
  raw({_cb:true,id:'boolean-marker',type:'req',payload:{name:'protected'}});
  raw({_cb:'1',id:'string-marker',type:'req',payload:{name:'protected'}});
  raw({_cb:1,id:'too-large',type:'req',payload:{name:'protected',data:'x'.repeat(6000)}});
  const frame=document.createElement('iframe');
  const sent=new Promise(resolve=>{
   const listener=e=>{if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.crossbusFrameSent){removeEventListener('message',listener);resolve();}};
   addEventListener('message',listener);
  });frame.src='/assets/frame.html';document.body.append(frame);await sent;await pause(100);
  const protectedStats=await bus.request('native','stats',{}, {timeout:3000});
  check('malformed/oversized/subframe messages never run protected handler',protectedStats.protectedCalls===0);
  bus.destroy();control({phase:'first',checks,userAgent:navigator.userAgent});
 }else{
  const protectedStats=await bus.request('native','stats',{}, {timeout:3000});
  check('wrong-origin navigation never runs protected handler',protectedStats.protectedCalls===0);
  check('RPC reinitializes after allowed navigation',protectedStats.echoCalls>=2);
  const pending=bus.request('native','never',{}, {timeout:3000});const cancelled=pending.catch(e=>e.code);
  // Transport cleanup removes its bound peer before the remaining requests are
  // cancelled. Assert that specific lifecycle rejection, never a generic error.
  await pause(40);bus.destroy();check('destroy cancels pending RPC',(await cancelled)==='ERR_PEER_DISCONNECTED');
  check('destroy removes JavaScript receive callback',window.__crossbus_receive__===undefined);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('host close confirmation missing')),3000);
   window.__crossbusTestClosed=()=>{clearTimeout(timer);resolve();};control({phase:'close'});
  });
  raw({_cb:1,id:'after-close',type:'req',payload:{name:'protected',data:{}}});await pause(100);
  control({phase:'complete',checks});
 }
 document.querySelector('#result').textContent=checks.join('\n');
}catch(error){bus?.destroy();control({phase:'failed',error:error.stack??String(error),checks});document.querySelector('#result').textContent=String(error);}
