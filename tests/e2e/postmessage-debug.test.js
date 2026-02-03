/**
 * @fileoverview Simplified test to debug PostMessageTransport bidirectional flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';

const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const PORT = 8797;

describe('PostMessage Transport Debug', () => {
    let server;
    let browser, userDataDir;
    let page;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const urlPath = req.url.split('?')[0];
            let filePath = path.join(PROJECT_ROOT, urlPath === '/' ? 'index.html' : urlPath);

            const ext = path.extname(filePath) || '.html';
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
            };

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
                res.end(data);
            });
        });

        await new Promise(resolve => server.listen(PORT, resolve));
        console.log(`Debug server on http://localhost:${PORT}`);

        const result = await launchBrowser();
        browser = result.browser;
        userDataDir = result.userDataDir;
        page = await newPage(browser, true);
    }, 30000);

    afterAll(async () => {
        await closeBrowser(browser, userDataDir);
        server?.close();
    });

    it('should verify bidirectional postMessage between parent and iframe', async () => {
        // Navigate to demo page
        await page.goto(`http://localhost:${PORT}/docs/index.html`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Inject raw postMessage test
        const result = await page.evaluate(async () => {
            return new Promise((resolve) => {
                // Create test iframe
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);

                // Listen for response
                let received = false;
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.test === 'pong') {
                        received = true;
                    }
                });

                // When iframe loads, send test message
                iframe.onload = () => {
                    // Inject script into iframe
                    const doc = iframe.contentDocument;
                    const script = doc.createElement('script');
                    script.textContent = `
                        window.addEventListener('message', (e) => {
                            console.log('[Iframe] Received:', e.data);
                            if (e.data && e.data.test === 'ping') {
                                console.log('[Iframe] Sending pong back');
                                window.parent.postMessage({ test: 'pong' }, '*');
                            }
                        });
                        console.log('[Iframe] Listener ready');
                    `;
                    doc.body.appendChild(script);

                    // Send ping
                    setTimeout(() => {
                        console.log('[Main] Sending ping');
                        iframe.contentWindow.postMessage({ test: 'ping' }, '*');
                    }, 100);

                    // Check result
                    setTimeout(() => {
                        resolve({ received });
                    }, 500);
                };

                iframe.src = 'about:blank';
            });
        });

        console.log('Result:', result);
        expect(result.received).toBe(true);
    }, 10000);
});
