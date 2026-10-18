import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, T0 } from './helpers';

const heartbeat = {
  at: T0,
  bootId: 'boot-1',
  uptimeSeconds: 3600,
  utcOffsetMinutes: 300,
  guardEnabled: true,
};
const reading = (over: object = {}) => ({
  id: uuidv7(),
  day: '2026-10-09',
  title: 'Atomic Habits',
  source: 'book',
  pages: 12,
  summary: 'Small habits compound.',
  ...over,
});
const attempt = (over: object = {}) => ({
  id: uuidv7(),
  day: '2026-10-09',
  at: T0,
  topicId: 'L0.fractions',
  difficulty: 3,
  correct: true,
  answerType: 'typed',
  ...over,
});

describe('POST /v1/heartbeat', () => {
  it('records the beat, updates the device offset and returns server time', async () => {
    const app = makeApp();
    const { token, deviceId } = await pairDevice(app);

    const reply = await call(app, 'POST', '/v1/heartbeat', { token, body: heartbeat });
    const me = await call<{ utcOffsetMinutes: number }>(app, 'GET', '/v1/device/me', { token });
    const row = await env.DB.prepare(
      'SELECT device_id, boot_id, uptime_seconds, guard_enabled, received_at FROM heartbeats',
    ).first();

    expect(reply.body.data).toEqual({ serverTime: T0 });
    expect(me.body.data.utcOffsetMinutes).toBe(300);
    expect(row).toEqual({
      device_id: deviceId,
      boot_id: 'boot-1',
      uptime_seconds: 3600,
      guard_enabled: 1,
      received_at: T0,
    });
  });

  it('rejects an invalid beat', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reply = await call(app, 'POST', '/v1/heartbeat', {
      token,
      body: { ...heartbeat, uptimeSeconds: -1 },
    });
    expect(reply.status).toBe(400);
  });
});

describe('POST /v1/reading', () => {
  it('stores a log once; a resend is acknowledged without a second row or an overwrite', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const log = reading();

    const first = await call(app, 'POST', '/v1/reading', { token, body: log });
    const again = await call(app, 'POST', '/v1/reading', {
      token,
      body: { ...log, summary: 'changed' },
    });
    const rows = await env.DB.prepare('SELECT summary FROM reading_logs').all();

    expect([first.status, first.body.data]).toEqual([201, { id: log.id, created: true }]);
    expect([again.status, again.body.data]).toEqual([200, { id: log.id, created: false }]);
    expect(rows.results).toEqual([{ summary: 'Small habits compound.' }]);
  });

  it.each([
    ['yesterday', '2026-10-08', 201],
    ['two days ago', '2026-10-07', 422],
    ['tomorrow', '2026-10-10', 422],
  ])('accepts or refuses a log for %s', async (_label, day, status) => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    expect((await call(app, 'POST', '/v1/reading', { token, body: reading({ day }) })).status).toBe(
      status,
    );
  });
});

describe('POST /v1/math/attempts', () => {
  type Sync = { added: string[]; ignored: string[]; rejected: { id: string; reason: string }[] };

  it('stores attempts idempotently and rejects future timestamps', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const a = attempt();
    const b = attempt({ correct: false, answerType: 'choice' });
    const ahead = attempt({ at: T0 + 300_001 });

    const first = await call<Sync>(app, 'POST', '/v1/math/attempts', {
      token,
      body: { attempts: [a, b, ahead] },
    });
    const again = await call<Sync>(app, 'POST', '/v1/math/attempts', {
      token,
      body: { attempts: [a] },
    });
    const row = await env.DB.prepare(
      'SELECT correct, answer_type, difficulty FROM math_attempts WHERE id = ?1',
    )
      .bind(b.id)
      .first();

    expect(first.body.data).toEqual({
      added: [a.id, b.id],
      ignored: [],
      rejected: [{ id: ahead.id, reason: 'future_timestamp' }],
    });
    expect(again.body.data).toEqual({ added: [], ignored: [a.id], rejected: [] });
    expect(row).toEqual({ correct: 0, answer_type: 'choice', difficulty: 3 });
  });

  it('accepts a full 500-attempt batch', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const attempts = Array.from({ length: 500 }, () => attempt());
    const reply = await call<Sync>(app, 'POST', '/v1/math/attempts', { token, body: { attempts } });
    expect(reply.body.data.added).toHaveLength(500);
  });
});

describe('heartbeat clock check', () => {
  it('refuses a beat stamped more than 5 minutes ahead of the server', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const ahead = await call(app, 'POST', '/v1/heartbeat', {
      token,
      body: { ...heartbeat, at: T0 + 300_001 },
    });
    const edge = await call(app, 'POST', '/v1/heartbeat', {
      token,
      body: { ...heartbeat, at: T0 + 300_000 },
    });
    expect([ahead.status, ahead.body.error?.code, edge.status]).toEqual([422, 'clock_ahead', 200]);
  });
});

describe('POST /v1/heartbeats', () => {
  type Batch = { added: number; rejected: number; serverTime: number };
  const beats = (n: number, from = T0 - n * 900_000) =>
    Array.from({ length: n }, (_, i) => ({
      ...heartbeat,
      at: from + i * 900_000,
      uptimeSeconds: 3600 + i * 900,
      guardSinceUptimeSeconds: 60,
    }));

  it('stores a batch with the guard-since uptime; a resend adds nothing', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const body = { beats: beats(3) };

    const first = await call<Batch>(app, 'POST', '/v1/heartbeats', { token, body });
    const again = await call<Batch>(app, 'POST', '/v1/heartbeats', { token, body });
    const rows = await env.DB.prepare(
      'SELECT uptime_seconds, guard_since_uptime FROM heartbeats ORDER BY at',
    ).all();

    expect([first.status, first.body.data]).toEqual([
      201,
      { added: 3, rejected: 0, serverTime: T0 },
    ]);
    expect([again.status, again.body.data.added]).toEqual([200, 0]);
    expect(rows.results).toEqual([
      { uptime_seconds: 3600, guard_since_uptime: 60 },
      { uptime_seconds: 4500, guard_since_uptime: 60 },
      { uptime_seconds: 5400, guard_since_uptime: 60 },
    ]);
  });

  it('drops and counts a beat from the future, keeping the rest', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const body = { beats: [...beats(2), { ...heartbeat, at: T0 + 300_001 }] };
    const reply = await call<Batch>(app, 'POST', '/v1/heartbeats', { token, body });
    expect([reply.status, reply.body.data.added, reply.body.data.rejected]).toEqual([201, 2, 1]);
  });

  it('takes the UTC offset from the newest beat', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const [older, newer] = beats(2);
    // Listed newest first: the offset follows time, not position.
    const body = {
      beats: [
        { ...newer, utcOffsetMinutes: 60 },
        { ...older, utcOffsetMinutes: 0 },
      ],
    };
    await call(app, 'POST', '/v1/heartbeats', { token, body });
    const me = await call<{ utcOffsetMinutes: number }>(app, 'GET', '/v1/device/me', { token });
    expect(me.body.data.utcOffsetMinutes).toBe(60);
  });

  it('refuses an empty batch and one over 96 beats', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const empty = await call(app, 'POST', '/v1/heartbeats', { token, body: { beats: [] } });
    const big = await call(app, 'POST', '/v1/heartbeats', { token, body: { beats: beats(97) } });
    expect([empty.status, big.status]).toEqual([400, 400]);
  });
});
