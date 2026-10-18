package expo.modules.usageguard.logic

/** The "guard is off" nudge comes at most this often. */
const val NUDGE_EVERY_MS = 6L * 60 * 60 * 1000

/** How long the guard must be down before a nudge: a boot reconnects it within this. */
const val DOWN_GRACE_MS = 10L * 60 * 1000

/** `downSince` is what the worker keeps for its next run: when it first saw the guard down. */
data class WatchdogPlan(val startForeground: Boolean, val nudge: Boolean, val downSince: Long?)

/**
 * What the 15-minute worker does besides the beat. The foreground service follows the
 * accessibility service. "Down" is switched off, or switched on but not running (Android stopped
 * it and left it listed). A nudge needs the guard to have been on before, so a fresh install isn't
 * nagged.
 */
fun watchdogPlan(
  enabled: Boolean,
  connected: Boolean,
  foregroundRunning: Boolean,
  everEnabled: Boolean,
  downSince: Long?,
  lastNudgeAt: Long?,
  now: Long,
): WatchdogPlan {
  val running = enabled && connected
  // A clock set back makes past times look in the future: count from now instead.
  val since = if (running) null else downSince?.takeIf { it <= now } ?: now
  val quiet = lastNudgeAt != null && now >= lastNudgeAt && now - lastNudgeAt < NUDGE_EVERY_MS
  val longDown = since != null && now - since >= DOWN_GRACE_MS
  return WatchdogPlan(
    startForeground = connected && !foregroundRunning,
    nudge = longDown && everEnabled && !quiet,
    downSince = since,
  )
}
