/**
 * @fileoverview E2E tests for multi-peer scenarios.
 * Tests 4+ widgets, selective targeting, dynamic peer changes.
 */

import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';

const PORT = 8771;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/e2e/fixtures/hub-advanced.html?widgets=4`;

describe('E2E: Multi-Peer Scenarios', () => {
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

        page.on('console', msg => {
            if (!msg.text().includes('favicon')) console.log(`[Browser] ${msg.text()}`);
        });

        await page.goto(HUB_URL, { waitUntil: 'networkidle0', timeout: 15000 });
        await page.waitForFunction(() => window.hub !== undefined, { timeout: 5000 });
        await page.evaluate(() => window.waitForPeers(4, 10000));
    }, 30000);

    afterAll(async () => {
        if (browser) await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    // ==================== 4 Widgets Connected ====================

    describe('4 Widgets Connected', () => {
        it('should have exactly 4 peers', async () => {
            const count = await page.evaluate(() => window.hub.peerCount);
            expect(count).toBe(4);
        });

        it('should list all 4 widgets', async () => {
            const peers = await page.evaluate(() => window.hub.peers);
            expect(peers).toHaveLength(4);
            expect(peers).toContain('widget-1');
            expect(peers).toContain('widget-2');
            expect(peers).toContain('widget-3');
            expect(peers).toContain('widget-4');
        });
    });

    // ==================== Selective Targeting ====================

    describe('Selective Peer Targeting', () => {
        it('should exclude specific peers via signal options', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:targeted', { target: 3 }, { exclude: ['widget-1', 'widget-2', 'widget-4'] });
            });
            expect(result.delivered).toBe(1);
        });

        it('should broadcast signal to all 4 peers', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:allPeers', { broadcast: true });
            });
            expect(result.delivered).toBe(4);
        });

        it('should request from specific peer among 4', async () => {
            const response = await page.evaluate(async () => {
                return await window.hub.request('widget-4', 'getStatus', {}, { timeout: 3000 });
            });

            expect(response).toBeDefined();
            expect(response.widgetId).toBe('widget-4');
        });
    });

    // ==================== Broadcast to All ====================

    describe('Broadcast Request to All', () => {
        it('should collect responses from all 4 peers', async () => {
            const results = await page.evaluate(async () => {
                const map = await window.hub.broadcastRequest('getStatus', {}, { timeout: 5000 });
                return Array.from(map.entries());
            });

            expect(results).toHaveLength(4);

            const widgetIds = results.map(([_, result]) => result.data.widgetId);
            expect(widgetIds).toContain('widget-1');
            expect(widgetIds).toContain('widget-2');
            expect(widgetIds).toContain('widget-3');
            expect(widgetIds).toContain('widget-4');
        });

        it('should compute across all peers', async () => {
            const results = await page.evaluate(async () => {
                const map = await window.hub.broadcastRequest('compute', { a: 2, b: 3 }, { timeout: 3000 });
                return Array.from(map.entries());
            });

            for (const [_, result] of results) {
                expect(result.data.result).toBe(5);
            }
        });
    });

    // ==================== Peer Disconnect ====================

    describe('Peer Disconnect', () => {
        it('should handle peer disconnection', async () => {
            const initialCount = await page.evaluate(() => window.hub.peerCount);
            expect(initialCount).toBe(4);

            // Disconnect widget-2
            await page.evaluate(() => window.hub.removePeer('widget-2'));

            await new Promise(r => setTimeout(r, 100));

            const afterCount = await page.evaluate(() => window.hub.peerCount);
            expect(afterCount).toBe(3);

            const peers = await page.evaluate(() => window.hub.peers);
            expect(peers).not.toContain('widget-2');
        });

        it('should signal only to remaining peers after disconnect', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:afterDisconnect', {});
            });
            expect(result.delivered).toBe(3);
        });

        it('should fail request to disconnected peer', async () => {
            const result = await page.evaluate(async () => {
                try {
                    await window.hub.request('widget-2', 'getStatus', {}, { timeout: 1000 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });
    });

    // ==================== Peer Enumeration ====================

    describe('Peer Enumeration', () => {
        it('should iterate over remaining peers', async () => {
            const result = await page.evaluate(() => {
                const statuses = [];
                for (const peerId of window.hub.peers) {
                    statuses.push(peerId);
                }
                return statuses;
            });

            expect(result).toHaveLength(3); // After disconnect
            expect(result).toContain('widget-1');
            expect(result).toContain('widget-3');
            expect(result).toContain('widget-4');
        });
    });
});
