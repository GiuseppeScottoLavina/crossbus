// Keeps the coding-agent skill in skills/crossbus/ runnable and on the package version.
import { it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFile(new URL(path, new URL('../../', import.meta.url)), 'utf8');

it('runs the first JavaScript example in SKILL.md against the checkout package', async () => {
    const skill = await read('skills/crossbus/SKILL.md');
    const example = skill.match(/^```js\r?\n([\s\S]*?)\r?\n```$/m);
    expect(example).not.toBeNull();
    // The bare 'crossbus' specifier resolves through the package's self-reference to dist/.
    const output = execFileSync('node', ['--input-type=module'], {
        cwd: root,
        input: example[1],
        encoding: 'utf8',
        timeout: 10000
    });
    expect(output.trim()).toBe('5');
});

it('pins the skill recipes and links to the package.json version', async () => {
    const { version } = JSON.parse(await read('package.json'));
    const pins = [];
    for (const path of ['skills/crossbus/SKILL.md', 'skills/crossbus/references/advanced.md']) {
        const source = await read(path);
        // Minimum-version notes such as "0.1.6+ receivers" or "0.1.8 or later" are not pins.
        for (const match of source.matchAll(/crossbus@(\d+\.\d+\.\d+)|\/(?:blob|tree)\/v(\d+\.\d+\.\d+)\/|(?:target|pinned to) CrossBus (\d+\.\d+\.\d+)/g))
            pins.push({ path, found: match[1] ?? match[2] ?? match[3] });
    }
    expect(pins.length).toBeGreaterThan(5);
    expect(pins.filter(pin => pin.found !== version)).toEqual([]);
});
