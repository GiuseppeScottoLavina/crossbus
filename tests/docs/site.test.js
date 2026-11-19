// The Pages site shell: shared chrome, the live home page, the documentation
// viewer, and layout at phone and desktop widths, served from docs/ alone.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';
import { PAGES, render } from '../../scripts/site-chrome.js';

const root = new URL('../../', import.meta.url);
const docs = new URL('docs/', root);
const TYPES = { js: 'text/javascript', css: 'text/css', html: 'text/html', png: 'image/png', md: 'text/markdown', map: 'application/json' };
let server, browser, userDataDir, base;
const pageErrors = [];

async function open(path, width = 1280) {
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(`${path}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(`${path}: ${message.text()}`); });
    await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
    // Fonts come from Google Fonts; the site must not depend on them.
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(base) ? request.continue() : request.respond({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(base + path, { waitUntil: 'networkidle0' });
    return page;
}

describe('Pages site', () => {
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
        ({ browser, userDataDir } = await launchBrowser('site'));
    }, 20000);
    afterEach(() => { expect(pageErrors.splice(0)).toEqual([]); });
    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        await new Promise(resolve => server.close(resolve));
    });

    it('keeps the shared header and footer identical on every page', async () => {
        const stale = [];
        for (const [file, page] of Object.entries(PAGES)) {
            const html = await readFile(new URL(file, root), 'utf8');
            if (render(html, page) !== html) stale.push(file);
        }
        expect(stale).toEqual([]);
    });

    it('runs the home page against a real Worker and shows the code it runs', async () => {
        const page = await open('');
        try {
            await page.waitForFunction(() => Number(document.body.dataset.live) >= 2, { timeout: 15000 });
            expect(await page.$eval('#hero-status', el => el.textContent)).toMatch(/requests answered by a module Worker · [\d,]+ primes below/);
            expect(Number(await page.$eval('#trace .k-res b', el => el.textContent))).toBeGreaterThanOrEqual(2);
            expect(await page.$eval('#src-page pre', el => el.textContent)).toContain("bus.request('worker', 'primes', { below })");
            await page.click('#tab-worker');
            expect(await page.$eval('#src-worker', el => el.hidden)).toBe(false);
            expect(await page.$eval('#src-page', el => el.hidden)).toBe(true);
            expect(await page.$eval('#src-worker pre', el => el.textContent)).toContain("bus.handle('primes'");
            expect(await page.$eval('.site-nav', el => el.querySelector('[aria-current]'))).toBeNull();
        } finally { await page.close(); }
    }, 30000);

    it('renders documentation with a contents list, scrollable tables and the right section marked', async () => {
        const page = await open('doc.html?file=API.md');
        try {
            await page.waitForFunction(() => document.querySelector('#content h1')?.textContent === 'CrossBus API');
            expect(await page.title()).toBe('CrossBus API — CrossBus docs');
            expect(await page.$eval('.site-nav [aria-current]', el => el.dataset.nav)).toBe('api');
            expect(await page.$eval('.docs-nav [aria-current="page"]', el => el.textContent)).toBe('API reference');
            expect(await page.$$eval('#toc a', links => links.length)).toBeGreaterThan(5);
            expect(await page.$$eval('#content table', tables => tables.every(table => table.parentElement.classList.contains('table-scroll')))).toBe(true);
            expect(await page.$eval('#content pre code', el => el.querySelector('.tok-k') !== null)).toBe(true);
            expect(await page.$eval('#doc-source', el => el.href)).toBe('https://github.com/GiuseppeScottoLavina/crossbus/blob/master/docs/API.md');
        } finally { await page.close(); }
    }, 30000);

    it('opens the documentation menu from a button on a phone', async () => {
        const page = await open('doc.html?file=STREAMING.md', 390);
        try {
            await page.waitForFunction(() => document.querySelector('#content h1'));
            expect(await page.$eval('#docs-nav', el => getComputedStyle(el).display)).toBe('none');
            await page.click('.docs-menu');
            expect(await page.$eval('#docs-nav', el => getComputedStyle(el).display)).toBe('block');
            expect(await page.$eval('.docs-menu', el => el.getAttribute('aria-expanded'))).toBe('true');
        } finally { await page.close(); }
    }, 30000);

    for (const width of [390, 1280]) {
        it(`fits every page in ${width} px without sideways scrolling`, async () => {
            const overflow = {};
            for (const path of ['', 'doc.html?file=API.md', 'doc.html?file=BENCHMARKS.md', 'playground.html', 'demos/', 'demos/worker-pool.html', 'demos/tabs.html', 'demos/secure-channel.html']) {
                const page = await open(path, width);
                try {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                    if (extra > 0) overflow[path || 'home'] = extra;
                } finally { await page.close(); }
            }
            expect(overflow).toEqual({});
        }, 90000);
    }
});
