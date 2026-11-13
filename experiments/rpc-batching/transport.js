// Opt-in research adapter, deliberately outside src/ and the npm export map.
import { isProtocolMessage } from '../../src/common/types.js';
export const BATCH_TYPE='crossbus:message-batch:1';
const MAX_PACKET_MESSAGES=64;

/**
 * Sends the first packet immediately and groups the rest of that microtask
 * window. Queued messages are cloned at send time: delaying that snapshot
 * would expose caller mutations and aliases between independent RPC calls.
 * Explicit transfers flush older work and bypass batching to detach immediately.
 * Both endpoints must install this adapter; there is no wire negotiation.
 */
export class BatchTransport {
 #base;
 #handler=null;
 #queue=[];
 #scheduled=false;
 #destroyed=false;
 #maxMessages;
 #onError;
 #sequence=0;
 #counts={sentPackets:0,sentMessages:0,receivedPackets:0,receivedMessages:0,maxBatch:0,snapshots:0};

 constructor(base,{maxMessages=16,onError=()=>{}}={}) {
  if(!Number.isSafeInteger(maxMessages)||maxMessages<1||maxMessages>MAX_PACKET_MESSAGES)throw new RangeError('maxMessages must be 1..64');
  if(!base||typeof base.send!=='function'||typeof base.onMessage!=='function')throw new TypeError('A message transport is required');
  this.#base=base;this.#maxMessages=maxMessages;this.#onError=onError;
  base.onMessage((message,context)=>this.#receive(message,context));
 }
 get stats(){return {...this.#counts,queued:this.#queue.length};}
 onMessage(handler){if(typeof handler!=='function')throw new TypeError('Handler required');this.#handler=handler;}
 offMessage(){this.#handler=null;}

 send(message,transfer) {
  if(this.#destroyed)throw new Error('Batch transport destroyed');
  if(transfer?.length) {
   this.#flush();
   this.#base.send(message,transfer);this.#counts.sentPackets++;this.#counts.sentMessages++;
   this.#schedule();return;
  }
  // The leading send avoids added snapshot/queue latency for sequential RPC.
  if(!this.#scheduled||this.#maxMessages===1) {
   this.#base.send(message,transfer);this.#counts.sentPackets++;this.#counts.sentMessages++;
   this.#schedule();return;
  }
  // A clone failure is synchronous, before this message enters the queue.
  const snapshot=structuredClone(message);
  if(this.#destroyed)throw new Error('Batch transport destroyed during snapshot');
  this.#queue.push(snapshot);this.#counts.snapshots++;this.#counts.sentMessages++;
  if(this.#queue.length>=this.#maxMessages) {
   try{this.#flush();}catch(error){this.#fail(error);throw error;}
  }
 }
 #schedule() {
  if(this.#scheduled||this.#destroyed)return;
  this.#scheduled=true;
  queueMicrotask(()=>{
   if(this.#destroyed)return;
   this.#scheduled=false;
   try{this.#flush();}catch(error){this.#fail(error);}
  });
 }
 #flush() {
  if(!this.#queue.length)return;
  const messages=this.#queue;this.#queue=[];
  // Single leftovers retain standard wire messages and avoid a batch wrapper.
  if(messages.length===1)this.#base.send(messages[0]);
  else {
   this.#base.send({_cb:1,id:`batch_${++this.#sequence}`,type:BATCH_TYPE,payload:{messages}});
   this.#counts.maxBatch=Math.max(this.#counts.maxBatch,messages.length);
  }
  this.#counts.sentPackets++;
 }
 #fail(error) {
  this.destroy();this.#onError(error);
 }
 #receive(message,context) {
  if(this.#destroyed||!this.#handler)return;
  this.#counts.receivedPackets++;
  if(message.type!==BATCH_TYPE) {
   this.#counts.receivedMessages++;this.#handler(message,context);return;
  }
  const messages=message.payload?.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>MAX_PACKET_MESSAGES)return;
  // Validate the entire container before delivering any logical member.
  for(const item of messages)if(!isProtocolMessage(item)||Array.isArray(item)||item.type===BATCH_TYPE)return;
  for(const item of messages) {
   if(this.#destroyed||!this.#handler)break;
   this.#counts.receivedMessages++;
   // Independent native events isolate observer errors; retain that property
   // when several logical messages share the same physical event.
   try{this.#handler(item,context);}
   catch(error){console.error('[BatchTransport] Logical message handler failed:',error);}
  }
 }
 destroy() {
  if(this.#destroyed)return;
  this.#destroyed=true;this.#scheduled=false;this.#queue=[];this.#handler=null;
  this.#base.offMessage?.();this.#base.destroy?.();
 }
}

/** Bind failure to peer cancellation instead of manufacturing remote responses. */
export function attachBatched(bus,base,{peerId,maxMessages=16}={}) {
 if(typeof peerId!=='string')throw new TypeError('A bound peer ID is required');
 const transport=new BatchTransport(base,{maxMessages,onError:()=>bus.removePeer(peerId)});
 try{bus.addTransport(transport,{peerId,origin:'channel'});}
 catch(error){transport.destroy();throw error;}
 return transport;
}
