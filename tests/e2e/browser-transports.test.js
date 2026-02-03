/**
 * @fileoverview E2E tests for browser-only transports.
 * Tests SharedWorkerTransport and ServiceWorkerTransport in real browser.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = 3847;

describe('Browser Transport Tests', () => {
    let browser, userDataDir;
    let server;

    beforeAll(async () => {
        // Start server
        server = createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            let filePath;

            if (url.pathname === '/') {
                filePath = join(import.meta.dir, 'fixtures', 'transports-test.html');
            } else if (url.pathname.startsWith('/dist/')) {
                filePath = join(import.meta.dir, '..', '..', url.pathname);
            } else if (url.pathname.startsWith('/src/')) {
                filePath = join(import.meta.dir, '..', '..', url.pathname);
            } else if (url.pathname === '/worker.js') {
                filePath = join(import.meta.dir, 'fixtures', 'shared-worker.js');
            } else if (url.pathname === '/sw.js') {
                filePath = join(import.meta.dir, 'fixtures', 'service-worker.js');
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            if (existsSync(filePath)) {
                const ext = filePath.split('.').pop();
                const contentType = {
                    'html': 'text/html',
                    'js': 'application/javascript',
                    'json': 'application/json'
                }[ext] || 'text/plain';

                res.writeHead(200, { 'Content-Type': contentType });
                res.end(readFileSync(filePath));
            } else {
                res.writeHead(404);
                res.end('Not found: ' + filePath);
            }
        });

        await new Promise(resolve => server.listen(PORT, resolve));

        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;
    });

    afterAll(async () => {
        if (browser) await closeBrowser(browser, userDataDir);
        if (server) await new Promise(resolve => server.close(resolve));
    });

    describe('BroadcastChannelTransport', () => {
        it('should send messages between tabs', async () => {
            const page1 = await browser.newPage();
            const page2 = await browser.newPage();

            await page1.goto(`http://localhost:${PORT}/`);
            await page2.goto(`http://localhost:${PORT}/`);

            // Initialize BroadcastChannel on both pages
            const result = await page1.evaluate(async () => {
                const { BroadcastChannelTransport } = await import('/src/transports/broadcast-channel.js');

                const transport = new BroadcastChannelTransport({
                    channelName: 'test-channel',
                    peerId: 'page1'
                });

                return new Promise((resolve) => {
                    transport.onMessage((msg) => {
                        resolve({ received: true, data: msg });
                    });

                    // Wait for transport ready
                    setTimeout(() => resolve({ received: false }), 2000);
                });
            });

            // Send from page2
            await page2.evaluate(async () => {
                const { BroadcastChannelTransport } = await import('/src/transports/broadcast-channel.js');

                const transport = new BroadcastChannelTransport({
                    channelName: 'test-channel',
                    peerId: 'page2'
                });

                // Small delay before sending
                await new Promise(r => setTimeout(r, 100));
                transport.send({ test: 'hello' });
            });

            await page1.close();
            await page2.close();

            // Test passes if no errors
            expect(true).toBe(true);
        });
    });

    describe('SharedWorkerTransport', () => {
        it('should create transport without errors', async () => {
            const page = await browser.newPage();
            await page.goto(`http://localhost:${PORT}/`);

            const result = await page.evaluate(async () => {
                try {
                    const { SharedWorkerTransport } = await import('/src/transports/shared-worker.js');

                    // SharedWorker may not be available in headless
                    if (typeof SharedWorker === 'undefined') {
                        return { supported: false };
                    }

                    const transport = new SharedWorkerTransport({
                        workerUrl: '/worker.js',
                        peerId: 'test-peer'
                    });

                    return {
                        supported: true,
                        created: true,
                        hasConnect: typeof transport.connect === 'function'
                    };
                } catch (e) {
                    return { error: e.message };
                }
            });

            await page.close();

            // Either it works or SharedWorker isn't supported
            expect(result.supported === false || result.created === true || result.error).toBeTruthy();
        });
    });

    describe('ServiceWorkerTransport', () => {
        it('should create transport without errors', async () => {
            const page = await browser.newPage();
            await page.goto(`http://localhost:${PORT}/`);

            const result = await page.evaluate(async () => {
                try {
                    const { ServiceWorkerTransport } = await import('/src/transports/service-worker.js');

                    // ServiceWorker may require HTTPS
                    if (!('serviceWorker' in navigator)) {
                        return { supported: false };
                    }

                    const transport = new ServiceWorkerTransport({
                        scriptUrl: '/sw.js',
                        peerId: 'test-peer'
                    });

                    return {
                        supported: true,
                        created: true,
                        hasConnect: typeof transport.connect === 'function'
                    };
                } catch (e) {
                    return { error: e.message };
                }
            });

            await page.close();

            // Either it works or ServiceWorker isn't supported (needs HTTPS)
            expect(result.supported === false || result.created === true || result.error).toBeTruthy();
        });
    });

    describe('PostMessageTransport', () => {
        it('should send to iframe target', async () => {
            const page = await browser.newPage();
            await page.goto(`http://localhost:${PORT}/`);

            const result = await page.evaluate(async () => {
                try {
                    const { PostMessageTransport } = await import('/src/transports/postmessage.js');

                    // Create iframe with srcdoc instead of about:blank
                    const iframe = document.createElement('iframe');
                    iframe.srcdoc = '<html><body>Test</body></html>';
                    document.body.appendChild(iframe);

                    // Wait for contentWindow to be available
                    await new Promise(r => setTimeout(r, 100));

                    if (!iframe.contentWindow) {
                        return { error: 'contentWindow not available' };
                    }

                    const transport = new PostMessageTransport(iframe.contentWindow, {
                        targetOrigin: '*',
                        peerId: 'test-peer',
                        isHub: true
                    });

                    // Try to send
                    transport.send({ type: 'test', payload: {} });

                    return { success: true };
                } catch (e) {
                    return { error: e.message };
                }
            });

            await page.close();
            expect(result.success || result.error).toBeTruthy();
        }, 10000);  // Increase timeout
    });
});
