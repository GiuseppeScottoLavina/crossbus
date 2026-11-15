// Fresh headless Chrome per measurement. argv: tree artifactRel workload order outfile
import { createServer } from 'node:http';
import { readFile, writeFile, rm } from 'node:fs/promises';
const [,, tree, artifactRel, workload, order, out] = process.argv;
const R = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const puppeteer = (await import(R + '/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const { findChrome } = await import(R + '/tests/e2e/puppeteer-helper.js');
const tools = new URL('./', import.meta.url).pathname;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>ab</title>'); return; }
    const file = path.startsWith('/__tools/') ? tools + path.slice(9) : tree + path;
    res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const userDataDir = (await import('node:os')).tmpdir() + '/crossbus-ab-chrome-' + process.pid;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || findChrome(), headless: true, args: ['--no-sandbox'], userDataDir });
try {
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const names = (process.env.NAMES ?? 'CrossBus,CrossBus + async hooks,CrossBus compact v2,CrossBus compact v2 + hooks').split(',');
  const results = await page.evaluate(async ({ workload, order, artifactRel, names, worker, iterations }) => {
    if (workload === 'local') return (await (await import('/__tools/local-workloads.js')).runLocal({ artifact: '/' + artifactRel, samples: 7, order })).results;
    const { runWorkloads } = await import('/experiments/rpc-wire-v2/workloads.js');
    return (await runWorkloads({ artifact: '/' + artifactRel, names, samples: 7, iterations, warmup: 8192, latencyGroups: 8, concurrencies: [1, 64], sizes: [1024], order, topology: worker ? 'worker' : 'local' })).results;
  }, { workload, order: Number(order), artifactRel, names, worker: process.env.WORKER === '1', iterations: Number(process.env.ITER ?? 16384) });
  await writeFile(out, JSON.stringify(results.map(r => ({ case: `${r.library} c=${r.concurrency} b=${r.textBytes}`, median: r.opsPerSecond.median, samples: r.opsPerSecond.samples }))));
} finally { await browser.close(); server.close(); await rm(userDataDir, { recursive: true, force: true }); }
process.exit(0);
