# Releasing CrossBus

## 0.1.5 publication — 14 November 2026

Version **0.1.5 is [published on npm](https://www.npmjs.com/package/crossbus/v/0.1.5)** and is the `latest` tag. Its registry tarball was downloaded and compared byte for byte with the archive from [CI 43585215006](https://github.com/GiuseppeScottoLavina/crossbus/actions/runs/43585215006), which passed all seven jobs, including packaged consumers on Node 18/20/22/24. The same registry version passed isolated consumers on Node 18.20.8 and 24.15.0, covering all 12 exports, declaration-file inclusion, ESM/CommonJS/minified RPC and base64/native flow streams.

Annotated tag **`v0.1.5`** pins tested source commit `1114ea83cfaff39cdf074ee5ff2812b032c64971`. The [GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.5) preserves `crossbus-0.1.5.tgz`, `SHA256SUMS` and `release-manifest.json`. Its archive SHA-256 is `093d973dfd7393cb2895335fb4a656e54292342bbf52d2926772d4cd9cc612aa`; registry integrity is `sha512-ViUYR9RIqJRu5ir36XZZYQNhutftKG1JUkYrrc1qAVKNspcKaHL5qbNLDBWfpGjemKb07A9ateKjc0/0b3hQ/g==`. Later publication-documentation commits do not replace that tag or those bytes. The archive's documentation describes the qualified release; the live publication record is maintained here after registry verification.

CocoaPods and Maven Central are not published by this npm release. SwiftPM source is available at the versioned Git tag; the Android AAR can be built locally using the included configuration.

## Earlier publication records

Version **0.1.4 is [published on npm](https://www.npmjs.com/package/crossbus/v/0.1.4)**. Its reported registry integrity was verified on 13 November 2026 against the exact CI archive attached to the GitHub release. Publishing a GitHub release and publishing to npm are separate operations; creating a tag alone does not publish a package.

The [0.1.4 GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.4) preserves the exact CI archive, checksum and release manifest. The downloaded npm tarball was compared byte for byte with that archive. Its tested source commit is `309b040f2e48d52d88a21cbe34c005d479f89077`; later publication-documentation commits do not replace its bytes.

The earlier [0.1.3 GitHub release](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.3) uses tag **`v0.1.3`** and attaches `crossbus-0.1.3.tgz`, `SHA256SUMS` and `release-manifest.json`. The manifest identifies the exact release commit, successful CI run, package integrity and measured runtime hash. Download the attached archive and verify its checksum when checking the released bytes. The repository has no npm publishing workflow. Neither the tag nor its reviewed archive should be replaced by a later build.

The RPC grouping experiments and their tests/data remain in the repository, excluded from the npm archive and all 12 package exports. Release 0.1.3 keeps standard MessageChannel encoding as its default; the existing opt-in compact encoding is included. The bulk-RPC prototype is not a released API.

## Validate and pack a future release

Use Node 24 and Bun for development. Package metadata is **0.1.5**. Its [release assets](https://github.com/GiuseppeScottoLavina/crossbus/releases/tag/v0.1.5) identify the exact tested archive. npm 0.1.4 and its release archive remain unchanged. Qualification and tagging are separate from registry publication; check the publication record and registry availability before declaring completion. Review the [candidate study](NEXT_RELEASE.md), [stream compatibility](STREAMING.md) and [qualification receipts](QUALIFICATION.md) before releasing. Install the committed dependency versions and validate that checkout:

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

Run `node tests/qualification/check-receipts.js` to verify the retained 0.1.5 browser/device receipts against the current library and fixture bytes. Runtime requalification requires the configured devices, development signing and local fixture access described in [QUALIFICATION.md](QUALIFICATION.md). CI additionally builds SwiftPM and packages the Android AAR, verifies its source/license/POM and compiles an isolated consumer. These SDK checks do not publish to Maven Central or CocoaPods. No 0.1.5 Git tag or npm publication is implied by the development version bump.

Install the archive in a separate directory and copy `tests/package/consumer-smoke.mjs` beside its `node_modules`. Run `node consumer-smoke.mjs` with that archive's version as its argument. CI repeats the packed-consumer check on Node 18, 20, 22 and 24, taking the expected version from package.json. The smoke test checks standard and compact MessageChannel RPC in ESM, CommonJS and minified artifacts.

## Publish a newly qualified archive to npm

After the new candidate is reviewed and its release is authorized, verify its GitHub release commit and CI results, compare the archive with its recorded checksum, and confirm its version is absent from `npm view crossbus versions --json`. Published versions, including 0.1.3, cannot be overwritten. Run `npm whoami --registry=https://registry.npmjs.org/` and confirm the package owner's account (`giuseppe-scotto-lavina`) or another account with package write access. Only then publish that newly reviewed archive:

```sh
RELEASE_VERSION=$(node -p 'require("./package.json").version')
npm publish "./artifacts/crossbus-${RELEASE_VERSION}.tgz" --access public --registry=https://registry.npmjs.org/
npm view "crossbus@${RELEASE_VERSION}" version dist.integrity --registry=https://registry.npmjs.org/
```

Publishing the tarball uploads the reviewed bytes; it does not run the source checkout's `prepublishOnly` gate again. Publishing from the repository instead runs `release:check` through that lifecycle hook and builds a new archive. Registry publication is irreversible for consumers and must be an intentional release action.

### Wait for registry availability

npm scans uploads before making them installable. A successful `npm publish` can report that processing continues while the version is still absent from registry reads. The [official announcement](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/) describes typical delays around five minutes, sometimes 15 minutes or longer; these are not guaranteed deadlines. Keep checking availability rather than repeating the publish command.

Before declaring the release complete, verify the version and `latest` tag, compare `dist.integrity` with the reviewed archive, download the registry tarball and compare its bytes/checksum. Install that exact registry version in an isolated consumer and run the packaged smoke test. If processing does not complete, check npm's notifications/status before taking another publishing action.

## Measurement scope

Historical timings in `BENCHMARKS.md` predate the 0.1.2 compatibility fallback and banners; their exact bundles are preserved under `benchmarks/measured-0.1.1/`. The new [competitor study](COMPETITOR_ANALYSIS.md) measures exact published 0.1.2 runtime bytes against the frozen 0.1.3 candidate, including hashes and retained samples. Release packaging does not establish universal performance leadership.
