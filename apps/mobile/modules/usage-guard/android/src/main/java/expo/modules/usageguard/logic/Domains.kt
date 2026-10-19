package expo.modules.usageguard.logic

/**
 * The host in a browser's address bar, or null when it isn't a web address: search text, a
 * browser page (chrome://), or nothing. Lowercase, without `www.`, a port or user info.
 */
fun hostOf(text: String?): String? {
  var rest = text?.trim()?.lowercase()?.removePrefix("view-source:") ?: return null
  if (rest.isEmpty() || rest.any { it.isWhitespace() }) return null
  // Only a scheme at the very start counts: an address inside the query must not hide the host.
  SCHEME.find(rest)?.let {
    if (it.groupValues[1] !in WEB_SCHEMES) return null
    rest = rest.substring(it.range.last + 1)
  }
  val host =
    rest
      .takeWhile { it != '/' && it != '?' && it != '#' }
      .substringAfterLast('@')
      .substringBefore(':')
      .trimEnd('.')
      .removePrefix("www.")
  return host.takeIf { '.' in it && HOST.matches(it) }
}

private val SCHEME = Regex("^([a-z][a-z0-9+.-]*)://")
private val WEB_SCHEMES = setOf("http", "https")
private val HOST = Regex("[a-z0-9-]+(\\.[a-z0-9-]+)+")

/** The host is a blocked domain or one of its subdomains (`m.youtube.com` under `youtube.com`). */
fun domainBlocked(host: String?, domains: Set<String>): Boolean =
  host != null && domains.any { host == it || host.endsWith(".$it") }

/**
 * Browsers whose address bar the guard can read, by its view id. These ids are not an API and can
 * change in an update; a browser whose bar isn't found is allowed (see ADR 0019).
 */
val BROWSER_URL_BARS: Map<String, String> =
  mapOf(
    "com.android.chrome" to "com.android.chrome:id/url_bar",
    "com.brave.browser" to "com.brave.browser:id/url_bar",
    "com.microsoft.emmx" to "com.microsoft.emmx:id/url_bar",
  )
