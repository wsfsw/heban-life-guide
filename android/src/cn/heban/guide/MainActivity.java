package cn.heban.guide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private TextView status;
    private Button start;
    private Button permission;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.WHITE);
        layout.setPadding(dp(22), dp(24), dp(22), dp(24));
        layout.setOnApplyWindowInsetsListener((view, insets) -> applyInsets(view, insets));

        TextView title = text("放大手机字体", 27);
        layout.addView(title);
        layout.addView(text("禾伴会在系统设置上方显示一行字，在该点的地方亮一个小光点。请您自己点击。", 18));
        layout.addView(text("开启辅助功能后，禾伴只在您主动开始引导时识别字体控件，内容留在这台手机。", 16));

        permission = new Button(this);
        permission.setText("去开启禾伴屏幕引导");
        permission.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        layout.addView(permission);

        start = new Button(this);
        start.setText("开始引导");
        start.setOnClickListener(view -> begin());
        layout.addView(start);

        status = text("", 16);
        layout.addView(status);
        setContentView(layout);
    }

    @Override protected void onResume() {
        super.onResume();
        ScreenGuideService service = ScreenGuideService.connected;
        if (service != null) service.end();
        refreshStatus();
        if (service == null) start.postDelayed(this::refreshStatus, 500);
    }

    private void refreshStatus() {
        ScreenGuideService service = ScreenGuideService.connected;
        start.setEnabled(service != null);
        permission.setVisibility(service == null ? View.VISIBLE : View.GONE);
        status.setText(service == null ? "请先开启辅助功能里的「禾伴屏幕引导」。" : "");
    }

    private void begin() {
        ScreenGuideService service = ScreenGuideService.connected;
        if (service == null) { status.setText("请先开启禾伴屏幕引导。"); return; }
        Intent intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
        ResolveInfo resolved = getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY | PackageManager.MATCH_SYSTEM_ONLY);
        ComponentName settings = resolved != null && (resolved.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0
                ? new ComponentName(resolved.activityInfo.packageName, resolved.activityInfo.name) : null;
        if (settings == null) { status.setText("这台手机暂时找不到显示设置入口。"); return; }
        intent.setComponent(settings);
        try {
            service.begin(settings.getPackageName());
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException failure) {
            service.end();
            status.setText("没能打开系统的显示设置。");
        }
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
