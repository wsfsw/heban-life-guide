package cn.heban.guide;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.AssetFileDescriptor;
import android.database.ContentObserver;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class ScreenGuideService extends AccessibilityService {
    static ScreenGuideService connected;
    private static final String FIND = "请点字体大小";
    private static final String WAIT = "正在打开字体设置";
    private static final String ENLARGE = "请把字体调大";
    private static final String DONE = "字体已放大";
    private static final String UNKNOWN = "可在设置里搜字体大小";
    private static final String SEARCH_FONT = "请在设置中搜字体";
    private static final String TYPE_FONT = "请输入字体";
    private static final String VIVO_FONT = "请点字体大小与粗细";
    private static final String VIVO_ADJUST = "请拖动上面的字号滑块";
    private static final String OPEN_SETTINGS = "请打开手机设置";
    private static final String CHANNEL = "heban_guide";
    private static final int NOTIFICATION = 37;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable poll = this::inspect;
    private final Runnable update = this::inspectSoon;
    private String settingsPackage;
    private float initialFont;
    private float initialConfigFont;
    private long started;
    private long tappedAt;
    private boolean finished;
    private GuidePlan plan;
    private GuideSessionStore sessions;
    private boolean observingFont;
    private StepEvidence evidence = new StepEvidence();
    private String sessionRef = "";
    private String resultRef = "";
    private String resultStatus = "";
    private int stepIndex;
    private String prompt = OPEN_SETTINGS;
    private Rect target;
    private String targetPackage = "";
    private int targetWindow;
    private long targetSince;
    private long advanceAt;
    private CapturedTarget recentTarget;
    private float initialRange = Float.NaN;
    private String currentRangeKey = "";
    private WindowManager windows;
    private KeyguardManager keyguard;
    private NotificationManager notifications;
    private TextView caption;
    private View glow;
    private TextToSpeech speech;
    private MediaPlayer recording;
    private boolean speechReady;
    private String lastUttered = "";
    private final ContentObserver fontObserver = new ContentObserver(handler) {
        @Override public void onChange(boolean selfChange) { inspectSoon(); }
    };

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        connected = this;
        windows = getSystemService(WindowManager.class);
        keyguard = getSystemService(KeyguardManager.class);
        notifications = getSystemService(NotificationManager.class);
        sessions = new GuideSessionStore(getSharedPreferences("active_guide", MODE_PRIVATE));
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "禾伴屏幕引导", NotificationManager.IMPORTANCE_LOW));
        if (!observingFont) {
            getContentResolver().registerContentObserver(Settings.System.getUriFor(Settings.System.FONT_SCALE), false, fontObserver);
            observingFont = true;
        }
        if (speech == null) {
            speech = new TextToSpeech(this, status -> {
                if (status != TextToSpeech.SUCCESS || speech == null || speech.getVoices() == null) return;
                Voice mandarin = speech.getVoices().stream().filter(voice -> ("zh".equals(voice.getLocale().getLanguage())
                        || "cmn".equals(voice.getLocale().getLanguage())) && !voice.isNetworkConnectionRequired()).findFirst().orElse(null);
                if (mandarin != null) speechReady = speech.setVoice(mandarin) == TextToSpeech.SUCCESS;
                if (speechReady && caption != null) announce(caption.getText().toString());
            });
        }
        if (!isRunning()) restoreSession();
    }

    void begin(String packageName, GuidePlan instructions, String ref) {
        end();
        settingsPackage = packageName;
        plan = instructions;
        sessionRef = ref;
        resultRef = ref;
        resultStatus = "running";
        if (ref.equals(getSharedPreferences("guide_result", MODE_PRIVATE).getString("ref", ""))) {
            getSharedPreferences("guide_result", MODE_PRIVATE).edit().remove("ref").apply();
        }
        stepIndex = 0;
        prompt = plan == null ? OPEN_SETTINGS : plan.steps.get(0).text;
        initialConfigFont = getResources().getConfiguration().fontScale;
        initialFont = Settings.System.getFloat(getContentResolver(), Settings.System.FONT_SCALE, Float.NaN);
        started = SystemClock.elapsedRealtime();
        saveSession();
        publishNotification();
        inspectSoon();
    }

    private int bootCount() {
        try { return Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
        catch (SecurityException unavailable) { return -1; }
    }

    private void saveSession() {
        if (sessions == null || !isRunning()) return;
        sessions.save(new GuideSessionStore.Session(settingsPackage, plan == null ? "" : plan.encode(), sessionRef, stepIndex,
                initialFont, initialConfigFont), bootCount(), SystemClock.elapsedRealtime(), System.currentTimeMillis());
    }

    private void restoreSession() {
        GuideSessionStore.Session saved = sessions.read(bootCount(), SystemClock.elapsedRealtime(), System.currentTimeMillis());
        if (saved == null) return;
        GuidePlan restored = saved.plan.isEmpty() ? null : GuidePlan.restore(saved.plan);
        if (!saved.plan.isEmpty() && (restored == null || saved.step >= restored.steps.size())) {
            sessions.clear();
            return;
        }
        settingsPackage = saved.settingsPackage;
        plan = restored;
        sessionRef = saved.reference;
        resultRef = sessionRef;
        resultStatus = "running";
        stepIndex = saved.step;
        initialFont = saved.initialFont;
        initialConfigFont = saved.initialConfigFont;
        started = SystemClock.elapsedRealtime();
        prompt = plan == null ? OPEN_SETTINGS : plan.steps.get(stepIndex).text;
        publishNotification();
        inspectSoon();
    }

    boolean isRunning() { return settingsPackage != null && !finished; }
    boolean isLastStep() { return plan == null || stepIndex == plan.steps.size() - 1; }
    String resultRef() { return resultRef; }
    String resultStatus() { return resultStatus; }
    String displayStatus(String ref) {
        if (isRunning()) return prompt;
        return "completed".equals(resultStatus) && (ref.isEmpty() || resultRef.equals(ref)) ? prompt : "";
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        inspectSoon();
    }

    void replay() {
        if (!isRunning()) return;
        lastUttered = "";
        inspectSoon();
        if (caption != null) announce(prompt);
    }

    void confirmCurrent() {
        if (!isRunning()) return;
        if (plan == null) finish("已确认完成");
        else next();
    }

    private void next() {
        if (!isRunning() || plan == null) return;
        advanceAt = SystemClock.uptimeMillis() + 220;
        clearTarget();
        recentTarget = null;
        evidence = new StepEvidence();
        stepIndex++;
        if (stepIndex >= plan.steps.size()) { finish("这次引导已完成"); return; }
        setPrompt(plan.steps.get(stepIndex).text);
        saveSession();
        inspectSoon();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!isRunning()) return;
        String eventPackage = Objects.toString(event.getPackageName(), "");
        if (plan == null && settingsPackage.equals(eventPackage)
                && (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    || event.getEventType() == AccessibilityEvent.TYPE_VIEW_SCROLLED)) clearTarget();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && target != null
                && (event.getWindowId() != targetWindow || !targetPackage.equals(eventPackage))) clearTarget();
        if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_CLICKED && !keyguard.isKeyguardLocked()
                && !GuidePlan.protectedPackage(eventPackage) && confirmsClick(event, eventPackage)) {
            if (plan != null) { next(); return; }
            tappedAt = SystemClock.elapsedRealtime();
            clearTarget();
            recentTarget = null;
            setPrompt(WAIT);
        }
        handler.removeCallbacks(update);
        handler.postDelayed(update, 90);
    }

    private boolean confirmsClick(AccessibilityEvent event, String app) {
        long at = event.getEventTime();
        Rect bounds = target != null && targetPackage.equals(app) && event.getWindowId() == targetWindow && at >= targetSince
                ? target : recentTarget != null && recentTarget.applies(app, event.getWindowId(), at) ? recentTarget.bounds : null;
        if (bounds == null) return false;
        AccessibilityNodeInfo source = event.getSource();
        if (source != null) {
            try {
                if (source.isPassword() || source.isEditable()) return false;
                Rect clicked = new Rect();
                source.getBoundsInScreen(clicked);
                if (!clicked.isEmpty() && bounds.contains(clicked.centerX(), clicked.centerY())
                        && clicked.width() <= bounds.width() && clicked.height() <= bounds.height()) return true;
            } finally { source.recycle(); }
        }
        if (plan == null) return false;
        GuidePlan.Step step = plan.steps.get(stepIndex);
        if (step.matches(event.getContentDescription())) return true;
        for (CharSequence label : event.getText()) if (step.matches(label)) return true;
        return false;
    }

    private void inspectSoon() {
        handler.removeCallbacks(poll);
        inspect();
    }

    private void inspect() {
        if (!isRunning()) return;
        long now = SystemClock.elapsedRealtime();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        try {
            String app = root == null ? "" : Objects.toString(root.getPackageName(), "");
            if (keyguard.isKeyguardLocked() || GuidePlan.protectedPackage(app) || passwordFocused(root)) {
                clearTarget();
                recentTarget = null;
                clearOverlays();
                lastUttered = "";
                stopAudio();
            } else if (plan != null) {
                inspectPlan(root, app);
                showCaption(prompt);
            } else if (StepEvidence.fontChanged(initialFont,
                    Settings.System.getFloat(getContentResolver(), Settings.System.FONT_SCALE, Float.NaN),
                    initialConfigFont, getResources().getConfiguration().fontScale)) {
                finish(DONE);
                return;
            } else if (!settingsPackage.equals(app)) {
                clearTarget();
                setPrompt(OPEN_SETTINGS);
                showCaption(prompt);
            } else {
                Candidates state = new Candidates();
                scan(root, null, false, 0, state);
                boolean fontDetail = state.isFontDetail();
                if (fontDetail) state.selectSizeControl();
                if (fontDetail || state.adjust != null) {
                    if (rangeIncreased(root.getWindowId(), state)) { finish(DONE); return; }
                    target = null;
                    setPrompt(fontDetail ? VIVO_ADJUST : ENLARGE);
                    if (state.adjust != null) showGlow(state.adjust);
                    else dropGlow();
                } else if (now - tappedAt < 1000) {
                    clearTarget();
                    setPrompt(WAIT);
                } else {
                    Rect candidate = state.font != null ? state.font : state.display;
                    if (candidate != null) {
                        markTarget(candidate, app, root.getWindowId());
                        setPrompt("请点" + (state.font != null ? state.fontName : state.displayName));
                    } else if (state.search != null && !state.searchFocused) {
                        target = null;
                        setPrompt(SEARCH_FONT);
                        showGlow(state.search);
                    } else {
                        clearTarget();
                        if (state.searchFocused) setPrompt(TYPE_FONT);
                        else if (now - started >= 2200) setPrompt(UNKNOWN);
                    }
                }
                showCaption(prompt);
            }
        } finally { if (root != null) root.recycle(); }
        handler.removeCallbacks(poll);
        handler.postDelayed(poll, 600);
    }

    private boolean rangeIncreased(int windowId, Candidates candidates) {
        if (!Float.isFinite(candidates.range)) return false;
        String key = windowId + ":" + candidates.rangeKey;
        if (!key.equals(currentRangeKey)) {
            currentRangeKey = key;
            initialRange = candidates.range;
            return false;
        }
        return FontTargets.enlarged(initialRange, candidates.range);
    }

    private boolean passwordFocused(AccessibilityNodeInfo root) {
        if (root == null) return false;
        AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focus == null) return false;
        try { return focus.isPassword(); }
        finally { focus.recycle(); }
    }

    private void inspectPlan(AccessibilityNodeInfo root, String app) {
        GuidePlan.Step step = plan.steps.get(stepIndex);
        if (root == null || SystemClock.uptimeMillis() < advanceAt) { clearTarget(); return; }
        boolean inScope = plan.containsApp(step, app, settingsPackage);
        if (inScope && plan.opensApp(step)) {
            next();
            return;
        }
        Match match = inScope ? findTarget(root, step.target) : new Match();
        GuidePlan.Step nextStep = isLastStep() ? null : plan.steps.get(stepIndex + 1);
        boolean nextVisible = nextStep != null && plan.containsApp(nextStep, app, settingsPackage)
                && !step.target.equals(nextStep.target) && findTarget(root, nextStep.target).found();
        boolean afterVisible = inScope && !step.after.isEmpty() && visibleLabel(root, step.after, 0, new int[]{0});
        if (evidence.observe(inScope, match.found(), match.selected, afterVisible, nextVisible)) {
            next();
            return;
        }
        if (!match.found()) clearTarget();
        else markTarget(match.bounds, app, root.getWindowId());
    }

    private Match findTarget(AccessibilityNodeInfo root, String label) {
        Match match = new Match();
        if (!label.isEmpty()) findTarget(root, null, false, label, 0, match);
        return match;
    }

    private void findTarget(AccessibilityNodeInfo node, Rect row, boolean rowSelected, String label, int depth, Match result) {
        if (depth > 22 || result.visited++ >= 500 || result.ambiguous || !node.isVisibleToUser()
                || node.isPassword() || node.isEditable()) return;
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        boolean clickable = node.isClickable() && node.isEnabled() && !bounds.isEmpty() && bounds.height() <= dp(180);
        Rect candidate = clickable ? bounds : row;
        boolean selected = node.isSelected() || (!clickable && rowSelected);
        if (candidate != null && labelMatches(node, label)) {
            if (result.bounds == null) result.bounds = candidate;
            else if (!result.bounds.equals(candidate)) result.ambiguous = true;
            result.selected |= selected;
        }
        for (int i = 0; i < node.getChildCount() && result.visited < 500 && !result.ambiguous; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            try { findTarget(child, candidate, selected, label, depth + 1, result); }
            finally { child.recycle(); }
        }
    }

    private boolean visibleLabel(AccessibilityNodeInfo node, String label, int depth, int[] visited) {
        if (depth > 22 || visited[0]++ >= 500 || !node.isVisibleToUser() || node.isEditable() || node.isPassword()) return false;
        if (labelMatches(node, label)) return true;
        for (int i = 0; i < node.getChildCount() && visited[0] < 500; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            try { if (visibleLabel(child, label, depth + 1, visited)) return true; }
            finally { child.recycle(); }
        }
        return false;
    }

    private boolean labelMatches(AccessibilityNodeInfo node, String label) {
        return label.equals(FontTargets.normalize(node.getText())) || label.equals(FontTargets.normalize(node.getContentDescription()));
    }

    private static final class Match {
        int visited;
        Rect bounds;
        boolean ambiguous;
        boolean selected;
        boolean found() { return !ambiguous && bounds != null; }
    }

    private static final class CapturedTarget {
        final Rect bounds;
        final String app;
        final int window;
        final long from;
        final long until = SystemClock.uptimeMillis();

        CapturedTarget(Rect bounds, String app, int window, long from) {
            this.bounds = bounds;
            this.app = app;
            this.window = window;
            this.from = from;
        }

        boolean applies(String eventApp, int eventWindow, long at) {
            return window == eventWindow && app.equals(eventApp) && at >= from && at <= until
                    && SystemClock.uptimeMillis() - until <= 1500;
        }
    }

    private void markTarget(Rect bounds, String app, int window) {
        if (!bounds.equals(target) || !app.equals(targetPackage) || window != targetWindow) {
            if (target != null) recentTarget = new CapturedTarget(target, targetPackage, targetWindow, targetSince);
            targetSince = SystemClock.uptimeMillis();
        }
        target = bounds;
        targetPackage = app;
        targetWindow = window;
        showGlow(bounds);
    }

    private void clearTarget() {
        if (target != null) recentTarget = new CapturedTarget(target, targetPackage, targetWindow, targetSince);
        target = null;
        targetPackage = "";
        dropGlow();
    }

    private void finish(String message) {
        finished = true;
        if (sessions != null) sessions.clear();
        resultRef = sessionRef;
        resultStatus = "completed";
        if (!resultRef.isEmpty()) getSharedPreferences("guide_result", MODE_PRIVATE).edit().putString("ref", resultRef).apply();
        clearTarget();
        setPrompt(message);
        if (!keyguard.isKeyguardLocked() && caption != null) showCaption(message);
        handler.postDelayed(this::end, 2800);
    }

    private void setPrompt(String next) {
        if (!next.equals(prompt)) {
            prompt = next;
            publishNotification();
        }
    }

    private void publishNotification() {
        if (!notifications.areNotificationsEnabled()) return;
        PendingIntent openApp = PendingIntent.getActivity(this, 0,
                new Intent(this, GuideActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder notification = new Notification.Builder(this, CHANNEL)
                .setContentTitle("禾伴屏幕引导").setContentText(prompt).setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(openApp).setVisibility(Notification.VISIBILITY_SECRET).setOngoing(true).setOnlyAlertOnce(true)
                .addAction(notificationAction("重听", "REPLAY", 1));
        if (!finished) notification.addAction(notificationAction(isLastStep() ? "我已完成" : "下一步", "NEXT", 2));
        notifications.notify(NOTIFICATION, notification.addAction(notificationAction("结束", "STOP", 3)).build());
    }

    private Notification.Action notificationAction(String title, String action, int requestCode) {
        Intent intent = new Intent(this, GuideControls.class).setAction("cn.heban.guide." + action);
        PendingIntent pending = PendingIntent.getBroadcast(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(null, title, pending).build();
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
        boolean detail = FontTargets.detail(label) || FontTargets.detail(description);
        if (!bounds.isEmpty()) {
            if (detail) result.fontDetailTitle = true;
            if ((FontTargets.sizeHeading(label) || FontTargets.sizeHeading(description))
                    && (result.sizeTitle == null || bounds.top < result.sizeTitle.top)) result.sizeTitle = bounds;
            if ((FontTargets.weightHeading(label) || FontTargets.weightHeading(description))
                    && (result.weightTitle == null || bounds.top < result.weightTitle.top)) result.weightTitle = bounds;
        }
        if (clickable != null && font && (result.font == null || detail && !result.fontDetailResult)) {
            result.font = clickable;
            result.fontDetailResult = detail;
            result.fontName = FontTargets.firstLine(FontTargets.font(label) ? label : description);
        }
        if (clickable != null && display && result.display == null) {
            result.display = clickable;
            result.displayName = FontTargets.firstLine(FontTargets.display(label) ? label : description);
        }
        if (FontTargets.settingsSearch(label) || FontTargets.settingsSearch(description) || FontTargets.settingsSearch(node.getHintText())) {
            if (!node.isPassword() && !bounds.isEmpty() && node.isEnabled() && result.search == null) {
                result.search = clickable == null && node.isEditable() ? bounds : clickable;
                result.searchFocused = node.isEditable() && node.isFocused();
            }
        }
        boolean adjust = FontTargets.increase(label) || FontTargets.increase(description);
        AccessibilityNodeInfo.RangeInfo range = node.getRangeInfo();
        boolean fontRange = range != null && (font || sizeGroup || FontTargets.fontControl(node.getViewIdResourceName()));
        String controlClass = Objects.toString(node.getClassName(), "");
        if (node.isEnabled() && !bounds.isEmpty() && (range != null || controlClass.endsWith("SeekBar"))) {
            result.sliders.add(new SizedControl(bounds, range == null ? Float.NaN : range.getCurrent(),
                    Objects.toString(node.getViewIdResourceName(), bounds.toShortString())));
        }
        if (node.isEnabled() && !bounds.isEmpty() && (fontRange || adjust && node.isClickable())) {
            if (result.adjust == null) result.adjust = bounds;
            if (fontRange && !Float.isFinite(result.range)) {
                result.range = range.getCurrent();
                result.rangeKey = Objects.toString(node.getViewIdResourceName(), bounds.toShortString());
            }
        }
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
        Rect search;
        Rect sizeTitle;
        Rect weightTitle;
        boolean searchFocused;
        boolean fontDetailTitle;
        boolean fontDetailResult;
        String fontName = "";
        String displayName = "";
        final List<SizedControl> sliders = new ArrayList<>();
        int visited;
        float range = Float.NaN;
        String rangeKey = "";

        boolean isFontDetail() {
            if (sizeTitle == null || weightTitle == null || sizeTitle.bottom >= weightTitle.top) return false;
            if (fontDetailTitle) return true;
            for (SizedControl control : sliders) {
                if (FontTargets.isSizeSlider(control.bounds.centerY(), sizeTitle.bottom, weightTitle.top)) return true;
            }
            return false;
        }

        void selectSizeControl() {
            SizedControl match = null;
            for (SizedControl control : sliders) {
                if (!FontTargets.isSizeSlider(control.bounds.centerY(), sizeTitle.bottom, weightTitle.top)) continue;
                if (match == null || Float.isFinite(control.value) && !Float.isFinite(match.value)
                        || Float.isFinite(control.value) == Float.isFinite(match.value) && control.bounds.top < match.bounds.top) match = control;
            }
            adjust = match == null ? null : match.bounds;
            range = match == null ? Float.NaN : match.value;
            rangeKey = match == null ? "" : match.key;
        }
    }

    private static final class SizedControl {
        final Rect bounds;
        final float value;
        final String key;
        SizedControl(Rect bounds, float value, String key) {
            this.bounds = bounds;
            this.value = value;
            this.key = key;
        }
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
            caption.setTextColor(0xff172645);
            caption.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            caption.setShadowLayer(dp(3), 0, dp(1), Color.WHITE);
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
        if (text.equals(lastUttered)) return;
        stopAudio();
        if (plan == null) {
            String file;
            switch (text) {
                case OPEN_SETTINGS: file = "open"; break;
                case FIND: file = "find"; break;
                case WAIT: file = "wait"; break;
                case ENLARGE: file = "adjust"; break;
                case DONE: file = "done"; break;
                case UNKNOWN: file = "search"; break;
                case SEARCH_FONT: file = "vivo-search"; break;
                case TYPE_FONT: file = "vivo-type"; break;
                case VIVO_FONT: file = "vivo-result"; break;
                case VIVO_ADJUST: file = "vivo-adjust"; break;
                case "请点显示大小和文字": file = "display"; break;
                default: file = "";
            }
            if (!file.isEmpty() && playRecording(file)) {
                lastUttered = text;
                return;
            }
        }
        if (speechReady && speech != null) {
            speech.setSpeechRate(0.84f);
            if (speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, text) == TextToSpeech.SUCCESS) lastUttered = text;
        }
    }

    private boolean playRecording(String file) {
        try (AssetFileDescriptor asset = getAssets().openFd(file + ".mp3")) {
            MediaPlayer player = recording = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            player.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
            player.setOnPreparedListener(ready -> { if (recording == ready) ready.start(); });
            player.setOnCompletionListener(played -> { if (recording == played) stopAudio(); });
            player.setOnErrorListener((failed, what, extra) -> { if (recording == failed) stopAudio(); return true; });
            player.prepareAsync();
            return true;
        } catch (java.io.IOException | IllegalStateException unavailable) {
            stopAudio();
            return false;
        }
    }

    private void stopAudio() {
        MediaPlayer active = recording;
        recording = null;
        if (active != null) active.release();
        if (speechReady && speech != null) speech.stop();
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
        if (isRunning()) { resultRef = sessionRef; resultStatus = "ended"; }
        if (sessions != null) sessions.clear();
        releaseRuntime();
    }

    private void releaseRuntime() {
        settingsPackage = null;
        plan = null;
        sessionRef = "";
        finished = false;
        target = null;
        recentTarget = null;
        targetPackage = "";
        tappedAt = advanceAt = 0;
        initialRange = Float.NaN;
        currentRangeKey = "";
        evidence = new StepEvidence();
        lastUttered = "";
        handler.removeCallbacksAndMessages(null);
        clearOverlays();
        stopAudio();
        if (notifications != null) notifications.cancel(NOTIFICATION);
    }

    @Override public void onInterrupt() { stopAudio(); }

    @Override public void onTaskRemoved(Intent rootIntent) {
        saveSession();
        super.onTaskRemoved(rootIntent);
    }

    @Override public boolean onUnbind(Intent intent) {
        if (isStillEnabled()) {
            saveSession();
            releaseRuntime();
        } else end();
        return super.onUnbind(intent);
    }

    private boolean isStillEnabled() {
        try {
            String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null) return Settings.Secure.getInt(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1;
            ComponentName own = new ComponentName(this, ScreenGuideService.class);
            TextUtils.SimpleStringSplitter list = new TextUtils.SimpleStringSplitter(':');
            list.setString(enabled);
            for (String name : list) if (own.equals(ComponentName.unflattenFromString(name))) return true;
            return false;
        } catch (SecurityException unavailable) {
            return true;
        }
    }

    @Override public void onDestroy() {
        if (connected == this) connected = null;
        releaseRuntime();
        if (observingFont) getContentResolver().unregisterContentObserver(fontObserver);
        if (speech != null) {
            speech.shutdown();
            speech = null;
        }
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
