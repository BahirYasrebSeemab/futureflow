package expo.modules.usageguard

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import expo.modules.usageguard.logic.Meter
import expo.modules.usageguard.logic.UsageEvent
import expo.modules.usageguard.logic.UsageKind
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

  /** Never look back further than this: older entries may be pruned, and a stale log misleads. */
  private const val MAX_LOOKBACK_MS = 24L * 60 * 60 * 1000

  /** A read of the usage log, made outside the guard's lock (it can take a while). */
  class Read(val from: Long?, val to: Long, val events: List<UsageEvent>)

  /**
   * Reads the log since the meter last checked. The first check only starts the clock: time
   * before the guard was set up is never charged. Without Usage access nothing is read.
   */
  fun read(context: Context, reconciledUntil: Long?, now: Long, isBlocked: (String) -> Boolean): Read {
    if (reconciledUntil == null || reconciledUntil >= now || !allowed(context)) return Read(null, now, emptyList())
    val from = maxOf(reconciledUntil, now - MAX_LOOKBACK_MS)
    val events = events(context, from, now).filter { it.pkg.isEmpty() || isBlocked(it.pkg) }
    return Read(from, now, events)
  }

  /**
   * Adds what the read found that the meter didn't count, and moves the check up to the read's
   * end. A read made against an older check (another one ran meanwhile) only moves nothing.
   */
  fun apply(meter: Meter, reconciledUntil: Long?, read: Read): Meter {
    if (meter.reconciledUntil != reconciledUntil) return meter
    val from = read.from ?: return meter.copy(reconciledUntil = read.to)
    val missed = uncovered(foregroundIntervals(read.events, from, read.to), meter.coveredWall(read.to))
    return meter.addMissed(missed).copy(reconciledUntil = read.to)
  }

  private fun events(context: Context, from: Long, to: Long): List<UsageEvent> {
    val stats = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val log = stats.queryEvents(from, to) ?: return emptyList()
    val found = ArrayList<UsageEvent>()
    val event = UsageEvents.Event()
    while (log.hasNextEvent()) {
      log.getNextEvent(event)
      val kind = kindOf(event.eventType) ?: continue
      val app = kind == UsageKind.RESUMED || kind == UsageKind.PAUSED
      found +=
        UsageEvent(
          if (app) event.packageName else "",
          kind,
          event.timeStamp,
          if (app) event.className ?: "" else "",
        )
    }
    return found
  }

  @Suppress("DEPRECATION")
  private fun kindOf(type: Int): UsageKind? =
    when (type) {
      UsageEvents.Event.MOVE_TO_FOREGROUND -> UsageKind.RESUMED // ACTIVITY_RESUMED on Android 10+
      UsageEvents.Event.MOVE_TO_BACKGROUND, // ACTIVITY_PAUSED
      ACTIVITY_STOPPED,
      ACTIVITY_DESTROYED -> UsageKind.PAUSED
      SCREEN_NON_INTERACTIVE,
      KEYGUARD_SHOWN,
      DEVICE_SHUTDOWN -> UsageKind.STOPPED_ALL
      DEVICE_STARTUP -> UsageKind.BOOTED
      else -> null
    }

  // UsageEvents.Event values, spelled out because some are newer than the minimum SDK.
  private const val SCREEN_NON_INTERACTIVE = 16
  private const val KEYGUARD_SHOWN = 17
  private const val ACTIVITY_STOPPED = 23
  private const val ACTIVITY_DESTROYED = 24
  private const val DEVICE_SHUTDOWN = 26
  private const val DEVICE_STARTUP = 27
}
