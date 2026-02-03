/**
 * @fileoverview E2E tests for edge cases and error scenarios.
 * Tests timeouts, handler errors, invalid inputs.
 */

import { launchBrowser, closeBrowser, newPage } from './puppeteer-helper.js';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';

const PORT = 8773;
const PROJECT_ROOT = path.resolve(import.meta.dir, '../..');
const HUB_URL = `http://localhost:${PORT}/tests/e2e/fixtures/hub-advanced.html?widgets=2`;

describe('E2E: Edge Cases', () => {
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

    // ==================== Timeout Scenarios ====================

    describe('Request Timeouts', () => {
        it('should throw on slow handler with short timeout', async () => {
            const result = await page.evaluate(async () => {
                try {
                    // Request slow echo with 500ms delay but 100ms timeout
                    await window.hub.request('widget-1', 'slowEcho', { delay: 500 }, { timeout: 100 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });

        it('should succeed if handler responds before timeout', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'slowEcho', { delay: 50 }, { timeout: 2000 });
            });

            expect(result).toBeDefined();
            expect(result.delayed).toBe(50);
        });
    });

    // ==================== Handler Errors ====================

    describe('Handler Errors', () => {
        it('should throw on failing handler', async () => {
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

        it('should throw on non-existent handler', async () => {
            const result = await page.evaluate(async () => {
                try {
                    await window.hub.request('widget-1', 'thisHandlerDoesNotExist', {}, { timeout: 3000 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });
    });

    // ==================== Non-existent Peers ====================

    describe('Non-existent Peers', () => {
        it('should report 0 delivered for signal to non-existent peer via exclude all', async () => {
            const result = await page.evaluate(() => {
                // Exclude all peers, nothing to deliver
                return window.hub.signal('test:fail', {}, { exclude: ['widget-1', 'widget-2'] });
            });

            expect(result.delivered).toBe(0);
        });

        it('should throw on request to non-existent peer', async () => {
            const result = await page.evaluate(async () => {
                try {
                    await window.hub.request('widget-999', 'getStatus', {}, { timeout: 1000 });
                    return { threw: false };
                } catch (e) {
                    return { threw: true, message: e.message };
                }
            });

            expect(result.threw).toBe(true);
        });
    });

    // ==================== Edge Case Payloads ====================

    describe('Edge Case Payloads', () => {
        it('should handle null payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', null, { timeout: 3000 });
            });

            // null payloads are normalized to undefined through message processing
            expect(result.echo).toBeUndefined();
        });

        it('should handle empty object payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', {}, { timeout: 3000 });
            });

            expect(result.echo).toEqual({});
        });

        it('should handle array payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', [1, 2, 3], { timeout: 3000 });
            });

            expect(result.echo).toEqual([1, 2, 3]);
        });

        it('should handle number payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', 42, { timeout: 3000 });
            });

            expect(result.echo).toBe(42);
        });

        it('should handle string payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', 'hello', { timeout: 3000 });
            });

            expect(result.echo).toBe('hello');
        });

        it('should handle boolean payload', async () => {
            const result = await page.evaluate(async () => {
                return await window.hub.request('widget-1', 'echo', true, { timeout: 3000 });
            });

            expect(result.echo).toBe(true);
        });
    });

    // ==================== Signal Names ====================

    describe('Signal Name Edge Cases', () => {
        it('should handle signal with special characters in name', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:special-chars_123', {});
            });

            expect(result.delivered).toBe(2);
        });

        it('should handle signal with unicode name', async () => {
            const result = await page.evaluate(() => {
                return window.hub.signal('test:日本語', { emoji: '🚌' });
            });

            expect(result.delivered).toBe(2);
        });

        it('should handle very long signal name', async () => {
            const result = await page.evaluate(() => {
                const longName = 'test:' + 'a'.repeat(200);
                return window.hub.signal(longName, {});
            });

            expect(result.delivered).toBe(2);
        });
    });
});
