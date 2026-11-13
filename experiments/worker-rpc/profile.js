// CPU sampling is diagnostic and perturbs execution: never use its rates as benchmarks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {launchBrowser, closeBrowser} from '../../tests/e2e/puppeteer-helper.js';

const root = new URL('../../', import.meta.url);
const output = new URL('benchmarks/worker-rpc/profiles/', root);
await mkdir(output, {recursive: true});
const server = createServer(async(req, res) => {
    try {
        const file = new URL('.' + new URL(req.url, 'http://local').pathname, root);
        if (!file.href.startsWith(root.href)) { res.writeHead(403); res.end(); return; }
        if (file.href === root.href) { res.end('<!doctype html><title>Worker RPC CPU sampling</title>'); return; }
        res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser, userDataDir;
const summaries = [];
const hashes = {};
for (const path of ['benchmarks/worker-rpc/baseline/crossbus.js', 'experiments/worker-rpc/profile.js', 'experiments/worker-rpc/profile-worker.js', 'tests/e2e/puppeteer-helper.js', 'package-lock.json', 'node_modules/puppeteer-core/package.json'])
    hashes[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
try {
    ({browser, userDataDir} = await launchBrowser('worker-rpc-cpu'));
    for (const hooks of [false, true]) for (const textBytes of [1024, 65536]) for (const concurrency of [1, 16, 64]) {
        const page = await browser.newPage();
        await page.goto(origin);
        // Dedicated Workers belong to Page.workers(), not Browser.targets().
        const workerCreated = new Promise(resolve => page.once('workercreated', resolve));
        await page.evaluate(async hooks => {
            const {CrossBus, MessageChannelTransport} = await import('/benchmarks/worker-rpc/baseline/crossbus.js');
            const worker = new Worker('/experiments/worker-rpc/profile-worker.js', {type: 'module'});
            const {port1, port2} = new MessageChannel();
            const ready = new Promise((resolve, reject) => {
                worker.onmessage = e => e.data.ready ? resolve() : reject(Error('Worker not ready'));
                worker.onerror = e => reject(Error(e.message));
            });
            worker.postMessage({port: port2, hooks}, [port2]);
            const bus = CrossBus.createSecure({peerId: 'client', allowedOrigins: ['channel']});
            bus.addTransport(MessageChannelTransport.fromPort(port1), {peerId: 'service', origin: 'channel'});
            if (hooks) { bus.addInboundHook(async value => value); bus.addOutboundHook(async value => value); }
            await ready; window.profilePair = {worker, bus};
        }, hooks);
        const worker = await workerCreated;
        assert.ok(worker.url().endsWith('/profile-worker.js'));
        const clients = [await page.createCDPSession(), worker.client];
        const spec = {hooks, textBytes, concurrency};
        // Warmup is outside the sampled interval; all results remain checked.
        await page.evaluate(async ({textBytes, concurrency}) => {
            const values = Array.from({length: concurrency}, (_,n) => ({n, text: 'x'.repeat(textBytes)}));
            for (let i = 0; i < 4096; i += concurrency) {
                const result = await Promise.all(values.map(v => window.profilePair.bus.request('service', 'echo', v)));
                for (let n = 0; n < result.length; n++) if (result[n].n !== n || result[n].text !== values[n].text) throw Error('Wrong warmup result');
            }
        }, spec);
        for (const client of clients) {
            await client.send('Profiler.enable');
            await client.send('Profiler.setSamplingInterval', {interval: 100});
            await client.send('Profiler.start');
        }
        const checked = await page.evaluate(async ({textBytes, concurrency}) => {
            const values = Array.from({length: concurrency}, (_,n) => ({n, text: 'x'.repeat(textBytes)}));
            const iterations = 32768;
            for (let i = 0; i < iterations; i += concurrency) {
                const result = await Promise.all(values.map(v => window.profilePair.bus.request('service', 'echo', v)));
                for (let n = 0; n < result.length; n++) if (result[n].n !== n || result[n].text !== values[n].text) throw Error('Wrong sampled result');
            }
            const remote = await window.profilePair.bus.request('service', 'stats');
            if (remote !== 4096 + iterations) throw Error('Remote invocation count mismatch');
            return iterations;
        }, spec);
        for (let side = 0; side < clients.length; side++) {
            const {profile} = await clients[side].send('Profiler.stop');
            const times = new Map();
            for (let i = 0; i < profile.samples.length; i++) times.set(profile.samples[i], (times.get(profile.samples[i]) ?? 0) + profile.timeDeltas[i]);
            const frames = profile.nodes.map(node => ({name: node.callFrame.functionName || '(anonymous)', url: node.callFrame.url.replaceAll(origin, ''), line: node.callFrame.lineNumber + 1, selfUs: times.get(node.id) ?? 0})).sort((a,b) => b.selfUs - a.selfUs);
            for (const node of profile.nodes) node.callFrame.url = node.callFrame.url.replaceAll(origin, '');
            const filename = `stock-${hooks ? 'hooks' : 'plain'}-${textBytes}-${concurrency}-${side ? 'worker' : 'client'}.cpuprofile`;
            await writeFile(new URL(filename, output), JSON.stringify(profile) + '\n');
            const summary = {...spec, side: side ? 'worker' : 'client', checked, filename, sampledUs: [...times.values()].reduce((a,b) => a+b,0), frames: frames.slice(0,25)};
            summaries.push(summary); console.log(filename, JSON.stringify(frames.slice(0,5)));
            await clients[side].send('Profiler.disable');
            // The Worker session is owned by Puppeteer and closed with the page.
            if (side === 0) await clients[side].detach();
        }
        await page.evaluate(() => { window.profilePair.bus.destroy(); window.profilePair.worker.terminate(); });
        await page.close();
    }
    assert.equal(summaries.length, 24);
    await writeFile(new URL('summary.json', output), JSON.stringify({runtime: await browser.version(), cpu: cpus()[0].model, hashes, caution: 'Unminified stock diagnostic CPU sampling at 100us, after warmup; sampling perturbs execution and does not measure uninstrumented throughput. Idle and GC samples retained. Frame self times are samples, not exact native serialization or scheduling cost.', results: summaries}, null, 2) + '\n');
} finally {
    await closeBrowser(browser, userDataDir);
    await new Promise(resolve => server.close(resolve));
}
