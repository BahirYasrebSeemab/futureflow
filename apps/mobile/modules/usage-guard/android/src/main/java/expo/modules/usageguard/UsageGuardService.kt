package expo.modules.usageguard

import android.accessibilityservice.AccessibilityService
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
          Intent.ACTION_USER_PRESENT -> {
            ignored = IGNORED_BASE + inputMethods()
            current?.let { onForeground(it) }
          }
        }
      }
    }

  override fun onServiceConnected() {
    super.onServiceConnected()
    neverBlocked = NEVER_BLOCKED_BASE + listOfNotNull(packageName, defaultDialer(), defaultSms())
    ignored = IGNORED_BASE + inputMethods()
    GuardStore.update(this) { it.restore(GuardClock.bootId(this)) }
    val filter =
      IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
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
    super.onDestroy()
  }

  private fun onForeground(pkg: String?) {
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
        evaluate()
      }
    }
  }

  private fun stopCounting() {
    handler.removeCallbacks(recheck)
    GuardStore.update(this) { it.leave(SystemClock.elapsedRealtime()) }
  }

  /** Shields now if the time is gone, otherwise checks again the moment it runs out. */
  private fun evaluate() {
    handler.removeCallbacks(recheck)
    val meter = GuardStore.meter(this)
    if (meter.open == null) return
    val remaining = meter.remainingMs(SystemClock.elapsedRealtime(), GuardClock.today(), GuardClock::dayOf)
    if (remaining <= 0) shield() else handler.postDelayed(recheck, remaining)
  }

  private fun shield() {
    stopCounting()
    current = null
    performGlobalAction(GLOBAL_ACTION_HOME)
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
}
