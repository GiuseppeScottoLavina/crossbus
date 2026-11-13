// Adapted from the original competitor study; independent inputs preserve its historical hashes.
import * as Comlink from '../../node_modules/comlink/dist/esm/comlink.mjs';
import { createBirpc } from '../../node_modules/birpc/dist/index.mjs';
import { connect, PortMessenger, CallOptions } from '../../node_modules/penpal/dist/penpal.mjs';

const stats = values => { const sorted = [...values].sort((a,b) => a-b); return { median: sorted[sorted.length >>> 1], min: sorted[0], max: sorted.at(-1), samples: values }; };

function crossbus(lib, hooks = false, wireFormat = 'standard') {
    const a = lib.CrossBus.createSecure({ peerId: 'a', allowedOrigins: ['channel'] });
    const b = lib.CrossBus.createSecure({ peerId: 'b', allowedOrigins: ['channel'] });
    const channel = new lib.MessageChannelTransport({wireFormat});
    a.addTransport(channel, { peerId: 'b', origin: 'channel' });
    b.addTransport(lib.MessageChannelTransport.fromPort(channel.remotePort,{wireFormat}), { peerId: 'a', origin: 'channel' });
    let calls=0;
    b.handle('echo', value => {calls++;return value;});
    b.handle('stats',()=>calls);
    if (hooks) for (const bus of [a,b]) {
        bus.addInboundHook(async value => value);
        bus.addOutboundHook(async value => value);
    }
    return { call: value => a.request('b','echo',value), stats:()=>a.request('b','stats'), close() { a.destroy(); b.destroy(); } };
}
function comlink(cached) {
    const channel = new MessageChannel();
    let calls=0;
    Comlink.expose({echo: function(value) {if(arguments.length!==1)throw Error('Exactly one application argument required');calls++;return value;},stats:()=>calls}, channel.port1);
    const remote = Comlink.wrap(channel.port2), echo = cached ? remote.echo : null;
    return { call: value => cached ? echo(value) : remote.echo(value), stats:()=>remote.stats(), async close() {
        remote[Comlink.releaseProxy]();
        await new Promise(resolve => setTimeout(resolve,0));
        channel.port1.close(); channel.port2.close();
    }};
}
function birpc(cached) {
    const {port1,port2} = new MessageChannel();
    const options = port => ({ post: data => port.postMessage(data), on: fn => { port.onmessage = event => fn(event.data); }, off: () => { port.onmessage = null; } });
    let calls=0;
    const a = createBirpc({},options(port1)), b = createBirpc({echo:function(value) {if(arguments.length!==1)throw Error('Exactly one application argument required');calls++;return value;},stats:()=>calls},options(port2));
    const echo = cached ? a.echo : null;
    return { call: value => cached ? echo(value) : a.echo(value), stats:()=>a.stats(), close() { a.$close(); b.$close(); port1.close(); port2.close(); } };
}
async function penpal(cached, timeout) {
    const {port1,port2} = new MessageChannel();
    const a = connect({messenger:new PortMessenger({port:port1}),timeout:5000});
    let calls=0;
    const b = connect({messenger:new PortMessenger({port:port2}),methods:{echo:function(value) {if(arguments.length!==1)throw Error('Exactly one application argument required');calls++;return value;},stats:()=>calls},timeout:5000});
    const [remote] = await Promise.all([a.promise,b.promise]);
    const echo = cached ? remote.echo : null, options = timeout ? new CallOptions({timeout:30000}) : null;
    return { call: value => timeout ? echo(value,options) : cached ? echo(value) : remote.echo(value), stats:()=>remote.stats(), close() { a.destroy(); b.destroy(); } };
}

async function workerEndpoint(name,lib,artifact) {
    const WorkerClass=typeof Worker!=='undefined'?Worker:(await import('node:worker_threads')).Worker;
    const worker=new WorkerClass(new URL('./competitor-worker.js',import.meta.url),{type:'module'});
    const {port1,port2}=new MessageChannel();
    const kind=name.startsWith('CrossBus')?'crossbus':name.startsWith('Comlink')?'comlink':name.startsWith('birpc')?'birpc':'penpal';
    const hooks=name.includes('hooks'), wireFormat=name.includes('compact')?'compact':'standard';
    const ready=new Promise((resolve,reject)=>{
        const handle=({data})=>data.error?reject(new Error(data.error)):resolve();
        if(worker.addEventListener){worker.addEventListener('message',handle,{once:true});worker.addEventListener('error',event=>reject(new Error(event.message)),{once:true});}
        else{worker.once('message',data=>handle({data}));worker.once('error',reject);}
    });
    worker.postMessage({kind,port:port2,artifact:new URL(artifact,import.meta.url).href,hooks,wireFormat},[port2]);
    let local;
    try {
        if(kind==='crossbus'){
            const bus=lib.CrossBus.createSecure({peerId:'a',allowedOrigins:['channel']});
            bus.addTransport(lib.MessageChannelTransport.fromPort(port1,{wireFormat}),{peerId:'b',origin:'channel'});
            if(hooks){bus.addInboundHook(async value=>value);bus.addOutboundHook(async value=>value);}
            local={call:value=>bus.request('b','echo',value),stats:()=>bus.request('b','stats'),close:()=>bus.destroy()};
        }else if(kind==='comlink'){
            const remote=Comlink.wrap(port1),echo=name.includes('cached')?remote.echo:null;
            local={call:value=>echo?echo(value):remote.echo(value),stats:()=>remote.stats(),close:()=>{remote[Comlink.releaseProxy]();}};
        }else if(kind==='birpc'){
            const remote=createBirpc({},{post:data=>port1.postMessage(data),on:fn=>{port1.onmessage=event=>fn(event.data);}}),echo=name.includes('cached')?remote.echo:null;
            local={call:value=>echo?echo(value):remote.echo(value),stats:()=>remote.stats(),close:()=>remote.$close()};
        }else{
            const connection=connect({messenger:new PortMessenger({port:port1}),timeout:5000});
            const remote=await connection.promise,echo=name.includes('cached')?remote.echo:null,options=new CallOptions({timeout:30000});
            local={call:value=>name.includes('timeout')?echo(value,options):echo?echo(value):remote.echo(value),stats:()=>remote.stats(),close:()=>connection.destroy()};
        }
        await ready;
        return{call:local.call,stats:local.stats,async close(){local.close();await new Promise(resolve=>setTimeout(resolve,0));port1.close();await worker.terminate();}};
    }catch(error){local?.close();port1.close();await worker.terminate();throw error;}
}

