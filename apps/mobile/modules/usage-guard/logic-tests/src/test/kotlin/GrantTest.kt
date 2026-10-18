import expo.modules.usageguard.logic.Grant
import expo.modules.usageguard.logic.Meter
import kotlin.test.Test
import kotlin.test.assertEquals

private const val DAY = 20_000L
private val sameDay: (Long) -> Long = { DAY }

class GrantTest {
  @Test
  fun `an unlock adds to a committed balance of zero`() {
    val m = Meter().commit(0, 0, DAY).grant("u1", DAY, 600)
    assertEquals(600_000, m.remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `an unlock adds to the base allowance on a day without a commit`() {
    val m = Meter().grant("u1", DAY, 600)
    assertEquals(1_500_000, m.remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `the same unlock twice adds once`() {
    val m = Meter().commit(0, 0, DAY).grant("u1", DAY, 600).grant("u1", DAY, 600)
    assertEquals(listOf(Grant("u1", DAY, 600)), m.grants)
    assertEquals(600_000, m.remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `an unlock from another day adds nothing today`() {
    val m = Meter().commit(0, 0, DAY).grant("u1", DAY - 1, 600)
    assertEquals(0, m.remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `a commit that includes the unlock drops it, so it counts once`() {
    val m = Meter().grant("u1", DAY, 600).grant("u2", DAY, 600).commit(0, 600, DAY, setOf("u1"))
    assertEquals(listOf(Grant("u2", DAY, 600)), m.grants)
    assertEquals(1_200_000, m.remainingMs(0, DAY, sameDay))
  }

  @Test
  fun `a commit drops unlocks from earlier days`() {
    val m = Meter().grant("old", DAY - 1, 600).grant("new", DAY, 600).commit(0, 0, DAY)
    assertEquals(listOf(Grant("new", DAY, 600)), m.grants)
  }

  @Test
  fun `time spent comes off the unlock too`() {
    val m = Meter().commit(0, 0, DAY).grant("u1", DAY, 600).enter(0, 0, "b").leave(60_000)
    assertEquals(540_000, m.remainingMs(60_000, DAY, sameDay))
  }
}
