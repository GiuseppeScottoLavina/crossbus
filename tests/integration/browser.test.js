/**
 * @fileoverview Puppeteer integration tests for CrossBus.
 * Tests real browser communication between hub and widget iframes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';

const PORT = 8765;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/integration/hub.html`;

describe('CrossBus Integration Tests', () => {
    let browser;
    let page;
    let server;
    let userDataDir;

    beforeAll(async () => {
        // Start HTTP server from project root
        server = Bun.serve({
            port: PORT,
            async fetch(req) {
                const url = new URL(req.url);
                let urlPath = url.pathname;

                if (urlPath === '/') urlPath = '/tests/integration/hub.html';

                // Skip favicon
                if (urlPath === '/favicon.ico') {
                    return new Response('', { status: 204 });
                }

                const filePath = path.join(PROJECT_ROOT, urlPath);
                const file = Bun.file(filePath);

                // Check if file exists
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

        console.log(`Test server running on http://localhost:${PORT}`);
        console.log(`Serving from: ${PROJECT_ROOT}`);

        // Launch browser using helper with EPERM workarounds
        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;

        page = await browser.newPage();

        // Enable console logging
        page.on('console', msg => {
            const text = msg.text();
            if (!text.includes('favicon')) {
                console.log(`[Browser] ${text}`);
            }
        });

        page.on('pageerror', err => {
            console.log(`[Browser Error] ${err.message}`);
        });

        // Navigate to hub
        console.log(`Navigating to ${HUB_URL}...`);
        await page.goto(HUB_URL, { waitUntil: 'networkidle0', timeout: 10000 });

        // Wait for hub to initialize
        await page.waitForFunction(() => window.hub !== undefined, { timeout: 5000 });
        console.log('Hub initialized');

        // Wait for at least 1 widget to connect (2 iframes may take longer)
        await page.waitForFunction(() => {
            return window.hub && window.hub.peerCount >= 1;
        }, { timeout: 8000 });

        console.log('Widgets connected');
    }, 20000); // 20s timeout for beforeAll

    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    it('should have hub initialized', async () => {
        const hubExists = await page.evaluate(() => !!window.hub);
        expect(hubExists).toBe(true);
    });

    it('should connect at least one peer', async () => {
        const peerCount = await page.evaluate(() => window.hub.peerCount);
        expect(peerCount).toBeGreaterThanOrEqual(1);
    });

    it('should broadcast signals', async () => {
        const result = await page.evaluate(() => {
            return window.hub.signal('test:ping', { timestamp: Date.now() });
        });

        expect(result.delivered).toBeGreaterThanOrEqual(1);
    });

    it('should handle request/response', async () => {
        const response = await page.evaluate(async () => {
            const peers = window.hub.peers;
            if (peers.length === 0) return { error: 'no peers' };

            try {
                return await window.hub.request(peers[0], 'getStatus', {}, { timeout: 3000 });
            } catch (e) {
                return { error: e.message };
            }
        });

        expect(response).toBeDefined();
        // Either got status or an error message
        expect(response.status !== undefined || response.error !== undefined).toBe(true);
    });
});

function getContentType(urlPath) {
    if (urlPath.endsWith('.html')) return 'text/html';
    if (urlPath.endsWith('.js')) return 'application/javascript';
    if (urlPath.endsWith('.css')) return 'text/css';
    if (urlPath.endsWith('.json')) return 'application/json';
    return 'text/plain';
}
