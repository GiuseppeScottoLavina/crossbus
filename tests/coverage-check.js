import { readFile } from 'node:fs/promises';
const lcov = await readFile(new URL('../coverage/lcov.info', import.meta.url), 'utf8');
let lines = 0, covered = 0;
for (const record of lcov.split('end_of_record')) {
    if (!/^SF:src\//m.test(record)) continue;
    for (const match of record.matchAll(/^DA:\d+,(\d+)/gm)) { lines++; if (+match[1] > 0) covered++; }
}
const ratio = covered / lines;
console.log(`Source line coverage: ${(ratio * 100).toFixed(2)}% (${covered}/${lines}); minimum 90%.`);
if (!lines || ratio < 0.9) process.exitCode = 1;
console.log('Bun LCOV does not report branch coverage here. The historical Vitest 85% branch target is not a verified/enforced result.');
