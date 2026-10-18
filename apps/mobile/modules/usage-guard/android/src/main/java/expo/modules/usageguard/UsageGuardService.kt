package expo.modules.usageguard

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.view.inputmethod.InputMethodManager
import expo.modules.usageguard.logic.BROWSER_URL_BARS
import expo.modules.usageguard.logic.IGNORED_BASE
import expo.modules.usageguard.logic.NEVER_BLOCKED_BASE
import expo.modules.usageguard.logic.Verdict
import expo.modules.usageguard.logic.WindowView
import expo.modules.usageguard.logic.classify
import expo.modules.usageguard.logic.domainBlocked
import expo.modules.usageguard.logic.hostOf
import expo.modules.usageguard.logic.sideBlocked

/**
 * Watches which app is in front (spec §7). Time in a blocked app is counted; when the balance
 * runs out the Shield covers the app. Of window content it reads only the root package of each
 * visible app window and the address bar of a few browsers (ADR 0019); nothing read leaves the
 * phone or reaches a log.
 */
class UsageGuardService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())
  private var neverBlocked: Set<String> = NEVER_BLOCKED_BASE
  private var ignored: Set<String> = IGNORED_BASE
  /** The last app that counted (not a keyboard or the status bar). */
  private var current: String? = null
  /** The focused app is blocked (an app, or a browser on a blocked domain). */
  private var focusBlocked = false
  /** A blocked app is visible beside it: picture-in-picture or split screen. */
  private var besideBlocked = false
  /** The last host read from each browser's address bar. */
  private val hosts = HashMap<String, String?>()
  private val recheck = Runnable { evaluate() }
  private val reread = Runnable { current?.takeIf { it in BROWSER_URL_BARS }?.let { readHost(it); onForeground(it) } }

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
    val pkg = event?.packageName?.toString()
    when (event?.eventType) {
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
        if (pkg != null && pkg in BROWSER_URL_BARS) readHost(pkg)
        onForeground(pkg)
      }
      // A page change inside the browser in front: read its address bar again, once per burst.
      AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ->
        if (pkg != null && pkg == current && pkg in BROWSER_URL_BARS) {
          handler.removeCallbacks(reread)
          handler.postDelayed(reread, REREAD_MS)
        }
      AccessibilityEvent.TYPE_WINDOWS_CHANGED -> scanWindows()
    }
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    stopCounting()
    runCatching { unregisterReceiver(screen) }
    connectedSinceElapsed = null
    GuardForegroundService.stop() // after clearing connectedSinceElapsed, which it checks
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
    val verdict = verdictOf(pkg)
    if (verdict == Verdict.IGNORE) return
    current = pkg
    focusBlocked = verdict == Verdict.BLOCKED
    updateCounting()
  }

  private fun stopCounting() {
    handler.removeCallbacks(recheck)
    GuardStore.update(this) { it.leave(SystemClock.elapsedRealtime()) }
    GuardForegroundService.poke()
  }

  /** Counts while the focused app or one beside it is blocked. */
  private fun updateCounting() {
    if (!focusBlocked && !besideBlocked) return stopCounting()
    GuardStore.update(this) {
      it.enter(System.currentTimeMillis(), SystemClock.elapsedRealtime(), GuardClock.bootId(this))
    }
    GuardForegroundService.poke()
    evaluate()
  }

  /** The verdict for a package, a browser judged by the host in its address bar. */
  private fun verdictOf(pkg: String?): Verdict {
    val verdict =
      classify(pkg, GuardStore.blocked(this), GuardStore.blockGames(this), GuardApps.isGame(this, pkg), neverBlocked, ignored)
    if (verdict != Verdict.ALLOWED || pkg == null || pkg !in BROWSER_URL_BARS) return verdict
    return if (domainBlocked(hosts[pkg], GuardStore.domains(this))) Verdict.BLOCKED else Verdict.ALLOWED
  }

  /**
   * Reads the browser's address bar, unless the owner is typing in it. A bar that can't be found
   * (the browser changed its layout) reads as no host: the browser is allowed.
   */
  private fun readHost(pkg: String) {
    val root = rootInActiveWindow ?: return
    if (root.packageName?.toString() != pkg) return
    val bar = root.findAccessibilityNodeInfosByViewId(BROWSER_URL_BARS.getValue(pkg)).firstOrNull()
    if (bar == null) {
      hosts[pkg] = null
      return
    }
    if (bar.isFocused) return
    hosts[pkg] = hostOf(bar.text?.toString())
  }

  /** Picture-in-picture and split screen: blocked apps visible without being focused. */
  private fun scanWindows() {
    val seen =
      windows.map { w ->
        WindowView(
          pkg = w.root?.packageName?.toString(),
          application = w.type == AccessibilityWindowInfo.TYPE_APPLICATION,
          focused = w.isFocused || w.isActive,
        )
      }
    val beside = sideBlocked(seen, ::verdictOf)
    if (beside == besideBlocked) return
    besideBlocked = beside
    updateCounting()
  }

  /** Shields now if the time is gone, otherwise checks again the moment it runs out. */
  private fun evaluate() {
    handler.removeCallbacks(recheck)
    val meter = GuardStore.meter(this)
    if (meter.open == null) return
    val remaining = meter.remainingMs(SystemClock.elapsedRealtime(), GuardClock.today(), GuardClock::dayOf)
    if (remaining > 0) {
      handler.postDelayed(recheck, remaining)
      return
    }
    // Already on the shield (or in Future Flow) with a picture-in-picture still playing: don't
    // relaunch it; the next app switch brings it back until the PiP is closed.
    if (current == packageName) stopCounting() else shield()
  }

  /**
   * Covers the blocked app straight away. Pressing Home first would trigger Android's app-switch
   * protection, which can hold back the shield for seconds; the shield's own buttons go home.
   */
  private fun shield() {
    stopCounting()
    current = null
    focusBlocked = false
    startActivity(
      Intent(this, ShieldActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
    )
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
    /** Page changes come in bursts; the address bar is read once the burst settles. */
    private const val REREAD_MS = 500L

    /** When this process's service connected (monotonic ms); null while it isn't connected. */
    @Volatile var connectedSinceElapsed: Long? = null
      private set
  }
}
