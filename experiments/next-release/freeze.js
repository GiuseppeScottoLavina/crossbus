// Freeze once, after the build; do not replace an existing measured candidate.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const directory = 'benchmarks/next-release/';
const sources = async (path) =>
    (
        await Promise.all(
            (await readdir(path, { withFileTypes: true })).map((entry) =>
                entry.isDirectory() ? sources(path + '/' + entry.name) : path + '/' + entry.name
            )
        )
    ).flat();
const files = [
    ...(await sources('src')),
    'package.json',
    'package-lock.json',
    'experiments/next-release/run.js',
    'experiments/next-release/freeze.js',
    'experiments/next-release/stream-workloads.js',
    'experiments/next-release/stream-run.js',
    'experiments/next-release/stream-isolated.js',
    'experiments/worker-rpc/run.js',
    'experiments/worker-rpc/workloads.js',
    'experiments/worker-rpc/competitor-worker.js',
    'experiments/worker-rpc/isolated.js',
    'tests/e2e/puppeteer-helper.js',
    'node_modules/puppeteer-core/package.json',
    'node_modules/birpc/dist/index.mjs',
    'node_modules/penpal/dist/penpal.mjs',
    'node_modules/comlink/dist/esm/comlink.mjs'
];
const inputs = {};
for (const path of files) inputs[path] = await readFile(path, 'utf8');
await writeFile(directory + 'inputs.json', JSON.stringify(inputs) + '\n', { flag: 'wx' });
const manifest = {
    version: JSON.parse(inputs['package.json']).version,
    sha256: {},
    inputsSha256: sha(await readFile(directory + 'inputs.json'))
};
for (const file of ['crossbus.min.js', 'nano.min.js', 'package-lock.json'])
    manifest.sha256[file] = sha(await readFile(directory + 'candidate/' + file));
for (const file of ['crossbus.min.js', 'nano.min.js'])
    if (manifest.sha256[file] !== sha(await readFile('dist/' + file)))
        throw Error('Rebuild/freeze candidate: ' + file);
await writeFile(directory + 'candidate/manifest.json', JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx'
});
console.log('Frozen', manifest);
