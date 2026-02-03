/**
 * @fileoverview E2E stress tests for high-volume messaging.
 * Tests high message rates, large payloads, concurrent requests.
 */

import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';

const PORT = 8772;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/e2e/fixtures/hub-advanced.html?widgets=2`;

describe('E2E: Stress Tests', () => {
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

    // ==================== High Volume Signals ====================

    describe('High Volume Signals', () => {
        it('should handle 50 signals rapidly', async () => {
            const result = await page.evaluate(async () => {
                const count = 50;
                let delivered = 0;

                for (let i = 0; i < count; i++) {
                    const r = await window.hub.signal(`stress:signal-${i}`, { index: i });
                    delivered += r.delivered;
                }

                return { count, delivered };
            });

            // Each signal should be delivered to 2 widgets
            expect(result.delivered).toBe(100);
        });

        it('should complete 50 signals in under 500ms', async () => {
            const result = await page.evaluate(() => {
                const start = Date.now();
                for (let i = 0; i < 50; i++) {
                    window.hub.signal(`stress:fast-${i}`, { i });
                }
                return { duration: Date.now() - start };
            });

            expect(result.duration).toBeLessThan(500);
        });
    });

    // ==================== Concurrent Requests ====================

    describe('Concurrent Requests', () => {
        it('should handle 10 concurrent requests', async () => {
            const results = await page.evaluate(async () => {
                const promises = [];

                for (let i = 0; i < 10; i++) {
                    promises.push(
                        window.hub.request('widget-1', 'compute', { a: i, b: i * 2 }, { timeout: 5000 })
                    );
                }

                return await Promise.all(promises);
            });

            expect(results).toHaveLength(10);

            for (let i = 0; i < 10; i++) {
                expect(results[i].result).toBe(i + i * 2);
            }
        });

        it('should handle concurrent requests to different peers', async () => {
            const results = await page.evaluate(async () => {
                const promises = [
                    window.hub.request('widget-1', 'echo', { peer: 1 }, { timeout: 3000 }),
                    window.hub.request('widget-2', 'echo', { peer: 2 }, { timeout: 3000 }),
                    window.hub.request('widget-1', 'compute', { a: 1, b: 2 }, { timeout: 3000 }),
                    window.hub.request('widget-2', 'compute', { a: 3, b: 4 }, { timeout: 3000 }),
                ];

                return await Promise.all(promises);
            });

            expect(results[0].from).toBe('widget-1');
            expect(results[1].from).toBe('widget-2');
            expect(results[2].result).toBe(3);
            expect(results[3].result).toBe(7);
        });
    });

    // ==================== Large Payloads ====================

    describe('Large Payloads', () => {
        it('should handle 10KB payload', async () => {
            const result = await page.evaluate(async () => {
                const largeData = 'x'.repeat(10 * 1024);
                return await window.hub.request('widget-1', 'echo', { data: largeData }, { timeout: 5000 });
            });

            expect(result.echo.data.length).toBe(10 * 1024);
        });

        it('should handle 50KB payload', async () => {
            const result = await page.evaluate(async () => {
                const largeData = 'y'.repeat(50 * 1024);
                return await window.hub.request('widget-2', 'echo', { data: largeData }, { timeout: 5000 });
            });

            expect(result.echo.data.length).toBe(50 * 1024);
        });

        it('should handle complex nested payload', async () => {
            const result = await page.evaluate(async () => {
                const complexData = {
                    users: Array.from({ length: 100 }, (_, i) => ({
                        id: i,
                        name: `User ${i}`,
                        metadata: { created: Date.now() }
                    }))
                };
                return await window.hub.request('widget-1', 'echo', complexData, { timeout: 5000 });
            });

            expect(result.echo.users).toHaveLength(100);
        });
    });

    // ==================== Burst Messages ====================

    describe('Burst Messaging', () => {
        it('should handle signal burst (100 signals)', async () => {
            const result = await page.evaluate(async () => {
                const start = Date.now();
                let totalDelivered = 0;

                for (let i = 0; i < 100; i++) {
                    const r = await window.hub.signal('burst:msg', { i });
                    totalDelivered += r.delivered;
                }

                return { duration: Date.now() - start, totalDelivered };
            });

            expect(result.duration).toBeLessThan(1000);
            expect(result.totalDelivered).toBe(200); // 100 signals x 2 widgets
        });

        it('should survive mixed burst (signals + requests)', async () => {
            const results = await page.evaluate(async () => {
                const start = Date.now();
                const requestPromises = [];

                // 20 signals + 5 requests interleaved
                for (let i = 0; i < 20; i++) {
                    window.hub.signal('mixed:signal', { i });

                    if (i % 4 === 0) {
                        requestPromises.push(
                            window.hub.request('widget-1', 'echo', { i }, { timeout: 5000 })
                        );
                    }
                }

                const responses = await Promise.all(requestPromises);
                return {
                    duration: Date.now() - start,
                    responseCount: responses.length
                };
            });

            expect(results.responseCount).toBe(5);
        });
    });
});
