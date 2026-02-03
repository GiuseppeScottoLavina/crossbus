/**
 * @fileoverview E2E tests for complete CrossBus API coverage.
 * Tests all public methods in real browser environment.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';

const PORT = 8770;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/e2e/fixtures/hub-advanced.html?widgets=2`;

describe('E2E: Complete API Coverage', () => {
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

        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;
        page = await newPage(browser, true);

        await page.goto(HUB_URL, { waitUntil: 'networkidle0', timeout: 15000 });
        await page.waitForFunction(() => window.hub !== undefined, { timeout: 5000 });
        await page.evaluate(() => window.waitForPeers(2, 8000));
    }, 25000);

    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    // ==================== Peer Management ====================

    describe('Peer Management', () => {
        it('should have multiple peers connected', async () => {
            const count = await page.evaluate(() => window.hub.peerCount);
            expect(count).toBe(2);
        });

        it('should list all connected peers', async () => {
            const peers = await page.evaluate(() => window.hub.peers);
            expect(peers).toHaveLength(2);
            expect(peers).toContain('widget-1');
            expect(peers).toContain('widget-2');
        });

        it('should check peer existence via getPeer', async () => {
            const exists = await page.evaluate(() => window.hub.getPeer('widget-1') !== undefined);
            expect(exists).toBe(true);

            const notExists = await page.evaluate(() => window.hub.getPeer('non-existent') === undefined);
            expect(notExists).toBe(true);
        });

        it('should get peer info', async () => {
            const peerInfo = await page.evaluate(() => window.hub.getPeer('widget-1'));
            expect(peerInfo).toBeDefined();
            expect(peerInfo.peerId).toBe('widget-1');
        });
    });

    // ==================== Signal Broadcasting ====================

    describe('signal() Broadcasting', () => {
        it('should broadcast signal to all peers', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:broadcast', { message: 'hello all' });
            });
            expect(result.delivered).toBe(2);
        });

        it('should exclude specific peer via options.exclude', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:partial', { message: 'not widget-2' }, { exclude: ['widget-2'] });
            });
            expect(result.delivered).toBe(1);
        });

        it('should report failed deliveries', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:all', {});
            });
            expect(result.failed).toEqual([]);
        });
    });

    // ==================== Request/Response ====================

    describe('request() / handle()', () => {
        it('should make request and receive response', async () => {
            const response = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'getStatus', {}, { timeout: 3000 });
            });

            expect(response).toBeDefined();
            expect(response.status).toBe('healthy');
            expect(response.widgetId).toBe('widget-1');
        });

        it('should handle echo request', async () => {
            const response = await page.evaluate(async () => {
                return await window.hub.request('widget-2', 'echo', { foo: 'bar' }, { timeout: 3000 });
            });

            expect(response).toBeDefined();
            expect(response.echo.foo).toBe('bar');
            expect(response.from).toBe('widget-2');
        });

        it('should handle compute request', async () => {
            const response = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'compute', { a: 10, b: 20 }, { timeout: 3000 });
            });

            expect(response).toBeDefined();
            expect(response.result).toBe(30);
        });

        it('should handle async handler with delay', async () => {
            const start = Date.now();
            const response = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'slowEcho', { delay: 150 }, { timeout: 5000 });
            });
            const duration = Date.now() - start;

            expect(response).toBeDefined();
            expect(response.delayed).toBe(150);
            expect(duration).toBeGreaterThanOrEqual(100); // Allow tolerance
        });

        it('should throw on handler error', async () => {
            const result = await page.evaluate(async () => {
                try {
                    await window.hub.request('widget-1', 'failHandler', {}, { timeout: 3000 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });

        it('should throw on unknown handler', async () => {
            const result = await page.evaluate(async () => {
                try {
                    await window.hub.request('widget-1', 'nonExistentHandler', {}, { timeout: 3000 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });
    });

    // ==================== Broadcast Request ====================

    describe('broadcastRequest()', () => {
        it('should send request to all peers and collect responses', async () => {
            const results = await page.evaluate(async () => {
                const map = await window.hub.broadcastRequest('getStatus', {}, { timeout: 3000 });
                return Array.from(map.entries());
            });

            expect(results).toHaveLength(2);

            for (const [peerId, result] of results) {
                expect(result.success).toBe(true);
                expect(result.data.widgetId).toBe(peerId);
            }
        });

        it('should compute across all peers', async () => {
            const results = await page.evaluate(async () => {
                const map = await window.hub.broadcastRequest('compute', { a: 5, b: 3 }, { timeout: 3000 });
                return Array.from(map.entries());
            });

            for (const [_, result] of results) {
                expect(result.success).toBe(true);
                expect(result.data.result).toBe(8);
            }
        });
    });

    // ==================== Hub Properties ====================

    describe('Hub Properties', () => {
        it('should have peerId', async () => {
            const peerId = await page.evaluate(() => window.hub.peerId);
            expect(peerId).toBe('hub');
        });

        it('should be hub mode', async () => {
            const isHub = await page.evaluate(() => window.hub.isHub);
            expect(isHub).toBe(true);
        });

        it('should have hasHandler', async () => {
            const hasEcho = await page.evaluate(() => window.hub.hasHandler('echo'));
            expect(hasEcho).toBe(true);

            const hasUnknown = await page.evaluate(() => window.hub.hasHandler('unknown'));
            expect(hasUnknown).toBe(false);
        });
    });
});
