import type { LedgerEvent } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { call, event, makeApp, pairDevice, T0, taskSpec, type App, type Clock } from './helpers';

type Today = {
  day: string;
  serverTime: number;
  plan: { status: string } | null;
  dayRecord: { kind: string } | null;
  balanceSeconds: number;
  earnedTodaySeconds: number;
};

const today = (app: App, token: string) => call<Today>(app, 'GET', '/v1/today', { token });

describe('GET /v1/today', () => {
  it('pays the base grant on the first call of the day, once', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);

    const first = await today(app, token);
    const second = await today(app, token);
    const ledger = await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token });
    const row = await env.DB.prepare('SELECT device_id FROM ledger_events').first();

    expect(first.body.data).toEqual({
      day: '2026-10-09',
      serverTime: T0,
      plan: null,
      dayRecord: null,
      balanceSeconds: 900,
      earnedTodaySeconds: 900,
    });
    expect(second.body.data.balanceSeconds).toBe(900);
    expect(ledger.body.data.events.map((e) => [e.kind, e.seconds, e.day])).toEqual([
      ['base_grant', 900, '2026-10-09'],
    ]);
    expect(row).toEqual({ device_id: null });
  });

  it('does not pay again when the phone already wrote the base grant', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await call(app, 'POST', '/v1/ledger/events', {
      token,
      body: { events: [event({ kind: 'base_grant', seconds: 900 })] },
    });

    expect((await today(app, token)).body.data.balanceSeconds).toBe(900);
  });

  it('reports the balance across days, including spends', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await call(app, 'POST', '/v1/ledger/events', {
      token,
      body: {
        events: [
          event({ kind: 'math_reward', seconds: 180, refId: 'a1', day: '2026-10-08' }),
          event({ kind: 'usage_spend', seconds: -300 }),
        ],
      },
    });

    const data = (await today(app, token)).body.data;

    expect([data.balanceSeconds, data.earnedTodaySeconds]).toEqual([780, 900]);
  });

  it("shows today's plan and day record", async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const tasks = [taskSpec(), taskSpec(), taskSpec()];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
    await call(app, 'POST', '/v1/day-type', { token, body: { day: '2026-10-09', kind: 'bad' } });

    const data = (await today(app, token)).body.data;

    expect(data.plan?.status).toBe('locked');
    expect(data.dayRecord).toEqual({ day: '2026-10-09', kind: 'bad' });
  });

  it('starts a new day at 04:00 on the device clock (Dushanbe, UTC+5)', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 9, 22, 59) }; // 03:59 local on 10-10
    const app = makeApp(clock);
    const { token } = await pairDevice(app, { utcOffsetMinutes: 300 });

    const before = await today(app, token);
    clock.now = Date.UTC(2026, 9, 9, 23, 0); // 04:00 local
    const after = await today(app, token);

    expect([before.body.data.day, after.body.data.day]).toEqual(['2026-10-09', '2026-10-10']);
    expect(after.body.data.balanceSeconds).toBe(1800);
    expect(after.body.data.earnedTodaySeconds).toBe(900);
  });
});
