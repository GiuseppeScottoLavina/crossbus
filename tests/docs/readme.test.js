import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';

const root = new URL('../../', import.meta.url);
let browser, userDataDir, app, widget;
const sources = {};
function server(role) {
    return createServer(async (req, res) => {
        try {
            const path = new URL(req.url, 'http://local').pathname;
            if (path === '/' || path === '/widget.html') {
                res.setHeader('Content-Type', 'text/html');
                res.end(`<!doctype html><html lang="en"><output id="result"></output><script type="importmap">{"imports":{"crossbus":"/dist/crossbus.js"}}</script><script type="module" src="/${role}.js"></script></html>`);
            } else if (path === `/${role}.js`) {
                res.setHeader('Content-Type', 'application/javascript'); res.end(sources[role]);
            } else if (path === '/dist/crossbus.js') {
                res.setHeader('Content-Type', 'application/javascript'); res.end(await readFile(new URL(`.${path}`, root)));
            } else { res.writeHead(404); res.end(); }
        } catch (error) { res.writeHead(500); res.end(String(error)); }
    });
}

describe('README iframe example', () => {
    beforeAll(async () => {
        app = server('hub'); widget = server('widget');
        await Promise.all([new Promise(resolve => app.listen(0, '127.0.0.1', resolve)), new Promise(resolve => widget.listen(0, '127.0.0.1', resolve))]);
        const origins = { app: `http://127.0.0.1:${app.address().port}`, widget: `http://127.0.0.1:${widget.address().port}` };
        for (const role of ['hub', 'widget']) {
            sources[role] = (await readFile(new URL(`examples/quickstart/${role}.js`, root), 'utf8'))
                .replaceAll('https://widget.example.com', origins.widget).replaceAll('https://app.example.com', origins.app);
        }
        ({ browser, userDataDir } = await launchBrowser('readme'));
    }, 15000);
    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        await Promise.all([app, widget].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
    });
    it('keeps the README modules identical to the executable example', async () => {
        const readme = await readFile(new URL('README.md', root), 'utf8');
        const blocks = [...readme.matchAll(/```js\n([\s\S]*?)\n```/g)];
        expect(blocks[0][1].trim()).toBe((await readFile(new URL('examples/quickstart/hub.js', root), 'utf8')).trim());
        expect(blocks[1][1].trim()).toBe((await readFile(new URL('examples/quickstart/widget.js', root), 'utf8')).trim());
    });
    it('completes RPC across different origins on cold and warm page loads', async () => {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            for (let run = 0; run < 3; run++) {
                await page.goto(`http://127.0.0.1:${app.address().port}/`);
                await page.waitForFunction(() => {
                    const frame = document.querySelector('iframe');
                    return frame !== null;
                });
                const frame = await (await page.$('iframe')).contentFrame();
                await frame.waitForFunction(() => document.querySelector('#result')?.textContent.includes('ready'));
                expect(JSON.parse(await frame.$eval('#result', element => element.textContent))).toEqual({ id: 123, status: 'ready' });
                expect(new URL(frame.url()).port).not.toBe(String(app.address().port));
            }
            expect(errors).toEqual([]);
        } finally { await page.close(); }
    }, 15000);
});
