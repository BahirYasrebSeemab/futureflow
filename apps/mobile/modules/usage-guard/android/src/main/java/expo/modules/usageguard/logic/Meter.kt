package expo.modules.usageguard.logic

/** The daily allowance (spec §6.1), used whenever the phone doesn't know today's balance. */
const val DEFAULT_BASE_SECONDS = 15L * 60

/** Time spent in blocked apps, closed and waiting for the app to turn it into ledger events. */
data class Session(val seq: Long, val startWall: Long, val ms: Long)

/** A blocked app in the foreground right now. Its length comes from the monotonic clock. */
data class OpenSession(val startWall: Long, val startElapsed: Long, val bootId: String)

/**
 * Time an emergency unlock added (spec §6.1), known here before any commit includes it, so it
 * works offline. [id] is the `unlock_borrow` event's id.
 */
data class Grant(val id: String, val day: Long, val seconds: Long)

/** The guard's whole state. Every change returns a new Meter. */
data class Meter(
  val balanceSeconds: Long? = null,
  val balanceDay: Long? = null,
  val sessions: List<Session> = emptyList(),
  val open: OpenSession? = null,
  val nextSeq: Long = 1,
  val baseSeconds: Long = DEFAULT_BASE_SECONDS,
  val grants: List<Grant> = emptyList(),
  /** The unlocks the last commit's balance included: a grant for one of them arrived late. */
  val included: Set<String> = emptySet(),
  /** Android's usage log has been checked against this meter up to here (wall ms). */
  val reconciledUntil: Long? = null,
) {
  /** Adds an unlock's time for [day]; the same id twice adds it once. */
  fun grant(id: String, day: Long, seconds: Long): Meter =
    if (id in included || grants.any { it.id == id }) this
    else copy(grants = grants + Grant(id, day, seconds))

  fun enter(wall: Long, elapsed: Long, bootId: String): Meter =
    if (open != null) this else copy(open = OpenSession(wall, elapsed, bootId))

  /** Closes the open session. Lengths come from the monotonic clock, never below zero. */
  fun leave(elapsed: Long): Meter {
    val running = open ?: return this
    val ms = elapsed - running.startElapsed
    val closed = copy(open = null)
    if (ms <= 0) return closed
    return closed.copy(sessions = sessions + Session(nextSeq, running.startWall, ms), nextSeq = nextSeq + 1)
  }

  /** Everything not yet committed. An open session is cut at now, so long sessions report too. */
  fun pending(wall: Long, elapsed: Long, bootId: String): Pair<Meter, List<Session>> {
    if (open == null) return this to sessions
    val split = leave(elapsed).enter(wall, elapsed, bootId)
    return split to split.sessions
  }

  /**
   * The app recorded sessions up to [watermark]; [balanceSeconds] already includes them and the
   * unlocks in [included].
   */
  fun commit(watermark: Long, balanceSeconds: Long, day: Long, included: Set<String> = emptySet()): Meter =
    copy(
      balanceSeconds = balanceSeconds,
      balanceDay = day,
      sessions = sessions.filter { it.seq > watermark },
      grants = grants.filter { it.id !in included && it.day >= day },
      included = included,
    )

  /**
   * After a reboot the monotonic clock restarts, so a session left open can't be measured. A start
   * later than now on that clock means another boot too, even if the boot id didn't change.
   */
  fun restore(bootId: String, elapsed: Long): Meter =
    if (open != null && (open.bootId != bootId || open.startElapsed > elapsed)) copy(open = null)
    else this

  /** Time Android's usage log shows in blocked apps that the guard missed: closed sessions. */
  fun addMissed(intervals: List<Interval>): Meter =
    intervals.fold(this) { m, i ->
      m.copy(sessions = m.sessions + Session(m.nextSeq, i.start, i.end - i.start), nextSeq = m.nextSeq + 1)
    }

  /** What the guard has counted and not yet committed, on the wall clock, the open session to [now]. */
  fun coveredWall(now: Long): List<Interval> =
    sessions.map { Interval(it.startWall, it.startWall + it.ms) } +
      listOfNotNull(open?.let { Interval(it.startWall, maxOf(it.startWall, now)) })

  /** A service that (re)connects can't know when the last one stopped, so it starts afresh. */
  fun forgetOpen(): Meter = copy(open = null)

  /** On a day the app hasn't committed, the base allowance applies (spec §13.1). */
  fun remainingMs(elapsed: Long, day: Long, dayOf: (Long) -> Long): Long {
    val openMs = open?.let { (elapsed - it.startElapsed).coerceAtLeast(0) } ?: 0
    val grantedMs = grants.filter { it.day == day }.sumOf { it.seconds } * MS_PER_SECOND
    val known = balanceSeconds
    if (known != null && balanceDay == day) {
      return known * MS_PER_SECOND + grantedMs - sessions.sumOf { it.ms } - openMs
    }
    val spentToday = sessions.filter { dayOf(it.startWall) == day }.sumOf { it.ms }
    return baseSeconds * MS_PER_SECOND + grantedMs - spentToday - openMs
  }
}

private const val MS_PER_SECOND = 1_000L
