package expo.modules.usageguard

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import expo.modules.usageguard.logic.minutesLeft

/**
 * Keeps the guard's process in the foreground, so a low-memory phone doesn't kill it, and shows
 * the time left (spec §7 "Staying alive"). It runs while the accessibility service is connected.
 */
class GuardForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var shown: String? = null
  private val tick =
    object : Runnable {
      override fun run() {
        refresh()
        handler.postDelayed(this, TICK_MS)
      }
    }

  override fun onCreate() {
    super.onCreate()
    GuardNotifications.ensureChannels(this)
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val text = text()
    val notification = GuardNotifications.time(this, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(GuardNotifications.TIME_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(GuardNotifications.TIME_ID, notification)
    }
    shown = text
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, TICK_MS)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    instance = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun refresh() {
    val text = text()
    if (text == shown) return
    GuardNotifications.showTime(this, text)
    shown = text
  }

  private fun text(): String {
    val meter = GuardStore.meter(this)
    val left = minutesLeft(meter.remainingMs(SystemClock.elapsedRealtime(), GuardClock.today(), GuardClock::dayOf))
    return if (left == 0L) getString(R.string.guard_time_out) else getString(R.string.guard_time_left, left)
  }

  companion object {
    private const val TAG = "FutureFlowGuard"
    private const val TICK_MS = 30_000L
    @Volatile private var instance: GuardForegroundService? = null

    fun running(): Boolean = instance != null

    /** Android may refuse a start from the background; the watchdog tries again later. */
    fun start(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return // no channels or typed services before 8.0
      try {
        context.startForegroundService(Intent(context, GuardForegroundService::class.java))
      } catch (e: IllegalStateException) {
        Log.w(TAG, "{\"event\":\"foreground_start_refused\",\"name\":\"${e.javaClass.simpleName}\"}")
      } catch (e: SecurityException) {
        Log.w(TAG, "{\"event\":\"foreground_start_refused\",\"name\":\"SecurityException\"}")
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, GuardForegroundService::class.java))
    }

    /** The meter changed: show the new time now rather than at the next tick. */
    fun poke() {
      instance?.let { service -> service.handler.post { service.refresh() } }
    }
  }
}
