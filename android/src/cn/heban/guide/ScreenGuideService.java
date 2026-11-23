package cn.heban.guide;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.TextView;
import java.util.Locale;
import java.util.Objects;

public final class ScreenGuideService extends AccessibilityService {
    static ScreenGuideService connected;
    private static final String FIND = "请点字体大小";
    private static final String WAIT = "正在打开字体设置";
    private static final String ENLARGE = "请把字体调大";
    private static final String DONE = "字体已放大";
    private static final String UNKNOWN = "可在设置里搜字体大小";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable poll = this::inspect;
    private final Runnable update = this::inspectSoon;
    private String settingsPackage;
    private float initialFont;
    private long started;
    private long tappedAt;
    private long lastSupportedWindow;
    private boolean enteredSettings;
    private boolean finished;
    private Rect target;
    private WindowManager windows;
    private TextView caption;
    private View glow;
    private TextToSpeech speech;
    private boolean speechReady;
    private String lastUttered = "";

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        connected = this;
        windows = getSystemService(WindowManager.class);
        speech = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || speech == null || speech.getVoices() == null) return;
            Voice mandarin = speech.getVoices().stream().filter(voice -> "zh".equals(voice.getLocale().getLanguage())
                    && !voice.isNetworkConnectionRequired()).findFirst().orElse(null);
            if (mandarin != null) speechReady = speech.setVoice(mandarin) == TextToSpeech.SUCCESS;
            if (speechReady && caption != null) announce(caption.getText().toString());
        });
    }

    void begin(String packageName) {
        end();
        settingsPackage = packageName;
        initialFont = Settings.System.getFloat(getContentResolver(), Settings.System.FONT_SCALE, getResources().getConfiguration().fontScale);
        started = SystemClock.elapsedRealtime();
        inspectSoon();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (settingsPackage == null || finished) return;
        if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_CLICKED && target != null
                && settingsPackage.contentEquals(Objects.toString(event.getPackageName(), ""))) {
            AccessibilityNodeInfo source = event.getSource();
            if (source != null) {
                try {
                    Rect bounds = new Rect();
                    source.getBoundsInScreen(bounds);
                    int x = bounds.centerX();
                    int y = bounds.centerY();
                    if (!bounds.isEmpty() && target.contains(x, y)
                            && bounds.width() <= target.width() && bounds.height() <= target.height()) {
                        tappedAt = SystemClock.elapsedRealtime();
                        dropGlow();
                        target = null;
                        showCaption(WAIT);
                    }
                } finally { source.recycle(); }
            }
        }
        handler.removeCallbacks(update);
        handler.postDelayed(update, 90);
    }

    private void inspectSoon() {
        handler.removeCallbacks(poll);
        inspect();
    }

    private void inspect() {
        if (settingsPackage == null || finished) return;
        long now = SystemClock.elapsedRealtime();
        if (now - started > 150_000) { end(); return; }
        AccessibilityNodeInfo root = getRootInActiveWindow();
        try {
            if (root == null || !settingsPackage.contentEquals(Objects.toString(root.getPackageName(), ""))) {
                clearOverlays();
                target = null;
                if (enteredSettings && now - lastSupportedWindow > 1800) { end(); return; }
            } else {
                enteredSettings = true;
                lastSupportedWindow = now;
                Candidates state = new Candidates();
                scan(root, null, false, 0, state);
                float fontScale = Settings.System.getFloat(getContentResolver(), Settings.System.FONT_SCALE, initialFont);
                if (FontTargets.enlarged(initialFont, fontScale)) {
                    finished = true;
                    dropGlow();
                    showCaption(DONE);
                    handler.postDelayed(this::end, 2500);
                    return;
                }
                if (state.adjust != null) {
                    target = null;
                    showCaption(ENLARGE);
                    showGlow(state.adjust);
                } else if (now - tappedAt < 1000) {
                    target = null;
                    dropGlow();
                    showCaption(WAIT);
                } else {
                    target = state.font != null ? state.font : state.display;
                    if (target != null) {
                        showCaption(state.font != null ? FIND : "请点显示大小和文字");
                        showGlow(target);
                    } else {
                        dropGlow();
                        if (now - started >= 2200) showCaption(UNKNOWN);
                    }
                }
            }
        } finally { if (root != null) root.recycle(); }
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, 350);
    }

    private void scan(AccessibilityNodeInfo node, Rect row, boolean sizeGroup, int depth, Candidates result) {
        if (depth > 22 || result.visited++ >= 500 || !node.isVisibleToUser()) return;
        CharSequence label = node.getText();
        CharSequence description = node.getContentDescription();
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        Rect clickable = node.isClickable() && node.isEnabled() && !bounds.isEmpty() && bounds.height() <= dp(180) ? bounds : row;
        boolean font = FontTargets.font(label) || FontTargets.font(description);
        boolean display = FontTargets.display(label) || FontTargets.display(description);
        if (clickable != null && font && result.font == null) result.font = clickable;
        if (clickable != null && display && result.display == null) result.display = clickable;
        boolean adjust = FontTargets.increase(label) || FontTargets.increase(description);
        if (result.adjust == null && node.isEnabled() && !bounds.isEmpty()
                && ((node.getRangeInfo() != null && (font || sizeGroup || FontTargets.fontControl(node.getViewIdResourceName())))
                        || (adjust && node.isClickable()))) result.adjust = bounds;
        boolean labelledGroup = sizeGroup || font || hasFontLabel(node);
        for (int i = 0; i < node.getChildCount() && result.visited < 500; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            try { scan(child, clickable, labelledGroup, depth + 1, result); }
            finally { child.recycle(); }
        }
    }

    private boolean hasFontLabel(AccessibilityNodeInfo node) {
        // A slider can be described by a sibling label in the same small settings row.
        int count = node.getChildCount();
        if (count < 2 || count > 4) return false;
        boolean slider = false;
        boolean label = false;
        for (int i = 0; i < count; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            try {
                slider |= child.getRangeInfo() != null;
                label |= FontTargets.font(child.getText()) || FontTargets.font(child.getContentDescription());
            } finally { child.recycle(); }
        }
        return slider && label;
    }

    private static final class Candidates {
        Rect font;
        Rect display;
        Rect adjust;
        int visited;
    }

    private WindowManager.LayoutParams overlay(int width, int height) {
        return new WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
    }

    private void showCaption(String text) {
        if (caption != null && text.contentEquals(caption.getText())) return;
        if (caption == null) {
            caption = new TextView(this);
            caption.setGravity(Gravity.CENTER);
            caption.setSingleLine(true);
            caption.setEllipsize(TextUtils.TruncateAt.END);
            caption.setTextSize(18);
            caption.setTextColor(Color.WHITE);
            caption.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            caption.setShadowLayer(dp(3), 0, dp(1), Color.BLACK);
            caption.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            WindowManager.LayoutParams params = overlay(WindowManager.LayoutParams.MATCH_PARENT, dp(29));
            params.gravity = Gravity.TOP;
            params.y = topInset();
            windows.addView(caption, params);
        }
        caption.setText(text);
        announce(text);
    }

    private void announce(String text) {
        if (!speechReady || speech == null || text.equals(lastUttered)) return;
        lastUttered = text;
        speech.setSpeechRate(0.84f);
        speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, text);
    }

    private void showGlow(Rect location) {
        if (glow != null && location.equals(glow.getTag())) return;
        dropGlow();
        WindowManager.LayoutParams params = overlay(dp(13), dp(13));
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.x = Math.max(0, location.right - dp(27));
        // Leave the caption clear even if a settings row is at the top edge.
        params.y = Math.max(topInset() + dp(29), location.centerY() - dp(6));
        glow = new View(this);
        glow.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        glow.setTag(new Rect(location));
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(0xffffc334);
        dot.setStroke(dp(2), 0xff624308);
        glow.setBackground(dot);
        windows.addView(glow, params);
    }

    private void dropGlow() {
        if (glow == null) return;
        windows.removeView(glow);
        glow = null;
    }

    private void clearOverlays() {
        dropGlow();
        if (caption != null) { windows.removeView(caption); caption = null; }
    }

    void end() {
        settingsPackage = null;
        enteredSettings = finished = false;
        target = null;
        tappedAt = lastSupportedWindow = 0;
        lastUttered = "";
        handler.removeCallbacksAndMessages(null);
        clearOverlays();
        if (speechReady) speech.stop();
    }

    @Override public void onInterrupt() { end(); }

    @Override public void onDestroy() {
        if (connected == this) connected = null;
        end();
        if (speech != null) speech.shutdown();
        super.onDestroy();
    }

    private int topInset() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            return windows.getCurrentWindowMetrics().getWindowInsets().getInsetsIgnoringVisibility(android.view.WindowInsets.Type.statusBars()).top;
        }
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id == 0 ? dp(24) : getResources().getDimensionPixelSize(id);
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
