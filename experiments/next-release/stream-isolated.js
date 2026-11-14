import { spawnSync } from 'node:child_process';
for (const runtime of ['node', 'bun', 'chrome'])
    for (let round = 1; round <= 3; round++)
        for (const variant of round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
            const output = `benchmarks/next-release/stream-${runtime}-${variant}-${round}.json`;
            console.log(new Date().toISOString(), output);
            const child = spawnSync(
                runtime === 'bun' ? 'bun' : 'node',
                [
                    'experiments/next-release/stream-run.js',
                    variant,
                    String(round),
                    output,
                    ...(runtime === 'chrome' ? ['--browser'] : [])
                ],
                { stdio: 'inherit' }
            );
            if (child.error) throw child.error;
            if (child.status !== 0) process.exit(child.status ?? 1);
        }
