// One fresh-process measurement. argv: tree artifactRel workload order outfile
import { writeFile } from 'node:fs/promises';
const [,, tree, artifactRel, workload, order, out] = process.argv;
const artifact = 'file://' + tree + '/' + artifactRel;
let report;
if (workload === 'rpc' || workload === 'rpc-big') {
  const { runWorkloads } = await import('file://' + tree + '/experiments/rpc-wire-v2/workloads.js');
  const names = (process.env.NAMES ?? 'CrossBus,CrossBus + async hooks,CrossBus compact v2,CrossBus compact v2 + hooks').split(',');
  report = await runWorkloads({ artifact, names, samples: 7, iterations: 4096, warmup: 8192, latencyGroups: 8, concurrencies: [1, 64], sizes: workload === 'rpc' ? [1024] : [0, 65536], order: Number(order) });
} else {
  const { runLocal } = await import(new URL('./local-workloads.js', import.meta.url));
  report = await runLocal({ artifact, samples: 7, order: Number(order) });
}
await writeFile(out, JSON.stringify(report.results.map(r => ({ case: `${r.library} c=${r.concurrency} b=${r.textBytes}`, median: r.opsPerSecond.median, samples: r.opsPerSecond.samples }))));
process.exit(0);
