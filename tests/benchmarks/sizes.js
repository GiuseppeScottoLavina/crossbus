import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const files = ['crossbus.js', 'crossbus.min.js', 'crossbus.core.js', 'crossbus.core.min.js', 'nano.js', 'nano.min.js', 'plugins/retry.js', 'plugins/circuit-breaker.js', 'plugins/schema-validation.js'];
const sizes = [];
for (const file of files) {
    const data = await readFile(new URL(`../../dist/${file}`, import.meta.url));
    sizes.push({ file: `dist/${file}`, rawBytes: data.length, gzipBytes: gzipSync(data, { level: 9 }).length,
        brotliBytes: brotliCompressSync(data).length, sha256: createHash('sha256').update(data).digest('hex') });
}
await mkdir(new URL('../../benchmarks/', import.meta.url), { recursive: true });
await writeFile(new URL('../../benchmarks/sizes.json', import.meta.url), JSON.stringify({ timestamp: new Date().toISOString(), runtime: process.version, gzipLevel: 9, sizes }, null, 2) + '\n');
console.table(sizes.map(({sha256, ...row}) => row));
