// Functional qualification, not a throughput benchmark. Profiles are disposable.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { launchBrowser, closeBrowser } from '../e2e/puppeteer-helper.js';
const root = new URL('../../', import.meta.url),
    kind = process.argv[2] ?? 'chrome';
if (!['chrome', 'firefox', 'safari', 'ipad'].includes(kind))
    throw Error('Select chrome, firefox, safari or ipad');
const host = kind === 'ipad' ? process.env.CROSSBUS_TEST_HOST : '127.0.0.1';
if (!host) throw Error('Set CROSSBUS_TEST_HOST to this Mac address reachable from the iPad');
const output = process.argv[3] ?? 'artifacts/qualification-' + kind + '.json';
await access(output).then(
    () => {
        throw Error('Receipt already exists; select a fresh output path: ' + output);
    },
    (error) => {
        if (error.code !== 'ENOENT') throw error;
    }
);
const server = () =>
    createServer(async (req, res) => {
        try {
            const path = new URL(req.url, 'http://local').pathname;
            if (path === '/') {
                res.end(
                    '<!doctype html><meta charset="utf-8"><title>CrossBus qualification</title>'
                );
                return;
            }
            if (!path.startsWith('/dist/') && !path.startsWith('/tests/qualification/'))
                throw Error('Invalid path');
            const file = new URL('.' + path, root);
            if (!file.href.startsWith(root.href)) throw Error('Invalid path');
            res.setHeader('Content-Type', path.endsWith('.html') ? 'text/html' : 'text/javascript');
            res.end(await readFile(file));
        } catch {
            res.writeHead(404);
            res.end();
        }
    });
const servers = [server(), server()];
for (const s of servers)
    await new Promise((resolve) => s.listen(0, kind === 'ipad' ? '0.0.0.0' : '127.0.0.1', resolve));
const origins = servers.map((s) => 'http://' + host + ':' + s.address().port);
let browser, userDataDir, session;
const wd = async (method, path, body) => {
    const response = await fetch('http://127.0.0.1:4783' + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw Error(JSON.stringify(result));
    return result.value;
};
try {
    let report, runtime;
    if (kind === 'safari' || kind === 'ipad') {
        const caps =
            kind === 'ipad'
                ? {
                      browserName: 'Safari',
                      platformName: 'iOS',
                      'safari:deviceType': 'iPad',
                      'safari:useSimulator': false,
                      'safari:deviceUDID': process.env.CROSSBUS_IPAD_UDID
                  }
                : { browserName: 'safari' };
        if (kind === 'ipad' && !caps['safari:deviceUDID']) throw Error('Set CROSSBUS_IPAD_UDID');
        const created = process.env.CROSSBUS_SAFARI_SESSION_FILE
            ? JSON.parse(await readFile(process.env.CROSSBUS_SAFARI_SESSION_FILE, 'utf8')).value
            : await wd('POST', '/session', { capabilities: { alwaysMatch: caps } });
        session = created.sessionId;
        runtime = Object.fromEntries(
            Object.entries(created.capabilities).filter(
                ([key]) => !['safari:deviceName', 'safari:deviceUDID'].includes(key)
            )
        );
        await wd('POST', '/session/' + session + '/timeouts', { script: 60000, pageLoad: 30000 });
        await wd('POST', '/session/' + session + '/url', { url: origins[0] });
        report = await wd('POST', '/session/' + session + '/execute/async', {
            script: "const done=arguments[arguments.length-1];import('/tests/qualification/browser-suite.js').then(m=>m.runBrowserSuite(arguments[0])).then(r=>done({report:r}),e=>done({error:e.stack||String(e)}));",
            args: [origins[1]]
        });
        if (report.error) throw Error(report.error);
        report = report.report;
    } else {
        if (kind === 'chrome') ({ browser, userDataDir } = await launchBrowser('qualification'));
        else {
            userDataDir = await mkdtemp(join(tmpdir(), 'crossbus-firefox-'));
            browser = await puppeteer.launch({
                browser: 'firefox',
                executablePath:
                    process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox',
                headless: true,
                userDataDir
            });
        }
        runtime = await browser.version();
        const page = await browser.newPage();
        await page.goto(origins[0]);
        report = await page.evaluate(
            async (other) =>
                (await import('/tests/qualification/browser-suite.js')).runBrowserSuite(other),
            origins[1]
        );
    }
    const hashes = {};
    for (const file of [
        'dist/crossbus.min.js',
        'tests/qualification/browser-suite.js',
        'tests/qualification/window.html',
        'tests/qualification/worker.js',
        'tests/qualification/run-browser.js',
        'package-lock.json'
    ])
        hashes[file] = createHash('sha256')
            .update(await readFile(new URL(file, root)))
            .digest('hex');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
        output,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                kind,
                runtime,
                hashes,
                scope: 'Functional browser qualification; elapsed times are diagnostics, not performance evidence.',
                ...report
            },
            null,
            2
        ) + '\n'
    );
    console.log(kind, runtime, report.checkedCases, 'cases passed.');
} finally {
    if (session) await wd('DELETE', '/session/' + session).catch(() => {});
    if (browser) await closeBrowser(browser, userDataDir);
    else if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
    for (const s of servers) await new Promise((resolve) => s.close(resolve));
}
