import Foundation
import CoreFoundation
import WebKit

/// Main-frame, HTTPS-origin-restricted JSON transport for NativeBridgeTransport.
/// Register before loading the page; retain the bridge and call close() on teardown.
@MainActor
public final class CrossBusBridge: NSObject, WKScriptMessageHandler {
    public var onMessage: (([String: Any]) -> Void)?
    private weak var webView: WKWebView?
    private let origins: Set<String>
    private let name: String
    private let callback: String
    private let maxBytes: Int
    private var closed = false

    public init(webView: WKWebView, allowedOrigins: Set<String>,
                handlerName: String = "crossbus", callbackName: String = "__crossbus_receive__",
                maxMessageBytes: Int = 1_048_576) {
        precondition(!allowedOrigins.isEmpty && maxMessageBytes > 0)
        precondition(allowedOrigins.allSatisfy { origin in
            guard let url = URL(string: origin) else { return false }
            return url.scheme == "https" && url.host != nil && Self.origin(url) == origin
        }, "Use exact HTTPS origins without paths or wildcards")
        self.webView = webView
        self.origins = allowedOrigins
        self.name = handlerName
        self.callback = callbackName
        self.maxBytes = maxMessageBytes
        super.init()
        webView.configuration.userContentController.add(self, name: name)
    }

    private static func origin(_ url: URL) -> String {
        guard let scheme = url.scheme, let host = url.host else { return "" }
        return "\(scheme)://\(host)" + (url.port == nil || url.port == 443 ? "" : ":\(url.port!)")
    }

    public func userContentController(_ userContentController: WKUserContentController,
                                      didReceive message: WKScriptMessage) {
        guard !closed, message.webView === webView, message.name == name,
              message.frameInfo.isMainFrame else { return }
        let origin = message.frameInfo.securityOrigin
        let port = origin.port == 0 || origin.port == 443 ? "" : ":\(origin.port)"
        guard origins.contains("\(origin.protocol)://\(origin.host)\(port)"),
              let body = message.body as? [String: Any], Self.valid(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              data.count <= maxBytes else { return }
        onMessage?(body)
    }

    private static func valid(_ message: [String: Any]) -> Bool {
        // NSNumber bridges JSON true to Int(1); protocol v1 requires a number.
        guard let marker = message["_cb"] as? NSNumber,
              CFGetTypeID(marker) != CFBooleanGetTypeID(), marker.doubleValue == 1 else { return false }
        return message["id"] is String && (message["type"] is String || message["t"] is String)
    }

    /// Delivers an envelope to JS; JSON is encoded as a value, never interpolated as code.
    /// Call after the page has installed NativeBridgeTransport's receive callback.
    public func send(_ message: [String: Any], completion: ((Error?) -> Void)? = nil) throws {
        guard !closed, let view = webView, let url = view.url, origins.contains(Self.origin(url)) else {
            throw NSError(domain: "CrossBus", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not connected to an allowed origin"])
        }
        guard Self.valid(message) else { throw NSError(domain: "CrossBus", code: 2) }
        let data = try JSONSerialization.data(withJSONObject: message, options: [.fragmentsAllowed])
        guard data.count <= maxBytes else { throw NSError(domain: "CrossBus", code: 3) }
        let callbackJSON = String(data: try JSONSerialization.data(withJSONObject: callback, options: [.fragmentsAllowed]), encoding: .utf8)!
        // Pass a JSON string to the JS receiver, escaping quotes and script characters.
        let json = String(data: data, encoding: .utf8)!
        let argument = String(data: try JSONSerialization.data(withJSONObject: json, options: [.fragmentsAllowed]), encoding: .utf8)!
        let expectedOrigin = String(data: try JSONSerialization.data(withJSONObject: Self.origin(url), options: [.fragmentsAllowed]), encoding: .utf8)!
        view.evaluateJavaScript("if(location.origin === \(expectedOrigin)){globalThis[\(callbackJSON)](\(argument))}") { _, error in completion?(error) }
    }

    /// Reply to a standard CrossBus request envelope from onMessage.
    public func reply(to request: [String: Any], data: Any = NSNull(),
                      error: [String: String]? = nil) throws {
        guard let id = request["id"] as? String else { throw NSError(domain: "CrossBus", code: 2) }
        try send(["_cb": 1, "id": UUID().uuidString, "type": "res", "payload": [
            "requestId": id, "success": error == nil, "data": data,
            "error": error as Any? ?? NSNull()
        ]])
    }

    public func close() {
        guard !closed else { return }
        closed = true
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: name)
        onMessage = nil
        webView = nil
    }
}
