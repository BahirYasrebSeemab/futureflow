import expo.modules.usageguard.logic.Verdict
import expo.modules.usageguard.logic.WindowView
import expo.modules.usageguard.logic.sideBlocked
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private val verdict: (String?) -> Verdict = { if (it == "yt") Verdict.BLOCKED else Verdict.ALLOWED }

class WindowsTest {
  @Test
  fun `a blocked app in picture-in-picture beside the focused app counts`() {
    val windows = listOf(WindowView("maps", true, true), WindowView("yt", true, false))
    assertTrue(sideBlocked(windows, verdict))
  }

  @Test
  fun `the focused window is left to the focus rule`() {
    assertFalse(sideBlocked(listOf(WindowView("yt", true, true)), verdict))
  }

  @Test
  fun `system windows never count`() {
    assertFalse(sideBlocked(listOf(WindowView("yt", false, false)), verdict))
  }

  @Test
  fun `allowed apps beside each other are fine`() {
    val windows = listOf(WindowView("maps", true, true), WindowView("notes", true, false), WindowView(null, true, false))
    assertFalse(sideBlocked(windows, verdict))
  }
}
