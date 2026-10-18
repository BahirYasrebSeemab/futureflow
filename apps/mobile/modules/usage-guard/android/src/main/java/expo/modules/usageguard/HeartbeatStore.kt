package expo.modules.usageguard

import android.content.Context
import android.content.SharedPreferences
import expo.modules.usageguard.logic.Beat
import expo.modules.usageguard.logic.BeatQueue
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/** Where the heartbeat goes, its sealed token, the queued beats and the watchdog's memory. */
internal object HeartbeatStore {
  private const val PREFS = "futureflow.heartbeat"
  private const val KEY_URL = "apiUrl"
  private const val KEY_TOKEN = "token"
  private const val KEY_QUEUE = "queue"
  private const val KEY_EVER_ENABLED = "everEnabled"
  private const val KEY_LAST_NUDGE = "lastNudgeAt"
  private val lock = Any()

  data class Credentials(val apiUrl: String, val token: String)

  fun link(context: Context, apiUrl: String, token: String) {
    prefs(context).edit().putString(KEY_URL, apiUrl).putString(KEY_TOKEN, TokenVault.seal(token)).apply()
  }

  /** Forgets where to send and how; queued beats stay for the next pairing. */
  fun unlink(context: Context) {
    prefs(context).edit().remove(KEY_URL).remove(KEY_TOKEN).apply()
  }

  fun credentials(context: Context): Credentials? {
    val p = prefs(context)
    val url = p.getString(KEY_URL, null) ?: return null
    val token = p.getString(KEY_TOKEN, null)?.let { TokenVault.open(it) } ?: return null
    return Credentials(url, token)
  }

  fun linked(context: Context): Boolean = prefs(context).contains(KEY_TOKEN)

  fun queue(context: Context): BeatQueue = synchronized(lock) { read(context) }

  fun record(context: Context, beat: Beat) = change(context) { it.add(beat) }

  fun remove(context: Context, sent: List<Beat>) = change(context) { it.remove(sent) }

  fun everEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_EVER_ENABLED, false)

  fun markEnabled(context: Context) {
    prefs(context).edit().putBoolean(KEY_EVER_ENABLED, true).apply()
  }

  fun lastNudgeAt(context: Context): Long? =
    prefs(context).let { if (it.contains(KEY_LAST_NUDGE)) it.getLong(KEY_LAST_NUDGE, 0) else null }

  fun markNudged(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_NUDGE, at).apply()
  }

  private fun change(context: Context, update: (BeatQueue) -> BeatQueue) =
    synchronized(lock) {
      prefs(context).edit().putString(KEY_QUEUE, encode(update(read(context)))).apply()
    }

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(context: Context): BeatQueue {
    val raw = prefs(context).getString(KEY_QUEUE, null) ?: return BeatQueue()
    return try {
      val array = JSONArray(raw)
      BeatQueue((0 until array.length()).map { decode(array.getJSONObject(it)) })
    } catch (e: JSONException) {
      BeatQueue() // A lost queue is a gap the server can see; a crash loop is worse.
    }
  }

  private fun encode(queue: BeatQueue): String = JSONArray(queue.beats.map(::toJson)).toString()

  fun toJson(b: Beat): JSONObject =
    JSONObject()
      .put("at", b.at)
      .put("bootId", b.bootId)
      .put("uptimeSeconds", b.uptimeSeconds)
      .put("utcOffsetMinutes", b.utcOffsetMinutes)
      .put("guardEnabled", b.guardEnabled)
      .put("guardSinceUptimeSeconds", b.guardSinceUptimeSeconds ?: JSONObject.NULL)

  private fun decode(o: JSONObject) =
    Beat(
      at = o.getLong("at"),
      bootId = o.getString("bootId"),
      uptimeSeconds = o.getLong("uptimeSeconds"),
      utcOffsetMinutes = o.getInt("utcOffsetMinutes"),
      guardEnabled = o.getBoolean("guardEnabled"),
      guardSinceUptimeSeconds =
        if (o.isNull("guardSinceUptimeSeconds")) null else o.getLong("guardSinceUptimeSeconds"),
    )
}
