// Writes the shared header and footer into every page of the Pages site, so
// navigation is defined once. Run `node scripts/site-chrome.js` after editing
// it; `--check` exits non-zero when a page is out of date.
import { readFile, writeFile } from 'node:fs/promises';

const REPO = 'https://github.com/GiuseppeScottoLavina/crossbus';

export const PAGES = {
    'docs/index.html': { prefix: '', current: 'home' },
    'docs/doc.html': { prefix: '', current: 'docs' },
    'docs/playground.html': { prefix: '', current: 'playground' },
    'docs/demos/index.html': { prefix: '../', current: 'demos', demo: 'index.html' },
    'docs/demos/worker-pool.html': { prefix: '../', current: 'demos', demo: 'worker-pool.html' },
    'docs/demos/tabs.html': { prefix: '../', current: 'demos', demo: 'tabs.html' },
    'docs/demos/secure-channel.html': { prefix: '../', current: 'demos', demo: 'secure-channel.html' }
};

const DEMOS = [['index.html', 'Overview'], ['worker-pool.html', 'Worker pool'], ['tabs.html', 'Tabs in sync'], ['secure-channel.html', 'Secure channel']];

export function header({ prefix, current, demo }) {
    const p = prefix;
    // A section link is "page" on its own page and "true" on pages inside it.
    const mark = id => current !== id ? '' : (id === 'demos' && demo !== 'index.html') ? ' aria-current="true"' : ' aria-current="page"';
    const subnav = !demo ? '' : `
        <nav class="subnav" aria-label="Demos">
            <div class="wrap">
                <span>Demos</span>
${DEMOS.map(([file, label]) => `                <a href="${file === 'index.html' ? './' : file}"${file === demo ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
            </div>
        </nav>`;
    return `<header class="topbar">
        <div class="wrap">
            <a class="brand" href="${p || './'}"${current === 'home' ? ' aria-current="page"' : ''}><img src="${p}logo-400.png" alt="" width="24" height="24">CrossBus</a>
            <nav class="site-nav" aria-label="Site">
                <a href="${p}doc.html?file=GETTING_STARTED.md" data-nav="docs"${mark('docs')}>Docs</a>
                <a href="${p}doc.html?file=API.md" data-nav="api"${mark('api')}>API</a>
                <a href="${p}demos/" data-nav="demos"${mark('demos')}>Demos</a>
                <a href="${p}playground.html" data-nav="playground"${mark('playground')}>Playground</a>
            </nav>
            <div class="nav-ext">
                <a class="pill" href="${REPO}">GitHub</a>
                <a class="pill" href="https://www.npmjs.com/package/crossbus">npm</a>
            </div>
        </div>${subnav}
    </header>`;
}

export function footer({ prefix }) {
    const p = prefix;
    return `<footer class="foot">
        <div class="wrap foot-grid">
            <div class="foot-brand">
                <a class="brand" href="${p || './'}"><img src="${p}logo-400.png" alt="" width="24" height="24">CrossBus</a>
                <p>Signals, RPC and bounded streams between windows, iframes, workers, tabs and native WebViews.</p>
            </div>
            <nav aria-label="Learn">
                <h2>Learn</h2>
                <a href="${p}doc.html?file=GETTING_STARTED.md">Getting started</a>
                <a href="${p}doc.html?file=API.md">API reference</a>
                <a href="${p}doc.html?file=EXAMPLES.md">Examples</a>
                <a href="${p}doc.html?file=STREAMING.md">Streaming</a>
            </nav>
            <nav aria-label="Try">
                <h2>Try</h2>
                <a href="${p}demos/">Live demos</a>
                <a href="${p}playground.html">Playground</a>
                <a href="${REPO}/tree/master/examples">Example apps</a>
            </nav>
            <nav aria-label="Project">
                <h2>Project</h2>
                <a href="${REPO}">GitHub</a>
                <a href="https://www.npmjs.com/package/crossbus">npm</a>
                <a href="${REPO}/blob/master/SECURITY.md">Security</a>
                <a href="${REPO}/blob/master/CHANGELOG.md">Changelog</a>
            </nav>
        </div>
        <div class="wrap foot-legal">CrossBus is released under the <a href="${REPO}/blob/master/LICENSE">Apache-2.0 license</a>.</div>
    </footer>`;
}

const HEADER = /<header class="topbar">[\s\S]*?<\/header>/;
const FOOTER = /<footer class="foot">[\s\S]*?<\/footer>/;

/** Returns the page with its chrome replaced; throws if a block is missing. */
export function render(html, page) {
    if (!HEADER.test(html) || !FOOTER.test(html)) throw new Error('page has no topbar header or foot footer');
    return html.replace(HEADER, () => header(page)).replace(FOOTER, () => footer(page));
}

if (import.meta.main ?? process.argv[1] === new URL(import.meta.url).pathname) {
    const root = new URL('../', import.meta.url);
    const check = process.argv.includes('--check');
    const stale = [];
    for (const [file, page] of Object.entries(PAGES)) {
        const html = await readFile(new URL(file, root), 'utf8');
        let next;
        try { next = render(html, page); } catch (error) { throw new Error(`${file}: ${error.message}`); }
        if (next === html) continue;
        stale.push(file);
        if (!check) await writeFile(new URL(file, root), next);
    }
    if (check && stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run node scripts/site-chrome.js`); process.exit(1); }
    console.log(stale.length ? `${check ? 'Stale' : 'Updated'}: ${stale.join(', ')}` : 'Site chrome is up to date.');
}
