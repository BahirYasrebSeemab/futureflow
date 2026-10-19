package expo.modules.usageguard

import android.content.Context
import android.content.SharedPreferences
import expo.modules.usageguard.logic.Grant
import expo.modules.usageguard.logic.Meter
import expo.modules.usageguard.logic.OpenSession
import expo.modules.usageguard.logic.Session
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * The guard's state in SharedPreferences, so the service and the shield keep working when the
 * React Native runtime is dead (spec §7). Every change is one locked read-modify-write.
 */
internal object GuardStore {
  private const val PREFS = "futureflow.guard"
  private const val KEY_METER = "meter"
  private const val KEY_BLOCKED = "blocked"
  private const val KEY_BLOCK_GAMES = "blockGames"
  private const val KEY_DOMAINS = "domains"
  private val lock = Any()

  fun meter(context: Context): Meter = synchronized(lock) { read(context) }

  fun update(context: Context, change: (Meter) -> Meter): Meter =
    transact(context) { meter -> change(meter).let { it to it } }

  fun <T> transact(context: Context, change: (Meter) -> Pair<Meter, T>): T =
    synchronized(lock) {
      val (next, result) = change(read(context))
      prefs(context).edit().putString(KEY_METER, encode(next)).apply()
      result
    }

  fun blocked(context: Context): Set<String> =
    prefs(context).getStringSet(KEY_BLOCKED, null)?.toSet() ?: emptySet()

  fun blockGames(context: Context): Boolean = prefs(context).getBoolean(KEY_BLOCK_GAMES, true)

  fun domains(context: Context): Set<String> =
    prefs(context).getStringSet(KEY_DOMAINS, null)?.toSet() ?: emptySet()

  fun setDomains(context: Context, domains: Set<String>) {
    prefs(context).edit().putStringSet(KEY_DOMAINS, domains).apply()
  }

  fun setBlocked(context: Context, packages: Set<String>, blockGames: Boolean) {
    prefs(context)
      .edit()
      .putStringSet(KEY_BLOCKED, packages)
      .putBoolean(KEY_BLOCK_GAMES, blockGames)
      .apply()
  }

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(context: Context): Meter {
    val raw = prefs(context).getString(KEY_METER, null) ?: return Meter()
    return try {
      decode(JSONObject(raw))
    } catch (e: JSONException) {
      Meter() // Unreadable state falls back to the base allowance rather than crashing the guard.
    }
  }

  private fun encode(m: Meter): String =
    JSONObject()
      .put("balanceSeconds", m.balanceSeconds ?: JSONObject.NULL)
      .put("balanceDay", m.balanceDay ?: JSONObject.NULL)
      .put("nextSeq", m.nextSeq)
      .put("baseSeconds", m.baseSeconds)
      .put(
        "sessions",
        JSONArray(
          m.sessions.map { JSONObject().put("seq", it.seq).put("start", it.startWall).put("ms", it.ms) }
        ),
      )
      .put(
        "grants",
        JSONArray(m.grants.map { JSONObject().put("id", it.id).put("day", it.day).put("seconds", it.seconds) }),
      )
      .put("included", JSONArray(m.included.toList()))
      .put("reconciledUntil", m.reconciledUntil ?: JSONObject.NULL)
      .put(
        "open",
        m.open?.let {
          JSONObject()
            .put("startWall", it.startWall)
            .put("startElapsed", it.startElapsed)
            .put("bootId", it.bootId)
        } ?: JSONObject.NULL,
      )
      .toString()

  private fun decode(o: JSONObject): Meter {
    val sessions = o.getJSONArray("sessions")
    val open = o.optJSONObject("open")
    // Meters stored before unlocks existed have no grants.
    val grants = o.optJSONArray("grants") ?: JSONArray()
    val included = o.optJSONArray("included") ?: JSONArray()
    return Meter(
      balanceSeconds = if (o.isNull("balanceSeconds")) null else o.getLong("balanceSeconds"),
      balanceDay = if (o.isNull("balanceDay")) null else o.getLong("balanceDay"),
      sessions =
        (0 until sessions.length()).map {
          val s = sessions.getJSONObject(it)
          Session(s.getLong("seq"), s.getLong("start"), s.getLong("ms"))
        },
      open =
        open?.let {
          OpenSession(it.getLong("startWall"), it.getLong("startElapsed"), it.getString("bootId"))
        },
      nextSeq = o.getLong("nextSeq"),
      baseSeconds = o.getLong("baseSeconds"),
      grants =
        (0 until grants.length()).map {
          val g = grants.getJSONObject(it)
          Grant(g.getString("id"), g.getLong("day"), g.getLong("seconds"))
        },
      included = (0 until included.length()).map { included.getString(it) }.toSet(),
      reconciledUntil =
        if (!o.has("reconciledUntil") || o.isNull("reconciledUntil")) null else o.getLong("reconciledUntil"),
    )
  }
}
