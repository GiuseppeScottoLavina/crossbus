# Releasing CrossBus

The prepared release is **0.1.2**. Publishing a GitHub release and publishing to npm are separate operations.

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
shasum -a 256 artifacts/crossbus-0.1.2.tgz
```

`release:check` runs lint, source type checking, the build, unit/package tests, consumer declaration checks and the source coverage gate. Browser tests require Chrome and local HTTP servers. Native checks compile the source adapters; they do not qualify physical WebViews.

Install the archive in a separate directory and copy `tests/package/consumer-smoke.mjs` beside its `node_modules`. Run `node consumer-smoke.mjs 0.1.2`. CI repeats the packed-consumer check on Node 18, 20, 22 and 24.

## Publish the prepared archive to npm

First verify that the GitHub release's commit and CI results are the intended ones, compare the downloaded archive with the release's `SHA256SUMS`, and check that `npm view crossbus version` still permits publishing 0.1.2. Then, with the package owner's npm credentials:

```sh
npm publish ./artifacts/crossbus-0.1.2.tgz --access public --registry=https://registry.npmjs.org/
npm view crossbus@0.1.2 version dist.integrity --registry=https://registry.npmjs.org/
```

Publishing the tarball uploads the reviewed bytes; it does not run the source checkout's `prepublishOnly` gate again. Publishing from the repository instead runs `release:check` through that lifecycle hook and builds a new archive. Registry publication is irreversible for consumers and must be an intentional release action.

## Measurement scope

Performance timings in `BENCHMARKS.md` were measured before the 0.1.2 compatibility fallback and version banners. Their exact bundles are preserved under `benchmarks/measured-0.1.1/`; they are not timings of the final 0.1.2 archive. Release packaging does not establish universal performance leadership.