export async function runWorkloads({ artifact = '../../dist/crossbus.min.js', samples = 9, iterations = 4096, warmup = 4096, latencyGroups = 128, names = ['CrossBus','CrossBus + async hooks','CrossBus compact wire','CrossBus compact + hooks','birpc cached','Penpal cached + timeout'], topology = 'local', concurrencies = [1,16,64], sizes = [1024], order = 0 } = {}) {
    for(const count of [samples,iterations,warmup,latencyGroups])if(!Number.isSafeInteger(count)||count<1)throw Error('Positive integer counts required');
    if(!['local','worker'].includes(topology)||!Number.isSafeInteger(order)||order<0)throw Error('Invalid topology/order');
    if(!concurrencies.length||!sizes.length||!names.length||new Set(names).size!==names.length)throw Error('Nonempty unique case selection required');
    for(const c of concurrencies)if(!Number.isSafeInteger(c)||c<1||c>64||iterations%c||warmup%c)throw Error('Invalid concurrency/count combination');
    for(const size of sizes)if(!Number.isSafeInteger(size)||size<0)throw Error('Invalid payload size');
    const lib = await import(artifact);
    const definitions = [
        ['CrossBus', () => crossbus(lib)],
        ['CrossBus + async hooks', () => crossbus(lib,true)],
        ['Comlink', () => comlink(false)], ['Comlink cached', () => comlink(true)],
        ['birpc', () => birpc(false)], ['birpc cached', () => birpc(true)],
        ['Penpal', () => penpal(false,false)], ['Penpal cached', () => penpal(true,false)], ['Penpal cached + timeout', () => penpal(true,true)]
    ];
    if ('wireFormat' in lib.MessageChannelTransport.prototype) definitions.splice(2,0,
        ['CrossBus compact wire',()=>crossbus(lib,false,'compact')],
        ['CrossBus compact + hooks',()=>crossbus(lib,true,'compact')]);
    for(const name of names)if(!definitions.some(([known])=>known===name))throw Error('Unknown case: '+name);
    let selected=definitions.filter(([name])=>names.includes(name));
    selected=[...selected.slice(order%selected.length),...selected.slice(0,order%selected.length)];
    const results = [];
    for (const concurrency of concurrencies) for (const textBytes of sizes) {
        const payloads = Array.from({length:concurrency},(_,i)=>({value:i+7,text:'x'.repeat(textBytes)}));
        const cases = [];
        const run = async (item,count,latencies) => {
            const start = performance.now();
            for (let i=0;i<count;i+=concurrency) {
                const tick=latencies?performance.now():0;
                if (concurrency === 1) {
                    const value = await item.call(payloads[0]);
                    if (value.value !== 7 || value.text !== payloads[0].text) throw new Error(`${item.name}: incorrect response`);
                } else {
                    const values = await Promise.all(payloads.map(payload => item.call(payload)));
                    for (let j=0;j<values.length;j++) if (values[j].value !== payloads[j].value || values[j].text !== payloads[j].text) throw new Error(`${item.name}: incorrect response`);
                }
                if(latencies)latencies.push(performance.now()-tick);
            }
            return count/(performance.now()-start)*1000;
        };
        try {
            for (const [name,create] of selected) cases.push({name,...await (topology === 'worker' ? workerEndpoint(name,lib,artifact) : create()),rates:[]});
            for (const item of cases) await run(item,warmup);
            for (let round=0;round<samples;round++) for (let offset=0;offset<cases.length;offset++) {
                const item = cases[(round+offset)%cases.length];
                item.rates.push(await run(item,iterations));
            }
            for (const item of cases) {
                const latency=[];await run(item,latencyGroups*concurrency,latency);latency.sort((a,b)=>a-b);
                const checkedCalls=warmup+samples*iterations+latencyGroups*concurrency;
                if(await item.stats()!==checkedCalls)throw new Error(`${item.name}: remote handler invocation count mismatch`);
                const percentile=p=>latency[Math.floor((latency.length-1)*p)];
                results.push({library:item.name,concurrency,textBytes,callsPerSample:iterations,checkedCalls,opsPerSecond:stats(item.rates),latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),samples:latency}});
            }
        } finally { for (const item of cases) await item.close(); }
    }
    return { methodology: {samples,iterations,warmupCalls:warmup,latencyGroups,concurrencies,sizes,names,order,topology:topology==='worker'?'MessageChannel, main context and a real Worker; startup/handshake excluded, scheduling included':'MessageChannel, two endpoints in one event loop; worker startup/scheduling excluded',
        payload:'Distinct preallocated objects per member; every returned scalar/full text and exact remote echo invocation count verified; burst completion RTT sampled separately',
        order:'Rotate library order each round; repeat this suite in fresh processes',
        guarantees:'CrossBus retains default payload/request limits, peer binding and timeout. Comlink has no per-call timeout; birpc defaults to 60s; Penpal default has none, plus a cached 30s-timeout variant. API semantics differ.'},results };
}
