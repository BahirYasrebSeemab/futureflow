package expo.modules.usageguard

import android.content.Context
import android.provider.Settings
import expo.modules.usageguard.logic.dayIndex
import java.util.TimeZone

/** Wall time decides the day; the monotonic clock measures lengths (spec §4.3 rule 6). */
internal object GuardClock {
  private const val MS_PER_MINUTE = 60_000

  fun dayOf(wall: Long): Long = dayIndex(wall, TimeZone.getDefault().getOffset(wall) / MS_PER_MINUTE)

  fun today(): Long = dayOf(System.currentTimeMillis())

  /** Changes on every boot, so a session left open before a reboot is recognised. */
  fun bootId(context: Context): String =
    Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 0).toString()
}
