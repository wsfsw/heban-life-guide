package cn.heban.guide;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private TextView title;
    private TextView status;
    private Button start;
    private Button permission;
    private Button next;
    private Button replay;
    private Button stop;
    private GuidePlan pendingPlan;
    private boolean invalidPlan;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        readPlan(getIntent());
        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.WHITE);
        layout.setPadding(dp(22), dp(24), dp(22), dp(24));
        layout.setOnApplyWindowInsetsListener((view, insets) -> applyInsets(view, insets));

        title = text("禾伴屏幕引导", 27);
        layout.addView(title);
        layout.addView(text("开始后，可以退出禾伴或切换应用。屏幕顶部会显示一行字，找到这一步的按钮时会亮起小光点。", 18));
        layout.addView(text("请您自己点击。您可以在通知栏或回到禾伴结束引导。", 16));

        permission = add(layout, "去开启禾伴屏幕引导", () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        start = add(layout, "开始跨应用引导", this::confirmStart);
        replay = add(layout, "再听这一步", () -> { if (ScreenGuideService.connected != null) ScreenGuideService.connected.replay(); });
        next = add(layout, "我做完了，下一步", () -> {
            if (ScreenGuideService.connected != null) ScreenGuideService.connected.next();
            refreshStatus();
        });
        stop = add(layout, "结束引导", () -> {
            if (ScreenGuideService.connected != null) ScreenGuideService.connected.end();
            refreshStatus();
        });

        status = text("", 16);
        layout.addView(status);
        scroll.addView(layout);
        setContentView(scroll);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readPlan(intent);
        refreshStatus();
    }

    private void readPlan(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        invalidPlan = false;
        pendingPlan = null;
        if (uri != null && "heban-guide".equals(uri.getScheme()) && "phone".equals(uri.getHost()) && "/steps".equals(uri.getPath())) {
            pendingPlan = GuidePlan.parse(uri.getQueryParameter("plan"));
            invalidPlan = pendingPlan == null;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        refreshStatus();
        start.postDelayed(this::refreshStatus, 500);
    }

    private void refreshStatus() {
        ScreenGuideService service = ScreenGuideService.connected;
        boolean running = service != null && service.isRunning();
        title.setText(pendingPlan == null ? "放大手机字体" : pendingPlan.title);
        start.setEnabled(service != null && !invalidPlan);
        start.setText(running ? "重新开始这项引导" : "开始跨应用引导");
        permission.setVisibility(service == null ? View.VISIBLE : View.GONE);
        replay.setVisibility(running ? View.VISIBLE : View.GONE);
        next.setVisibility(running && service.hasPlan() ? View.VISIBLE : View.GONE);
        stop.setVisibility(running ? View.VISIBLE : View.GONE);
        status.setText(invalidPlan ? "没有读到这次的步骤。请从禾伴助手再次打开。"
                : running ? service.currentPrompt() : service == null ? "请先开启辅助功能里的「禾伴屏幕引导」。" : "");
    }

    private void confirmStart() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !getPreferences(MODE_PRIVATE).getBoolean("askedForNotifications", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("askedForNotifications", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        } else begin();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 1 && results.length > 0) begin();
    }

    private void begin() {
        ScreenGuideService service = ScreenGuideService.connected;
        if (service == null || invalidPlan) { refreshStatus(); return; }
        Intent intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
        ResolveInfo resolved = getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY | PackageManager.MATCH_SYSTEM_ONLY);
        ComponentName settings = resolved != null && (resolved.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0
                ? new ComponentName(resolved.activityInfo.packageName, resolved.activityInfo.name) : null;
        String settingsPackage = settings == null ? "com.android.settings" : settings.getPackageName();
        service.begin(settingsPackage, pendingPlan);
        if (pendingPlan == null && settings != null) {
            try {
                startActivity(intent.setComponent(settings));
            } catch (ActivityNotFoundException | SecurityException failure) {
                status.setText("请手动打开手机设置。");
            }
        } else {
            moveTaskToBack(true);
        }
        refreshStatus();
    }

    private Button add(LinearLayout layout, String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setOnClickListener(view -> action.run());
        layout.addView(button);
        return button;
    }

    private TextView text(String value, int size) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(0xff172d44);
        text.setPadding(0, 0, 0, dp(16));
        return text;
    }

    private WindowInsets applyInsets(View view, WindowInsets insets) {
        view.setPadding(dp(22) + insets.getSystemWindowInsetLeft(), dp(24) + insets.getSystemWindowInsetTop(),
                dp(22) + insets.getSystemWindowInsetRight(), dp(24) + insets.getSystemWindowInsetBottom());
        return insets;
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
