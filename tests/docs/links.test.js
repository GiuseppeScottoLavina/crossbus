import { it, expect } from 'bun:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dir, '../..');
it('resolves relative documentation links and images in the checkout', async () => {
    const files = [];
    const scan = async path => {
        const info = await stat(path);
        if (info.isDirectory()) for (const file of await readdir(path)) await scan(resolve(path, file));
        else if (path.endsWith('.md')) files.push(path);
    };
    for (const path of ['README.md', 'SECURITY.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs', 'native']) await scan(resolve(root, path));
    const broken = [];
    for (const file of files) {
        const source = (await readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
        for (const match of source.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
            const link = match[1];
            if (/^(?:https?:|mailto:|#)/.test(link)) continue;
            try { await stat(resolve(dirname(file), decodeURIComponent(link.split('#')[0]))); }
            catch { broken.push(`${file}: ${link}`); }
        }
    }
    expect(files.length).toBeGreaterThan(15);
    expect(broken).toEqual([]);
});
