# Releasing CrossBus

Version **0.1.2** is [published on npm](https://www.npmjs.com/package/crossbus/v/0.1.2). Version **0.1.3 is a prepared candidate**, not an npm publication. The commands below target that candidate. Publishing a GitHub release and publishing to npm are separate operations.

## Validate and pack

Use Node 24 and Bun for development. Install the committed dependency versions:

```sh
npm ci --legacy-peer-deps
bun run release:check
bun run test:all
# On a Mac with the configured iOS SDK and Android/AndroidX dependencies:
bun run test:native
mkdir -p artifacts
npm pack --ignore-scripts --pack-destination artifacts
shasum -a 256 artifacts/crossbus-0.1.3.tgz
```

`release:check` runs lint, source type checking, the build, unit/package tests, consumer declaration checks and the source coverage gate. Browser tests require Chrome and local HTTP servers. Native checks compile the source adapters; they do not qualify physical WebViews.

Install the archive in a separate directory and copy `tests/package/consumer-smoke.mjs` beside its `node_modules`. Run `node consumer-smoke.mjs 0.1.3`. CI repeats the packed-consumer check on Node 18, 20, 22 and 24, taking the expected version from package.json. The smoke test checks standard and compact MessageChannel RPC in ESM, CommonJS and minified artifacts.

## Publish the prepared archive to npm

After the candidate is reviewed and its release is authorized, verify that the GitHub release's commit and CI results are the intended ones, compare the archive with its recorded checksum, and confirm that 0.1.3 is absent from `npm view crossbus versions --json`. Version 0.1.2 cannot be overwritten. Run `npm whoami --registry=https://registry.npmjs.org/` and confirm the package owner's account (`giuseppe-scotto-lavina`) or another account with package write access. Then publish the reviewed archive deliberately:

```sh
npm publish ./artifacts/crossbus-0.1.3.tgz --access public --registry=https://registry.npmjs.org/
npm view crossbus@0.1.3 version dist.integrity --registry=https://registry.npmjs.org/
```

Publishing the tarball uploads the reviewed bytes; it does not run the source checkout's `prepublishOnly` gate again. Publishing from the repository instead runs `release:check` through that lifecycle hook and builds a new archive. Registry publication is irreversible for consumers and must be an intentional release action.

## Measurement scope

Historical timings in `BENCHMARKS.md` predate the 0.1.2 compatibility fallback and banners; their exact bundles are preserved under `benchmarks/measured-0.1.1/`. The new [competitor study](COMPETITOR_ANALYSIS.md) measures exact published 0.1.2 runtime bytes against the frozen 0.1.3 candidate, including hashes and retained samples. Release packaging does not establish universal performance leadership.
