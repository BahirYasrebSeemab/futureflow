package expo.modules.usageguard

import android.content.Context
import android.util.Log
import expo.modules.usageguard.logic.SendOutcome
import expo.modules.usageguard.logic.sendOutcome
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/** Sends queued beats oldest first, one day per request, until the queue is empty or a send fails. */
internal object HeartbeatSender {
  private const val TAG = "FutureFlowGuard"
  private const val TIMEOUT_MS = 15_000
  private val lock = Any()

  fun flush(context: Context) {
    synchronized(lock) {
      while (true) {
        val credentials = HeartbeatStore.credentials(context) ?: return
        val batch = HeartbeatStore.queue(context).batch()
        if (batch.isEmpty()) return
        val status = post(credentials, JSONObject().put("beats", JSONArray(batch.map(HeartbeatStore::toJson))))
        when (sendOutcome(status)) {
          SendOutcome.SENT -> HeartbeatStore.remove(context, batch)
          SendOutcome.DISCARD -> {
            Log.w(TAG, JSONObject().put("event", "heartbeat_discarded").put("status", status).toString())
            HeartbeatStore.remove(context, batch)
          }
          SendOutcome.UNLINK -> {
            HeartbeatStore.unlink(context)
            return
          }
          SendOutcome.KEEP -> return
        }
      }
    }
  }

  /** The HTTP status, or null when no answer came. */
  private fun post(credentials: HeartbeatStore.Credentials, body: JSONObject): Int? {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL("${credentials.apiUrl}/v1/heartbeats").openConnection() as HttpURLConnection)
      connection.requestMethod = "POST"
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("content-type", "application/json")
      connection.setRequestProperty("accept", "application/json")
      connection.setRequestProperty("authorization", "Bearer ${credentials.token}")
      connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      connection.responseCode
    } catch (e: IOException) {
      null
    } finally {
      connection?.disconnect()
    }
  }
}
