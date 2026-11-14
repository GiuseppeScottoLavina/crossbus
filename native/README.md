# Native WebView adapters

The npm package ships `native/ios/CrossBusBridge.swift` and `native/android/CrossBusBridge.java` as source integrations. Both deliver JSON envelopes to `NativeBridgeTransport`, receive protocol messages, restrict the host to configured HTTPS origins and main frames, and provide a reply helper for JavaScript-initiated RPC. These are transport adapters: application authorization, handler dispatch, native-initiated request tracking and durable queues remain application responsibilities.

Version 0.1.5 adds SwiftPM/CocoaPods configuration and a Gradle AAR build. Focused runtime tests passed on physical iPadOS 27.2.1 and Pixel 7 Pro / Android 17, including bidirectional RPC, origin/frame rejection, navigation and teardown. See [exact receipts, cases and limits](../docs/QUALIFICATION.md). Compile/package checks remain distinct from those runtime tests. These SDKs have not been published to CocoaPods or Maven Central; npm 0.1.4 does not include the new packaging configuration.

## Build the candidate SDKs locally

From this repository's root:

```sh
swift build --scratch-path artifacts/swift-package
pod lib lint CrossBusNative.podspec --platforms=ios,macos
# Use JDK 21 (as in CI) and Android SDK platform 35; set JAVA_HOME/ANDROID_HOME.
native/android/gradlew -p native/android --no-daemon \
  publishReleasePublicationToQualificationRepository
python3 tests/native/check-artifact.py \
  artifacts/native-maven/io/github/giuseppescottolavina/crossbus-native/0.1.5-SNAPSHOT
native/android/gradlew -p tests/native/android-host --no-daemon \
  -PusePublishedBridge=true :app:assembleDebug
```

The wrapper pins Gradle 9.6.1 and its distribution checksum. The Android build uses AndroidX WebKit 1.14.0, minimum API 23, and writes the AAR, source JAR and POM into this checkout's `artifacts/native-maven` repository. `check-artifact.py` verifies the actual bridge class, canonical source, Apache license and dependency metadata.

In Xcode, add this checkout as a **local Swift package** and link `CrossBusNative`; use `import CrossBusNative`. Minimum targets are iOS 15 and macOS 12, with Swift tools 5.9. A CocoaPods consumer can use `pod 'CrossBusNative', :path => '/absolute/path/to/this/checkout'` in its own Podfile. Replace that path with the actual checkout. Release tag `v0.1.5` identifies the Swift package source; a Git tag does not register a CocoaPod or publish to Maven Central.

