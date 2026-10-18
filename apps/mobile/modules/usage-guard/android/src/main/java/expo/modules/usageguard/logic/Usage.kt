package expo.modules.usageguard.logic

/** Shorter gaps are timestamp jitter between Android's usage log and the guard, not missed time. */
const val MIN_MISSED_MS = 60_000L

/** Wall-clock time, [start, end). */
data class Interval(val start: Long, val end: Long)

/** What an entry in Android's usage log means for the guard. */
enum class UsageKind {
  /** One of an app's screens came to the front. */
  RESUMED,
  /** That screen left the front (paused, stopped or destroyed). */
  PAUSED,
  /** Everything left the front at once: the screen went off, the lock screen came, a shutdown. */
  STOPPED_ALL,
  /** The phone started: whatever was open before it died is unknown, so it isn't charged. */
  BOOTED,
}

/** An entry in Android's usage log; `pkg` and `activity` are empty for phone-wide kinds. */
data class UsageEvent(val pkg: String, val kind: UsageKind, val at: Long, val activity: String = "")

/**
 * When blocked apps were in front between [from] and [to], merged across apps. An app already in
 * front at [from] (its first event is a pause) starts there; one still in front ends at [to].
 */
fun foregroundIntervals(events: List<UsageEvent>, from: Long, to: Long): List<Interval> {
  // An app is in front while any of its screens is; the next screen often resumes before the
  // last one pauses.
  val screens = HashMap<String, MutableSet<String>>()
  val since = HashMap<String, Long>()
  val seen = HashSet<String>()
  val found = ArrayList<Interval>()
  for (e in events.sortedBy { it.at }) {
    val first = seen.add(e.pkg)
    val open = screens.getOrPut(e.pkg) { HashSet() }
    if (e.kind == UsageKind.RESUMED) {
      if (open.isEmpty()) since[e.pkg] = e.at
      open += e.activity
    } else if (open.remove(e.activity)) {
      if (open.isEmpty()) found += Interval(since.remove(e.pkg) ?: from, e.at)
    } else if (first) {
      found += Interval(from, e.at) // in front before the window began
    }
  }
  since.values.forEach { found += Interval(it, to) }
  return merge(found.map { Interval(maxOf(it.start, from), minOf(it.end, to)) }.filter { it.end > it.start })
}

/** Overlapping or touching intervals become one; the result is sorted. */
private fun merge(intervals: List<Interval>): List<Interval> {
  val merged = ArrayList<Interval>()
  for (i in intervals.sortedBy { it.start }) {
    val last = merged.lastOrNull()
    if (last != null && i.start <= last.end) merged[merged.size - 1] = Interval(last.start, maxOf(last.end, i.end))
    else merged += i
  }
  return merged
}

/** The parts of [intervals] that no [covered] interval counts, each at least [minMs] long. */
fun uncovered(intervals: List<Interval>, covered: List<Interval>, minMs: Long = MIN_MISSED_MS): List<Interval> {
  val cover = merge(covered)
  return merge(intervals)
    .flatMap { interval ->
      var pieces = listOf(interval)
      for (c in cover) {
        pieces =
          pieces.flatMap { p ->
            if (c.end <= p.start || c.start >= p.end) listOf(p)
            else listOfNotNull(
              Interval(p.start, c.start).takeIf { c.start > p.start },
              Interval(c.end, p.end).takeIf { c.end < p.end },
            )
          }
      }
      pieces
    }
    .filter { it.end - it.start >= minMs }
}
