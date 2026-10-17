package expo.modules.usageguard.logic

enum class Verdict { BLOCKED, ALLOWED, IGNORE }

/** Calls and emergencies are never blocked (spec §7). Future Flow is added at runtime. */
val NEVER_BLOCKED_BASE: Set<String> =
  setOf(
    "com.android.phone",
    "com.android.emergency",
    "com.google.android.dialer",
    "com.android.server.telecom",
  )

/** Windows that sit on top of an app without leaving it. Keyboards are added at runtime. */
val IGNORED_BASE: Set<String> = setOf("com.android.systemui")

fun classify(
  pkg: String?,
  blocked: Set<String>,
  blockGames: Boolean,
  isGame: Boolean,
  neverBlocked: Set<String>,
  ignored: Set<String>,
): Verdict =
  when {
    pkg.isNullOrEmpty() || pkg in ignored -> Verdict.IGNORE
    pkg in neverBlocked -> Verdict.ALLOWED
    pkg in blocked || (blockGames && isGame) -> Verdict.BLOCKED
    else -> Verdict.ALLOWED
  }
