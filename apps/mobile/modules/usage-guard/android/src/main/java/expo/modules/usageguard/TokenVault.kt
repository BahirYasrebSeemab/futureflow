package expo.modules.usageguard

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The heartbeat's copy of the device token, sealed with a key that never leaves the Android
 * Keystore (the same approach as expo-secure-store), so a copied prefs file is useless.
 */
internal object TokenVault {
  private const val KEYSTORE = "AndroidKeyStore"
  private const val ALIAS = "futureflow.heartbeat"
  private const val TRANSFORM = "AES/GCM/NoPadding"
  private const val TAG_BITS = 128
  private const val KEY_BITS = 256

  fun seal(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
    val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return encode(cipher.iv) + ":" + encode(sealed)
  }

  /** Null when the value or the key is unusable (a restored backup, a wiped keystore). */
  fun open(sealed: String): String? {
    val parts = sealed.split(':')
    if (parts.size != 2) return null
    return try {
      val cipher = Cipher.getInstance(TRANSFORM)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, decode(parts[0])))
      String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8)
    } catch (e: GeneralSecurityException) {
      null
    } catch (e: IllegalArgumentException) {
      null
    }
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val spec =
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(KEY_BITS)
        .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
      .apply { init(spec) }
      .generateKey()
  }

  private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

  private fun decode(text: String) = Base64.decode(text, Base64.NO_WRAP)
}
