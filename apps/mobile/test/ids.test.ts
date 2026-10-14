import { DeviceTokenSchema } from '@futureflow/contracts';
import { randomBytes } from 'node:crypto';
import { makeIds, toBase64Url } from '@/lib/ids';

const ids = makeIds((n) => new Uint8Array(randomBytes(n)));

test('newId makes distinct UUIDv7 ids that sort by time', () => {
  const a = ids.newId(Date.UTC(2026, 9, 14, 8));
  const b = ids.newId(Date.UTC(2026, 9, 14, 9));
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(a < b).toBe(true);
  expect(new Set(Array.from({ length: 100 }, () => ids.newId())).size).toBe(100);
});

test('newDeviceToken is 32 random bytes in base64url, as the API expects', () => {
  const token = ids.newDeviceToken();
  expect(DeviceTokenSchema.safeParse(token).success).toBe(true);
  expect(token).not.toBe(ids.newDeviceToken());
});

test('toBase64Url uses the URL-safe alphabet without padding', () => {
  expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
  expect(toBase64Url(new Uint8Array([1]))).toBe('AQ');
});
