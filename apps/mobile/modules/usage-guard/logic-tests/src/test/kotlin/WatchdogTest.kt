import expo.modules.usageguard.logic.NUDGE_EVERY_MS
import expo.modules.usageguard.logic.WatchdogPlan
import expo.modules.usageguard.logic.watchdogPlan
import kotlin.test.Test
import kotlin.test.assertEquals

private const val NOW = 100_000_000L

class WatchdogTest {
  @Test
  fun `a connected guard without its foreground service gets it back`() {
    assertEquals(
      WatchdogPlan(startForeground = true, nudge = false),
      watchdogPlan(true, true, false, true, null, NOW),
    )
  }

  @Test
  fun `a healthy guard needs nothing`() {
    assertEquals(
      WatchdogPlan(startForeground = false, nudge = false),
      watchdogPlan(true, true, true, true, null, NOW),
    )
  }

  @Test
  fun `a guard switched off after being on is nudged`() {
    assertEquals(
      WatchdogPlan(startForeground = false, nudge = true),
      watchdogPlan(false, false, false, true, null, NOW),
    )
  }

  @Test
  fun `a fresh install is not nagged`() {
    assertEquals(false, watchdogPlan(false, false, false, false, null, NOW).nudge)
  }

  @Test
  fun `the nudge comes at most every six hours`() {
    assertEquals(false, watchdogPlan(false, false, false, true, NOW - NUDGE_EVERY_MS + 1, NOW).nudge)
    assertEquals(true, watchdogPlan(false, false, false, true, NOW - NUDGE_EVERY_MS, NOW).nudge)
  }

  @Test
  fun `a clock set back doesn't silence the nudge for good`() {
    assertEquals(true, watchdogPlan(false, false, false, true, NOW + 3_600_000, NOW).nudge)
  }

  @Test
  fun `no foreground service without a connected guard`() {
    assertEquals(false, watchdogPlan(true, false, false, true, null, NOW).startForeground)
  }
}
