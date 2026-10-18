package expo.modules.usageguard.logic

/** One beat per 15 minutes (spec §6.1): a day of them is one request. */
const val BEAT_BATCH = 96

/** A week of beats: what the phone keeps while it can't reach the server. */
const val BEAT_CAPACITY = 7 * BEAT_BATCH

/** What the server needs to tell "phone off" from "guard off" (spec §6.5). No app names. */
data class Beat(
  val at: Long,
  val bootId: String,
  val uptimeSeconds: Long,
  val utcOffsetMinutes: Int,
  val guardEnabled: Boolean,
  /** Uptime when the guard's service last connected; null when it isn't connected. */
  val guardSinceUptimeSeconds: Long?,
)

/** Beats waiting to be sent, oldest first. Past capacity the oldest go. */
data class BeatQueue(val beats: List<Beat> = emptyList(), val capacity: Int = BEAT_CAPACITY) {
  fun add(beat: Beat): BeatQueue = this

  fun batch(size: Int = BEAT_BATCH): List<Beat> = emptyList()

  fun drop(n: Int): BeatQueue = this
}

enum class SendOutcome {
  /** Stored: drop the batch. */
  SENT,
  /** Offline or the server is down: try again later. */
  KEEP,
  /** The token is no longer valid: forget it and keep the beats for the next pairing. */
  UNLINK,
  /** The server can never take this batch: drop it rather than block the queue. */
  DISCARD,
}

/** `status` is the HTTP status, or null when no answer came. */
fun sendOutcome(status: Int?): SendOutcome = SendOutcome.KEEP

/** Whole minutes left for the notification, rounded up so "0 min" means out of time. */
fun minutesLeft(remainingMs: Long): Long = 0
