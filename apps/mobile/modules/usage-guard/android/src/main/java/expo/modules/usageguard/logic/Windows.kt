package expo.modules.usageguard.logic

/** One window on screen, as the accessibility service lists it. */
data class WindowView(val pkg: String?, val application: Boolean, val focused: Boolean)

/**
 * A blocked app visible on screen: full screen, picture-in-picture or either half of a split
 * screen, focused or not (tapping the other half moves focus without a window-state event).
 * System windows don't count.
 */
fun sideBlocked(windows: List<WindowView>, verdictOf: (String?) -> Verdict): Boolean =
  windows.any { it.application && verdictOf(it.pkg) == Verdict.BLOCKED }
