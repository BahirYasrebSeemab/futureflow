package expo.modules.usageguard

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import java.util.concurrent.ConcurrentHashMap

/** What the guard needs to know about installed apps. */
internal object GuardApps {
  private val games = ConcurrentHashMap<String, Boolean>()

  fun isGame(context: Context, pkg: String?): Boolean {
    if (pkg.isNullOrEmpty()) return false
    return games.getOrPut(pkg) {
      try {
        val info = context.packageManager.getApplicationInfo(pkg, 0)
        @Suppress("DEPRECATION")
        val flagged = info.flags and ApplicationInfo.FLAG_IS_GAME != 0
        flagged ||
          (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && info.category == ApplicationInfo.CATEGORY_GAME)
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }
    }
  }
}
