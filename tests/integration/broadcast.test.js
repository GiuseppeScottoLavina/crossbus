/**
 * @fileoverview Integration tests for BroadcastChannel transport.
 * Tests that BroadcastChannelTransport works correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';

const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const TEST_PORT = 8767;

describe('BroadcastChannel Integration Tests', () => {
    let browser;
    let page;
    let server;
    let userDataDir;

    beforeAll(async () => {
        // Start test server
        server = Bun.serve({
            port: TEST_PORT,
            async fetch(req) {
                const url = new URL(req.url);
                let urlPath = url.pathname;
                if (urlPath === '/') urlPath = '/tests/integration/broadcast-test.html';
                if (urlPath === '/favicon.ico') return new Response('', { status: 204 });

                const filePath = path.join(PROJECT_ROOT, urlPath);
                const file = Bun.file(filePath);
                if (!(await file.exists())) {
                    return new Response('Not Found', { status: 404 });
                }

                const ext = urlPath.split('.').pop();
                const types = { html: 'text/html', js: 'application/javascript', css: 'text/css' };
                return new Response(file, {
                    headers: { 'Content-Type': types[ext] || 'application/octet-stream' }
                });
            }
        });
        console.log(`Broadcast test server on http://localhost:${TEST_PORT}`);

        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;
        page = await browser.newPage();

        page.on('console', msg => {
            if (msg.type() !== 'warning') {
                console.log(`[Browser] ${msg.text()}`);
            }
        });
    });

    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        if (server) server.stop();
    });

    it('should report BroadcastChannel as supported', async () => {
        await page.goto(`http://localhost:${TEST_PORT}/tests/integration/broadcast-test.html`);
        await page.waitForFunction(() => window.busReady === true, { timeout: 5000 });

        const supported = await page.evaluate(() => {
            return typeof BroadcastChannel !== 'undefined';
        });

        expect(supported).toBe(true);
    });

    it('should create BroadcastChannelTransport', async () => {
        const result = await page.evaluate(async () => {
            const { BroadcastChannelTransport } = await import('/src/index.js');

            const transport = new BroadcastChannelTransport('test-channel');
            const isSupported = BroadcastChannelTransport.isSupported();

            transport.destroy();

            return { created: true, isSupported };
        });

        expect(result.created).toBe(true);
        expect(result.isSupported).toBe(true);
    });

    it('should send and receive via BroadcastChannel', async () => {
        const result = await page.evaluate(async () => {
            return new Promise((resolve) => {
                // Create two BroadcastChannels on same name
                const channel1 = new BroadcastChannel('crossbus-test');
                const channel2 = new BroadcastChannel('crossbus-test');

                let received = null;

                channel2.onmessage = (event) => {
                    received = event.data;
                };

                // Send from channel1
                channel1.postMessage({ test: 'data', value: 42 });

                // Wait a bit for message
                setTimeout(() => {
                    channel1.close();
                    channel2.close();
                    resolve({ received });
                }, 100);
            });
        });

        expect(result.received).toBeDefined();
        expect(result.received.test).toBe('data');
        expect(result.received.value).toBe(42);
    });
});
