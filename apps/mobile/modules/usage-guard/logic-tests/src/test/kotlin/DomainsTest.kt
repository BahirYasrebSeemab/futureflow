import expo.modules.usageguard.logic.domainBlocked
import expo.modules.usageguard.logic.hostOf
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val SOCIAL = setOf("youtube.com", "instagram.com", "x.com")

class DomainsTest {
  @Test
  fun `the host comes out of a full address`() {
    assertEquals("m.youtube.com", hostOf("https://m.youtube.com/watch?v=1"))
    assertEquals("instagram.com", hostOf("http://www.instagram.com:443/reel/abc#x"))
    assertEquals("example.org", hostOf("https://user:pw@example.org/path"))
  }

  @Test
  fun `the address bar often shows no scheme`() {
    assertEquals("youtube.com", hostOf("youtube.com/shorts/xyz"))
    assertEquals("youtube.com", hostOf("  YouTube.com  "))
  }

  @Test
  fun `search text and browser pages are not addresses`() {
    assertNull(hostOf("how to focus"))
    assertNull(hostOf("instagram"))
    assertNull(hostOf("chrome://newtab"))
    assertNull(hostOf(""))
    assertNull(hostOf(null))
  }

  @Test
  fun `a scheme is only at the start, so an address in the query can't hide the host`() {
    assertEquals("youtube.com", hostOf("youtube.com/watch?v=abc&x=https://a.org"))
    assertEquals("youtube.com", hostOf("https://youtube.com/redirect?u=http://x.org"))
  }

  @Test
  fun `a trailing dot and view-source don't hide the host`() {
    assertEquals("youtube.com", hostOf("youtube.com."))
    assertEquals("youtube.com", hostOf("https://youtube.com./watch"))
    assertEquals("youtube.com", hostOf("view-source:https://youtube.com/"))
  }

  @Test
  fun `a blocked domain matches itself and its subdomains`() {
    assertTrue(domainBlocked("youtube.com", SOCIAL))
    assertTrue(domainBlocked("m.youtube.com", SOCIAL))
    assertTrue(domainBlocked("x.com", SOCIAL))
  }

  @Test
  fun `a name that only ends like a blocked domain does not match`() {
    assertFalse(domainBlocked("notyoutube.com", SOCIAL))
    assertFalse(domainBlocked("box.com", SOCIAL))
    assertFalse(domainBlocked("youtube.com.evil.org", SOCIAL))
  }

  @Test
  fun `a blocked word in the path does not block the site`() {
    assertFalse(domainBlocked(hostOf("https://news.example.org/youtube.com"), SOCIAL))
  }

  @Test
  fun `no host or no domains block nothing`() {
    assertFalse(domainBlocked(null, SOCIAL))
    assertFalse(domainBlocked("youtube.com", emptySet()))
  }
}
