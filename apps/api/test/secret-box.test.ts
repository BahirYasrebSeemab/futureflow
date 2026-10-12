import { describe, expect, it } from 'vitest';
import { importSecretKey, open, seal } from '../src/crypto/secret-box';

/** Bytes 0..31, base64. Test-only key. */
export const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const OTHER_KEY = 'HwAeHR0cGxoZGBcWFRQTEhEQDw4NDAsKCQgHBgUEAwI=';

describe('secret box (AES-GCM)', () => {
  it('opens what it sealed, with a fresh IV each time', async () => {
    const key = await importSecretKey(TEST_KEY);
    if (key === null) throw new Error('key');
    const a = await seal(key, 'github_pat_secret');
    const b = await seal(key, 'github_pat_secret');

    expect(a).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('github_pat_secret');
    expect(await open(key, a)).toBe('github_pat_secret');
  });

  it('refuses tampered text, another key, and malformed input', async () => {
    const key = await importSecretKey(TEST_KEY);
    const other = await importSecretKey(OTHER_KEY);
    if (key === null || other === null) throw new Error('key');
    const sealed = await seal(key, 'secret');
    const [v, iv, ct] = sealed.split('.');
    const flipped = `${v}.${iv}.${(ct ?? '').slice(0, -4)}AAA=`;

    expect(await open(key, flipped)).toBeNull();
    expect(await open(other, sealed)).toBeNull();
    expect(await open(key, 'v2.a.b')).toBeNull();
    expect(await open(key, 'v1.%%%.###')).toBeNull();
  });

  it('only accepts a 32-byte base64 key', async () => {
    expect(await importSecretKey(undefined)).toBeNull();
    expect(await importSecretKey('c2hvcnQ=')).toBeNull();
    expect(await importSecretKey('not base64!')).toBeNull();
  });
});
