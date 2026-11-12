import { CrossBus, MessageChannelTransport } from '../../dist/crossbus.min.js';
import * as Comlink from '../../node_modules/comlink/dist/esm/comlink.mjs';
const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { median: sorted[sorted.length >>> 1], min: sorted[0], max: sorted.at(-1), samples: values }; };
function crossbus() {
    const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
    const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
    const transport = new MessageChannelTransport();
    a.addTransport(transport, { peerId: 'b', origin: 'channel' });
    b.addTransport(MessageChannelTransport.fromPort(transport.remotePort), { peerId: 'a', origin: 'channel' });
    b.handle('echo', value => value);
    return { call: value => a.request('b', 'echo', value), close() { a.destroy(); b.destroy(); } };
}
function comlink(cached) {
    const channel = new MessageChannel();
    Comlink.expose({ echo: value => value }, channel.port1);
    const remote = Comlink.wrap(channel.port2);
    const echo = cached ? remote.echo : null;
    return { call: cached ? value => echo(value) : value => remote.echo(value), close() {
        remote[Comlink.releaseProxy]();
        // Release is asynchronous; give its protocol response a turn before closing.
        setTimeout(() => { channel.port1.close(); channel.port2.close(); }, 0);
    } };
}
export async function runWorkloads() {
    const results = [];
    for (const textBytes of [0, 1024, 65536]) {
        const payload = { value: 7, text: 'x'.repeat(textBytes) };
        const cases = [
            { name: 'CrossBus', ...crossbus() },
            { name: 'Comlink', ...comlink(false) },
            { name: 'Comlink cached method', ...comlink(true) }
        ].map(item => ({ ...item, rates: [], millisecondsPerCall: [] }));
        const iterations = 1000, samples = 9;
        try {
            for (const item of cases) for (let warmup = 0; warmup < 100; warmup++) {
                const result = await item.call(payload);
                if (result.value !== 7 || result.text !== payload.text) throw new Error('Warmup response mismatch');
            }
            for (let round = 0; round < samples; round++) for (let offset = 0; offset < cases.length; offset++) {
                const item = cases[(round + offset) % cases.length];
                const start = performance.now();
                for (let call = 0; call < iterations; call++) {
                    const result = await item.call(payload);
                    if (result.value !== 7 || result.text !== payload.text) throw new Error('RPC response mismatch');
                }
                const elapsed = performance.now() - start;
                item.rates.push(iterations / elapsed * 1000);
                item.millisecondsPerCall.push(elapsed / iterations);
            }
            for (const item of cases) results.push({ library: item.name, transport: 'MessageChannel (both endpoints in one event loop)', textBytes,
                callsPerSample: iterations, opsPerSecond: stats(item.rates), meanMsPerCall: stats(item.millisecondsPerCall) });
        } finally { for (const item of cases) item.close(); }
    }
    return { methodology: { samples: 9, warmupCalls: 100, timer: 'batched performance.now; 1000 sequential calls per sample',
        order: 'rotating library order per round', payload: 'identical structured-cloned objects, checked on every response',
        topology: 'real MessageChannels, both endpoints in one event loop; excludes worker/iframe startup and scheduling',
        features: 'CrossBus default request/payload limits enabled; Comlink default protocol, with ordinary and cached method access. APIs and guarantees differ.' }, results };
}
