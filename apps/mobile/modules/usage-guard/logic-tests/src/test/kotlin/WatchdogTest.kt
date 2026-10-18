import expo.modules.usageguard.logic.DOWN_GRACE_MS
import expo.modules.usageguard.logic.NUDGE_EVERY_MS
import expo.modules.usageguard.logic.watchdogPlan
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

private const val NOW = 100_000_000L
private const val LONG_DOWN = NOW - DOWN_GRACE_MS

class WatchdogTest {
  @Test
  fun `a connected guard without its foreground service gets it back`() {
    val plan = watchdogPlan(true, true, false, true, null, null, NOW)
    assertEquals(true, plan.startForeground)
    assertEquals(false, plan.nudge)
  }

  @Test
  fun `a healthy guard needs nothing and is not down`() {
    val plan = watchdogPlan(true, true, true, true, LONG_DOWN, null, NOW)
    assertEquals(false, plan.startForeground)
    assertEquals(false, plan.nudge)
    assertNull(plan.downSince)
  }

  @Test
  fun `the first run that sees the guard down remembers when, without a nudge`() {
    val plan = watchdogPlan(false, false, false, true, null, null, NOW)
    assertEquals(NOW, plan.downSince)
    assertEquals(false, plan.nudge)
  }

  @Test
  fun `a guard switched off for the grace period is nudged`() {
    val plan = watchdogPlan(false, false, false, true, LONG_DOWN, null, NOW)
    assertEquals(true, plan.nudge)
    assertEquals(LONG_DOWN, plan.downSince)
  }

  @Test
  fun `a guard switched on but not running for the grace period is nudged`() {
    assertEquals(true, watchdogPlan(true, false, false, true, LONG_DOWN, null, NOW).nudge)
  }

  @Test
  fun `a guard down for less than the grace period is not nudged yet`() {
    assertEquals(false, watchdogPlan(true, false, false, true, LONG_DOWN + 1, null, NOW).nudge)
  }

  @Test
  fun `a fresh install is not nagged`() {
    assertEquals(false, watchdogPlan(false, false, false, false, LONG_DOWN, null, NOW).nudge)
  }

  @Test
  fun `the nudge comes at most every six hours`() {
    assertEquals(
      false,
      watchdogPlan(false, false, false, true, LONG_DOWN, NOW - NUDGE_EVERY_MS + 1, NOW).nudge,
    )
    assertEquals(
      true,
      watchdogPlan(false, false, false, true, LONG_DOWN, NOW - NUDGE_EVERY_MS, NOW).nudge,
    )
  }

  @Test
  fun `a clock set back doesn't silence the nudge for good`() {
    assertEquals(true, watchdogPlan(false, false, false, true, LONG_DOWN, NOW + 3_600_000, NOW).nudge)
  }

  @Test
  fun `a down time in the future after a clock change starts again from now`() {
    assertEquals(NOW, watchdogPlan(false, false, false, true, NOW + 60_000, null, NOW).downSince)
  }

  @Test
  fun `no foreground service without a connected guard`() {
    assertEquals(false, watchdogPlan(true, false, false, true, null, null, NOW).startForeground)
  }
}
