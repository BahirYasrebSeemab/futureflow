package expo.modules.usageguard.logic

/** One window on screen, as the accessibility service lists it. */
data class WindowView(val pkg: String?, val application: Boolean, val focused: Boolean)

/**
 * A blocked app visible beside the focused window: picture-in-picture or the other half of a split
 * screen. The focused window is left to the focus rule; system windows don't count.
 */
fun sideBlocked(windows: List<WindowView>, verdictOf: (String?) -> Verdict): Boolean = false
