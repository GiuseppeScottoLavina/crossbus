/**
 * @fileoverview Puppeteer integration tests for CrossBus with Web Workers.
 * Tests communication between main thread and Web Worker.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';

const PORT = 8766; // Different port from iframe tests
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const TEST_URL = `http://localhost:${PORT}/tests/integration/worker-test.html`;

describe('CrossBus Worker Integration Tests', () => {
    let browser;
    let page;
    let server;
    let userDataDir;

    beforeAll(async () => {
        // Start HTTP server
        server = Bun.serve({
            port: PORT,
            async fetch(req) {
                const url = new URL(req.url);
                let urlPath = url.pathname;

                if (urlPath === '/') urlPath = '/tests/integration/worker-test.html';
                if (urlPath === '/favicon.ico') {
                    return new Response('', { status: 204 });
                }

                const filePath = path.join(PROJECT_ROOT, urlPath);
                const file = Bun.file(filePath);

                if (!(await file.exists())) {
                    console.log(`[Server] 404: ${urlPath}`);
                    return new Response('Not Found', { status: 404 });
                }

                return new Response(file, {
                    headers: {
                        'Content-Type': getContentType(urlPath),
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        });

        console.log(`Worker test server on http://localhost:${PORT}`);

        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;

        page = await browser.newPage();

        page.on('console', msg => {
            console.log(`[Browser] ${msg.text()}`);
        });

        page.on('pageerror', err => {
            console.log(`[Browser Error] ${err.message}`);
        });

        await page.goto(TEST_URL, { waitUntil: 'networkidle0', timeout: 10000 });

        // Wait for worker to register
        await page.waitForFunction(() => window.workerReady === true, { timeout: 5000 });
        console.log('Worker ready');
    }, 15000);

    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    it('should have worker registered', async () => {
        const ready = await page.evaluate(() => window.workerReady);
        expect(ready).toBe(true);
    });

    it('should send signal to worker', async () => {
        const result = await page.evaluate(() => {
            return window.sendSignalToWorker('test:ping', { ts: Date.now() });
        });

        expect(result).toBe(true);
    });

    it('should request from worker and get response', async () => {
        const response = await page.evaluate(async () => {
            return await window.requestFromWorker('getStatus', {});
        });

        expect(response).toBeDefined();
        expect(response.status).toBe('worker-healthy');
        expect(response.workerId).toBe('test-worker');
    });

    it('should handle compute request', async () => {
        const response = await page.evaluate(async () => {
            return await window.requestFromWorker('compute', { a: 10, b: 32 });
        });

        expect(response).toBeDefined();
        expect(response.result).toBe(42);
        expect(response.computed).toBe(true);
    });

    it('should handle echo request', async () => {
        const response = await page.evaluate(async () => {
            return await window.requestFromWorker('echo', { message: 'hello worker' });
        });

        expect(response).toBeDefined();
        expect(response.echo.message).toBe('hello worker');
        expect(response.from).toBe('worker');
    });
});

function getContentType(urlPath) {
    if (urlPath.endsWith('.html')) return 'text/html';
    if (urlPath.endsWith('.js')) return 'application/javascript';
    if (urlPath.endsWith('.css')) return 'text/css';
    if (urlPath.endsWith('.json')) return 'application/json';
    return 'text/plain';
}
