# Browser and native qualification — 14 November 2026

This record covers the **0.1.5 runtime qualified before publication**, identified by the library SHA-256 in every receipt. It does not extend the published 0.1.4 archive. Receipts under [benchmarks/qualification/2026-11-14](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/benchmarks/qualification/2026-11-14) retain exact runtime and input hashes. Functional elapsed times are diagnostics, not throughput or physical interaction measurements.

## Focused browser cases

Ten cases passed on headless Chrome 155.0.8059.79, headless Firefox 160.0, desktop Safari 27.2 and **physical iPad Safari 27.2 on iPadOS 27.2.1**. The iPad session explicitly disables simulator selection.

Cases cover standard/compact RPC with cyclic graphs and Maps, distinct concurrent replies, asynchronous hooks, handler ACL rejection with zero protected executions, valid JSON fallback, typed-view ownership/backing budgets, default deadlines/destruction, actual cross-origin windows with a rogue source, real module Worker RPC/native-binary flow streaming, independently padded base64 chunks covering every byte value, stream reordering/idle gaps and UUID v4 generation. This is focused compatibility coverage, not every transport/plugin/engine combination.

Run from a built checkout:

```sh
node tests/qualification/run-browser.js chrome artifacts/new-chrome.json
node tests/qualification/run-browser.js firefox artifacts/new-firefox.json
# Start /usr/bin/safaridriver -p 4783 separately with remote automation enabled.
node tests/qualification/run-browser.js safari artifacts/new-safari.json
# Set CROSSBUS_TEST_HOST to the Mac's reachable address and CROSSBUS_IPAD_UDID
# to the connected physical iPad's identifier before selecting ipad.
node tests/qualification/run-browser.js ipad artifacts/new-ipad.json
```

Run Safari/iPad sessions sequentially and retain failed attempts separately. The temporary server serves only the distribution and qualification fixtures. Device IDs, account metadata and local network addresses are excluded from public receipts.

## Physical native WebViews

The dedicated hosts passed on an **iPad Pro with iPadOS 27.2.1** and a **Pixel 7 Pro with Android 17 / API 37, WebView 157.0.8103.38**. The Pixel host consumes the locally staged Maven AAR rather than compiling the bridge as a source dependency. An additional iOS simulator receipt is separate from physical-device proof.

Each host checks eleven JavaScript assertions plus native counters/guards: JS-to-native echo with Unicode/quotes, native error propagation, native-to-JS RPC returning the expected data, malformed/oversized/subframe rejection without protected-handler execution, denied-origin navigation, native send rejection on that origin, reinitialization on allowed navigation, pending-RPC cancellation and receive-callback removal on destruction, and send rejection after native close. Receipts require two native echo calls, two valid native-initiated replies, zero protected executions and a fresh per-run nonce.

The iOS test exposed an NSNumber bridging bug: boolean `true` was accepted as protocol marker `1`. The candidate distinguishes CFBoolean from numeric NSNumber; the fixed adapter passes the physical test. This does not establish that every possible malformed message or navigation race is covered.

```sh
# Device identifiers are local CLI inputs; do not commit them or signing profiles.
python3 tests/native/qualify.py android --device "$ANDROID_SERIAL" \
  --published-bridge --output artifacts/new-pixel-native.json
python3 tests/native/qualify.py ios --device "$IPAD_UDID" \
  --output artifacts/new-ipad-native.json
```

Use a fresh output path. Android requires authorized ADB and an installed SDK/JDK. Build the local Maven artifact first as described in [native packaging](../native/README.md). iOS requires Xcode, XcodeGen, the user's configured development team/provisioning and device trust. The iOS helper preserves a generated project's team setting, runs an ephemeral certificate-pinned HTTPS fixture and closes its server afterward. Test-only control channels and certificate configuration are not production library APIs. Tests operate on the dedicated qualification app, preserving unrelated apps and data. The Android driver clears only that test app's activity task on launch, so each nonce belongs to a fresh execution rather than an existing activity's old Intent.

## Packaging and verification boundaries

SwiftPM compilation, strict local CocoaPods lint for iOS/macOS, Android AAR/source/POM/license checks and an isolated AAR consumer build passed locally. CI repeats Swift compilation and Android packaging/consumer compilation; its actual runs are recorded in the audit. Maven Central and CocoaPods registration/publication have not been performed. Development signing data, generated projects, binaries and private fixture keys stay out of Git and npm.

```sh
node tests/qualification/check-receipts.js
```

This verifies the retained receipts against current library/fixture hashes and checks their success/counter invariants. It does not rerun hardware. Broad native performance, Android Chrome, other OS/WebView versions, background lifecycle and all application-specific host policies remain outside these focused checks. See [the candidate performance comparison](NEXT_RELEASE.md) for separately measured RPC throughput.
