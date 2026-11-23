package cn.heban.guide;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

final class GuidePlan {
    private static final Pattern SENSITIVE = Pattern.compile(
            "付款|支付|转账|下单|删除|确认购买|授权|验证码|密码|登录|发送|同意|\\b(pay|purchase|delete|send|password|allow|sign in)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PACKAGE = Pattern.compile("[a-zA-Z]\\w*(\\.[a-zA-Z]\\w*){1,6}");
    final String title;
    final String app;
    final List<Step> steps;

    static final class Step {
        final String text;
        final String target;
        final String app;

        Step(String text, String target, String app) {
            this.text = text;
            this.target = target.length() <= 28 && !SENSITIVE.matcher(target).find()
                    ? FontTargets.normalize(target) : "";
            this.app = app;
        }

        boolean matches(CharSequence label) {
            return !target.isEmpty() && target.equals(FontTargets.normalize(label));
        }
    }

    private GuidePlan(String title, String app, List<Step> steps) {
        this.title = title;
        this.app = app;
        this.steps = Collections.unmodifiableList(steps);
    }

    static GuidePlan parse(String payload) {
        if (payload == null || payload.length() > 2200) return null;
        try {
            JSONObject input = new JSONObject(payload);
            JSONArray steps = input.optJSONArray("steps");
            if (steps == null || steps.length() == 0 || steps.length() > 5) return null;
            List<Step> output = new ArrayList<>();
            for (int i = 0; i < steps.length(); i++) {
                JSONObject step = steps.optJSONObject(i);
                if (step == null) return null;
                String text = step.optString("text").trim();
                if (text.isEmpty() || text.length() > 85 || text.matches("(?s).*\\p{Cntrl}.*")) return null;
                output.add(new Step(text, step.optString("target", ""), step.optString("app", "")));
            }
            String title = input.optString("title", "手机操作引导").trim();
            if (title.isEmpty() || title.length() > 24 || title.matches("(?s).*\\p{Cntrl}.*")) title = "手机操作引导";
            return new GuidePlan(title, input.optString("app"), output);
        } catch (JSONException invalid) {
            return null;
        }
    }

    boolean containsApp(Step step, String current, String settingsPackage) {
        String scope = step.app.isEmpty() ? app : step.app;
        switch (scope) {
            case "settings": return current.equals(settingsPackage);
            case "wechat": return "com.tencent.mm".equals(current);
            case "qq": return "com.tencent.mobileqq".equals(current);
            case "maps": return "com.autonavi.minimap".equals(current) || "com.baidu.BaiduMap".equals(current) || "com.tencent.map".equals(current);
            case "browser": return "com.android.chrome".equals(current) || "com.microsoft.emmx".equals(current) || "com.UCMobile".equals(current);
            default: return scope.length() <= 100 && PACKAGE.matcher(scope).matches() && current.equals(scope);
        }
    }

    boolean opensApp(Step step) {
        String names;
        switch (step.app.isEmpty() ? app : step.app) {
            case "settings": names = "(系统设置|设置)"; break;
            case "wechat": names = "微信"; break;
            case "qq": names = "QQ"; break;
            case "maps": names = "(高德地图|百度地图|腾讯地图)"; break;
            case "browser": names = "(浏览器|Chrome|Edge)"; break;
            default: return false;
        }
        return step.text.matches("(?i)(请|先|请先)?(打开|进入|切换到)(手机(里|中|上)?的)?[“「]?"+ names +"[”」]?(应用|App)?[。！!]?");
    }

    static boolean protectedPackage(String name) {
        String check = name.toLowerCase(Locale.ROOT);
        return check.contains("permissioncontroller") || check.contains("packageinstaller")
                || check.contains("credential") || check.contains("authenticator");
    }
}
