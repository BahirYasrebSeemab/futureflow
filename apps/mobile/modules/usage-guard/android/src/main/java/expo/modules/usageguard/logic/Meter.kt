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
  fun enter(wall: Long, elapsed: Long, bootId: String): Meter = this

  fun leave(elapsed: Long): Meter = this

  fun pending(wall: Long, elapsed: Long): Pair<Meter, List<Session>> = this to emptyList()

  fun commit(watermark: Long, balanceSeconds: Long, day: Long): Meter = this

  fun restore(bootId: String): Meter = this

  fun remainingMs(elapsed: Long, day: Long, dayOf: (Long) -> Long): Long = 0
}
