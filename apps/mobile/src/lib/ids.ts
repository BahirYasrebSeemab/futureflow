import { v7 } from 'uuid';

export type Ids = Readonly<{
  /** UUIDv7: unique and time-ordered to the millisecond (not within one; see the outbox order). */
  newId: (now?: number) => string;
  /** 32 random bytes, base64url: the device token the phone invents before pairing (ADR 0006). */
  newDeviceToken: () => string;
}>;

/** Hermes has no crypto.getRandomValues, so the caller supplies the randomness (expo-crypto on the phone). */
export function makeIds(randomBytes: (n: number) => Uint8Array): Ids {
  return {
    newId: (now = Date.now()) => v7({ msecs: now, random: randomBytes(16) }),
    newDeviceToken: () => toBase64Url(randomBytes(32)),
  };
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
