package com.jjinmakcha.app;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 귀가 중 카운트다운을 앱이 백그라운드에 있어도 상단 알림으로 계속 보여주는 JS-네이티브 브릿지.
// start(): 포그라운드 서비스 시작(OS가 프로세스를 안 죽이게 붙잡아둠).
// update(): 서비스를 재시작하지 않고 같은 알림 ID로 내용만 갱신(수십 초 간격으로 불러도 가벼움).
// stop(): 서비스 종료 + 알림 제거.
@CapacitorPlugin(name = "CommuteNotification")
public class CommuteNotificationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), CommuteForegroundService.class);
        intent.putExtra(CommuteForegroundService.EXTRA_DATA, toBundle(call));
        getContext().startForegroundService(intent);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Notification notification = CommuteForegroundService.buildNotification(getContext(), toBundle(call));
        NotificationManagerCompat.from(getContext()).notify(CommuteForegroundService.NOTIFICATION_ID, notification);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CommuteForegroundService.class));
        NotificationManagerCompat.from(getContext()).cancel(CommuteForegroundService.NOTIFICATION_ID);
        call.resolve();
    }

    private Bundle toBundle(PluginCall call) {
        Bundle b = new Bundle();
        b.putString("routeName", call.getString("routeName", "찐막차"));
        boolean urgent = call.getBoolean("urgent", false);
        b.putBoolean("urgent", urgent);
        b.putString("leaveLabel", call.getString("leaveLabel", ""));
        b.putString("comment", call.getString("comment", ""));
        b.putString("transitValue", call.getString("transitValue", ""));
        b.putString("departureClock", call.getString("departureClock", "--:--"));
        b.putString("walkText", call.getString("walkText", ""));
        b.putString("countdownText", call.getString("countdownText", ""));
        return b;
    }
}
