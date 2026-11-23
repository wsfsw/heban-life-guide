package cn.heban.guide;

import java.util.Locale;
import java.util.List;

final class FontTargets {
    private static final List<String> FONT = java.util.Arrays.asList("字体大小", "文字大小", "字号", "font size", "text size");
    private static final List<String> DISPLAY = java.util.Arrays.asList("显示大小和文字", "显示大小和字体", "字体与显示大小", "字体大小与粗细",
            "字体大小和样式", "字体与屏幕缩放", "display size and text", "font size and style", "font and screen zoom");
    private static final List<String> INCREASE = java.util.Arrays.asList("增大字体", "增大字号", "增加字体大小", "调大字体", "放大字体", "increase font size", "larger font");

    static String normalize(CharSequence label) {
        return label == null ? "" : label.toString().trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    static boolean font(CharSequence label) { return FONT.contains(normalize(label)); }
    static boolean display(CharSequence label) { return DISPLAY.contains(normalize(label)); }
    static boolean increase(CharSequence label) { return INCREASE.contains(normalize(label)); }

    static boolean fontControl(CharSequence id) {
        String name = normalize(id);
        return name.endsWith("/font_size") || name.endsWith("/font_size_seekbar") || name.endsWith("/font_scale");
    }

    static boolean enlarged(float initial, float current) {
        return Float.isFinite(initial) && Float.isFinite(current) && current > initial + 0.005f;
    }
}
