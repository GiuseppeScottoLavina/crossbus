// Explicit bulk-call experiment. Not exported or shipped by the npm package.
import { isProtocolMessage } from '../../src/common/types.js';
export const GROUP_TYPE='crossbus:rpc-group:1';
export const REPLY_GROUP_TYPE='crossbus:rpc-group-reply:1';
const MAX_GROUP=64;
const MAX_REPLY_WINDOWS=4;
const bindings=new WeakMap();

/**
 * Only explicit synchronous groups share a native request packet. Ordinary
 * sends retain immediate native snapshot semantics. Replies ready in the first
 * microtask checkpoint may share a reply graph; slow replies send independently.
 * Both group inputs and coalesced outputs preserve their shared graph aliases.
 */
export class GroupTransport {
 #base;
 #handler=null;
 #outgoing=null;
 #destroyed=false;
 #onError;
 #sequence=0;
 #packets=0;
 #messages=0;
 #replyIds=new Map();
 #replyWindows=new Set();
 constructor(base,{onError=()=>{}}={}){
  if(!base||typeof base.send!=='function'||typeof base.onMessage!=='function')throw new TypeError('Transport required');
  this.#base=base;this.#onError=onError;base.onMessage((m,c)=>this.#receive(m,c));
 }
 get stats(){return{sentPackets:this.#packets,sentMessages:this.#messages,queued:(this.#outgoing?.length??0)+[...this.#replyWindows].reduce((n,w)=>n+w.responses.length,0),replyMappings:this.#replyIds.size};}
 onMessage(fn){if(typeof fn!=='function')throw new TypeError('Handler required');this.#handler=fn;}
 offMessage(){this.#handler=null;}
 send(message,transfer){
  if(this.#destroyed)throw Error('Group transport destroyed');
  const window=message.type==='res'?this.#replyIds.get(message.payload?.requestId):null;
  if(window&&!transfer?.length){
   this.#replyIds.delete(message.payload.requestId);window.responses.push(message);this.#messages++;
   if(!window.scheduled){
    window.scheduled=true;
    queueMicrotask(()=>{
     if(this.#destroyed)return;
     const responses=window.responses;window.responses=[];window.scheduled=false;
     try{this.#base.send(responses.length===1?responses[0]:{_cb:1,id:`replies_${++this.#sequence}`,type:REPLY_GROUP_TYPE,payload:{messages:responses}});this.#packets++;}
     catch(error){this.destroy();this.#onError(error);}
     finally{if(window.closed)this.#replyWindows.delete(window);}
    });
   }
   return;
  }
  if(this.#outgoing!==null&&message.type==='req'&&!transfer?.length){
   this.#outgoing.push(message);this.#messages++;
   if(this.#outgoing.length>=MAX_GROUP){
    try{this.#flush();}catch(error){this.destroy();this.#onError(error);throw error;}
   }
   return;
  }
  // Signals, responses and explicit transfers keep native send order/ownership.
  this.#flush();this.#base.send(message,transfer);this.#packets++;this.#messages++;
 }
 group(fn){
  if(this.#destroyed)throw Error('Group transport destroyed');
  if(this.#outgoing!==null){
   // Nested groups must finish their own native snapshot before returning.
   try{this.#flush();const value=fn();this.#flush();return value;}
   catch(error){this.destroy();this.#onError(error);throw error;}
  }
  this.#outgoing=[];
  try{const value=fn();this.#flush();return value;}
  catch(error){this.destroy();this.#onError(error);throw error;}
  finally{this.#outgoing=null;}
 }
 #flush(){
  if(!this.#outgoing?.length)return;
  const messages=this.#outgoing;this.#outgoing=null;
  try{
   // Native serialization can execute getters. Reentrant ordinary sends must
   // send immediately, rather than enter a queue that the outer call retires.
   this.#base.send(messages.length===1?messages[0]:{_cb:1,id:`group_${++this.#sequence}`,type:GROUP_TYPE,payload:{messages}});
   this.#packets++;
  }finally{if(!this.#destroyed)this.#outgoing=[];}
 }
 #receive(message,context){
  if(this.#destroyed||!this.#handler)return;
  if(message.type!==GROUP_TYPE&&message.type!==REPLY_GROUP_TYPE){this.#handler(message,context);return;}
  const requests=message.type===GROUP_TYPE;
  const messages=message.payload?.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>MAX_GROUP)return;
  const ids=new Set();
  for(const m of messages){
   const id=requests?m?.id:m?.payload?.requestId;
   if(!isProtocolMessage(m)||Array.isArray(m)||m.type!==(requests?'req':'res')||typeof id!=='string'||ids.has(id)||requests&&this.#replyIds.has(id))return;
   ids.add(id);
  }
  let window;
  if(requests&&this.#replyWindows.size<MAX_REPLY_WINDOWS){
   window={ids,responses:[],scheduled:false,closed:false};this.#replyWindows.add(window);
   for(const id of ids)this.#replyIds.set(id,window);
  }
  for(const m of messages){
   if(this.#destroyed||!this.#handler)break;
   try{this.#handler(m,context);}catch(error){console.error('[GroupTransport] Logical handler failed:',error);}
  }
  // Already-ready handler continuations run first. Clear missing IDs before
  // waiting for future tasks: one slow member never holds the others back.
  if(window)queueMicrotask(()=>{
   window.closed=true;
   for(const id of window.ids)if(this.#replyIds.get(id)===window)this.#replyIds.delete(id);
   if(!window.scheduled)this.#replyWindows.delete(window);
  });
 }
 destroy(){
  if(this.#destroyed)return;
  this.#destroyed=true;this.#outgoing=null;this.#handler=null;bindings.delete(this);
  this.#replyIds.clear();for(const window of this.#replyWindows)window.responses=[];this.#replyWindows.clear();
  this.#base.offMessage?.();this.#base.destroy?.();
 }
}
export function attachGrouped(bus,base,{peerId}={}){
 if(typeof peerId!=='string')throw new TypeError('Bound peer ID required');
 const transport=new GroupTransport(base,{onError:()=>bus.removePeer(peerId)});
 try{bus.addTransport(transport,{peerId,origin:'channel'});}
 catch(error){transport.destroy();throw error;}
 bindings.set(transport,{bus,peerId});
 return transport;
}
/**
 * Capture an explicit group before returning. Existing per-call options, peer
 * checks and timers remain owned by CrossBus. Async outbound hooks may defer
 * individual sends beyond the group window; those use the ordinary path.
 * A native clone failure closes this binding and cancels its pending requests.
 */
export function requestGroup(bus,transport,peerId,operations){
 let all;
 try{
  const binding=bindings.get(transport);
  if(!binding||binding.bus!==bus||binding.peerId!==peerId)throw new TypeError('Transport must be bound to this bus and peer');
  if(!Array.isArray(operations)||operations.length<1||operations.length>MAX_GROUP)throw new RangeError('A group requires 1..64 operations');
  const calls=operations.map(op=>{
   const name=op?.name;
   if(typeof name!=='string')throw new TypeError('Each operation requires a handler name');
   return{name,payload:op.payload,options:op.options};
  });
  transport.group(()=>{all=Promise.all(calls.map(op=>bus.request(peerId,op.name,op.payload,op.options)));});
  return all;
 }catch(error){all?.catch(()=>{});return Promise.reject(error);}
}
