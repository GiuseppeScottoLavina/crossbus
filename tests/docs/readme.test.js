import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';
import { startQuickstart } from '../../examples/quickstart/server.js';

const root = new URL('../../', import.meta.url);
let browser, userDataDir, demo;

describe('README executable examples', () => {
    beforeAll(async () => {
        demo = await startQuickstart({ appPort: 0, widgetPort: 0 });
        ({ browser, userDataDir } = await launchBrowser('readme'));
    }, 15000);
    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        await demo?.close();
    });
    it('runs the exact README RPC module in Node without a bundler', async () => {
        const readme = await readFile(new URL('README.md', root), 'utf8');
        const block = readme.match(/```js\n([\s\S]*?)\n```/)[1];
        expect(block.trim()).toBe((await readFile(new URL('examples/quickstart/rpc.mjs', root), 'utf8')).trim());
        const { stdout, stderr } = await promisify(execFile)('node', [fileURLToPath(new URL('examples/quickstart/rpc.mjs', root))], { timeout: 5000 });
        expect(stdout.trim()).toBe('5');
        expect(stderr).toBe('');
    });
    it('loads the shipped HTML/modules and completes cross-origin RPC on repeated loads', async () => {
        const page = await browser.newPage();
        const errors = [];
        const failed = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => failed.push(request.url()));
        try {
            for (let run = 0; run < 3; run++) {
                await page.goto(demo.app);
                await page.waitForSelector('iframe');
                const frame = await (await page.$('iframe')).contentFrame();
                await frame.waitForFunction(() => document.querySelector('#result')?.textContent.includes('ready'));
                expect(JSON.parse(await frame.$eval('#result', element => element.textContent))).toEqual({ id: 123, status: 'ready' });
                expect(new URL(frame.url()).origin).toBe(demo.widget);
                expect(demo.app).not.toBe(demo.widget);
            }
            expect(errors).toEqual([]);
            expect(failed).toEqual([]);
        } finally { await page.close(); }
    }, 15000);
});

it('runs the development compact-v2 example against the checkout package', async () => {
    const {stdout,stderr}=await promisify(execFile)('node',[fileURLToPath(new URL('examples/quickstart/rpc-compact-v2.mjs',root))],{timeout:5000});
    expect(stdout.trim()).toBe('5');expect(stderr).toBe('');
});

// Runs the README's inline browser snippets (iframe pair and Worker pair) in Chrome.
// Each block is selected by its first-line file comment. The page uses an import map;
// module Workers ignore import maps, so worker code gets the bundle path substituted
// for the bare 'crossbus' specifier. Placeholder origins are replaced with local ones.
describe('README inline browser snippets', () => {
    let snippetBrowser, snippetDir, servers = [];
    const bundle = () => readFile(new URL('dist/crossbus.js', root), 'utf8');
    const snippet = (readme, file) => {
        const block = [...readme.matchAll(/```js\n([\s\S]*?)\n```/g)].map(match => match[1])
            .find(code => code.startsWith(`// ${file}`));
        if (!block) throw new Error(`README snippet ${file} not found`);
        return block;
    };
    const page = (module) => `<!doctype html><meta charset="utf-8">
<script>window.__logs=[];const log=console.log;console.log=(...args)=>{window.__logs.push(args);log(...args);};</script>
<script type="importmap">{"imports":{"crossbus":"/crossbus.js"}}</script>
<script type="module" src="/${module}"></script>`;
    const serve = routes => new Promise(resolve => {
        const server = createServer(async (request, response) => {
            const path = new URL(request.url, 'http://127.0.0.1').pathname;
            const route = routes[path];
            if (!route) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', route[0]);
            response.end(await route[1]());
        }).listen(0, '127.0.0.1', () => resolve(server));
        servers.push(server);
    });
    const html = 'text/html; charset=utf-8', js = 'text/javascript; charset=utf-8';
    beforeAll(async () => {
        ({ browser: snippetBrowser, userDataDir: snippetDir } = await launchBrowser('readme-snippets'));
    }, 15000);
    afterAll(async () => {
        await closeBrowser(snippetBrowser, snippetDir);
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    });

    it('connects the parent page and cross-origin iframe snippets', async () => {
        const readme = await readFile(new URL('README.md', root), 'utf8');
        let appOrigin, widgetOrigin;
        const localize = code => code.replace("'https://widget.example.com'", JSON.stringify(widgetOrigin))
            .replace("'https://app.example.com'", JSON.stringify(appOrigin));
        const app = await serve({
            '/': [html, async () => page('app.js')], '/crossbus.js': [js, bundle],
            '/app.js': [js, async () => localize(snippet(readme, 'app.js'))]
        });
        const widget = await serve({
            '/widget.html': [html, async () => page('widget.js')], '/crossbus.js': [js, bundle],
            '/widget.js': [js, async () => localize(snippet(readme, 'widget.js'))]
        });
        appOrigin = `http://127.0.0.1:${app.address().port}`;
        widgetOrigin = `http://127.0.0.1:${widget.address().port}`;
        const tab = await snippetBrowser.newPage();
        const errors = [];
        tab.on('pageerror', error => errors.push(error.message));
        try {
            await tab.goto(`${appOrigin}/`);
            await tab.waitForSelector('iframe');
            const frame = await (await tab.$('iframe')).contentFrame();
            await frame.waitForFunction(() => window.__logs?.length > 0, { timeout: 10000 });
            expect(await frame.evaluate(() => window.__logs)).toEqual([[{ id: 123, status: 'ready' }]]);
            expect(new URL(frame.url()).origin).toBe(widgetOrigin);
            expect(errors).toEqual([]);
        } finally { await tab.close(); }
    }, 20000);

    it('runs the Worker snippets over a transferred MessageChannel', async () => {
        const readme = await readFile(new URL('README.md', root), 'utf8');
        const worker = snippet(readme, 'worker.js');
        expect(worker).toContain("from 'crossbus'");
        const server = await serve({
            '/': [html, async () => page('main.js')], '/crossbus.js': [js, bundle],
            '/main.js': [js, async () => snippet(readme, 'main.js')],
            '/worker.js': [js, async () => worker.replace("from 'crossbus'", "from '/crossbus.js'")]
        });
        const tab = await snippetBrowser.newPage();
        const errors = [];
        tab.on('pageerror', error => errors.push(error.message));
        try {
            await tab.goto(`http://127.0.0.1:${server.address().port}/`);
            await tab.waitForFunction(() => window.__logs?.length > 0, { timeout: 10000 });
            expect(await tab.evaluate(() => window.__logs)).toEqual([[832040]]);
            expect(errors).toEqual([]);
        } finally { await tab.close(); }
    }, 20000);
});
