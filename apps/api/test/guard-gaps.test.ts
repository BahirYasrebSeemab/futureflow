import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { analyzeGuard } from '../src/upkeep/guard';
import { call, makeApp, pairDevice, type App, type Clock } from './helpers';

const H = 3_600_000;
const DAY9 = Date.UTC(2026, 9, 9, 4); // the 9th's day starts at 04:00 UTC (offset 0)

async function setup() {
  const clock: Clock = { now: DAY9 };
  const app: App = makeApp(clock);
  const { token } = await pairDevice(app);
  const beat = async (
    at: number,
    bootId = 'boot-1',
    uptimeSeconds = 99_999,
    guardEnabled = true,
  ) => {
    clock.now = at;
    await call(app, 'POST', '/v1/heartbeat', {
      token,
      // Connected at this very beat: a long silence before it still counts.
      body: {
        at,
        bootId,
        uptimeSeconds,
        utcOffsetMinutes: 0,
        guardEnabled,
        guardSinceUptimeSeconds: guardEnabled ? uptimeSeconds : null,
      },
    });
  };
  const analyze = () => analyzeGuard(makeDeps(env, { now: () => clock.now }));
  return { app, token, clock, beat, analyze };
}

describe('guard gaps', () => {
  it('stores a reboot gap as phone off and a silent gap as guard disabled, across runs', async () => {
    const { app, token, beat, analyze } = await setup();
    await beat(DAY9);
    await analyze(); // cursor now at the first beat
    await beat(DAY9 + 10 * H, 'boot-2', 60); // phone off for 10 h
    await beat(DAY9 + 10.25 * H, 'boot-2', 960);
    await beat(DAY9 + 12.25 * H, 'boot-2', 8160); // 2 h silence, no reboot
    expect(await analyze()).toBe(2);
    expect(await analyze()).toBe(0);

    const day = await call<{ phoneOffMinutes: number; guardDisabledMinutes: number }>(
      app,
      'GET',
      '/v1/guard/2026-10-09',
      { token },
    );
    expect([day.body.data.phoneOffMinutes, day.body.data.guardDisabledMinutes]).toEqual([600, 120]);
  });

  it('lets the owner reclassify yesterday as a bad day after a day with the phone off', async () => {
    const { app, token, clock, beat, analyze } = await setup();
    await beat(DAY9);
    await beat(DAY9 + 20 * H, 'boot-2', 60); // off 20 of the 9th's 24 h
    await analyze();
    clock.now = Date.UTC(2026, 9, 10, 8); // the 10th, morning (grace window)

    const reply = await call(app, 'POST', '/v1/day-type', {
      token,
      body: { day: '2026-10-09', kind: 'bad' },
    });

    expect([reply.status, reply.body.data]).toEqual([201, { day: '2026-10-09', kind: 'bad' }]);
  });

  it('refuses to reclassify yesterday when the phone was mostly on', async () => {
    const { app, token, clock, beat, analyze } = await setup();
    await beat(DAY9);
    await beat(DAY9 + 3 * H, 'boot-2', 60);
    await analyze();
    clock.now = Date.UTC(2026, 9, 10, 8);

    const reply = await call(app, 'POST', '/v1/day-type', {
      token,
      body: { day: '2026-10-09', kind: 'bad' },
    });

    expect([reply.status, reply.body.error?.code]).toEqual([422, 'day_out_of_range']);
  });
});

describe('gaps that span days', () => {
  it('counts a gap on every day it covers, and reclassifies a whole day off right after boot', async () => {
    const { app, token, clock, beat } = await setup();
    await beat(Date.UTC(2026, 9, 9, 23)); // the 9th, 23:00
    await beat(Date.UTC(2026, 9, 11, 9), 'boot-2', 60); // back on the 11th at 09:00
    clock.now = Date.UTC(2026, 9, 11, 9, 5); // no upkeep tick has run yet

    const tenth = await call<{ phoneOffMinutes: number }>(app, 'GET', '/v1/guard/2026-10-10', {
      token,
    });
    const reply = await call(app, 'POST', '/v1/day-type', {
      token,
      body: { day: '2026-10-10', kind: 'bad' },
    });

    expect(tenth.body.data.phoneOffMinutes).toBe(0); // before analysis, nothing is known
    expect(reply.status).toBe(201); // the reclassification analyzes the new beats itself
    const after = await call<{ phoneOffMinutes: number }>(app, 'GET', '/v1/guard/2026-10-10', {
      token,
    });
    expect(after.body.data.phoneOffMinutes).toBe(24 * 60);
  });
});

describe('guard gaps from queued beats', () => {
  it('beats queued while offline and sent late fill the silence they cover', async () => {
    const { token, clock, beat, analyze, app } = await setup();
    await beat(DAY9);
    await analyze();
    const queued = Array.from({ length: 12 }, (_, i) => ({
      at: DAY9 + (i + 1) * 0.25 * H,
      bootId: 'boot-1',
      uptimeSeconds: 99_999 + (i + 1) * 900,
      utcOffsetMinutes: 0,
      guardEnabled: true,
      guardSinceUptimeSeconds: 60,
    }));
    clock.now = DAY9 + 4 * H;
    await call(app, 'POST', '/v1/heartbeats', { token, body: { beats: queued } });
    const stored = await env.DB.prepare('SELECT COUNT(*) AS n FROM heartbeats').first('n');
    expect([stored, await analyze()]).toEqual([13, 0]);
  });

  it('a Doze-delayed beat with the guard connected throughout is no gap; one after a reconnect is', async () => {
    const { token, clock, analyze, app } = await setup();
    const send = async (at: number, uptimeSeconds: number, since: number | null) => {
      clock.now = at;
      await call(app, 'POST', '/v1/heartbeats', {
        token,
        body: {
          beats: [
            {
              at,
              bootId: 'boot-1',
              uptimeSeconds,
              utcOffsetMinutes: 0,
              guardEnabled: true,
              guardSinceUptimeSeconds: since,
            },
          ],
        },
      });
    };
    await send(DAY9, 10_000, 100);
    await send(DAY9 + 3 * H, 10_000 + 3 * 3600, 100); // held back by Doze
    await send(DAY9 + 6 * H, 10_000 + 6 * 3600, 10_000 + 5 * 3600); // reconnected at hour 5
    expect(await analyze()).toBe(1);

    const day = await call<{ guardDisabledMinutes: number }>(app, 'GET', '/v1/guard/2026-10-09', {
      token,
    });
    expect(day.body.data.guardDisabledMinutes).toBe(180);
  });
});
