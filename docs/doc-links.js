const documents = new Set(['GETTING_STARTED.md','API.md','ARCHITECTURE.md','ADVANCED.md','AGENTS.md','AI-GUIDE.md','EXAMPLES.md','PERFORMANCE.md','BENCHMARKS.md','CONTRIBUTING.md','DEVELOPMENT.md','AUDIT.md','RELEASING.md','PAPER.md','THIRD_PARTY.md','COMPETITOR_ANALYSIS.md','RPC_BATCHING.md','WORKER_RPC.md']);
export function documentationFile(requested) { return documents.has(requested) ? requested : 'GETTING_STARTED.md'; }
export function rewriteDocumentationLinks(content) {
    const repository = 'https://github.com/GiuseppeScottoLavina/crossbus/blob/master/docs/';
    for (const anchor of content.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href');
        if (!href || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue;
        const target = new URL(href, repository);
        const file = target.pathname.split('/').at(-1);
        if (target.pathname.startsWith('/GiuseppeScottoLavina/crossbus/blob/master/docs/') && documents.has(file)) {
            anchor.href = `doc.html?file=${encodeURIComponent(file)}${target.hash}`;
        } else anchor.href = target.href;
    }
}
