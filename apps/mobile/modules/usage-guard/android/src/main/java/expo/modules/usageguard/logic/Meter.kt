package expo.modules.usageguard.logic

/** The daily allowance (spec §6.1), used whenever the phone doesn't know today's balance. */
const val DEFAULT_BASE_SECONDS = 15L * 60

/** Time spent in blocked apps, closed and waiting for the app to turn it into ledger events. */
data class Session(val seq: Long, val startWall: Long, val ms: Long)

/** A blocked app in the foreground right now. Its length comes from the monotonic clock. */
data class OpenSession(val startWall: Long, val startElapsed: Long, val bootId: String)

/** The guard's whole state. Every change returns a new Meter. */
data class Meter(
  val balanceSeconds: Long? = null,
  val balanceDay: Long? = null,
  val sessions: List<Session> = emptyList(),
  val open: OpenSession? = null,
  val nextSeq: Long = 1,
  val baseSeconds: Long = DEFAULT_BASE_SECONDS,
) {
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
    val running = open ?: return this to sessions
    val split = leave(elapsed).enter(wall, elapsed, running.bootId)
    return split to split.sessions
  }

  /** The app recorded sessions up to [watermark]; [balanceSeconds] already includes them. */
  fun commit(watermark: Long, balanceSeconds: Long, day: Long): Meter =
    copy(
      balanceSeconds = balanceSeconds,
      balanceDay = day,
      sessions = sessions.filter { it.seq > watermark },
    )

  /** After a reboot the monotonic clock restarts, so a session left open can't be measured. */
  fun restore(bootId: String, elapsed: Long): Meter =
    if (open != null && open.bootId != bootId) copy(open = null) else this

  fun forgetOpen(): Meter = this

  /** On a day the app hasn't committed, the base allowance applies (spec §13.1). */
  fun remainingMs(elapsed: Long, day: Long, dayOf: (Long) -> Long): Long {
    val openMs = open?.let { (elapsed - it.startElapsed).coerceAtLeast(0) } ?: 0
    val known = balanceSeconds
    if (known != null && balanceDay == day) {
      return known * MS_PER_SECOND - sessions.sumOf { it.ms } - openMs
    }
    val spentToday = sessions.filter { dayOf(it.startWall) == day }.sumOf { it.ms }
    return baseSeconds * MS_PER_SECOND - spentToday - openMs
  }
}

private const val MS_PER_SECOND = 1_000L
