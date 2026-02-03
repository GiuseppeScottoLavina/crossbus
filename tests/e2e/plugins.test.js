/**
 * @fileoverview E2E tests for plugin-like patterns.
 * Tests retry, failure isolation, and recovery scenarios.
 */

import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';

const PORT = 8774;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/e2e/fixtures/hub-advanced.html?widgets=2`;

describe('E2E: Plugin Patterns', () => {
    let browser, userDataDir;
    let page;
    let server;

    beforeAll(async () => {
        server = Bun.serve({
            port: PORT,
            async fetch(req) {
                const url = new URL(req.url);
                let urlPath = url.pathname === '/' ? '/tests/e2e/fixtures/hub-advanced.html' : url.pathname;
                if (urlPath === '/favicon.ico') return new Response('', { status: 204 });

                const file = Bun.file(path.join(PROJECT_ROOT, urlPath));
                if (!(await file.exists())) return new Response('Not Found', { status: 404 });

                return new Response(file, {
                    headers: {
                        'Content-Type': urlPath.endsWith('.html') ? 'text/html' :
                            urlPath.endsWith('.js') ? 'application/javascript' : 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        });

        const { browser: _browser, userDataDir: _userDataDir } = await launchBrowser(); browser = _browser; userDataDir = _userDataDir;
        page = await browser.newPage();

        await page.goto(HUB_URL, { waitUntil: 'networkidle0', timeout: 15000 });
        await page.waitForFunction(() => window.hub !== undefined, { timeout: 5000 });
        await page.evaluate(() => window.waitForPeers(2, 8000));
    }, 25000);

    afterAll(async () => {
        if (browser) await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    // ==================== Retry Pattern ====================

    describe('Retry Patterns', () => {
        it('should succeed on first attempt without retry needed', async () => {
            const result = await page.evaluate(async () => {
                const start = Date.now();
                const response = await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 });
                return { response, duration: Date.now() - start };
            });

            expect(result.response.status).toBe('healthy');
            expect(result.duration).toBeLessThan(500);
        });

        it('should handle success after simulated retry scenario', async () => {
            // Make multiple requests in sequence (simulating retry outside CrossBus)
            const results = await page.evaluate(async () => {
                const attempts = [];

                for (let i = 0; i < 3; i++) {
                    try {
                        const response = await window.hub.request('widget-1', 'getStatus', { attempt: i }, { timeout: 3000 });
                        attempts.push({ success: true, response });
                    } catch (e) {
                        attempts.push({ success: false, error: e.message });
                    }
                }

                return attempts;
            });

            // All attempts should succeed
            expect(results.every(r => r.success)).toBe(true);
        });
    });

    // ==================== Failure Isolation ====================

    describe('Failure Isolation', () => {
        it('should isolate failures per handler', async () => {
            const result = await page.evaluate(async () => {
                // First, cause a failure
                try {
                    await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                } catch { }

                // Then, successful request should still work
                return await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 });
            });

            expect(result.status).toBe('healthy');
        });

        it('should isolate failures between peers', async () => {
            const results = await page.evaluate(async () => {
                // Cause failure on widget-1
                let w1Error = null;
                try {
                    await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                } catch (e) {
                    w1Error = e.message;
                }

                // widget-2 should be unaffected
                const w2Response = await window.hub.request('widget-2', 'getStatus', {}, { timeout: 3000 });

                return { w1Error, w2Response };
            });

            expect(results.w1Error).toBeDefined();
            expect(results.w2Response.widgetId).toBe('widget-2');
        });
    });

    // ==================== Mixed Success/Failure ====================

    describe('Mixed Request Patterns', () => {
        it('should handle interleaved success and failure', async () => {
            const results = await page.evaluate(async () => {
                const outcomes = [];

                // success
                outcomes.push({ type: 'success', got: !!(await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 })) });

                // fail
                try {
                    await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                    outcomes.push({ type: 'fail', got: false });
                } catch {
                    outcomes.push({ type: 'fail', got: true });
                }

                // success
                outcomes.push({ type: 'success', got: !!(await window.hub.request('widget-1', 'echo', {}, { timeout: 3000 })) });

                // fail
                try {
                    await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                    outcomes.push({ type: 'fail', got: false });
                } catch {
                    outcomes.push({ type: 'fail', got: true });
                }

                // success
                outcomes.push({ type: 'success', got: !!(await window.hub.request('widget-1', 'compute', { a: 1, b: 2 }, { timeout: 3000 })) });

                return outcomes;
            });

            // Pattern: success, fail, success, fail, success
            expect(results.map(r => r.got)).toEqual([true, true, true, true, true]);
        });
    });

    // ==================== Recovery Patterns ====================

    describe('Recovery Patterns', () => {
        it('should recover after timeout', async () => {
            const results = await page.evaluate(async () => {
                const outcomes = [];

                // First, a slow request that times out
                try {
                    await window.hub.request('widget-1', 'slowEcho', { delay: 500 }, { timeout: 100 });
                    outcomes.push('no-timeout');
                } catch {
                    outcomes.push('timeout');
                }

                // Wait for slow handler to complete
                await new Promise(r => setTimeout(r, 600));

                // Next request should work
                const response = await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 });
                outcomes.push(response ? 'recovered' : 'still-broken');

                return outcomes;
            });

            expect(results[0]).toBe('timeout');
            expect(results[1]).toBe('recovered');
        });

        it('should recover after multiple failures', async () => {
            const results = await page.evaluate(async () => {
                // Cause multiple failures
                for (let i = 0; i < 3; i++) {
                    try {
                        await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                    } catch { }
                }

                // Should still work
                const response = await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 });
                return { recovered: response.status === 'healthy' };
            });

            expect(results.recovered).toBe(true);
        });
    });
});
