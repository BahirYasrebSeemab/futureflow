import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, makeApp } from './helpers';

describe('app shell', () => {
  it('answers health in the envelope', async () => {
    expect(await call(makeApp(), 'GET', '/v1/health')).toEqual({
      status: 200,
      body: { ok: true, data: { status: 'ok' }, error: null },
    });
  });

  it('answers unknown paths with a 404 envelope', async () => {
    const reply = await call(makeApp(), 'GET', '/nope');
    expect(reply).toEqual({
      status: 404,
      body: { ok: false, data: null, error: { code: 'not_found', message: 'Not found.' } },
    });
  });

  it('the worker entry serves the same app', async () => {
    const res = await exports.default.fetch('http://api.test/v1/health');
    expect(await res.json()).toEqual({ ok: true, data: { status: 'ok' }, error: null });
  });
});
