package expo.modules.usageguard

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import expo.modules.usageguard.logic.Interval
import expo.modules.usageguard.logic.Meter
import expo.modules.usageguard.logic.UsageEvent
import expo.modules.usageguard.logic.foregroundIntervals
import expo.modules.usageguard.logic.uncovered

/**
 * Accurate minutes (spec §7): Android's usage log shows when blocked apps were in front. Time the
 * guard didn't count (its service killed or switched off) is added to the meter as sessions, so
 * the next sync charges it. Needs Usage access; without it nothing changes.
 */
internal object UsageReconciler {
  fun allowed(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /**
   * The meter with missed time since its last check added, checked up to [now]. The first check
   * only starts the clock: time before the guard was set up is never charged.
   */
  fun reconcile(context: Context, meter: Meter, now: Long, isBlocked: (String) -> Boolean): Meter {
    val from = meter.reconciledUntil
    if (from == null || from >= now || !allowed(context)) return meter.copy(reconciledUntil = now)
    val events = events(context, from, now).filter { isBlocked(it.pkg) }
    val missed = uncovered(foregroundIntervals(events, from, now), meter.coveredWall(now))
    return meter.addMissed(missed).copy(reconciledUntil = now)
  }

  private fun events(context: Context, from: Long, to: Long): List<UsageEvent> {
    val stats = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val log = stats.queryEvents(from, to) ?: return emptyList()
    val found = ArrayList<UsageEvent>()
    val event = UsageEvents.Event()
    while (log.hasNextEvent()) {
      log.getNextEvent(event)
      @Suppress("DEPRECATION")
      val resumed =
        when (event.eventType) {
          UsageEvents.Event.MOVE_TO_FOREGROUND -> true // ACTIVITY_RESUMED on Android 10+
          UsageEvents.Event.MOVE_TO_BACKGROUND -> false // ACTIVITY_PAUSED on Android 10+
          else -> null
        } ?: continue
      found += UsageEvent(event.packageName, resumed, event.timeStamp, event.className ?: "")
    }
    return found
  }
}
