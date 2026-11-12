package io.crossbus;

import android.net.Uri;
import android.os.Looper;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import org.json.JSONException;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Origin-restricted, main-frame JSON transport. All methods run on the UI thread. */
public final class CrossBusBridge implements AutoCloseable {
    public interface Listener { void onMessage(JSONObject message) throws JSONException; }
    private WebView webView;
    private final Set<String> origins;
    private final String interfaceName;
    private final String callbackName;
    private final int maxMessageBytes;
    private Listener listener;

    public CrossBusBridge(WebView view, Set<String> allowedOrigins) {
        this(view, allowedOrigins, "CrossBus", "__crossbus_receive__", 1048576);
    }

    public CrossBusBridge(WebView view, Set<String> allowedOrigins, String name,
                          String callback, int maxBytes) {
        checkThread();
        if (allowedOrigins.isEmpty() || maxBytes <= 0) throw new IllegalArgumentException("Origins and positive budget required");
        for (String value : allowedOrigins) {
            Uri uri = Uri.parse(value);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null ||
                    value.contains("*") || !value.equals(origin(uri))) {
                throw new IllegalArgumentException("Use exact HTTPS origins without paths");
            }
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            throw new UnsupportedOperationException("WebView WEB_MESSAGE_LISTENER required");
        }
        webView = view;
        origins = new HashSet<>(allowedOrigins);
        interfaceName = name;
        callbackName = callback;
        maxMessageBytes = maxBytes;
        // Unlike addJavascriptInterface, WebView verifies the sending frame's origin.
        WebViewCompat.addWebMessageListener(view, name, origins, (source, message, sourceOrigin, mainFrame, proxy) -> {
            if (webView == null || !mainFrame || !origins.contains(origin(sourceOrigin)) ||
                    message.getType() != WebMessageCompat.TYPE_STRING) return;
            String json = message.getData();
            if (json == null || json.length() > maxBytes || json.getBytes(StandardCharsets.UTF_8).length > maxBytes) return;
            try {
                JSONObject envelope = new JSONObject(json);
                if (valid(envelope) && listener != null) listener.onMessage(envelope);
            } catch (JSONException ignored) { /* Malformed envelopes are rejected. */ }
        });
    }

    private static String origin(Uri uri) {
        int port = uri.getPort();
        return uri.getScheme() + "://" + uri.getHost() + (port == -1 || port == 443 ? "" : ":" + port);
    }
    private static void checkThread() {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Use the UI thread");
    }
    private static boolean valid(JSONObject message) {
        return Integer.valueOf(1).equals(message.opt("_cb")) && message.opt("id") instanceof String &&
            (message.opt("type") instanceof String || message.opt("t") instanceof String);
    }
    public void setListener(Listener value) { checkThread(); listener = value; }

    /** Call after the page has installed NativeBridgeTransport's receive callback. */
    public void send(JSONObject message) {
        checkThread();
        if (webView == null || webView.getUrl() == null || !origins.contains(origin(Uri.parse(webView.getUrl())))) {
            throw new IllegalStateException("Not connected to an allowed origin");
        }
        if (!valid(message)) throw new IllegalArgumentException("Invalid CrossBus envelope");
        String json = message.toString();
        if (json.getBytes(StandardCharsets.UTF_8).length > maxMessageBytes) throw new IllegalArgumentException("Message too large");
        String expectedOrigin = origin(Uri.parse(webView.getUrl()));
        webView.evaluateJavascript("if(location.origin === " + JSONObject.quote(expectedOrigin) + "){globalThis[" + JSONObject.quote(callbackName) + "](" + JSONObject.quote(json) + ")}", null);
    }
    public void reply(JSONObject request, Object data, JSONObject error) throws JSONException {
        JSONObject payload = new JSONObject().put("requestId", request.getString("id"))
            .put("success", error == null).put("data", data == null ? JSONObject.NULL : data)
            .put("error", error == null ? JSONObject.NULL : error);
        send(new JSONObject().put("_cb", 1).put("id", UUID.randomUUID().toString()).put("type", "res").put("payload", payload));
    }
    @Override public void close() {
        checkThread();
        if (webView == null) return;
        WebViewCompat.removeWebMessageListener(webView, interfaceName);
        listener = null;
        webView = null;
    }
}
