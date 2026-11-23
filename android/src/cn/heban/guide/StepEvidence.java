package cn.heban.guide;

final class StepEvidence {
    private boolean sawTarget;
    private boolean sawUnselected;
    private boolean sawAfterMissing;
    private boolean sawNextMissing;

    boolean observe(boolean inScope, boolean target, boolean selected, boolean after, boolean next) {
        if ((sawUnselected && target && selected) || (sawAfterMissing && after)
                || (sawTarget && sawNextMissing && !target && next)) return true;
        if (inScope) {
            if (!after) sawAfterMissing = true;
            if (target) {
                sawTarget = true;
                if (!selected) sawUnselected = true;
                if (!next) sawNextMissing = true;
            }
        }
        return false;
    }

    static boolean fontChanged(float initialSetting, float setting, float initialConfig, float config) {
        return FontTargets.enlarged(initialSetting, setting) || FontTargets.enlarged(initialConfig, config);
    }
}
