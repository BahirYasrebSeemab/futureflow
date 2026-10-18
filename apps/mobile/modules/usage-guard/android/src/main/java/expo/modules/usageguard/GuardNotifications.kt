package expo.modules.usageguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/** The quiet "N min left" channel, and the "guard is off" nudge. Android 8.0+ only (channels). */
internal object GuardNotifications {
  const val TIME_CHANNEL = "futureflow.guard.time"
  private const val ALERT_CHANNEL = "futureflow.guard.alerts"
  const val TIME_ID = 4401
  private const val NUDGE_ID = 4402

  fun ensureChannels(context: Context) {
    val manager = manager(context)
    manager.createNotificationChannel(
      NotificationChannel(
          TIME_CHANNEL,
          context.getString(R.string.guard_time_channel),
          NotificationManager.IMPORTANCE_LOW,
        )
        .apply { setShowBadge(false) }
    )
    manager.createNotificationChannel(
      NotificationChannel(
        ALERT_CHANNEL,
        context.getString(R.string.guard_alert_channel),
        NotificationManager.IMPORTANCE_DEFAULT,
      )
    )
  }

  fun time(context: Context, text: String): Notification =
    Notification.Builder(context, TIME_CHANNEL)
      .setSmallIcon(R.drawable.guard_notification)
      .setContentTitle(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STATUS)
      .setContentIntent(open(context, null))
      .build()

  fun showTime(context: Context, text: String) = manager(context).notify(TIME_ID, time(context, text))

  /** Opens the Guard screen, where turning the guard back on is one tap away. */
  fun nudge(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    ensureChannels(context)
    manager(context)
      .notify(
        NUDGE_ID,
        Notification.Builder(context, ALERT_CHANNEL)
          .setSmallIcon(R.drawable.guard_notification)
          .setContentTitle(context.getString(R.string.guard_off_title))
          .setContentText(context.getString(R.string.guard_off_body))
          .setAutoCancel(true)
          .setContentIntent(open(context, Uri.parse("futureflow://guard")))
          .build(),
      )
  }

  private fun open(context: Context, uri: Uri?): PendingIntent {
    val intent =
      if (uri == null) context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
      else Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      if (uri == null) 0 else 1,
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}
