# Releasing CrossBus

Version **0.1.3 is [published on npm](https://www.npmjs.com/package/crossbus/v/0.1.3)**. Its reported registry integrity was verified on 13 November 2026 against the exact CI archive attached to the GitHub release. Publishing a GitHub release and publishing to npm are separate operations; creating a tag alone does not publish a package.

The [GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.3) uses tag **`v0.1.3`** and attaches `crossbus-0.1.3.tgz`, `SHA256SUMS` and `release-manifest.json`. The manifest identifies the exact release commit, successful CI run, package integrity and measured runtime hash. Download the attached archive and verify its checksum when checking the released bytes. The repository has no npm publishing workflow. Neither the tag nor its reviewed archive should be replaced by a later build.

The RPC grouping experiments and their tests/data remain in the repository, excluded from the npm archive and all 12 package exports. Release 0.1.3 keeps standard MessageChannel encoding as its default; the existing opt-in compact encoding is included. The bulk-RPC prototype is not a released API.

## Validate and pack a future release

Use Node 24 and Bun for development. Current master contains post-release tooling updates; **advance package metadata to a new, unpublished version before preparing another npm release**. Install the committed dependency versions and validate that checkout:

```sh
npm ci --legacy-peer-deps
bun run release:check
bun run test:all
# On a Mac with the configured iOS SDK and Android/AndroidX dependencies:
bun run test:native
mkdir -p artifacts
npm pack --ignore-scripts --pack-destination artifacts
RELEASE_VERSION=$(node -p 'require("./package.json").version')
shasum -a 256 "artifacts/crossbus-${RELEASE_VERSION}.tgz"
```

`release:check` runs lint, source type checking, the build, unit/package tests, consumer declaration checks and the source coverage gate. Browser tests require Chrome and local HTTP servers. Native checks compile the source adapters; they do not qualify physical WebViews.

Install the archive in a separate directory and copy `tests/package/consumer-smoke.mjs` beside its `node_modules`. Run `node consumer-smoke.mjs` with that archive's version as its argument. CI repeats the packed-consumer check on Node 18, 20, 22 and 24, taking the expected version from package.json. The smoke test checks standard and compact MessageChannel RPC in ESM, CommonJS and minified artifacts.

## Publish a newly qualified archive to npm

After the new candidate is reviewed and its release is authorized, verify its GitHub release commit and CI results, compare the archive with its recorded checksum, and confirm its version is absent from `npm view crossbus versions --json`. Published versions, including 0.1.3, cannot be overwritten. Run `npm whoami --registry=https://registry.npmjs.org/` and confirm the package owner's account (`giuseppe-scotto-lavina`) or another account with package write access. Only then publish that newly reviewed archive:

```sh
RELEASE_VERSION=$(node -p 'require("./package.json").version')
npm publish "./artifacts/crossbus-${RELEASE_VERSION}.tgz" --access public --registry=https://registry.npmjs.org/
npm view "crossbus@${RELEASE_VERSION}" version dist.integrity --registry=https://registry.npmjs.org/
```

Publishing the tarball uploads the reviewed bytes; it does not run the source checkout's `prepublishOnly` gate again. Publishing from the repository instead runs `release:check` through that lifecycle hook and builds a new archive. Registry publication is irreversible for consumers and must be an intentional release action.

## Measurement scope

Historical timings in `BENCHMARKS.md` predate the 0.1.2 compatibility fallback and banners; their exact bundles are preserved under `benchmarks/measured-0.1.1/`. The new [competitor study](COMPETITOR_ANALYSIS.md) measures exact published 0.1.2 runtime bytes against the frozen 0.1.3 candidate, including hashes and retained samples. Release packaging does not establish universal performance leadership.
