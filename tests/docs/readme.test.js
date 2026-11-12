import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
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
