// Documentation viewer: renders one allow-listed Markdown file from this
// folder, then adds the page title, table of contents and code colouring.
import { documentationFile, rewriteDocumentationLinks } from './doc-links.js';
import { highlight } from './demos/shared.js';

const SITE = 'https://giuseppescottolavina.github.io/crossbus/';
const params = new URLSearchParams(location.search);
const file = documentationFile(params.get('file') || 'GETTING_STARTED.md');
const content = document.getElementById('content');

document.title = `${file.replace('.md', '')} — CrossBus docs`;
document.getElementById('doc-source').href = `https://github.com/GiuseppeScottoLavina/crossbus/blob/master/docs/${file}`;

// Mark where the reader is, in the site navigation and the sidebar.
for (const link of document.querySelectorAll('.site-nav a[data-nav]')) link.removeAttribute('aria-current');
const section = file === 'API.md' ? 'api' : 'docs';
document.querySelector(`.site-nav a[data-nav="${section}"]`)?.setAttribute('aria-current', file === 'API.md' || file === 'GETTING_STARTED.md' ? 'page' : 'true');
for (const link of document.querySelectorAll('.docs-nav a')) {
    if (new URL(link.href).searchParams.get('file') === file) link.setAttribute('aria-current', 'page');
}

// On narrow screens the sidebar opens from a button.
const menu = document.querySelector('.docs-menu');
const nav = document.getElementById('docs-nav');
menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
});

try {
    const response = await fetch(file);
    if (!response.ok) throw new Error('File not found');
    content.innerHTML = marked.parse(await response.text());
    rewriteDocumentationLinks(content);
    describePage();
    enhanceContent();
    buildContents();
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' });
} catch (error) {
    const title = document.createElement('h1');
    title.textContent = 'Could not load documentation';
    const detail = document.createElement('p');
    detail.textContent = `${file}: ${error.message}`;
    const link = document.createElement('a');
    link.href = 'doc.html?file=GETTING_STARTED.md';
    link.textContent = 'Go to Getting started';
    content.replaceChildren(title, detail, link);
}

/** Per-document title, description and canonical URL for search engines. */
function describePage() {
    const heading = content.querySelector('h1')?.textContent.trim();
    if (heading) {
        document.title = `${heading} — CrossBus docs`;
        menu.textContent = heading;
        menu.setAttribute('aria-label', `Documentation menu. Current page: ${heading}`);
    }
    const summary = [...content.querySelectorAll('p')].map(p => p.textContent.trim().replace(/\s+/g, ' ')).find(text => text.length > 60);
    if (summary) {
        const text = summary.length > 160 ? summary.slice(0, summary.lastIndexOf(' ', 157)) + '…' : summary;
        document.querySelector('meta[name="description"]').content = text;
        document.querySelector('meta[property="og:description"]').content = text;
    }
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${SITE}doc.html?file=${file}`;
    document.head.appendChild(canonical);
    document.querySelector('meta[property="og:title"]').content = document.title;
}

/** Wide tables scroll on their own; JavaScript code is coloured like the demos. */
function enhanceContent() {
    for (const table of content.querySelectorAll('table')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll';
        table.replaceWith(wrapper);
        wrapper.append(table);
    }
    for (const code of content.querySelectorAll('pre code')) {
        if (/language-(?:js|javascript|mjs|cjs|jsx|ts|typescript|tsx)\b/.test(code.className)) code.innerHTML = highlight(code.textContent);
    }
}

/** Heading anchors plus an "On this page" list that follows the scroll position. */
function buildContents() {
    const headings = [...content.querySelectorAll('h2, h3')];
    const toc = document.getElementById('toc');
    const used = new Set();
    for (const [index, heading] of headings.entries()) {
        const text = heading.textContent.trim();
        let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index}`;
        for (let n = 2; used.has(slug); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`;
        used.add(slug);
        heading.id = slug;
        const anchor = document.createElement('a');
        anchor.href = `#${slug}`;
        anchor.className = 'heading-anchor';
        anchor.setAttribute('aria-label', `Link to ${text}`);
        anchor.textContent = '#';
        heading.append(anchor);
        const link = document.createElement('a');
        link.href = `#${slug}`;
        link.textContent = text;
        if (heading.tagName === 'H3') link.className = 'toc-h3';
        toc.append(link);
    }
    if (headings.length < 2) return;
    toc.parentElement.hidden = false;
    const links = new Map([...toc.querySelectorAll('a')].map(link => [link.hash.slice(1), link]));
    const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        for (const link of links.values()) link.classList.toggle('active', link === links.get(visible.target.id));
    }, { rootMargin: '-80px 0px -70% 0px' });
    for (const heading of headings) observer.observe(heading);
}
