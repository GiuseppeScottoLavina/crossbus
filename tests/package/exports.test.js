import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = await readFile(new URL('../../package.json', import.meta.url), 'utf8').then(JSON.parse);

describe('Published package', () => {
    for (const [path, entry] of Object.entries(pkg.exports)) {
        it(`loads ${path} and ships declarations`, async () => {
            const url = new URL(`../../${entry.import}`, import.meta.url);
            expect(Object.keys(await import(url.href)).length).toBeGreaterThan(0);
            expect((await readFile(new URL(`../../${entry.types}`, import.meta.url), 'utf8')).length).toBeGreaterThan(0);
        });
    }
    for (const artifact of ['crossbus.js', 'crossbus.min.js', 'crossbus.cjs']) {
        it(`${artifact}: preserves protocol and request/response interoperability`, async () => {
            const { CrossBus, MessageChannelTransport } = artifact.endsWith('.cjs')
                ? require(`../../dist/${artifact}`) : await import(`../../dist/${artifact}`);
            const a = new CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
            const b = new CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
            const transport = new MessageChannelTransport();
            a.addTransport(transport, { peerId: 'b', origin: 'channel' });
            b.addTransport(MessageChannelTransport.fromPort(transport.remotePort), { peerId: 'a', origin: 'channel' });
            b.handle('echo', data => data);
            try { expect(await a.request('b', 'echo', { text: 'quote " / 🐟', array: [1, 2] }, { timeout: 1000 })).toEqual({ text: 'quote " / 🐟', array: [1, 2] }); }
            finally { a.destroy(); b.destroy(); }
        });
    }
});
