// Signal fan-out over real MessageChannels and local emit; correctness-checked. Works in Node/Bun/browser.
const stats = v => { const s=[...v].sort((a,b)=>a-b); return { median:s[s.length>>>1], min:s[0], max:s.at(-1), samples:v }; };
export async function runLocal({ artifact, samples=7, order=0 }) {
  const lib = await import(artifact);
  const results = [];
  const cases = [];
  // Signal fan-out: hub -> N receivers, each with one async listener reading event.data.payload.
  for (const peers of [1, 8]) cases.push({ name:`signal fan-out x${peers}`, iterations: 4096/peers|0, setup() {
    const hub = lib.CrossBus.createSecure({ peerId:'hub', allowedOrigins:['channel'] });
    const recv = []; let got = 0, sum = 0, resolve = null; const expect = { n: 0 };
    for (let i=0;i<peers;i++) {
      const t = new lib.MessageChannelTransport();
      hub.addTransport(t, { peerId:'p'+i, origin:'channel' });
      const b = lib.CrossBus.createSecure({ peerId:'p'+i, allowedOrigins:['channel'] });
      b.addTransport(lib.MessageChannelTransport.fromPort(t.remotePort), { peerId:'hub', origin:'channel' });
      b.on('tick', e => { if (e.data.source !== 'hub') throw Error('bad source'); sum += e.data.payload.value; if (++got === expect.n) resolve(); });
      recv.push(b);
    }
    const payload = { value: 3, text: 'x'.repeat(1024) };
    return { async op() { got = 0; expect.n = peers; const p = new Promise(r => resolve = r); const r = await hub.signal('tick', payload); if (r.delivered !== peers) throw Error('delivery'); await p; },
      check(total) { if (sum !== total*peers*3) throw Error('signal checksum mismatch '+sum); }, close() { hub.destroy(); recv.forEach(b=>b.destroy()); } };
  }});
  // Local async emit() with 1 / 10 listeners (sync mode so the work is awaited) and emitSync.
  for (const n of [1, 10]) cases.push({ name:`emit() sync-mode x${n}`, iterations: 65536, setup() {
    const bus = new lib.EventEmitter(); let sum = 0; for (let i=0;i<n;i++) bus.on('e', ev => { sum += ev.data.v; }, { mode:'sync' });
    const data = { v: 1 };
    return { op: () => bus.emit('e', data), check(total){ if (sum !== total*n) throw Error('emit checksum'); }, close(){} };
  }});
  cases.push({ name:'emit() async-mode x1', iterations: 65536, setup() {
    const bus = new lib.EventEmitter(); let sum = 0; bus.on('e', ev => { sum += ev.data.v; });
    const data = { v: 1 };
    return { op: () => bus.emit('e', data), async check(total){ await new Promise(r=>setTimeout(r,0)); if (sum !== total) throw Error('emit async checksum'); }, close(){} };
  }});
  const sel = [...cases.slice(order % cases.length), ...cases.slice(0, order % cases.length)];
  const live = sel.map(c => ({ ...c, inst: c.setup(), rates: [], total: 0 }));
  const run = async (c, count) => { const s = performance.now(); for (let i=0;i<count;i++) await c.inst.op(); c.total += count; return count/(performance.now()-s)*1000; };
  for (const c of live) await run(c, c.iterations*2);
  for (let r=0;r<samples;r++) for (let o=0;o<live.length;o++) { const c = live[(r+o)%live.length]; c.rates.push(await run(c, c.iterations)); }
  for (const c of live) { await c.inst.check(c.total); c.inst.close(); results.push({ library: c.name, concurrency: 1, textBytes: 0, opsPerSecond: stats(c.rates) }); }
  return { results };
}
