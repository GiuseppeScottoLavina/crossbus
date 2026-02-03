/**
 * @fileoverview Shared Puppeteer helper for E2E tests
 * 
 * Per GEMINI.md global rules - SOTA 2026:
 * - Module: puppeteer-core (NOT puppeteer) - no automatic Chrome download
 * - Chrome: Global in ~/.cache/puppeteer/ 
 * - userDataDir: ALWAYS in /tmp to avoid macOS sandbox issues
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Find Chrome in global cache paths per GEMINI.md
 * Checks for both chrome-headless-shell and Chrome for Testing
 * @returns {string|null} Path to Chrome executable
 */
export function findChrome() {
    const cachePaths = [
        join(process.env.HOME, '.cache', 'puppeteer'),
        '/tmp/puppeteer'  // Fallback sandbox
    ];

    for (const cachePath of cachePaths) {
        if (!existsSync(cachePath)) continue;
        const dirs = readdirSync(cachePath);

        // Priority 1: chrome-headless-shell (lighter, recommended)
        for (const dir of dirs) {
            if (dir.startsWith('chrome-headless-shell')) {
                const versions = readdirSync(join(cachePath, dir)).sort().reverse();
                for (const v of versions) {
                    const path = join(cachePath, dir, v, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
                    if (existsSync(path)) return path;
                }
            }
        }

        // Priority 2: Chrome for Testing
        for (const dir of dirs) {
            if (dir === 'chrome') {
                const versions = readdirSync(join(cachePath, dir)).sort().reverse();
                for (const v of versions) {
                    const path = join(cachePath, dir, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
                    if (existsSync(path)) return path;
                }
            }
        }
    }

    throw new Error(
        'Chrome not found. Run from Terminal.app:\n' +
        'PUPPETEER_CACHE_DIR=~/.cache/puppeteer npx puppeteer browsers install chrome-headless-shell'
    );
}

/**
 * Delay helper (replaces deprecated waitForTimeout).
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Launch browser with standardized configuration per GEMINI.md
 * @param {string} testName - Test name for userDataDir identification
 * @returns {Promise<Browser>}
 */
export async function launchBrowser(testName = 'test') {
    const userDataDir = `/tmp/puppeteer-${testName}-${Date.now()}`;

    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        userDataDir
    });

    return { browser, userDataDir };
}

/**
 * Cleanup browser and temp directory.
 * @param {Browser} browser 
 * @param {string} userDataDir 
 */
export async function closeBrowser(browser, userDataDir) {
    if (browser) {
        try {
            await browser.close();
        } catch (e) {
            // Ignore close errors
        }
    }

    if (userDataDir && existsSync(userDataDir)) {
        try {
            const { rmSync } = await import('fs');
            rmSync(userDataDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Create a new page with console logging.
 * @param {Browser} browser 
 * @param {boolean} logConsole - Whether to log console messages
 * @returns {Promise<Page>}
 */
export async function newPage(browser, logConsole = false) {
    const page = await browser.newPage();

    if (logConsole) {
        page.on('console', msg => {
            if (!msg.text().includes('favicon')) {
                console.log(`[Browser] ${msg.text()}`);
            }
        });
        page.on('pageerror', err => console.log(`[Browser Error] ${err.message}`));
    }

    return page;
}
