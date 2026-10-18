package expo.modules.usageguard

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.usageguard.logic.NEVER_BLOCKED_BASE

/** The app's side of the guard: the block list in, spent time out, the balance back in. */
class UsageGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsageGuard")

    AsyncFunction("status") {
      mapOf(
        "enabled" to GuardHealth.enabled(context),
        "connected" to GuardHealth.connected(),
        "foreground" to GuardForegroundService.running(),
        "notifications" to GuardHealth.notificationsAllowed(context),
        "batteryUnrestricted" to GuardHealth.batteryUnrestricted(context),
        "xiaomi" to GuardHealth.xiaomi(),
        "usageAccess" to UsageReconciler.allowed(context),
      )
    }

    AsyncFunction("setBlockedApps") { packages: List<String>, blockGames: Boolean ->
      GuardStore.setBlocked(context, packages.toSet(), blockGames)
    }

    // Blocked sites, for the browsers whose address bar the guard reads. Stays on the phone.
    AsyncFunction("setBlockedDomains") { domains: List<String> ->
      GuardStore.setDomains(context, domains.map { it.lowercase() }.toSet())
    }

    AsyncFunction("pendingSpend") {
      // The service may not be back after a reboot: restore first, so an old session is dropped.
      val boot = GuardClock.bootId(context)
      val elapsed = SystemClock.elapsedRealtime()
      val now = System.currentTimeMillis()
      val blocked = GuardStore.blocked(context)
      val games = GuardStore.blockGames(context)
      val never = neverOffered()
      // Time Android's usage log shows in blocked apps that the guard missed becomes sessions too.
      val isBlocked = { pkg: String ->
        pkg !in never && (pkg in blocked || (games && GuardApps.isGame(context, pkg)))
      }
      GuardStore.transact(context) {
          UsageReconciler.reconcile(context, it.restore(boot, elapsed), now, isBlocked)
            .pending(now, elapsed, boot)
        }
        .map {
          mapOf("seq" to it.seq.toDouble(), "start" to it.startWall.toDouble(), "ms" to it.ms.toDouble())
        }
    }

    AsyncFunction("commit") { watermark: Double, balanceSeconds: Double, included: List<String> ->
      GuardStore.update(context) {
        it.commit(watermark.toLong(), balanceSeconds.toLong(), GuardClock.today(), included.toSet())
      }
      GuardForegroundService.poke()
      Unit
    }

    // An emergency unlock's time, at once and offline; the next commit that includes it drops it.
    AsyncFunction("grant") { id: String, seconds: Double ->
      GuardStore.update(context) { it.grant(id, GuardClock.today(), seconds.toLong()) }
      GuardForegroundService.poke()
      Unit
    }

    // The monotonic clock, so the unlock wait can't be shortened by changing the time.
    AsyncFunction("clock") {
      mapOf(
        "elapsed" to SystemClock.elapsedRealtime().toDouble(),
        "bootId" to GuardClock.bootId(context),
      )
    }

    // Launcher apps for the picker. The list stays on the phone (spec §13.3).
    AsyncFunction("installedApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        // Future Flow, the dialer and the SMS app are never blocked, so they aren't offered.
        .filter { (pkg, _) -> pkg !in neverOffered() }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }
        .map { (pkg, label) -> mapOf("package" to pkg, "label" to label) }
    }

    // The heartbeat's own copy of the token, so it runs when React Native doesn't.
    AsyncFunction("link") { apiUrl: String, token: String ->
      HeartbeatStore.link(context, apiUrl, token)
      HeartbeatWorker.schedule(context)
      HeartbeatWorker.beatNow(context)
    }

    AsyncFunction("unlink") { HeartbeatStore.unlink(context) }

    AsyncFunction("openSettings") { kind: String -> open(settingsIntent(kind)) }
  }

  private fun neverOffered(): Set<String> =
    setOfNotNull(
      context.packageName,
      (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage,
      Telephony.Sms.getDefaultSmsPackage(context),
    ) + NEVER_BLOCKED_BASE

  private fun settingsIntent(kind: String): Intent {
    val pkg = context.packageName
    return when (kind) {
      "notifications" ->
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      "battery" ->
        if (GuardHealth.xiaomi()) {
          Intent()
            .setComponent(ComponentName(MIUI_POWER, "$MIUI_POWER.ui.HiddenAppsConfigActivity"))
            .putExtra("package_name", pkg)
            .putExtra("package_label", context.applicationInfo.loadLabel(context.packageManager))
        } else {
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg"))
        }
      "usage" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      "autostart" ->
        Intent()
          .setComponent(
            ComponentName(MIUI_SECURITY, "com.miui.permcenter.autostart.AutoStartManagementActivity")
          )
      else -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }
  }

  /** Vendor screens move between versions: when one is missing, App info is the way there. */
  private fun open(intent: Intent) {
    try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
      openAppInfo()
    } catch (e: SecurityException) {
      openAppInfo()
    }
  }

  private fun openAppInfo() {
    context.startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  private companion object {
    const val MIUI_POWER = "com.miui.powerkeeper"
    const val MIUI_SECURITY = "com.miui.securitycenter"
  }
}
