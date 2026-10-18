import expo.modules.usageguard.logic.dayIndex
import java.time.Instant
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

private fun at(iso: String) = Instant.parse(iso).toEpochMilli()

private fun day(iso: String) = LocalDate.parse(iso).toEpochDay()

class DaysTest {
  @Test
  fun `the day turns at 04 00 local east of UTC`() {
    // UTC+5: 04:00 local on the 17th is 23:00 UTC on the 16th.
    assertEquals(day("2026-10-17"), dayIndex(at("2026-10-16T23:00:00Z"), 300))
    assertEquals(day("2026-10-16"), dayIndex(at("2026-10-16T22:59:59Z"), 300))
  }

  @Test
  fun `the day turns at 04 00 local west of UTC`() {
    // UTC-4: 04:00 local is 08:00 UTC.
    assertEquals(day("2026-10-17"), dayIndex(at("2026-10-17T08:00:00Z"), -240))
    assertEquals(day("2026-10-16"), dayIndex(at("2026-10-17T07:59:59Z"), -240))
  }
}
