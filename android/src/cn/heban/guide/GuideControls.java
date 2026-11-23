package cn.heban.guide;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class GuideControls extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        ScreenGuideService service = ScreenGuideService.connected;
        if (service == null) return;
        String action = intent.getAction();
        if ("cn.heban.guide.REPLAY".equals(action)) service.replay();
        else if ("cn.heban.guide.NEXT".equals(action)) service.confirmCurrent();
        else if ("cn.heban.guide.STOP".equals(action)) service.end();
    }
}
