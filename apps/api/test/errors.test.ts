import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, event, makeApp, pairDevice } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error envelope', () => {
  it('answers malformed JSON with 400 invalid_request', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reply = await call(app, 'POST', '/v1/ledger/events', { token, raw: '{"events": [' });
    expect([reply.status, reply.body.error?.code]).toEqual([400, 'invalid_request']);
  });

  it('accepts the largest batch the schema allows', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const events = Array.from({ length: 500 }, (_, i) =>
      event({
        kind: 'correction',
        seconds: -1,
        refId: String(i).padStart(128, 'r'),
        reason: 'x'.repeat(500),
      }),
    );
    const reply = await call<{ added: string[] }>(app, 'POST', '/v1/ledger/events', {
      token,
      body: { events },
    });
    expect([reply.status, reply.body.data.added.length]).toEqual([200, 500]);
  });

  it('answers a body over 512 KiB with 413', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const raw = JSON.stringify({ events: [], pad: 'x'.repeat(600_000) });
    const reply = await call(app, 'POST', '/v1/ledger/events', {
      token,
      raw,
      headers: { 'content-length': String(raw.length) },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([413, 'payload_too_large']);
  });

  it('answers a database failure with a 500 that leaks nothing, and logs without personal data', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await env.DB.exec('ALTER TABLE ledger_events RENAME TO ledger_events_offline');
    try {
      const reply = await call(app, 'POST', '/v1/ledger/events', {
        token,
        body: { events: [event({ kind: 'usage_spend', seconds: -60, reason: 'private-note' })] },
      });

      expect(reply).toEqual({
        status: 500,
        body: {
          ok: false,
          data: null,
          error: { code: 'internal', message: 'Something went wrong on the server.' },
        },
      });
      const logged = log.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(JSON.parse(logged)).toMatchObject({
        level: 'error',
        event: 'unhandled_error',
        route: '/v1/ledger/events',
      });
      expect(logged).not.toContain('private-note');
      expect(logged).not.toContain(token);
    } finally {
      await env.DB.exec('ALTER TABLE ledger_events_offline RENAME TO ledger_events');
    }
  });
});
