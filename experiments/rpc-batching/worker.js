import { endpoint } from './endpoints.js';
const host=typeof self!=='undefined'?self:(await import('node:worker_threads')).parentPort;
host.onmessage=async({data})=>{
 try{await endpoint(data.kind,data.port,'b','a',{hooks:data.hooks});host.postMessage({ready:true});}
 catch(error){host.postMessage({error:error.message});}
};
