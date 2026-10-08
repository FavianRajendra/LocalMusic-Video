package com.localmusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * LocalMusic and Video - foreground service. While it runs, Android keeps the app process (and the yt-dlp/FFmpeg jobs
 * inside it) alive when the screen is off or the app is in the background. LmvEnginePlugin starts it whenever a
 * download/sync is active, or while Auto-sync is switched on, and stops it when there is nothing left to do.
 */
public class DownloadService extends Service {
    static final String CHANNEL = "lmv_downloads";
    static final int ID = 4711;
    static volatile DownloadService live;
    PowerManager.WakeLock wake;

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        live = this;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW));
        Notification n = build("LocalMusic and Video", "Working in the background", -1);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, n);
        if (wake == null) {   // keeps the CPU awake while the screen is off
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lmv:download");
            wake.setReferenceCounted(false);
        }
        return START_NOT_STICKY;   // if Android kills the process the jobs are gone too, so do not restart an empty service
    }

    Notification build(String title, String text, int pct) {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(this, CHANNEL).setContentTitle(title).setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download).setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true);
        if (pct >= 0) b.setProgress(100, Math.min(100, pct), false);
        return b.build();
    }

    /** Called by the plugin to refresh the ongoing notification (current track + progress). */
    static void update(Context c, String title, String text, int pct) {
        DownloadService s = live; if (s == null) return;
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(ID, s.build(title, text, pct));
    }

    /** The CPU wake lock is held ONLY while a download is actually running (holding it all day drained the battery and heated the phone). */
    static void hold(boolean on) {
        DownloadService s = live; if (s == null || s.wake == null) return;
        if (on && !s.wake.isHeld()) s.wake.acquire(2 * 60 * 60 * 1000L); else if (!on && s.wake.isHeld()) s.wake.release();
    }

    @Override public void onDestroy() {
        live = null;
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
