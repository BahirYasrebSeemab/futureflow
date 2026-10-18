package expo.modules.usageguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a boot or an app update: a beat now, so the server sees the phone back quickly. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
        HeartbeatWorker.schedule(context)
        HeartbeatWorker.beatNow(context)
      }
    }
  }
}
