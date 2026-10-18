package expo.modules.usageguard

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import expo.modules.usageguard.logic.Beat
import java.util.TimeZone

/** What Android can tell about the guard's chances of staying alive. */
internal object GuardHealth {
  private const val MS_PER_SECOND = 1_000
  private const val MS_PER_MINUTE = 60_000
  private val XIAOMI_BRANDS = setOf("xiaomi", "redmi", "poco")

  /** The accessibility service is switched on in Settings. */
  fun enabled(context: Context): Boolean {
    val me = ComponentName(context, UsageGuardService::class.java)
    val list =
      Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        ?: return false
    return list.split(':').any { ComponentName.unflattenFromString(it) == me }
  }

  /** The service is running in this process (not only switched on). */
  fun connected(): Boolean = UsageGuardService.connectedSinceElapsed != null

  fun notificationsAllowed(context: Context): Boolean =
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()

  fun batteryUnrestricted(context: Context): Boolean =
    (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .isIgnoringBatteryOptimizations(context.packageName)

  fun xiaomi(): Boolean =
    Build.MANUFACTURER.lowercase() == "xiaomi" || Build.BRAND.lowercase() in XIAOMI_BRANDS

  fun beat(context: Context): Beat {
    val now = System.currentTimeMillis()
    return Beat(
      at = now,
      bootId = GuardClock.bootId(context),
      uptimeSeconds = SystemClock.elapsedRealtime() / MS_PER_SECOND,
      utcOffsetMinutes = TimeZone.getDefault().getOffset(now) / MS_PER_MINUTE,
      guardEnabled = enabled(context),
      guardSinceUptimeSeconds = UsageGuardService.connectedSinceElapsed?.div(MS_PER_SECOND),
    )
  }
}
