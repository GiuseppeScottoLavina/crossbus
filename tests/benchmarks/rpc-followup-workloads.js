// Exact installed competitor versions are recorded by study.js, together with hashes.
import * as Comlink from '../../node_modules/comlink/dist/esm/comlink.mjs';
import { createBirpc } from '../../node_modules/birpc/dist/index.mjs';
import { connect, PortMessenger, CallOptions } from '../../node_modules/penpal/dist/penpal.mjs';

const stats = values => { const sorted = [...values].sort((a,b) => a-b); return { median: sorted[sorted.length >>> 1], min: sorted[0], max: sorted.at(-1), samples: values }; };

function crossbus(lib, hooks = false, wireFormat = 'standard', budget = undefined) {
    const a = new lib.CrossBus({ peerId: 'a', allowedOrigins: ['channel'], maxPayloadSize: budget });
    const b = new lib.CrossBus({ peerId: 'b', allowedOrigins: ['channel'], maxPayloadSize: budget });
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
    Comlink.expose({echo: value => {calls++;return value;},stats:()=>calls}, channel.port1);
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
    const a = createBirpc({},options(port1)), b = createBirpc({echo:value => {calls++;return value;},stats:()=>calls},options(port2));
    const echo = cached ? a.echo : null;
    return { call: value => cached ? echo(value) : a.echo(value), stats:()=>a.stats(), close() { a.$close(); b.$close(); port1.close(); port2.close(); } };
}
async function penpal(cached, timeout) {
    const {port1,port2} = new MessageChannel();
    const a = connect({messenger:new PortMessenger({port:port1}),timeout:5000});
    let calls=0;
    const b = connect({messenger:new PortMessenger({port:port2}),methods:{echo:value => {calls++;return value;},stats:()=>calls},timeout:5000});
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
            const bus=new lib.CrossBus({peerId:'a',allowedOrigins:['channel']});
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

export async function runWorkloads({ artifact = '../../dist/crossbus.min.js', samples = 9, iterations = 4096, filter, topology = 'local', diagnosticBudget = false, warmupCalls = 4096 } = {}) {
    const lib = await import(artifact);
    const definitions = [
        ['CrossBus', () => crossbus(lib)],
        ['CrossBus + async hooks', () => crossbus(lib,true)],
        ['Comlink cached', () => comlink(true)],
        ['birpc cached', () => birpc(true)],
        ['Penpal cached + timeout', () => penpal(true,true)]
    ];
    if ('wireFormat' in lib.MessageChannelTransport.prototype) definitions.splice(2,0,
        ['CrossBus compact wire',()=>crossbus(lib,false,'compact')],
        ['CrossBus compact + hooks',()=>crossbus(lib,true,'compact')]);
    if (diagnosticBudget) {
        if (topology === 'worker') throw Error('Budget ablation is local-only; remote checks must match');
        definitions.push(['CrossBus no budget (diagnostic)',()=>crossbus(lib,false,'standard',0)],
            ['CrossBus compact no budget (diagnostic)',()=>crossbus(lib,false,'compact',0)]);
    }
    const selected=definitions.filter(([name])=>!filter||name.includes(filter));
    const results = [];
    for (const concurrency of [1,16]) for (const textBytes of [0,1024,65536]) {
        const payload = {value:7,text:'x'.repeat(textBytes)};
        const cases = [];
        for (const [name,create] of selected) cases.push({name,...await (topology === 'worker' ? workerEndpoint(name,lib,artifact) : create()),rates:[]});
        const run = async (item,count) => {
            const start = performance.now();
            for (let i=0;i<count;i+=concurrency) {
                if (concurrency === 1) {
                    const value = await item.call(payload);
                    if (value.value !== 7 || value.text !== payload.text) throw new Error(`${item.name}: incorrect response`);
                } else {
                    const values = await Promise.all(Array.from({length:concurrency},() => item.call(payload)));
                    for (const value of values) if (value.value !== 7 || value.text !== payload.text) throw new Error(`${item.name}: incorrect response`);
                }
            }
            return count/(performance.now()-start)*1000;
        };
        try {
            for (const item of cases) await run(item,warmupCalls);
            for (let round=0;round<samples;round++) for (let offset=0;offset<cases.length;offset++) {
                const item = cases[(round+offset)%cases.length];
                item.rates.push(await run(item,iterations));
            }
            for (const item of cases) if(await item.stats()!==warmupCalls+samples*iterations) throw new Error(`${item.name}: remote handler invocation count mismatch`);
            for (const item of cases) results.push({library:item.name,concurrency,textBytes,callsPerSample:iterations,opsPerSecond:stats(item.rates)});
        } finally { for (const item of cases) await item.close(); }
    }
    return { methodology: {samples,iterations,warmupCalls,diagnosticBudget,topology:topology==='worker'?'MessageChannel, main context and a real Worker; startup/handshake excluded, scheduling included':'MessageChannel, two endpoints in one event loop; worker startup/scheduling excluded',
        payload:'Identical structured-cloned objects; every returned scalar/text checked; remote echo invocation counts verified after timing',
        order:'Rotate library order each round; repeat this suite in fresh processes',
        diagnostic:'Rows labelled no budget disable only that guard on controlled test data; they are excluded from production performance comparisons.',
        guarantees:'Non-diagnostic CrossBus cases retain default payload/request limits, peer binding and timeout. Comlink has no per-call timeout; birpc defaults to 60s; Penpal default has none, plus a cached 30s-timeout variant. API semantics differ.'},results };
}
