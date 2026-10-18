package expo.modules.usageguard.logic

/** The "guard is off" nudge comes at most this often. */
const val NUDGE_EVERY_MS = 6L * 60 * 60 * 1000

data class WatchdogPlan(val startForeground: Boolean, val nudge: Boolean)

/**
 * What the 15-minute worker does besides the beat. The foreground service follows the
 * accessibility service; a nudge needs the guard to have been on before, so a fresh install
 * isn't nagged.
 */
fun watchdogPlan(
  enabled: Boolean,
  connected: Boolean,
  foregroundRunning: Boolean,
  everEnabled: Boolean,
  lastNudgeAt: Long?,
  now: Long,
): WatchdogPlan {
  // A clock set back makes the last nudge look in the future: treat it as long ago.
  val quiet = lastNudgeAt != null && now >= lastNudgeAt && now - lastNudgeAt < NUDGE_EVERY_MS
  return WatchdogPlan(
    startForeground = connected && !foregroundRunning,
    nudge = !enabled && everEnabled && !quiet,
  )
}
