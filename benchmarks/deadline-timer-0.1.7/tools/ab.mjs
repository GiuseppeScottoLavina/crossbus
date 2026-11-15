// Paired fresh-process A/B coordinator. Alternates order; reports median paired ratio (B/A) and range.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const A = arg('--a'), B = arg('--b'), pairs = Number(arg('--pairs', '5')), runtime = arg('--runtime', 'node'), workload = arg('--workload', 'rpc'), tag = arg('--tag', 'run');
const artifactRel = arg('--artifact', 'dist/crossbus.min.js');
const outDir = new URL('../samples/' + tag + '/', import.meta.url).pathname; mkdirSync(outDir, { recursive: true });
const child = new URL(runtime === 'chrome' ? './child-browser.mjs' : './child.mjs', import.meta.url).pathname;
const exe = runtime === 'bun' ? 'bun' : 'node';
const data = { A: [], B: [] };
for (let p = 0; p < pairs; p++) {
  for (const v of p % 2 ? ['B', 'A'] : ['A', 'B']) {
    const out = `${outDir}${v}-${p}.json`;
    execFileSync(exe, [child, v === 'A' ? A : B, artifactRel, workload, String(p), out], { stdio: ['ignore', 'ignore', 'inherit'], env: process.env });
    data[v].push(Object.fromEntries(JSON.parse(readFileSync(out, 'utf8')).map(r => [r.case, r.median])));
  }
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
console.log(`\n${tag}: ${runtime} ${workload}, ${pairs} pairs, B=${B.split('/').pop()} vs A=${A.split('/').pop()}`);
const rows = [];
for (const c of Object.keys(data.A[0])) {
  const ratios = data.A.map((a, i) => data.B[i][c] / a[c]);
  rows.push({ case: c, A_ops: Math.round(med(data.A.map(x => x[c]))), B_ops: Math.round(med(data.B.map(x => x[c]))), ratio: med(ratios).toFixed(3), min: Math.min(...ratios).toFixed(3), max: Math.max(...ratios).toFixed(3), all: ratios.map(r => r.toFixed(3)).join(' ') });
}
console.table(rows);
