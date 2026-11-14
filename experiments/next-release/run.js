// Reuse the frozen 0.1.4 workload without rewriting its historical evidence.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const directory = 'benchmarks/next-release/';
const plans = {
    primary: [
        '--samples',
        '9',
        '--iterations',
        '4096',
        '--warmup',
        '4096',
        '--sizes',
        '1024',
        '--concurrency',
        '1,16,64'
    ],
    guard: [
        '--samples',
        '5',
        '--iterations',
        '2048',
        '--warmup',
        '2048',
        '--sizes',
        '0,65536',
        '--concurrency',
        '1,64',
        '--names',
        'CrossBus,CrossBus + async hooks,birpc cached,Penpal cached + timeout'
    ]
};
for (const runtime of ['node', 'bun', 'chrome', 'chrome-worker']) {
    for (const [profile, plan] of Object.entries(plans)) {
        for (let round = 1; round <= 3; round++) {
            for (const variant of round % 2
                ? ['baseline', 'candidate']
                : ['candidate', 'baseline']) {
                const output = `${directory}${profile}-${runtime}-${variant}-${round}.json`;
                if (existsSync(output)) throw Error('Refusing to overwrite evidence: ' + output);
                console.log(new Date().toISOString(), 'Starting', output);
                const result = spawnSync(
                    runtime === 'bun' ? 'bun' : 'node',
                    [
                        'experiments/worker-rpc/run.js',
                        '--artifact',
                        directory + variant + '/crossbus.min.js',
                        ...plan,
                        '--order',
                        String(round - 1),
                        '--output',
                        output,
                        ...(runtime.startsWith('chrome') ? ['--browser'] : []),
                        ...(runtime === 'chrome-worker' ? ['--worker'] : [])
                    ],
                    { stdio: 'inherit' }
                );
                if (result.error) throw result.error;
                if (result.status !== 0) process.exit(result.status ?? 1);
            }
        }
    }
}
