// Run explicitly with Node --expose-gc. Heap deltas are process observations,
// not exact object sizes or proof that every possible lifecycle is leak-free.
import { CrossBus } from '../../dist/crossbus.min.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
if (!global.gc) throw new Error('Run node --expose-gc tests/benchmarks/memory.js');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); global.gc(); global.gc(); };
const samples = [];
const count = 200;
for (let round = -1; round < 7; round++) {
    await settle();
    const before = process.memoryUsage().heapUsed;
    let buses = [], pending = [];
    let rejected = 0;
    for (let index = 0; index < count; index++) {
        const bus = new CrossBus({ peerId: `bus-${index}`, allowedOrigins: ['channel'] });
        for (let peer = 0; peer < 10; peer++) bus.addPeer(`peer-${peer}`, () => {});
        bus.handle('echo', value => value);
        buses.push(bus);
        pending.push(bus.request('peer-0', 'waiting', {}, { timeout: 60000 })
            .then(() => { throw new Error('Unexpected request success'); }, () => { rejected++; }));
    }
    await settle();
    const live = process.memoryUsage().heapUsed;
    const liveTimeouts = process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
    for (const bus of buses) bus.destroy();
    await Promise.all(pending);
    if (rejected !== count) throw new Error('Requests were not cancelled on destroy');
    buses = []; pending = [];
    await settle();
    const after = process.memoryUsage().heapUsed;
    const afterTimeouts = process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
    if (afterTimeouts !== 0) throw new Error('Request timeout resources survived destruction');
    if (round >= 0) samples.push({ beforeHeapBytes: before, liveHeapBytes: live, afterHeapBytes: after,
        liveDeltaBytes: live - before, afterDeltaBytes: after - before, liveTimeouts, afterTimeouts, cancelledRequests: rejected });
}
const bundle = await readFile(new URL('../../dist/crossbus.min.js', import.meta.url));
const script = await readFile(new URL('./memory.js', import.meta.url));
const result = { metadata: { timestamp: new Date().toISOString(), runtime: process.version, cpu: cpus()[0].model,
    bundleSha256: createHash('sha256').update(bundle).digest('hex'), scriptSha256: createHash('sha256').update(script).digest('hex') },
    methodology: { rounds: 7, warmupRounds: 1, buses: count, peersPerBus: 10, pendingRequestsPerBus: 1,
        gc: 'two explicit GC calls after draining async work at each observation',
        caution: 'Process heap deltas include allocator/JIT noise; negative deltas are retained. No universal per-object or leak-free claim.' }, samples };
await writeFile(new URL('../../benchmarks/memory-node.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.table(samples);
console.log('Saved benchmarks/memory-node.json; all pending requests cancelled and timeout resources returned to zero.');
