package cn.heban.guide;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    static final String PAGES = "https://wsfsw.github.io/heban-life-guide-pages/";
    private static final String CLOUD = "https://heban-life-guide.wsfsw2008.chatgpt.site/";
    private static final int FILE_PICKER = 20;
    private static final int WEB_PERMISSIONS = 21;
    private WebView web;
    private PermissionRequest mediaRequest;
    private ValueCallback<Uri[]> files;
    private boolean switchingSite;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setOnApplyWindowInsetsListener(this::applyInsets);
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.END);
        actions.addView(button("用浏览器打开", () -> openBrowser(currentTrustedUrl())));
        actions.addView(button("屏幕引导", () -> openGuide(null)));
        layout.addView(actions);
        web = new WebView(this);
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " HebanAndroid/0.5");
        web.setWebViewClient(new Navigation());
        web.setWebChromeClient(new Media());
        Bundle savedWeb = state == null ? null : state.getBundle("web");
        if (savedWeb == null || web.restoreState(savedWeb) == null) web.loadUrl(PAGES + "#/elder");
        if (state == null) handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        Uri guide = intent == null ? null : intent.getData();
        if (guideUrl(guide)) openGuide(guide);
    }

    private void openGuide(Uri data) {
        Intent intent = new Intent(this, GuideActivity.class);
        if (data != null) intent.setData(data);
        startActivity(intent);
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); deliverGuideResult(); }
    }

    @Override protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        Bundle browserState = new Bundle();
        web.saveState(browserState);
        state.putBundle("web", browserState);
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        if (files != null) files.onReceiveValue(null);
        if (mediaRequest != null) mediaRequest.deny();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else {
            ScreenGuideService service = ScreenGuideService.connected;
            if (service == null || !service.isRunning() || !moveTaskToBack(true)) super.onBackPressed();
        }
    }

    private void deliverGuideResult() {
        if (!trustedPage(currentPage())) return;
        ScreenGuideService service = ScreenGuideService.connected;
        String completed = getSharedPreferences("guide_result", MODE_PRIVATE).getString("ref", "");
        String reference = service == null || service.resultRef().isEmpty() ? completed : service.resultRef();
        if (reference.isEmpty()) return;
        String status = service != null && reference.equals(service.resultRef()) ? service.resultStatus() : "completed";
        String ref = org.json.JSONObject.quote(reference);
        String result = org.json.JSONObject.quote(status);
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('heban-guide-result',{detail:{ref:" + ref + ",status:" + result + "}}))", null);
    }

    private static boolean mainOrigin(Uri uri, String host) {
        return uri != null && "https".equals(uri.getScheme()) && host.equals(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private static boolean trustedPage(Uri uri) {
        if (mainOrigin(uri, "heban-life-guide.wsfsw2008.chatgpt.site")) return true;
        return mainOrigin(uri, "wsfsw.github.io") && uri.getPath() != null && uri.getPath().startsWith("/heban-life-guide-pages/");
    }

    private static boolean guideUrl(Uri uri) {
        return uri != null && "heban-guide".equals(uri.getScheme()) && "phone".equals(uri.getHost())
                && ("/font".equals(uri.getPath()) || "/steps".equals(uri.getPath()));
    }

    private Uri currentTrustedUrl() {
        Uri current = currentPage();
        return trustedPage(current) ? current : Uri.parse(PAGES);
    }

    private Uri currentPage() {
        return Uri.parse(web == null || web.getUrl() == null ? "" : web.getUrl());
    }

    private void openBrowser(Uri url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
        catch (ActivityNotFoundException failure) { Toast.makeText(this, "找不到可打开此链接的应用。", Toast.LENGTH_SHORT).show(); }
    }

    private final class Navigation extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!request.isForMainFrame()) return !trustedPage(url);
            if (guideUrl(url)) {
                if (request.hasGesture() && trustedPage(currentPage())) openGuide(url);
                return true;
            }
            if (trustedPage(url)) return false;
            if (request.hasGesture() && ("https".equals(url.getScheme()) || "tel".equals(url.getScheme()))) openBrowser(url);
            return true;
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) openAlternateSite(request.getUrl());
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
            if (request.isForMainFrame() && error.getStatusCode() >= 400) openAlternateSite(request.getUrl());
        }

        @Override public void onPageFinished(WebView view, String url) { deliverGuideResult(); }
    }

    private void openAlternateSite(Uri failed) {
        if (switchingSite || !trustedPage(failed)) return;
        switchingSite = true;
        boolean failedPages = mainOrigin(failed, "wsfsw.github.io");
        web.post(() -> web.loadUrl((failedPages ? CLOUD : PAGES) + "#/elder"));
    }

    private final class Media extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (!trustedPage(currentPage())) { callback.onReceiveValue(null); return true; }
            if (files != null) files.onReceiveValue(null);
            files = callback;
            try { startActivityForResult(params.createIntent(), FILE_PICKER); }
            catch (ActivityNotFoundException failure) { files.onReceiveValue(null); files = null; }
            return true;
        }

        @Override public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> requestMedia(request));
        }

        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (mediaRequest == request) mediaRequest = null;
        }
    }

    private static String permissionFor(String resource) {
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        return "";
    }

    private void requestMedia(PermissionRequest request) {
        if (mediaRequest != null || !canGrantMedia(request)) {
            request.deny();
            return;
        }
        List<String> pending = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = permissionFor(resource);
            if (!permission.isEmpty() && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) pending.add(permission);
        }
        if (pending.isEmpty()) grantMedia(request);
        else {
            mediaRequest = request;
            requestPermissions(pending.toArray(new String[0]), WEB_PERMISSIONS);
        }
    }

    private void grantMedia(PermissionRequest request) {
        if (!canGrantMedia(request)) { request.deny(); return; }
        List<String> allowed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = permissionFor(resource);
            if (!permission.isEmpty() && checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) allowed.add(resource);
        }
        if (allowed.isEmpty()) request.deny();
        else request.grant(allowed.toArray(new String[0]));
    }

    private boolean canGrantMedia(PermissionRequest request) {
        Uri page = currentPage();
        return trustedPage(page) && mainOrigin(request.getOrigin(), page.getHost());
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == WEB_PERMISSIONS && mediaRequest != null) {
            PermissionRequest request = mediaRequest;
            mediaRequest = null;
            grantMedia(request);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_PICKER && files != null) {
            Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result, data);
            if (selected != null) {
                for (Uri uri : selected) {
                    if (!"content".equals(uri.getScheme())) { selected = null; break; }
                }
            }
            files.onReceiveValue(selected);
            files = null;
        }
    }

    private Button button(String text, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private WindowInsets applyInsets(View view, WindowInsets insets) {
        view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
        return insets;
    }
}
