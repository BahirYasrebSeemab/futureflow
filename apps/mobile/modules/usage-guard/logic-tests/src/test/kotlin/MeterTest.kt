import expo.modules.usageguard.logic.Meter
import expo.modules.usageguard.logic.OpenSession
import expo.modules.usageguard.logic.Session
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

private const val DAY = 20_000L
private val sameDay: (Long) -> Long = { DAY }

class MeterTest {
  @Test
  fun `time in a blocked app comes off the committed balance`() {
    val m = Meter().commit(0, 600, DAY).enter(1_000, 5_000, "b").leave(65_000)
    assertEquals(listOf(Session(1, 1_000, 60_000)), m.sessions)
    assertEquals(540_000, m.remainingMs(65_000, DAY, sameDay))
  }

  @Test
  fun `leave closes the open session`() {
    val m = Meter().enter(0, 0, "b").leave(10_000)
    assertNull(m.open)
    assertEquals(10_000, m.sessions.single().ms)
  }

  @Test
  fun `the open session counts while it runs`() {
    val m = Meter().commit(0, 600, DAY).enter(0, 0, "b")
    assertEquals(570_000, m.remainingMs(30_000, DAY, sameDay))
  }

  @Test
  fun `entering again keeps the first start`() {
    val m = Meter().enter(0, 100, "b").enter(50, 200, "b")
    assertEquals(OpenSession(0, 100, "b"), m.open)
  }

  @Test
  fun `zero-length and backwards sessions are dropped`() {
    assertEquals(emptyList<Session>(), Meter().enter(0, 100, "b").leave(100).sessions)
    assertEquals(emptyList<Session>(), Meter().enter(0, 100, "b").leave(40).sessions)
  }

  @Test
  fun `a new day without a commit starts from the base allowance`() {
    val dayOf: (Long) -> Long = { wall -> if (wall < 1_000_000) DAY else DAY + 1 }
    val m =
      Meter()
        .commit(0, 3_000, DAY)
        .enter(0, 0, "b")
        .leave(120_000) // yesterday: not counted today
        .enter(2_000_000, 200_000, "b")
        .leave(260_000) // today: 60 s
    assertEquals(900_000 - 60_000, m.remainingMs(260_000, DAY + 1, dayOf))
  }

  @Test
  fun `a meter that never had a commit uses the base allowance`() {
    assertEquals(900_000, Meter().remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `an open session from another boot is dropped`() {
    val m = Meter().enter(0, 0, "boot-1")
    assertNull(m.restore("boot-2").open)
    assertEquals(m.open, m.restore("boot-1").open)
  }

  @Test
  fun `commit drops sessions up to the watermark only`() {
    val m = Meter().enter(0, 0, "b").leave(1_000).enter(2_000, 2_000, "b").leave(5_000)
    val committed = m.commit(1, 600, DAY)
    assertEquals(listOf(Session(2, 2_000, 3_000)), committed.sessions)
    assertEquals(597_000, committed.remainingMs(5_000, DAY, sameDay))
  }

  @Test
  fun `pending splits an open session so long sessions report`() {
    val (m, sessions) = Meter().enter(0, 0, "b").pending(60_000, 60_000)
    assertEquals(listOf(Session(1, 0, 60_000)), sessions)
    assertEquals(OpenSession(60_000, 60_000, "b"), m.open)
    assertEquals(570_000, m.commit(1, 600, DAY).remainingMs(90_000, DAY, sameDay))
  }

  @Test
  fun `pending without an open session returns what is closed`() {
    val m = Meter().enter(0, 0, "b").leave(1_000)
    assertEquals(m.sessions, m.pending(5_000, 5_000).second)
  }
}
