import { CrossBus } from './assets/crossbus.min.js';
const { MessageChannelTransport, PostMessageTransport } = await import('./assets/crossbus.min.js');

const resources = new Set();
const bundleUrl = new URL('./assets/crossbus.min.js', location.href).href;
function log(target, message, type = '', data) {
    const consoleElement = document.getElementById(`${target}-console`);
    if (!consoleElement) return;
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `${new Date().toLocaleTimeString()} ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`;
    consoleElement.append(line);
    consoleElement.scrollTop = consoleElement.scrollHeight;
}
function clearConsole(target) { document.getElementById(`${target}-console`)?.replaceChildren(); }
function payload(id) { const text = document.getElementById(id).value; try { return JSON.parse(text); } catch { return text; } }
function pair(leftId, rightId) {
    const left = CrossBus.createSecure({ peerId: leftId, allowedOrigins: ['channel'] });
    const right = CrossBus.createSecure({ peerId: rightId, allowedOrigins: ['channel'] });
    const channel = new MessageChannelTransport();
    left.addTransport(channel, { peerId: rightId, origin: 'channel' });
    right.addTransport(MessageChannelTransport.fromPort(channel.remotePort), { peerId: leftId, origin: 'channel' });
    resources.add(left); resources.add(right);
    return [left, right];
}
const [hub, agent] = pair('hub', 'agent');
let listener;
function updateListener() {
    listener?.unsubscribe();
    const pattern = document.getElementById('listen-pattern').value;
    listener = agent.on(pattern, event => log('agent', `Received: ${event.name}`, 'signal', event.data.payload), { mode: 'sync' });
    log('agent', `Listening to: ${pattern}`, 'response');
}
async function sendSignal() {
    const name = document.getElementById('signal-name').value;
    const data = payload('signal-data');
    try { await hub.signal(name, data); log('hub', `Signal sent: ${name}`, 'signal', data); }
    catch (error) { log('hub', error.message, 'error'); }
}
const [client, service] = pair('client', 'server');
const handlers = {
    getUser: data => ({ id: data.id, name: 'Demo user', fixture: true }),
    calculate: data => ({ sum: (data.a || 0) + (data.b || 0), product: (data.a || 0) * (data.b || 0) }),
    echo: data => data
};
for (const [name, handler] of Object.entries(handlers)) service.handle(name, data => {
    log('server', `Handling ${name}`, 'request', data);
    const result = handler(data);
    log('server', 'Returning', 'response', result);
    return result;
});
async function sendRequest() {
    const name = document.getElementById('rpc-handler').value;
    try {
        log('client', `Request: ${name}`, 'request');
        log('client', 'Response:', 'response', await client.request('server', name, payload('rpc-data')));
    } catch (error) { log('client', error.message, 'error'); }
}

let worker, workerBus, workerUrl, workerReady = false;
async function initWorker() {
    workerReady = false;
    document.getElementById('worker-status').classList.remove('connected');
    document.getElementById('worker-dot').classList.remove('connected');
    workerBus?.destroy(); worker?.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    try {
        log('main', 'Starting a real module Worker', 'request');
        const source = `import { CrossBus, MessageChannelTransport } from ${JSON.stringify(bundleUrl)};
        self.onmessage = ({data}) => {
            if (!data.port) return;
            const bus = CrossBus.createSecure({peerId:'worker',allowedOrigins:['channel']});
            bus.addTransport(MessageChannelTransport.fromPort(data.port),{peerId:'main',origin:'channel'});
            bus.handle('compute',({n}) => {
                if (!Number.isSafeInteger(n) || n<0 || n>10000000) throw new Error('N must be an integer from 0 to 10000000');
                let sum=0; for(let i=1;i<=n;i++) sum+=i;
                return {sum,workerContext:typeof document==='undefined'};
            });
            bus.signal('worker:ready');
        };`;
        workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        worker = new Worker(workerUrl, { type: 'module' });
        const current = CrossBus.createSecure({ peerId: 'main', allowedOrigins: ['channel'] });
        workerBus = current;
        const channel = new MessageChannelTransport();
        current.addTransport(channel, { peerId: 'worker', origin: 'channel' });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Worker initialization timed out')), 5000);
            current.once('worker:ready', () => { clearTimeout(timer); resolve(); }, { mode: 'sync' });
            worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
            worker.postMessage({ port: channel.remotePort }, [channel.remotePort]);
            channel.markRemoteTransferred();
        });
        if (current !== workerBus) return;
        workerReady = true;
        document.getElementById('worker-status').classList.add('connected');
        document.getElementById('worker-dot').classList.add('connected');
        log('worker', 'Ready: actual Worker, MessageChannel and compute handler', 'response');
        log('main', 'Worker connected', 'response');
    } catch (error) { log('main', error.message, 'error'); }
}
async function computeInWorker() {
    if (!workerReady) { log('main', 'Wait for the worker to connect', 'error'); return; }
    const n = Number(document.getElementById('compute-value').value);
    try {
        log('main', `Request: compute(${n})`, 'request');
        const result = await workerBus.request('worker', 'compute', { n });
        log('worker', 'Computed in the Worker:', 'response', result);
        log('main', 'Response:', 'response', result);
    } catch (error) { log('main', error.message, 'error'); }
}

