// Runs the live demos from the published Pages folder alone, in Chrome.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';

const root = new URL('../../', import.meta.url);
const docs = new URL('docs/', root);
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', png: 'image/png', jpg: 'image/jpeg', map: 'application/json' };
let server, browser, userDataDir, base;
const pageErrors = [];

async function open(path) {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(`${path}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(`${path}: ${message.text()}`); });
    await page.setViewport({ width: 1280, height: 900 });
    // Fonts come from Google Fonts; the demos must not depend on them.
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(base) ? request.continue() : request.respond({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(base + path);
    return page;
}

describe('live demos on the Pages source', () => {
    beforeAll(async () => {
        server = createServer(async (req, res) => {
            try {
                const pathname = new URL(req.url, 'http://local').pathname;
                const file = new URL(`.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`, docs);
                if (!file.href.startsWith(docs.href)) { res.writeHead(403); res.end(); return; }
                res.setHeader('Content-Type', TYPES[file.pathname.split('.').pop()] ?? 'application/octet-stream');
                res.end(await readFile(file));
            } catch { res.writeHead(404); res.end(); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${server.address().port}/`;
        ({ browser, userDataDir } = await launchBrowser('demos'));
    }, 20000);
    afterEach(() => { expect(pageErrors.splice(0)).toEqual([]); });
    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        await new Promise(resolve => server.close(resolve));
    });

    it('ships the exact encryption plugin bundle', async () => {
        const [published, built] = await Promise.all([
            readFile(new URL('assets/plugins/encryption.min.js', docs)),
            readFile(new URL('dist/plugins/encryption.min.js', root))
        ]);
        expect(published.equals(built)).toBe(true);
    });

    it('streams live Worker round trips on the index', async () => {
        const page = await open('demos/');
        try {
            await page.waitForFunction(() => Number(document.body.dataset.live) >= 3, { timeout: 15000 });
            expect(await page.$eval('#hero-status', el => el.textContent)).toContain('answered by a module Worker');
            expect(Number(await page.$eval('#trace .k-res b', el => el.textContent))).toBeGreaterThanOrEqual(3);
        } finally { await page.close(); }
    }, 30000);

    it('renders the fractal on Workers, with compact-v2 and on the main thread', async () => {
        const page = await open('demos/worker-pool.html');
        try {
            const rendered = async previous => {
                await page.waitForFunction(value => Number(document.querySelector('#fractal').dataset.rendered) > value, { timeout: 20000 }, previous);
                return Number(await page.$eval('#fractal', el => el.dataset.rendered));
            };
            let generation = await rendered(0);
            const tiles = await page.$eval('#r-tiles', el => el.textContent);
            expect(tiles).toMatch(/^(\d+)\/ \1$/);
            expect(await page.$eval('#r-by', el => el.textContent)).toMatch(/Workers?$/);
            // Pixels arrived: the centre of the set is the inside colour, not blank.
            expect(await page.$eval('#fractal', el => [...el.getContext('2d').getImageData(el.width / 2, el.height / 2, 1, 1).data])).toEqual([8, 14, 20, 255]);
            await page.click('input[name="wire"][value="compact-v2"]');
            generation = await rendered(generation);
            expect(await page.$eval('#src-worker pre', el => el.textContent)).toContain("bus.handle('tile'");
            // Restart the pool while a render is in flight: its cancelled requests must not surface as errors.
            await page.click('#again');
            await page.click('input[name="wire"][value="standard"]');
            generation = await rendered(generation);
            await page.click('input[name="runon"][value="main"]');
            generation = await rendered(generation);
            expect(await page.$eval('#r-by', el => el.textContent)).toBe('Main thread');
            expect(Number(await page.$eval('#trace .k-req b', el => el.textContent))).toBeGreaterThan(0);
            // Zoom stops before 64-bit floats run out, instead of drawing blocks.
            for (let i = 0; i < 60 && !(await page.$eval('#zoom-in', el => el.disabled)); i++) await page.click('#zoom-in');
            expect(await page.$eval('#zoom-in', el => el.disabled)).toBe(true);
            expect(await page.$eval('#coords', el => el.textContent)).toContain('deepest zoom');
            expect(await page.$eval('#fractal', el => el.dataset.deepest)).toBe('true');
            await page.click('#reset');
            expect(await page.$eval('#zoom-in', el => el.disabled)).toBe(false);
        } finally { await page.close(); }
    }, 60000);

    it('keeps two tabs in sync', async () => {
        const first = await open('demos/tabs.html');
        await new Promise(resolve => setTimeout(resolve, 200));
        const second = await open('demos/tabs.html');
        try {
            for (const page of [first, second]) await page.waitForFunction(() => document.querySelectorAll('#tab-list li').length === 2, { timeout: 10000 });
            // A colour clash is resolved by the newer tab.
            await new Promise(resolve => setTimeout(resolve, 300));
            const settled = await Promise.all([first, second].map(page => page.$eval('#me-swatch', el => el.style.background)));
            expect(settled[0]).not.toBe(settled[1]);
            const box = await (await first.$('#board')).boundingBox();
            await first.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
            await first.mouse.down();
            for (let i = 1; i <= 20; i++) await first.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.5 - i * 0.01));
            await first.mouse.up();
            await second.waitForFunction(() => document.querySelector('#empty').hidden, { timeout: 5000 });
            // The stroke was drawn on the second tab's own canvas.
            const inked = await second.$eval('#board', el => {
                const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
                let count = 0;
                for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
                return count;
            });
            expect(inked).toBeGreaterThan(200);
            await first.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);
            await second.waitForFunction(() => document.querySelector('.cursor:not([hidden])'), { timeout: 5000 });
            // A tab that joins later receives the drawing as a snapshot.
            const third = await open('demos/tabs.html');
            try {
                await third.waitForFunction(() => document.querySelector('#empty').hidden, { timeout: 8000 });
            } finally { await third.close(); }
        } finally { await first.close(); await second.close(); }
    }, 60000);

    it('refuses wire attacks when encrypted and shows them succeed in plaintext', async () => {
        const page = await open('demos/secure-channel.html');
        try {
            const attack = async () => {
                await page.click('#pay');
                await page.waitForFunction(() => document.querySelector('#client-result').textContent.startsWith('Sent'));
                for (const name of ['replay', 'forge', 'tamper']) {
                    await page.click(`#attack-${name}`);
                    await page.waitForFunction(() => !document.querySelector('#attempts li[data-status="pending"]'), { timeout: 5000 });
                }
                return page.$$eval('#attempts li', items => items.map(item => [item.dataset.status, item.querySelector('.badge').textContent]));
            };
            await page.waitForFunction(() => document.body.dataset.ready === 'true');
            expect(await attack()).toEqual([
                ['refused', 'Refused · ERR_DECRYPTION_FAILED'],
                ['refused', 'Refused · ERR_ENCRYPTION_REQUIRED'],
                ['refused', 'Refused · ERR_REPLAY_DETECTED']
            ]);
            expect(await page.$eval('#balance', el => el.textContent)).toBe('€975.00');
            expect(await page.$eval('#wire', el => el.textContent)).not.toContain('Alex');

            await page.click('input[name="encryption"][value="off"]');
            await page.waitForFunction(() => document.body.dataset.encrypted === 'false' && !document.querySelector('#attempts li'));
            expect((await attack()).map(([status]) => status)).toEqual(['accepted', 'accepted', 'accepted']);
            expect(await page.$eval('#balance', el => el.textContent)).toBe('€50.00');
            expect(await page.$eval('#src-wiring pre', el => el.textContent)).toContain('withEncryption(client, key)');
        } finally { await page.close(); }
    }, 60000);
});
