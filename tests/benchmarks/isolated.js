// One runtime per invocation. Alternating fresh process pairs avoid sharing a
// polymorphic hot call site between baseline and candidate implementations.
import { execFileSync } from 'node:child_process';
const index = process.argv.indexOf('--runtime');
const runtime = index >= 0 ? process.argv[index + 1] : 'node';
if (!['node', 'bun', 'chrome'].includes(runtime)) throw new Error('Use --runtime node, bun or chrome');
const executable = runtime === 'bun' ? 'bun' : 'node';
for (let round = 1; round <= 3; round++) {
    const order = round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const variant of order) {
        const args = ['tests/benchmarks/verified.js', '--paired', '--variant', variant,
            '--output', `benchmarks/isolated-${variant}-${runtime}-${round}.json`];
        if (runtime === 'chrome') args.push('--browser');
        execFileSync(executable, args, { stdio: 'inherit' });
    }
}
