const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The AES-256-GCM key from a Worker secret (base64 of 32 random bytes), or null if absent/invalid. */
export async function importSecretKey(base64: string | undefined): Promise<CryptoKey | null> {
  if (base64 === undefined) return null;
  const raw = fromBase64(base64);
  if (raw === null || raw.length !== KEY_BYTES) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts with a fresh random IV. The output names its format version for later key rotation. */
export async function seal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/** Decrypts, or null when the text is malformed, tampered with, or sealed with another key. */
export async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  const [version, ivText, ciphertextText] = sealed.split('.');
  if (version !== VERSION || ivText === undefined || ciphertextText === undefined) return null;
  const iv = fromBase64(ivText);
  const ciphertext = fromBase64(ciphertextText);
  if (iv === null || ciphertext === null) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