let iframeHub;
function loadIframes() {
    if (iframeHub) return;
    iframeHub = CrossBus.createSecure({ peerId: 'iframe-hub', isHub: true, allowedOrigins: [location.origin] });
    resources.add(iframeHub);
    iframeHub.handle('forward', async ({ to, text }, { peerId }) => {
        if (!['widget-a', 'widget-b'].includes(to) || typeof text !== 'string') throw new Error('Invalid target or text');
        const result = await iframeHub.request(to, 'receive', { from: peerId, text });
        log('iframe-hub', `${peerId} → ${to}`, 'signal', { text });
        return result;
    });
    for (const id of ['widget-a', 'widget-b']) {
        const frame = document.getElementById(id === 'widget-a' ? 'iframe-a' : 'iframe-b');
        iframeHub.addTransport(new PostMessageTransport(frame.contentWindow, {
            targetOrigin: location.origin, allowedOrigins: [location.origin]
        }), { peerId: id });
        const script = `import {CrossBus,PostMessageTransport} from ${JSON.stringify(bundleUrl)};
        const bus=CrossBus.createSecure({peerId:${JSON.stringify(id)},allowedOrigins:[${JSON.stringify(location.origin)}]});
        bus.addTransport(new PostMessageTransport(parent,{targetOrigin:${JSON.stringify(location.origin)},allowedOrigins:[${JSON.stringify(location.origin)}]}),{peerId:'iframe-hub'});
        bus.handle('receive',data=>{document.querySelector('#log').textContent='Received: '+data.text;return {received:true};});
        document.querySelector('button').onclick=async()=>{
            try {await bus.request('iframe-hub','forward',{to:${JSON.stringify(id === 'widget-a' ? 'widget-b' : 'widget-a')},text:document.querySelector('input').value});document.querySelector('#log').textContent='Delivered';}
            catch(error){document.querySelector('#log').textContent=error.message;}
        };
        document.querySelector('button').disabled=false;
        addEventListener('pagehide',()=>bus.destroy(),{once:true});`;
        frame.srcdoc = `<!doctype html><meta charset="utf-8"><h3>${id}</h3><input value="Hello from ${id}"><button disabled>Send to the other iframe</button><p id="log"></p><script type="module">${script}</script>`;
    }
    log('iframe-hub', 'Application forwarding handler installed; both iframe transports attached', 'response');
}
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => {
    for (const item of document.querySelectorAll('.tab')) item.classList.toggle('active', item === tab);
    for (const demo of document.querySelectorAll('.demo-content')) demo.style.display = demo.id === `demo-${tab.dataset.demo}` ? 'block' : 'none';
    if (tab.dataset.demo === 'iframe') loadIframes();
});
Object.assign(window, { clearConsole, sendSignal, updateListener, sendRequest, initWorker, computeInWorker });
updateListener();
await client.request('server', 'echo', { ready: true });
log('hub', 'Real MessageChannel attached to agent', 'response');
log('client', 'RPC round trip verified; getUser returns an explicitly marked local fixture', 'response');
void initWorker();
addEventListener('pagehide', () => {
    for (const resource of resources) resource.destroy();
    workerBus?.destroy(); worker?.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
}, { once: true });
