package cn.heban.guide;

import android.content.SharedPreferences;

final class GuideSessionStore {
    private static final long RESTORE_LIMIT = 60L * 60 * 1000;
    private static final long CLOCK_MARGIN = 120_000;
    private final SharedPreferences preferences;

    GuideSessionStore(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    static final class Session {
        final String settingsPackage;
        final String plan;
        final String reference;
        final int step;
        final float initialFont;
        final float initialConfigFont;

        Session(String settingsPackage, String plan, String reference, int step,
                float initialFont, float initialConfigFont) {
            this.settingsPackage = settingsPackage;
            this.plan = plan;
            this.reference = reference;
            this.step = step;
            this.initialFont = initialFont;
            this.initialConfigFont = initialConfigFont;
        }
    }

    void save(Session session, int boot, long elapsed, long wall) {
        preferences.edit()
                .putString("settings_package", session.settingsPackage)
                .putString("plan", session.plan)
                .putString("reference", session.reference)
                .putInt("step", session.step)
                .putFloat("initial_font", session.initialFont)
                .putFloat("initial_config_font", session.initialConfigFont)
                .putInt("boot", boot)
                .putLong("elapsed", elapsed)
                .putLong("wall", wall)
                .commit();
    }

    Session read(int boot, long elapsed, long wall) {
        try {
            String settings = preferences.getString("settings_package", "");
            if (settings.isEmpty()) return null;
            String plan = preferences.getString("plan", "");
            String ref = preferences.getString("reference", "");
            int step = preferences.getInt("step", -1);
            if (isFresh(preferences.getInt("boot", -1), preferences.getLong("elapsed", -1),
                    preferences.getLong("wall", -1), boot, elapsed, wall)
                    && settings.matches("[a-zA-Z][\\w]*(\\.[a-zA-Z][\\w]*){1,6}")
                    && (ref.isEmpty() || ref.matches("[a-zA-Z0-9_-]{1,128}"))
                    && step >= 0 && step < 5 && (step == 0 || !plan.isEmpty())) {
                return new Session(settings, plan, ref, step,
                        preferences.getFloat("initial_font", Float.NaN),
                        preferences.getFloat("initial_config_font", Float.NaN));
            }
        } catch (ClassCastException invalid) {
            // An unreadable snapshot is discarded like an expired one.
        }
        clear();
        return null;
    }

    void clear() {
        if (preferences.contains("settings_package")) preferences.edit().clear().commit();
    }

    static boolean isFresh(int savedBoot, long savedElapsed, long savedWall, int boot, long elapsed, long wall) {
        if (savedElapsed < 0 || savedWall <= 0 || (savedBoot != -1 && boot != -1 && savedBoot != boot)) return false;
        long elapsedAge = elapsed - savedElapsed;
        long wallAge = wall - savedWall;
        return elapsedAge >= 0 && elapsedAge <= RESTORE_LIMIT && Math.abs(wallAge - elapsedAge) <= CLOCK_MARGIN;
    }
}
