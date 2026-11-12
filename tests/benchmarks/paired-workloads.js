// Alternating, same-process comparisons of preserved baseline and candidate bundles.
import * as before from '../../benchmarks/before-optimization/crossbus.min.js';
import * as after from '../../dist/crossbus.min.js';
import { createNanoEmitter as beforeNano } from '../../benchmarks/before-optimization/nano.min.js';
import { createNanoEmitter as afterNano } from '../../dist/nano.min.js';

const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { median: sorted[values.length >>> 1], min: sorted[0], max: sorted.at(-1), samples: values }; };
export async function runWorkloads({ variant } = {}) {
    const samples = 9;
    const results = [];
    const definitions = [
        ['emitSync:1', 'sync', 1, 2000000], ['emitSync:10', 'sync', 10, 1000000],
        ['fast:subscribe+unsubscribe', 'churn', 0, 1000000],
        ['nano:1', 'nano', 1, 2000000], ['nano:10', 'nano', 10, 1000000],
        ['emit:no-listeners', 'empty', 0, 20000],
        ['pending:create+resolve', 'pending', 0, 20000],
        ['signal:1-peer', 'signal', 1, 20000], ['signal:10-peers', 'signal', 10, 20000],
        ['rpc:direct', 'rpc', 0, 10000], ['rpc:MessageChannel', 'channel', 0, 1500],
        ['rpc:MessageChannel+hooks', 'hooks', 0, 1500]
    ];
    for (const [name, mode, listeners, count] of definitions) {
        const libraries = variant === 'baseline' ? [before] : variant === 'candidate' ? [after] : [before, after];
        const cases = libraries.map(library => {
            const bus = new library.EventEmitter(); bus.setMaxListeners(0);
            const nano = library === after ? afterNano() : beforeNano();
            const pending = new library.PendingRequests();
            const a = new library.CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
            const b = new library.CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
            const payload = { value: 7 };
            let calls = 0, checksum = 0, hookCalls = 0;
            const handler = data => { calls++; checksum += data.value; };
            for (let i = 0; i < listeners; i++) {
                bus.onFast('event', handler); nano.on('event', handler);
                a.addPeer(`peer-${i}`, message => handler(message.payload.data));
            }
            if (mode === 'channel' || mode === 'hooks') {
                const transport = new library.MessageChannelTransport();
                a.addTransport(transport, { peerId: 'b', origin: 'channel' });
                b.addTransport(library.MessageChannelTransport.fromPort(transport.remotePort), { peerId: 'a', origin: 'channel' });
            } else if (mode === 'rpc') {
                a.addPeer('b', message => { void b.handleMessage(message, 'channel', 'a'); });
                b.addPeer('a', message => { void a.handleMessage(message, 'channel', 'b'); });
            }
            b.handle('echo', value => value);
            if (mode === 'hooks') for (const peer of [a, b]) {
                peer.addInboundHook(async value => { hookCalls++; return value; });
                peer.addOutboundHook(async value => { hookCalls++; return value; });
            }
            const run = async () => {
                const started = performance.now();
                if (mode === 'sync') for (let i = 0; i < count; i++) bus.emitSync('event', payload);
                else if (mode === 'nano') for (let i = 0; i < count; i++) nano.emit('event', payload);
                else if (mode === 'churn') for (let i = 0; i < count; i++) bus.onFast('temporary', handler)();
                else if (mode === 'empty') for (let i = 0; i < count; i++) {
                    if (await bus.emit('empty', payload) !== 0) throw new Error('Unexpected listener');
                }
                else if (mode === 'pending') for (let i = 0; i < count; i++) {
                    const request = pending.create('peer', 'echo');
                    pending.resolve(request.requestId, { success: true, data: 7 });
                    if (await request.promise !== 7) throw new Error('Pending response mismatch');
                }
                else if (mode === 'signal') for (let i = 0; i < count; i++) {
                    if ((await a.signal('tick', payload)).delivered !== listeners) throw new Error('Signal lost');
                }
                else for (let i = 0; i < count; i++) {
                    const result = await a.request('b', 'echo', payload, { timeout: 3000 });
                    if (result.value !== 7) throw new Error('RPC mismatch');
                }
                return count / (performance.now() - started) * 1000;
            };
            return { run, values: [], finish() {
                const expected = ['sync', 'nano', 'signal'].includes(mode) ? (samples + 1) * count * listeners : 0;
                if (calls !== expected || checksum !== calls * 7) throw new Error(`${name}: callback work mismatch`);
                if (mode === 'hooks' && hookCalls !== (samples + 1) * count * 4) throw new Error('Hooks were skipped');
                if (pending.size !== 0 || a.healthCheck().pendingRequests !== 0) throw new Error('Pending request leaked');
                a.destroy(); b.destroy(); bus.clear(); pending.cancelAll();
            }};
        });
        try {
            for (let round = -1; round < samples; round++) for (let offset = 0; offset < cases.length; offset++) {
                const item = cases[(offset + Math.max(0, round)) % cases.length];
                const value = await item.run();
                if (round >= 0) item.values.push(value);
            }
            if (variant) results.push({ workload: name, iterationsPerSample: count, opsPerSecond: stats(cases[0].values) });
            else {
                const baseline = stats(cases[0].values), candidate = stats(cases[1].values);
                results.push({ workload: name, iterationsPerSample: count, baselineOps: baseline,
                    candidateOps: candidate, ratio: candidate.median / baseline.median });
            }
        } finally { for (const item of cases) item.finish(); }
    }
    return { methodology: { samples, variant: variant ?? 'paired', order: variant ? 'single variant in a fresh process; one warmup round' : 'alternating baseline/candidate each round, one warmup round',
        artifacts: 'preserved pre-change minified bundle versus rebuilt minified candidate',
        correctness: 'verified callback counts, checksums, hook invocations, response contents and pending cleanup' }, results };
}
