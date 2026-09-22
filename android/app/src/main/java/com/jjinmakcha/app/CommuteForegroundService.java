package com.jjinmakcha.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;

// 귀가 중 카운트다운을 앱이 백그라운드/잠금화면에 있어도 상단 알림으로 계속 보여주기 위한
// 포그라운드 서비스. 안드로이드 14+(targetSdk 34+)부터 포그라운드 서비스 타입 명시가 필수인데,
// 위치/미디어 등 정해진 카테고리에 맞지 않는 용도라 specialUse로 신고함(매니페스트에 사유 등록).
// 알림 내용은 앱 화면의 카운트다운 카드와 최대한 비슷하게 커스텀 RemoteViews로 그림.
public class CommuteForegroundService extends Service {
    // 채널 생성 후엔 코드로 importance를 못 바꿔서(사용자가 설정에서 직접 바꿔야 함), 값을
    // 올리려면 새 채널 ID가 필요함 — v2. IMPORTANCE_LOW였을 때 삼성 원UI가 이 지속 알림을
    // 알림창 맨 아래 접힌 목록에 숨겨버려 실기기 테스트에서 아예 안 보이는 문제가 있었음
    static final String CHANNEL_ID = "commute_countdown_v2";
    static final int NOTIFICATION_ID = 4821;
    static final String EXTRA_DATA = "data";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Bundle data = intent != null ? intent.getBundleExtra(EXTRA_DATA) : null;
        Notification notification = buildNotification(this, data != null ? data : new Bundle());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        // 앱 프로세스가 죽으면 서비스도 같이 정리 — 재시작돼도 최신 경로 상태를 모르는 채로
        // 알림만 낡은 내용으로 남아있는 게 오히려 혼란스러움
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "귀가 중 알림", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("막차 시간까지 남은 시간을 알려드려요");
                nm.createNotificationChannel(channel);
            }
        }
    }

    private static RemoteViews buildCompactView(Context ctx, Bundle d) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.notification_commute_compact);
        boolean urgent = d.getBoolean("urgent", false);
        int color = urgent ? 0xFFEF4444 : 0xFF2563EB;
        v.setTextViewText(R.id.notif_compact_title, d.getString("routeName", "찐막차"));
        v.setTextViewText(R.id.notif_compact_comment, d.getString("comment", ""));
        v.setTextViewText(R.id.notif_compact_countdown, d.getString("countdownText", ""));
        v.setTextColor(R.id.notif_compact_countdown, color);
        return v;
    }

    private static RemoteViews buildExpandedView(Context ctx, Bundle d) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.notification_commute_expanded);
        boolean urgent = d.getBoolean("urgent", false);
        int color = urgent ? 0xFFEF4444 : 0xFF2563EB;
        int bannerBg = urgent ? R.drawable.notif_banner_bg_urgent : R.drawable.notif_banner_bg;

        v.setTextViewText(R.id.notif_route_title, d.getString("routeName", "찐막차"));
        v.setInt(R.id.notif_banner, "setBackgroundResource", bannerBg);
        v.setTextViewText(R.id.notif_leave_label, d.getString("leaveLabel", ""));
        v.setTextColor(R.id.notif_leave_label, color);
        v.setTextViewText(R.id.notif_comment, d.getString("comment", ""));
        v.setTextColor(R.id.notif_comment, color);
        v.setTextViewText(R.id.notif_transit_value, d.getString("transitValue", ""));
        v.setTextViewText(R.id.notif_departure_clock, d.getString("departureClock", "--:--"));
        v.setTextViewText(R.id.notif_walk_value, d.getString("walkText", ""));
        v.setTextViewText(R.id.notif_countdown, d.getString("countdownText", ""));
        v.setTextColor(R.id.notif_countdown, color);
        return v;
    }

    static Notification buildNotification(Context ctx, Bundle data) {
        Intent launchIntent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent contentIntent = launchIntent != null
            ? PendingIntent.getActivity(ctx, 0, launchIntent, piFlags)
            : null;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            // 잠금화면에서도 내용이 그대로 보이게(기본은 기기 보안 설정에 따라 가려질 수 있음)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCustomContentView(buildCompactView(ctx, data))
            .setCustomBigContentView(buildExpandedView(ctx, data))
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle());
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }
        return builder.build();
    }
}
