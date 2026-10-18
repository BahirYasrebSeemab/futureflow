package expo.modules.usageguard.logic

/**
 * The host in a browser's address bar, or null when it isn't a web address: search text, a
 * browser page (chrome://), or nothing. Lowercase, without `www.`, a port or user info.
 */
fun hostOf(text: String?): String? = null

/** The host is a blocked domain or one of its subdomains (`m.youtube.com` under `youtube.com`). */
fun domainBlocked(host: String?, domains: Set<String>): Boolean = false
