package expo.modules.usageguard

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The app's side of the guard: the block list in, spent time out, the balance back in. */
class UsageGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsageGuard")

    AsyncFunction("status") { mapOf("enabled" to isServiceEnabled(context)) }

    AsyncFunction("setBlockedApps") { packages: List<String>, blockGames: Boolean ->
      GuardStore.setBlocked(context, packages.toSet(), blockGames)
    }

    AsyncFunction("pendingSpend") {
      // The service may not be back after a reboot: restore first, so an old session is dropped.
      val boot = GuardClock.bootId(context)
      val elapsed = SystemClock.elapsedRealtime()
      GuardStore.transact(context) {
          it.restore(boot, elapsed).pending(System.currentTimeMillis(), elapsed, boot)
        }
        .map {
          mapOf("seq" to it.seq.toDouble(), "start" to it.startWall.toDouble(), "ms" to it.ms.toDouble())
        }
    }

    AsyncFunction("commit") { watermark: Double, balanceSeconds: Double ->
      GuardStore.update(context) {
        it.commit(watermark.toLong(), balanceSeconds.toLong(), GuardClock.today())
      }
      Unit
    }

    AsyncFunction("openSettings") {
      context.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  private fun isServiceEnabled(context: Context): Boolean {
    val me = ComponentName(context, UsageGuardService::class.java)
    val enabled =
      Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
  }
}
