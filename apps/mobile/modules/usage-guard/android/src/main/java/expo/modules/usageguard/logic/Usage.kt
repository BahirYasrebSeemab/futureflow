package expo.modules.usageguard.logic

/** Shorter gaps are timestamp jitter between Android's usage log and the guard, not missed time. */
const val MIN_MISSED_MS = 60_000L

/** Wall-clock time, [start, end). */
data class Interval(val start: Long, val end: Long)

/** A blocked app coming to the front (`resumed`) or leaving it, from Android's usage log. */
data class UsageEvent(val pkg: String, val resumed: Boolean, val at: Long)

/**
 * When blocked apps were in front between [from] and [to], merged across apps. An app already in
 * front at [from] (its first event is a pause) starts there; one still in front ends at [to].
 */
fun foregroundIntervals(events: List<UsageEvent>, from: Long, to: Long): List<Interval> = emptyList()

/** The parts of [intervals] that no [covered] interval counts, each at least [minMs] long. */
fun uncovered(intervals: List<Interval>, covered: List<Interval>, minMs: Long = MIN_MISSED_MS): List<Interval> =
  emptyList()
