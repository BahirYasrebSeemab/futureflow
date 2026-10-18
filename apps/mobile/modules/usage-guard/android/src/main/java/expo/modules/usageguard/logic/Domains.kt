package expo.modules.usageguard.logic

/**
 * The host in a browser's address bar, or null when it isn't a web address: search text, a
 * browser page (chrome://), or nothing. Lowercase, without `www.`, a port or user info.
 */
fun hostOf(text: String?): String? {
  var rest = text?.trim()?.lowercase() ?: return null
  if (rest.isEmpty() || rest.any { it.isWhitespace() }) return null
  val scheme = rest.indexOf("://")
  if (scheme >= 0) {
    if (rest.substring(0, scheme) !in WEB_SCHEMES) return null
    rest = rest.substring(scheme + 3)
  }
  var host = rest.takeWhile { it != '/' && it != '?' && it != '#' }.substringAfterLast('@').substringBefore(':')
  host = host.removePrefix("www.")
  return host.takeIf { '.' in it && HOST.matches(it) }
}

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
