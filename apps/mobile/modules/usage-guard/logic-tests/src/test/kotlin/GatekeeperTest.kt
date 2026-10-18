import expo.modules.usageguard.logic.IGNORED_BASE
import expo.modules.usageguard.logic.NEVER_BLOCKED_BASE
import expo.modules.usageguard.logic.Verdict
import expo.modules.usageguard.logic.classify
import kotlin.test.Test
import kotlin.test.assertEquals

private const val KEYBOARD = "com.google.android.inputmethod.latin"
private val blocked = setOf("com.instagram.android", "com.android.phone")

private fun verdict(pkg: String?, blockGames: Boolean = false, isGame: Boolean = false) =
  classify(pkg, blocked, blockGames, isGame, NEVER_BLOCKED_BASE, IGNORED_BASE + KEYBOARD)

class GatekeeperTest {
  @Test
  fun `a listed app is blocked and others are allowed`() {
    assertEquals(Verdict.BLOCKED, verdict("com.instagram.android"))
    assertEquals(Verdict.ALLOWED, verdict("com.android.chrome"))
  }

  @Test
  fun `never-blocked apps win over the block list`() {
    assertEquals(Verdict.ALLOWED, verdict("com.android.phone"))
  }

  @Test
  fun `games are blocked only when games are blocked`() {
    assertEquals(Verdict.BLOCKED, verdict("com.example.game", blockGames = true, isGame = true))
    assertEquals(Verdict.ALLOWED, verdict("com.example.game", blockGames = false, isGame = true))
  }

  @Test
  fun `an ignored window keeps the session open`() {
    // A keyboard or the notification shade over Instagram must not end the charge.
    assertEquals(Verdict.IGNORE, verdict(KEYBOARD))
    assertEquals(Verdict.IGNORE, verdict("com.android.systemui"))
    assertEquals(Verdict.IGNORE, verdict(null))
    assertEquals(Verdict.IGNORE, verdict(""))
  }

  @Test
  fun `share sheets and permission dialogs keep the session open`() {
    for (pkg in listOf(
      "android",
      "com.android.intentresolver",
      "com.android.permissioncontroller",
      "com.google.android.permissioncontroller",
    )) {
      assertEquals(Verdict.IGNORE, verdict(pkg), pkg)
    }
  }
}
