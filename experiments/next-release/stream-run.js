import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { createServer } from 'node:http';
import { runStreams } from './stream-workloads.js';
import { launchBrowser, closeBrowser } from '../../tests/e2e/puppeteer-helper.js';
const root = new URL('../../', import.meta.url);
const [variant, roundText, output] = process.argv.slice(2);
const round = Number(roundText);
if (!['baseline', 'candidate'].includes(variant) || ![1, 2, 3].includes(round) || !output)
    throw Error('Expected variant round fresh-output');
const artifact = 'benchmarks/next-release/' + variant + '/crossbus.min.js';
const hashes = {};
for (const file of [
    artifact,
    'package-lock.json',
    'experiments/next-release/stream-workloads.js',
    'experiments/next-release/stream-run.js',
    'experiments/next-release/stream-isolated.js',
    'tests/e2e/puppeteer-helper.js'
])
    hashes[file] = createHash('sha256')
        .update(await readFile(new URL(file, root)))
        .digest('hex');
let report,
    runtime = typeof Bun === 'undefined' ? 'Node ' + process.version : 'Bun ' + Bun.version;
if (process.argv.includes('--browser')) {
    const server = createServer(async (req, res) => {
        try {
            const file = new URL('.' + new URL(req.url, 'http://local').pathname, root);
            if (!file.href.startsWith(root.href)) throw Error('Invalid path');
            if (file.href === root.href) {
                res.end('<!doctype html><title>Binary stream comparison</title>');
                return;
            }
            res.setHeader('Content-Type', 'text/javascript');
            res.end(await readFile(file));
        } catch {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let browser, userDataDir;
    try {
        ({ browser, userDataDir } = await launchBrowser('stream-comparison'));
        runtime = await browser.version();
        const page = await browser.newPage();
        await page.goto('http://127.0.0.1:' + server.address().port);
        report = await page.evaluate(
            async ({ artifact, variant, round }) =>
                (await import('/experiments/next-release/stream-workloads.js')).runStreams(
                    '/' + artifact,
                    variant,
                    round - 1
                ),
            { artifact, variant, round }
        );
    } finally {
        await closeBrowser(browser, userDataDir);
        await new Promise((resolve) => server.close(resolve));
    }
} else report = await runStreams(new URL(artifact, root).href, variant, round - 1);
await writeFile(
    output,
    JSON.stringify({
        metadata: {
            timestamp: new Date().toISOString(),
            runtime,
            cpu: cpus()[0].model,
            variant,
            round,
            hashes
        },
        ...report
    }) + '\n',
    { flag: 'wx' }
);
console.table(
    report.results.map((r) => ({
        bytes: r.bytes,
        mode: r.mode,
        MiBps: Math.round(r.mebibytesPerSecond.median)
    }))
);
