import type { DayRecord } from '@mflow/core';
import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, T0, type App, type Clock } from './helpers';

const DAY_MS = 86_400_000;
const KEPT = ['01920000-0000-7000-8000-000000000001'];

const bad = (app: App, token: string, day: string) =>
  call<DayRecord>(app, 'POST', '/v1/day-type', { token, body: { day, kind: 'bad' } });
const away = (
  app: App,
  token: string,
  from: string,
  to: string,
  id = uuidv7(),
  place = 'Dushanbe',
) =>
  call<{ id: string; days: DayRecord[] }>(app, 'POST', '/v1/away', {
    token,
    body: { id, from, to, place, keptTaskIds: KEPT },
  });
const verdict = (app: App, token: string, id: string, body: object) =>
  call<DayRecord>(app, 'POST', `/v1/away/${id}/verdict`, { token, body });
const count = async (table: string) =>
  (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

describe('bad day', () => {
  it('declares today as a bad day once', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);

    const first = await bad(app, token, '2026-10-09');
    const again = await bad(app, token, '2026-10-09');

    expect([first.status, first.body.data]).toEqual([201, { day: '2026-10-09', kind: 'bad' }]);
    expect([again.status, again.body.error?.code]).toEqual([409, 'already_declared']);
  });

  it('allows one per ISO week', async () => {
    const clock: Clock = { now: T0 };
    const app = makeApp(clock);
    const { token } = await pairDevice(app);
    await bad(app, token, '2026-10-09'); // Friday

    clock.now = T0 + DAY_MS; // Saturday, same week
    const sameWeek = await bad(app, token, '2026-10-10');
    clock.now = T0 + 3 * DAY_MS; // Monday, next week
    const nextWeek = await bad(app, token, '2026-10-12');

    expect([sameWeek.status, sameWeek.body.error?.code]).toEqual([409, 'bad_day_limit_reached']);
    expect(nextWeek.status).toBe(201);
  });

  it('only for today', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await bad(app, token, '2026-10-10')).status).toBe(422);
  });
});

describe('away window', () => {
  it('writes one pending record per day of the window', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);

    const reply = await away(app, token, '2026-10-09', '2026-10-11');

    expect(reply.status).toBe(201);
    expect(reply.body.data.days).toEqual(
      ['2026-10-09', '2026-10-10', '2026-10-11'].map((day) => ({
        day,
        kind: 'away',
        away: { place: 'Dushanbe', keptTaskIds: KEPT, verified: 'pending' },
      })),
    );
  });

  it('is all-or-nothing when any day is already declared', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await bad(app, token, '2026-10-09');

    const reply = await away(app, token, '2026-10-09', '2026-10-11');

    expect([reply.status, reply.body.error?.code]).toEqual([409, 'already_declared']);
    expect([await count('away_windows'), await count('day_records')]).toEqual([0, 1]);
  });

  it.each([
    ['in the past', '2026-10-08', '2026-10-09'],
    ['more than 60 days ahead', '2026-12-09', '2026-12-10'],
  ])('refuses a window starting %s', async (_label, from, to) => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await away(app, token, from, to)).status).toBe(422);
  });
});

describe('away verdict', () => {
  it('confirms a day, then cancels it when the phone is found at home', async () => {
    const clock: Clock = { now: T0 };
    const app = makeApp(clock);
    const { token } = await pairDevice(app);
    const { id } = (await away(app, token, '2026-10-09', '2026-10-10')).body.data;

    const yes = await verdict(app, token, id, {
      day: '2026-10-09',
      verified: 'yes',
      distanceKm: 300,
    });
    clock.now = T0 + DAY_MS;
    const no = await verdict(app, token, id, { day: '2026-10-10', verified: 'no', distanceKm: 0 });

    expect(yes.body.data.away?.verified).toBe('yes');
    expect(no.body.data).toEqual({ day: '2026-10-10', kind: 'normal' });
    const stored = await env.DB.prepare(
      "SELECT distance_km FROM day_records WHERE day = '2026-10-09'",
    ).first<{ distance_km: number }>();
    expect(stored?.distance_km).toBe(300);
  });

  it('allows two unverified away days a month; the third reverts to normal', async () => {
    const clock: Clock = { now: T0 };
    const app = makeApp(clock);
    const { token } = await pairDevice(app);
    const results: DayRecord[] = [];
    for (let i = 0; i < 3; i++) {
      clock.now = T0 + i * DAY_MS;
      const day = `2026-10-${String(9 + i).padStart(2, '0')}`;
      const { id } = (await away(app, token, day, day)).body.data;
      results.push((await verdict(app, token, id, { day, verified: 'unknown' })).body.data);
    }
    expect(results.map((r) => r.away?.verified ?? r.kind)).toEqual([
      'unknown',
      'unknown',
      'normal',
    ]);
  });

  it('refuses a day outside the window or in the future, and an unknown window', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const { id } = (await away(app, token, '2026-10-09', '2026-10-10')).body.data;

    const outside = await verdict(app, token, id, { day: '2026-10-11', verified: 'yes' });
    const future = await verdict(app, token, id, { day: '2026-10-10', verified: 'yes' });
    const unknown = await verdict(app, token, '01920000-0000-7000-8000-00000000ffff', {
      day: '2026-10-09',
      verified: 'yes',
    });

    expect([outside.status, future.status, unknown.status]).toEqual([422, 422, 404]);
  });

  it('only accepts distances rounded to 10 km', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const { id } = (await away(app, token, '2026-10-09', '2026-10-09')).body.data;
    const reply = await verdict(app, token, id, {
      day: '2026-10-09',
      verified: 'yes',
      distanceKm: 15,
    });
    expect(reply.status).toBe(400);
  });
});

describe('away window retries', () => {
  it('a retried window with the same id answers 200 with the stored window', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const id = uuidv7();
    const first = await away(app, token, '2026-10-09', '2026-10-10', id);

    const retry = await away(app, token, '2026-10-09', '2026-10-10', id);

    expect([retry.status, retry.body.data]).toEqual([200, first.body.data]);
    expect(await count('away_windows')).toBe(1);
  });

  it('the same id with a different window is a conflict', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const id = uuidv7();
    await away(app, token, '2026-10-09', '2026-10-10', id);

    const other = await away(app, token, '2026-10-09', '2026-10-10', id, 'Toronto');

    expect([other.status, other.body.error?.code]).toEqual([409, 'already_declared']);
  });
});
