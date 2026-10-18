import expo.modules.usageguard.logic.BEAT_CAPACITY
import expo.modules.usageguard.logic.Beat
import expo.modules.usageguard.logic.BeatQueue
import expo.modules.usageguard.logic.SendOutcome
import expo.modules.usageguard.logic.minutesLeft
import expo.modules.usageguard.logic.sendOutcome
import kotlin.test.Test
import kotlin.test.assertEquals

private fun beat(at: Long) = Beat(at, "1", at / 1000, 300, true, 60)

class BeatsTest {
  @Test
  fun `beats queue oldest first`() {
    val q = BeatQueue().add(beat(1)).add(beat(2)).add(beat(3))
    assertEquals(listOf(beat(1), beat(2)), q.batch(2))
    assertEquals(listOf(beat(3)), q.drop(2).beats)
  }

  @Test
  fun `a batch is never longer than the queue`() {
    assertEquals(listOf(beat(1)), BeatQueue().add(beat(1)).batch(96))
  }

  @Test
  fun `past capacity the oldest beat goes`() {
    val q = BeatQueue(capacity = 2).add(beat(1)).add(beat(2)).add(beat(3))
    assertEquals(listOf(beat(2), beat(3)), q.beats)
  }

  @Test
  fun `the default capacity is a week`() {
    assertEquals(672, BEAT_CAPACITY)
  }

  @Test
  fun `dropping more than the queue holds empties it`() {
    assertEquals(emptyList(), BeatQueue().add(beat(1)).drop(5).beats)
  }

  @Test
  fun `a stored batch is sent`() {
    assertEquals(SendOutcome.SENT, sendOutcome(200))
    assertEquals(SendOutcome.SENT, sendOutcome(201))
  }

  @Test
  fun `a revoked token unlinks but keeps the beats`() {
    assertEquals(SendOutcome.UNLINK, sendOutcome(401))
  }

  @Test
  fun `a batch the server can never take is discarded`() {
    assertEquals(SendOutcome.DISCARD, sendOutcome(400))
    assertEquals(SendOutcome.DISCARD, sendOutcome(413))
  }

  @Test
  fun `no answer, a server error or rate limiting keeps the beats`() {
    assertEquals(SendOutcome.KEEP, sendOutcome(null))
    assertEquals(SendOutcome.KEEP, sendOutcome(500))
    assertEquals(SendOutcome.KEEP, sendOutcome(503))
    assertEquals(SendOutcome.KEEP, sendOutcome(429))
  }

  @Test
  fun `minutes left round up and stop at zero`() {
    assertEquals(15, minutesLeft(900_000))
    assertEquals(1, minutesLeft(1))
    assertEquals(0, minutesLeft(0))
    assertEquals(0, minutesLeft(-5_000))
    assertEquals(2, minutesLeft(60_001))
  }
}