An Android consumer can add the local repository URL and `implementation 'io.github.giuseppescottolavina:crossbus-native:0.1.5-SNAPSHOT'`; the [dedicated AAR consumer](https://github.com/GiuseppeScottoLavina/crossbus/tree/master/tests/native/android-host) supplies a working Gradle example. Alternatively, copy the canonical Swift/Java source as below. Packaging does not add a native handler registry, persistent queue or application authentication.

## JavaScript side

```js
import { CrossBus } from 'crossbus';
const { NativeBridgeTransport } = await import('crossbus');
const transport = new NativeBridgeTransport({ heartbeatInterval: 0 });
const bus = CrossBus.createSecure({ peerId: 'web', allowedOrigins: ['native'] });
const disconnect = bus.addTransport(transport, { peerId: 'native', origin: 'native' });
await transport.ready;
const result = await bus.request('native', 'echo', { text: 'Hello' });
// On teardown: bus.destroy(), or disconnect() for this transport only.
```

`native` is a local trust label, not a network origin. Native host restrictions establish the channel's trust. Payloads must be JSON-compatible; binary values need an application encoding. Default names are `CrossBus` on Android, `crossbus` on iOS and `__crossbus_receive__` for native-to-JS delivery. Custom `androidInterface`, `iosHandler` and `callbackName` must match the native adapter. A callback name has one active owner; use distinct names for independent channels.

Initialization timeout rejects `ready` with `ERR_NOT_CONNECTED`. Destroying during initialization rejects it with `ERR_DESTROYED`. The initialization queue defaults to 100 messages and throws `ERR_QUEUE_FULL` when full. Sending after connection propagates native bridge errors. Queue flushing failures reject `ready`; the application must not assume delivery before readiness.

## iOS (Swift / WKWebView)

Add the Swift source to the app target. These are integration fragments: `appURL` is the HTTPS URL served by your application, and `appOrigin` is its exact scheme/host/port without a path. The library does not host an application for you. On the main actor, install before navigation and retain the bridge:

```swift
let bridge = CrossBusBridge(webView: webView, allowedOrigins: [appOrigin])
bridge.onMessage = { [weak bridge] message in
    guard message["type"] as? String == "req",
          let payload = message["payload"] as? [String: Any] else { return }
    do {
        if payload["name"] as? String == "echo" {
            try bridge?.reply(to: message, data: payload["data"] ?? NSNull())
        } else {
            try bridge?.reply(to: message, error: ["code": "ERR_NO_HANDLER", "message": "Unknown handler"])
        }
    } catch { /* Report through the app's error path. */ }
}
webView.load(URLRequest(url: appURL))
// On teardown, on the main actor:
// bridge.close()
```

The user content controller retains its script handler; calling `close()` releases that registration. Exact HTTPS origins, without paths, are required. Native-to-JS calls must start after the JS transport installs its callback. `send()` accepts any valid CrossBus envelope, including native signals or responses; it exposes a completion callback for JavaScript evaluation errors.

## Android (Java / AndroidX WebKit)

Add `CrossBusBridge.java` to package `io.crossbus` in the app. Enable JavaScript in the app's WebView configuration. Use AndroidX WebKit (compiled here against 1.14.0); the installed WebView must support `WEB_MESSAGE_LISTENER`, checked at construction. No fallback exposes an unrestricted `addJavascriptInterface`.

Here `appURL` and `appOrigin` are application configuration strings, as described above.

```java
// build.gradle: implementation("androidx.webkit:webkit:1.14.0")
webView.getSettings().setJavaScriptEnabled(true);
CrossBusBridge bridge = new CrossBusBridge(webView,
    new java.util.HashSet<>(java.util.Arrays.asList(appOrigin)));
bridge.setListener(message -> {
    if (!"req".equals(message.optString("type"))) return;
    org.json.JSONObject payload = message.getJSONObject("payload");
    if ("echo".equals(payload.optString("name"))) {
        bridge.reply(message, payload.opt("data"), null);
    } else {
        bridge.reply(message, null, new org.json.JSONObject()
            .put("code", "ERR_NO_HANDLER").put("message", "Unknown handler"));
    }
});
webView.loadUrl(appURL);
// On teardown, on the UI thread: bridge.close();
```

Install before loading the page. All adapter methods and callbacks run on the UI thread; move heavy application work off that thread. `send()` accepts protocol envelopes after the JS callback is installed. `close()` unregisters the listener. The app owns navigation policy and must close or reinitialize its JS bus on document navigation.

## Protocol

JS requests use `{_cb:1,id,type:'req',payload:{name,data,source,dest}}`. Native replies use `{_cb:1,id,type:'res',payload:{requestId,success,data,error}}`, with a fresh response ID and the original request ID in `payload.requestId`. `reply()` constructs this shape. Signals use `{_cb:1,id,type:'sig',payload:{name,data}}`. `send()` is also the extension point for routing native-initiated requests and matching their replies in the host application.

The [Apple frame-origin API](https://developer.apple.com/documentation/webkit/wkframeinfo/securityorigin) identifies the sending frame, and [AndroidX WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addWebMessageListener(android.webkit.WebView,java.lang.String,java.util.Set,androidx.webkit.WebViewCompat.WebMessageListener)) supplies origin and frame information. The adapters check both. Test accepted/rejected origins, untrusted iframes, navigation, teardown, Unicode, errors and request/response on each target WebView before release.
