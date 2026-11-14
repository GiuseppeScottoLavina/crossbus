package io.crossbus.qualification;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import io.crossbus.CrossBusBridge;
import org.json.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

/** Dedicated disposable host. Console reports are a test control channel, not a CrossBus API. */
public final class MainActivity extends Activity {
    private WebView view;
    private CrossBusBridge bridge;
    private final JSONArray phases = new JSONArray();
    private int echoCalls, protectedCalls, nativeReplies;
    private String nativeRequestId;
    private boolean nativeReplyValid, deniedSendBlocked, closedSendBlocked;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        view = new WebView(this);
        setContentView(view);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebViewAssetLoader allowed = new WebViewAssetLoader.Builder().setDomain("crossbus.test")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebViewAssetLoader denied = new WebViewAssetLoader.Builder().setDomain("denied.crossbus.test")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        view.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest request) {
                WebResourceResponse response = allowed.shouldInterceptRequest(request.getUrl());
                return response != null ? response : denied.shouldInterceptRequest(request.getUrl());
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.message().startsWith("CROSSBUS_QUAL:")) {
                    try { control(new JSONObject(message.message().substring(14))); }
                    catch (Exception error) { fail(error.toString()); }
                }
                return true;
            }
        });
        bridge = new CrossBusBridge(view, new HashSet<>(Arrays.asList("https://crossbus.test")),
            "CrossBus", "__crossbus_receive__", 4096);
        bridge.setListener(this::onMessage);
        view.loadUrl("https://crossbus.test/assets/qualification.html");
    }

    private void onMessage(JSONObject message) throws JSONException {
        JSONObject payload = message.optJSONObject("payload");
        if (payload == null) return;
        if ("res".equals(message.optString("type")) && nativeRequestId != null && nativeRequestId.equals(payload.optString("requestId"))) {
            JSONObject data = payload.optJSONObject("data");
            nativeReplyValid = payload.optBoolean("success") && data != null && data.optInt("received") == 41 && "native 🐟".equals(data.optString("text"));
            nativeReplies++;
            return;
        }
        String name = payload.optString("name");
        if ("sig".equals(message.optString("type")) && "native:probe".equals(name)) {
            nativeRequestId = "native-" + UUID.randomUUID();
            bridge.send(new JSONObject().put("_cb",1).put("id",nativeRequestId).put("type","req")
                .put("payload",new JSONObject().put("name","fromNative").put("data",payload.get("data")).put("source","native").put("dest","web")));
            return;
        }
        if (!"req".equals(message.optString("type"))) return;
        switch (name) {
            case "echo": echoCalls++; bridge.reply(message,payload.opt("data"),null); break;
            case "stats": bridge.reply(message,new JSONObject().put("echoCalls",echoCalls).put("protectedCalls",protectedCalls)
                .put("nativeReplies",nativeReplies).put("nativeReplyValid",nativeReplyValid),null); break;
            case "protected": protectedCalls++; bridge.reply(message,7,null); break;
            case "never": break;
            default: bridge.reply(message,null,new JSONObject().put("code","ERR_NO_HANDLER").put("message","Unknown handler"));
        }
    }

    private JSONObject probe() throws JSONException {
        return new JSONObject().put("_cb",1).put("id","guard-probe").put("type","sig");
    }
    private void control(JSONObject report) throws Exception {
        String phase = report.optString("phase");
        switch (phase) {
            case "failed": fail(report.toString()); break;
            case "first":
                phases.put(report);
                view.postDelayed(() -> view.loadUrl("https://denied.crossbus.test/assets/denied.html"),50);
                break;
            case "denied":
                if (report.optBoolean("androidObjectExposed")) throw new IllegalStateException("Bridge exposed on denied origin");
                try { bridge.send(probe()); } catch (IllegalStateException expected) { deniedSendBlocked = true; }
                phases.put(report);
                view.postDelayed(() -> view.loadUrl("https://crossbus.test/assets/qualification.html?reload=1"),50);
                break;
            case "close":
                bridge.close();
                try { bridge.send(probe()); } catch (IllegalStateException expected) { closedSendBlocked = true; }
                view.evaluateJavascript("window.__crossbusTestClosed()",null);
                break;
            case "complete":
                if (phases.length()!=2 || protectedCalls!=0 || echoCalls<2 || nativeReplies<2 || !nativeReplyValid || !deniedSendBlocked || !closedSendBlocked)
                    throw new IllegalStateException("Native ledger/guard assertion failed");
                phases.put(report);
                JSONObject result = new JSONObject().put("passed",true).put("phases",phases).put("echoCalls",echoCalls)
                    .put("protectedCalls",protectedCalls).put("nativeReplies",nativeReplies).put("nativeReplyValid",nativeReplyValid).put("deniedSendBlocked",deniedSendBlocked)
                    .put("closedSendBlocked",closedSendBlocked).put("androidApi",android.os.Build.VERSION.SDK_INT)
                    .put("androidVersion",android.os.Build.VERSION.RELEASE).put("model",android.os.Build.MODEL)
                    .put("webViewVersion",WebViewCompat.getCurrentWebViewPackage(this).versionName);
                save(result); break;
            default: throw new IllegalArgumentException("Unknown fixture control phase: "+phase);
        }
    }
    private void save(JSONObject result) {
        try {
            result.put("runId",getIntent().getStringExtra("runId"));
            java.io.FileOutputStream out = new java.io.FileOutputStream(new File(getFilesDir(),"result.json"));
            out.write(result.toString(2).getBytes(StandardCharsets.UTF_8));out.close();
            android.util.Log.i("CrossBusQualification",result.toString());
        } catch(Exception error) { android.util.Log.e("CrossBusQualification","Cannot write result",error); }
    }
    private void fail(String error) {
        try {save(new JSONObject().put("passed",false).put("error",error).put("phases",phases));}
        catch(JSONException impossible) {throw new RuntimeException(impossible);}
    }
    @Override public void onDestroy() { if(bridge!=null)bridge.close();if(view!=null)view.destroy();super.onDestroy(); }
}
