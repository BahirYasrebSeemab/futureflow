import expo.modules.usageguard.logic.Interval
import expo.modules.usageguard.logic.Meter
import expo.modules.usageguard.logic.Session
import expo.modules.usageguard.logic.UsageEvent
import expo.modules.usageguard.logic.UsageKind.BOOTED
import expo.modules.usageguard.logic.UsageKind.PAUSED
import expo.modules.usageguard.logic.UsageKind.RESUMED
import expo.modules.usageguard.logic.UsageKind.STOPPED_ALL
import expo.modules.usageguard.logic.foregroundIntervals
import expo.modules.usageguard.logic.uncovered
import kotlin.test.Test
import kotlin.test.assertEquals

private const val MIN = 60_000L

class UsageTest {
  @Test
  fun `a resume and its pause make one interval`() {
    val events = listOf(UsageEvent("ig", RESUMED, 10 * MIN), UsageEvent("ig", PAUSED, 20 * MIN))
    assertEquals(listOf(Interval(10 * MIN, 20 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }

  @Test
  fun `an app still in front ends at to, and one already in front starts at from`() {
    val events = listOf(UsageEvent("ig", PAUSED, 5 * MIN), UsageEvent("yt", RESUMED, 50 * MIN))
    assertEquals(
      listOf(Interval(0, 5 * MIN), Interval(50 * MIN, 60 * MIN)),
      foregroundIntervals(events, 0, 60 * MIN),
    )
  }

  @Test
  fun `overlapping apps are merged, so time counts once`() {
    val events =
      listOf(
        UsageEvent("ig", RESUMED, 10 * MIN),
        UsageEvent("yt", RESUMED, 15 * MIN),
        UsageEvent("ig", PAUSED, 20 * MIN),
        UsageEvent("yt", PAUSED, 25 * MIN),
      )
    assertEquals(listOf(Interval(10 * MIN, 25 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }

  @Test
  fun `events out of order are sorted, and a second pause is ignored`() {
    val events =
      listOf(UsageEvent("ig", PAUSED, 20 * MIN), UsageEvent("ig", RESUMED, 10 * MIN), UsageEvent("ig", PAUSED, 30 * MIN))
    assertEquals(listOf(Interval(10 * MIN, 20 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }

  @Test
  fun `the guard's own time is subtracted, leaving only what it missed`() {
    val missed = uncovered(listOf(Interval(0, 30 * MIN)), listOf(Interval(5 * MIN, 10 * MIN), Interval(20 * MIN, 40 * MIN)))
    assertEquals(listOf(Interval(0, 5 * MIN), Interval(10 * MIN, 20 * MIN)), missed)
  }

  @Test
  fun `slivers under a minute are jitter, not missed time`() {
    val missed = uncovered(listOf(Interval(0, 10 * MIN)), listOf(Interval(30_000, 10 * MIN - 20_000)))
    assertEquals(emptyList(), missed)
  }

  @Test
  fun `fully covered time adds nothing`() {
    assertEquals(emptyList(), uncovered(listOf(Interval(MIN, 9 * MIN)), listOf(Interval(0, 10 * MIN))))
  }

  @Test
  fun `missed time becomes closed sessions with new numbers and less time left`() {
    val m = Meter().commit(0, 600, 1).addMissed(listOf(Interval(0, 2 * MIN), Interval(5 * MIN, 6 * MIN)))
    assertEquals(listOf(Session(1, 0, 2 * MIN), Session(2, 5 * MIN, MIN)), m.sessions)
    assertEquals(3, m.nextSeq)
    assertEquals(600_000 - 3 * MIN, m.remainingMs(0, 1) { 1 })
  }

  @Test
  fun `covered time is the open session and the uncommitted sessions`() {
    val m = Meter().enter(0, 0, "b").leave(MIN).enter(10 * MIN, 5 * MIN, "b")
    assertEquals(listOf(Interval(0, MIN), Interval(10 * MIN, 12 * MIN)), m.coveredWall(12 * MIN))
  }
}

class UsageScreensTest {
  @Test
  fun `the next screen resuming before the last one pauses keeps the app in front`() {
    val events =
      listOf(
        UsageEvent("ig", RESUMED, 10 * MIN, "Feed"),
        UsageEvent("ig", RESUMED, 15 * MIN, "Reel"),
        UsageEvent("ig", PAUSED, 15 * MIN + 1, "Feed"),
        UsageEvent("ig", PAUSED, 30 * MIN, "Reel"),
      )
    assertEquals(listOf(Interval(10 * MIN, 30 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }
}

class UsageResetTest {
  @Test
  fun `a phone that dies with an app in front charges nothing after it died`() {
    val events =
      listOf(
        UsageEvent("ig", RESUMED, 10 * MIN, "Feed"),
        UsageEvent("", BOOTED, 600 * MIN),
        UsageEvent("ig", RESUMED, 700 * MIN, "Feed"),
        UsageEvent("ig", PAUSED, 710 * MIN, "Feed"),
      )
    assertEquals(listOf(Interval(700 * MIN, 710 * MIN)), foregroundIntervals(events, 0, 800 * MIN))
  }

  @Test
  fun `screen off or a shutdown ends what was in front, at that moment`() {
    val events = listOf(UsageEvent("ig", RESUMED, 10 * MIN), UsageEvent("", STOPPED_ALL, 25 * MIN))
    assertEquals(listOf(Interval(10 * MIN, 25 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }

  @Test
  fun `a stray pause after a screen-off is not taken as the app in front since the start`() {
    val events = listOf(UsageEvent("", STOPPED_ALL, 5 * MIN), UsageEvent("ig", PAUSED, 30 * MIN))
    assertEquals(emptyList(), foregroundIntervals(events, 0, 60 * MIN))
  }

  @Test
  fun `a stopped or destroyed screen closes like a pause`() {
    val events = listOf(UsageEvent("ig", RESUMED, 10 * MIN, "Feed"), UsageEvent("ig", PAUSED, 12 * MIN, "Feed"))
    assertEquals(listOf(Interval(10 * MIN, 12 * MIN)), foregroundIntervals(events, 0, 60 * MIN))
  }
}
