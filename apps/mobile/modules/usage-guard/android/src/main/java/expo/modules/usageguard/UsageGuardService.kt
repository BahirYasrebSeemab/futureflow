package expo.modules.usageguard

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager
import expo.modules.usageguard.logic.IGNORED_BASE
import expo.modules.usageguard.logic.NEVER_BLOCKED_BASE
import expo.modules.usageguard.logic.Verdict
import expo.modules.usageguard.logic.classify

/**
 * Watches which app is in front (spec §7). Time in a blocked app is counted; when the balance
 * runs out the Shield covers the app. Only package names are read, never window content.
 */
class UsageGuardService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private val games = HashMap<String, Boolean>()
  private var neverBlocked: Set<String> = NEVER_BLOCKED_BASE
  private var ignored: Set<String> = IGNORED_BASE
  /** The last app that counted (not a keyboard or the status bar). */
  private var current: String? = null
  private val recheck = Runnable { evaluate() }

  private val screen =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
          // A phone left on Instagram with the screen off isn't spending time.
          Intent.ACTION_SCREEN_OFF -> stopCounting()
          // Back on without a lock screen (within the lock delay, Smart Lock): the app in front is
          // still in front, and no window event says so. With a lock, wait for the unlock.
          Intent.ACTION_SCREEN_ON -> if (!isLocked()) resume()
          Intent.ACTION_USER_PRESENT -> resume()
        }
      }
    }

  override fun onServiceConnected() {
    super.onServiceConnected()
    connectedSinceElapsed = SystemClock.elapsedRealtime()
    HeartbeatStore.markEnabled(this)
    GuardForegroundService.start(this)
    HeartbeatWorker.beatNow(this) // the server sees the guard back without waiting 15 minutes
    neverBlocked = NEVER_BLOCKED_BASE + listOfNotNull(packageName, defaultDialer(), defaultSms())
    ignored = IGNORED_BASE + inputMethods()
    // Nobody knows when an earlier service stopped, so a session it left open can't be measured.
    GuardStore.update(this) { it.forgetOpen() }
    val filter =
      IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screen, filter)
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    onForeground(event.packageName?.toString())
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    stopCounting()
    runCatching { unregisterReceiver(screen) }
    connectedSinceElapsed = null
    GuardForegroundService.stop(this)
    super.onDestroy()
  }

  private fun resume() {
    ignored = IGNORED_BASE + inputMethods()
    current?.let { onForeground(it) }
  }

  private fun isLocked(): Boolean =
    (getSystemService(KEYGUARD_SERVICE) as? KeyguardManager)?.isKeyguardLocked ?: true

  private fun onForeground(pkg: String?) {
    // A keyboard switched on after the service started is still a keyboard over the same app.
    if (pkg != null && pkg !in ignored && pkg in inputMethods()) ignored = ignored + pkg
    val verdict =
      classify(
        pkg,
        GuardStore.blocked(this),
        GuardStore.blockGames(this),
        isGame(pkg),
        neverBlocked,
        ignored,
      )
    when (verdict) {
      Verdict.IGNORE -> Unit
      Verdict.ALLOWED -> {
        current = pkg
        stopCounting()
      }
      Verdict.BLOCKED -> {
        current = pkg
        GuardStore.update(this) {
          it.enter(System.currentTimeMillis(), SystemClock.elapsedRealtime(), GuardClock.bootId(this))
        }
        GuardForegroundService.poke()
        evaluate()
      }
    }
  }

  private fun stopCounting() {
    handler.removeCallbacks(recheck)
    GuardStore.update(this) { it.leave(SystemClock.elapsedRealtime()) }
    GuardForegroundService.poke()
  }

  /** Shields now if the time is gone, otherwise checks again the moment it runs out. */
  private fun evaluate() {
    handler.removeCallbacks(recheck)
    val meter = GuardStore.meter(this)
    if (meter.open == null) return
    val remaining = meter.remainingMs(SystemClock.elapsedRealtime(), GuardClock.today(), GuardClock::dayOf)
    if (remaining <= 0) shield() else handler.postDelayed(recheck, remaining)
  }

  /**
   * Covers the blocked app straight away. Pressing Home first would trigger Android's app-switch
   * protection, which can hold back the shield for seconds; the shield's own buttons go home.
   */
  private fun shield() {
    stopCounting()
    current = null
    startActivity(
      Intent(this, ShieldActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
    )
  }

  private fun isGame(pkg: String?): Boolean {
    if (pkg.isNullOrEmpty()) return false
    return games.getOrPut(pkg) {
      try {
        val info = packageManager.getApplicationInfo(pkg, 0)
        @Suppress("DEPRECATION")
        val flagged = info.flags and ApplicationInfo.FLAG_IS_GAME != 0
        flagged ||
          (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            info.category == ApplicationInfo.CATEGORY_GAME)
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }
    }
  }

  private fun inputMethods(): Set<String> =
    (getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)
      ?.enabledInputMethodList
      ?.map { it.packageName }
      ?.toSet() ?: emptySet()

  private fun defaultDialer(): String? =
    (getSystemService(TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage

  private fun defaultSms(): String? = Telephony.Sms.getDefaultSmsPackage(this)

  companion object {
    /** When this process's service connected (monotonic ms); null while it isn't connected. */
    @Volatile var connectedSinceElapsed: Long? = null
      private set
  }
}
