// Real remote endpoint for the performance study; startup is outside timings.
const host = typeof self !== 'undefined' ? self : (await import('node:worker_threads')).parentPort;
let initialized = false;
host.onmessage = async ({data:config}) => {
    if (initialized) return;
    initialized = true;
    const port = config.port;
    let calls=0;
    const methods={echo:value=>{calls++;return value;},stats:()=>calls};
    try {
        if (config.kind === 'crossbus') {
            const lib = await import(config.artifact);
            const bus = new lib.CrossBus({peerId:'b',allowedOrigins:['channel']});
            bus.addTransport(lib.MessageChannelTransport.fromPort(port,{wireFormat:config.wireFormat}),{peerId:'a',origin:'channel'});
            bus.handle('echo',methods.echo);bus.handle('stats',methods.stats);
            if(config.hooks){bus.addInboundHook(async value=>value);bus.addOutboundHook(async value=>value);}
        } else if (config.kind === 'comlink') {
            const lib = await import('../../node_modules/comlink/dist/esm/comlink.mjs');
            lib.expose(methods,port);
        } else if (config.kind === 'birpc') {
            const {createBirpc}=await import('../../node_modules/birpc/dist/index.mjs');
            createBirpc(methods,{post:data=>port.postMessage(data),on:fn=>{port.onmessage=event=>fn(event.data);}});
        } else if(config.kind === 'penpal') {
            const {connect,PortMessenger}=await import('../../node_modules/penpal/dist/penpal.mjs');
            const connection=connect({messenger:new PortMessenger({port}),methods,timeout:5000});
            await connection.promise;
        } else throw Error('Unknown worker library');
        host.postMessage({ready:true});
    } catch(error){host.postMessage({error:error.message});}
};
