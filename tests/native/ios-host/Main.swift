import UIKit
import WebKit
import CryptoKit
import Security

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

@MainActor
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    var host: QualificationHost?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let host = QualificationHost(); self.host = host
        let controller = UIViewController(); controller.view = host.view
        let window = UIWindow(windowScene: scene); window.rootViewController = controller
        self.window = window; window.makeKeyAndVisible(); host.start()
    }
}

/// The extra WK handler is an explicit test-control channel, not a library API.
@MainActor
final class QualificationHost: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let view = WKWebView(frame: .zero)
    var bridge: CrossBusBridge!
    let origin = Bundle.main.object(forInfoDictionaryKey: "CrossBusOrigin") as? String ?? ""
    let denied = Bundle.main.object(forInfoDictionaryKey: "CrossBusDeniedOrigin") as? String ?? ""
    let fingerprint = Bundle.main.object(forInfoDictionaryKey: "CrossBusCertificateSHA256") as? String ?? ""
    var phases: [[String: Any]] = []
    var echoCalls = 0, protectedCalls = 0, nativeReplies = 0
    var nativeReplyValid = false, deniedSendBlocked = false, closedSendBlocked = false
    var nativeRequestId: String?
    var completed = false

    func start() {
        view.navigationDelegate = self
        view.configuration.userContentController.add(self, name: "qualification")
        bridge = CrossBusBridge(webView: view, allowedOrigins: [origin], maxMessageBytes: 4096)
        bridge.onMessage = { [weak self] message in
            do { try self?.receive(message) } catch { self?.fail(String(describing: error)) }
        }
        view.load(URLRequest(url: URL(string: origin + "/assets/qualification.html")!))
    }
    func receive(_ message: [String: Any]) throws {
        guard let payload = message["payload"] as? [String: Any] else { return }
        let type = message["type"] as? String
        if type == "res", let expected = nativeRequestId, payload["requestId"] as? String == expected {
            let data = payload["data"] as? [String: Any]
            nativeReplyValid = payload["success"] as? Bool == true && data?["received"] as? Int == 41 && data?["text"] as? String == "native 🐟"
            nativeReplies += 1; return
        }
        let name = payload["name"] as? String
        if type == "sig", name == "native:probe" {
            let id = "native-" + UUID().uuidString; nativeRequestId = id
            try bridge.send(["_cb":1,"id":id,"type":"req","payload":["name":"fromNative","data":payload["data"] ?? NSNull(),"source":"native","dest":"web"]])
            return
        }
        guard type == "req" else { return }
        switch name {
        case "echo": echoCalls += 1; try bridge.reply(to: message, data: payload["data"] ?? NSNull())
        case "stats": try bridge.reply(to: message, data: ["echoCalls":echoCalls,"protectedCalls":protectedCalls,"nativeReplies":nativeReplies,"nativeReplyValid":nativeReplyValid])
        case "protected": protectedCalls += 1; try bridge.reply(to: message, data: 7)
        case "never": break
        default: try bridge.reply(to: message, error: ["code":"ERR_NO_HANDLER","message":"Unknown handler"])
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard !completed, message.frameInfo.isMainFrame, let report = message.body as? [String: Any],
              let phase = report["phase"] as? String else { return }
        switch phase {
        case "failed": fail(String(describing: report))
        case "first":
            phases.append(report)
            view.load(URLRequest(url: URL(string: denied + "/assets/denied.html")!))
        case "denied":
            do { try bridge.send(["_cb":1,"id":"denied-probe","type":"sig"]) }
            catch { deniedSendBlocked = true }
            phases.append(report)
            view.load(URLRequest(url: URL(string: origin + "/assets/qualification.html?reload=1")!))
        case "close":
            bridge.close()
            do { try bridge.send(["_cb":1,"id":"closed-probe","type":"sig"]) }
            catch { closedSendBlocked = true }
            view.evaluateJavaScript("window.__crossbusTestClosed()")
        case "complete":
            guard phases.count == 2, protectedCalls == 0, echoCalls >= 2, nativeReplies >= 2,
                  nativeReplyValid, deniedSendBlocked, closedSendBlocked else { fail("Native ledger/guard assertion failed"); return }
            phases.append(report); completed = true
            save(["passed":true,"phases":phases,"echoCalls":echoCalls,"protectedCalls":protectedCalls,
                  "nativeReplies":nativeReplies,"nativeReplyValid":nativeReplyValid,"deniedSendBlocked":deniedSendBlocked,"closedSendBlocked":closedSendBlocked,
                  "osVersion":UIDevice.current.systemVersion,"model":UIDevice.current.model])
        default: fail("Unknown fixture control phase: " + phase)
        }
    }
    func fail(_ error: String) { guard !completed else { return }; completed = true; save(["passed":false,"error":error,"phases":phases]) }
    func save(_ result: [String: Any]) {
        do {
            var result = result
            result["runId"] = Bundle.main.object(forInfoDictionaryKey: "CrossBusRunID") as? String ?? ""
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("result.json")
            try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted,.sortedKeys]).write(to: url)
            NSLog("CrossBus qualification result: %@", url.path)
            bridge?.close()
            view.configuration.userContentController.removeScriptMessageHandler(forName: "qualification")
        } catch { NSLog("Cannot save qualification result: %@", String(describing: error)) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(String(describing:error)) }
    // Pin the ephemeral fixture certificate and exact configured test host/ports.
    // This delegate is confined to the test host; the production bridge changes no trust policy.
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        let space = challenge.protectionSpace
        let allowed = [origin,denied].compactMap(URL.init(string:)).contains { $0.host == space.host && ($0.port ?? 443) == space.port }
        if allowed, space.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let trust = space.serverTrust, let certificate = SecTrustGetCertificateAtIndex(trust,0) {
            let hash = SHA256.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format:"%02x",$0) }.joined()
            if hash == fingerprint { completionHandler(.useCredential,URLCredential(trust:trust)); return }
        }
        completionHandler(.cancelAuthenticationChallenge,nil)
    }
}
