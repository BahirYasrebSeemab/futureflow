import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/auth/token';
import { call, makeApp, pairDevice, phoneToken, T0, TEST_SETUP_CODE } from './helpers';

const PHONE_TOKEN = phoneToken();
const pairBody = {
  code: TEST_SETUP_CODE,
  token: PHONE_TOKEN,
  deviceName: 'Redmi A5',
  utcOffsetMinutes: 300,
};
const deviceCount = async () =>
  (await env.DB.prepare('SELECT count(*) AS n FROM devices').first<{ n: number }>())?.n;

describe('POST /v1/device/pair', () => {
  it('pairs once; the token the phone generated then authenticates the device', async () => {
    const app = makeApp();
    const reply = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
      body: pairBody,
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data).toEqual({ deviceId: expect.any(String) });
    const me = await call(app, 'GET', '/v1/device/me', { token: PHONE_TOKEN });
    expect(me.body.data).toEqual({
      id: reply.body.data.deviceId,
      name: 'Redmi A5',
      utcOffsetMinutes: 300,
    });
  });

  it('stores only the SHA-256 hash of the token', async () => {
    const { token } = await pairDevice(makeApp());
    const row = await env.DB.prepare('SELECT token_hash FROM devices').first<{
      token_hash: string;
    }>();
    expect(row?.token_hash).not.toBe(token);
    expect(row?.token_hash).toBe(await sha256Hex(token));
  });

  it('answers a retried pairing (same code, same token) with 200 and the same device', async () => {
    const app = makeApp();
    const first = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
      body: pairBody,
    });
    const retry = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
      body: pairBody,
    });

    expect([retry.status, retry.body.data]).toEqual([200, first.body.data]);
    expect(await deviceCount()).toBe(1);
  });

  it('a known token with a fresh setup code answers with its existing device, not a 500', async () => {
    const app = makeApp();
    const first = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
      body: pairBody,
    });
    const code = 'rotated-setup-code-0123456789';
    const again = await call<{ deviceId: string }>(app, 'POST', '/v1/device/pair', {
      body: { ...pairBody, code },
      env: { SETUP_CODE: code },
    });

    expect([again.status, again.body.data]).toEqual([200, first.body.data]);
    expect(await deviceCount()).toBe(1);
  });

  it('refuses a used setup code with a different token', async () => {
    const app = makeApp();
    await call(app, 'POST', '/v1/device/pair', { body: pairBody });
    const again = await call(app, 'POST', '/v1/device/pair', {
      body: { ...pairBody, token: phoneToken() },
    });

    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('code_used');
    expect(await deviceCount()).toBe(1);
  });

  it('refuses a wrong code without creating a device', async () => {
    const reply = await call(makeApp(), 'POST', '/v1/device/pair', {
      body: { ...pairBody, code: 'wrong-code-0123456789' },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([401, 'invalid_code']);
    expect(await deviceCount()).toBe(0);
  });

  it('is disabled when no setup code secret is configured', async () => {
    const reply = await call(makeApp(), 'POST', '/v1/device/pair', {
      body: pairBody,
      env: { SETUP_CODE: undefined },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([503, 'pairing_disabled']);
  });

  it('rejects an invalid body without echoing the submitted values', async () => {
    const reply = await call(makeApp(), 'POST', '/v1/device/pair', {
      body: { ...pairBody, code: 'short-secret' },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([400, 'invalid_request']);
    expect(reply.body.error?.message).toContain('code');
    expect(JSON.stringify(reply.body)).not.toContain('short-secret');
  });
});

describe('device authentication', () => {
  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['malformed token', 'Bearer short'],
    ['unknown token', `Bearer ${'A'.repeat(43)}`],
  ])('answers 401 for %s', async (_label, header) => {
    const app = makeApp();
    await pairDevice(app);
    const reply = await call(app, 'GET', '/v1/device/me', {
      headers: header === undefined ? {} : { authorization: header },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([401, 'unauthorized']);
  });

  it('accepts the scheme in any case', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reply = await call(app, 'GET', '/v1/device/me', {
      headers: { authorization: `bearer ${token}` },
    });
    expect(reply.status).toBe(200);
  });

  it('answers 401 for a revoked device', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await env.DB.prepare('UPDATE devices SET revoked_at = ?1').bind(T0).run();
    expect((await call(app, 'GET', '/v1/device/me', { token })).status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('answers 429 when the limiter refuses, keyed per device and for pairing', async () => {
    const keys: string[] = [];
    let allow = true;
    const app = makeApp(undefined, {
      limiter: async (key) => {
        keys.push(key);
        return allow;
      },
    });
    const { token, deviceId } = await pairDevice(app);
    allow = false;

    const me = await call(app, 'GET', '/v1/device/me', { token });
    const pair = await call(app, 'POST', '/v1/device/pair', { body: pairBody });

    expect([me.status, me.body.error?.code]).toEqual([429, 'rate_limited']);
    expect(pair.status).toBe(429);
    expect(keys).toEqual(['pair', `device:${deviceId}`, 'pair']);
  });

  it('uses the Workers rate-limit binding by default', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await call(app, 'GET', '/v1/device/me', { token })).status).toBe(200);
  });
});
