package expo.modules.usageguard

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import expo.modules.usageguard.logic.watchdogPlan
import java.util.concurrent.TimeUnit

/**
 * Every 15 minutes (spec §6.1), with or without React Native: record a beat, send what is queued,
 * then look after the guard (the watchdog).
 */
class HeartbeatWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val context = applicationContext
    HeartbeatStore.record(context, GuardHealth.beat(context))
    HeartbeatSender.flush(context)
    watch(context)
    return Result.success()
  }

  private fun watch(context: Context) {
    val now = System.currentTimeMillis()
    val plan =
      watchdogPlan(
        enabled = GuardHealth.enabled(context),
        connected = GuardHealth.connected(),
        foregroundRunning = GuardForegroundService.running(),
        everEnabled = HeartbeatStore.everEnabled(context) && HeartbeatStore.linked(context),
        lastNudgeAt = HeartbeatStore.lastNudgeAt(context),
        now = now,
      )
    if (plan.startForeground) GuardForegroundService.start(context)
    if (plan.nudge) {
      GuardNotifications.nudge(context)
      HeartbeatStore.markNudged(context, now)
    }
  }

  companion object {
    private const val PERIODIC = "futureflow.heartbeat"
    private const val NOW = "futureflow.heartbeat.now"
    private const val PERIOD_MINUTES = 15L

    /** Keeps the 15-minute work scheduled; WorkManager keeps it across reboots. */
    fun schedule(context: Context) {
      WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(
          PERIODIC,
          ExistingPeriodicWorkPolicy.KEEP,
          PeriodicWorkRequestBuilder<HeartbeatWorker>(PERIOD_MINUTES, TimeUnit.MINUTES).build(),
        )
    }

    /**
     * One beat as soon as possible: after pairing, a boot, or the guard coming back. Appended, so
     * a beat already running doesn't swallow the newer state.
     */
    fun beatNow(context: Context) {
      WorkManager.getInstance(context)
        .enqueueUniqueWork(
          NOW,
          ExistingWorkPolicy.APPEND_OR_REPLACE,
          OneTimeWorkRequestBuilder<HeartbeatWorker>().build(),
        )
    }
  }
}
