import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runUpkeep } from '../src/scheduled';
import {
  call,
  countingDb,
  geminiReply,
  makeApp,
  pairDevice,
  sampleRoadmap,
  taskSpec,
  type Clock,
} from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A busy tick: Monday 21:30, nightly + weekly + rollover + guard all do work. Measured 32 statements
 * (47 before sharing the owner context and batching); the free limit is 50.
 */
const D1_BUDGET = 32;

describe('upkeep cron', () => {
  it('runs every step within the free-plan budget and logs counts only', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 12, 8) }; // Monday the 12th
    const fetch: FetchLike = async () => geminiReply('Private review words.');
    const app = makeApp(clock, { fetch });
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
    await call(app, 'PUT', '/v1/plans/2026-10-12', {
      token,
      body: { tasks: [taskSpec('Private task'), taskSpec(), taskSpec()] },
    });
    await call(app, 'POST', '/v1/coach/messages', {
      token,
      body: { id: '01920000-0000-7000-8000-0000000000c1', text: 'last week note' },
    });
    await env.DB.prepare("UPDATE coach_messages SET day = '2026-10-07', week = '2026-W41'").run();
    for (const [h, boot, up] of [
      [8, 'b1', 9999],
      [9, 'b1', 99_999],
      [11, 'b2', 60],
    ] as const) {
      clock.now = Date.UTC(2026, 9, 12, h);
      await call(app, 'POST', '/v1/heartbeat', {
        token,
        body: {
          at: clock.now,
          bootId: boot,
          uptimeSeconds: up,
          utcOffsetMinutes: 0,
          guardEnabled: true,
        },
      });
    }
    clock.now = Date.UTC(2026, 9, 12, 21, 30);
    const counted = countingDb(env.DB);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const run = await runUpkeep(
      { ...env, DB: counted.db, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, fetch },
    );

    expect(run).toEqual({
      rolledOver: true,
      gaps: 2,
      nightly: 'ai',
      summarized: '2026-W41',
      deleted: 0,
      wordProblem: null,
    });
    expect(counted.count()).toBeLessThanOrEqual(D1_BUDGET);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('upkeep_run');
    expect(logged).not.toContain('Private');
  });
});

describe('upkeep step isolation', () => {
  it('a failing step is logged by name and the later steps still run', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 9, 21, 30) };
    const app = makeApp(clock);
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
    await env.DB.exec('ALTER TABLE heartbeats RENAME TO heartbeats_offline'); // breaks the guard step
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const run = await runUpkeep(env, { now: () => clock.now });
      expect(run.nightly).toBe('template');
      expect(errors.mock.calls.map((a) => JSON.parse(String(a[0])) as unknown)).toEqual([
        { level: 'error', event: 'upkeep_step_failed', step: 'guard', name: 'Error' },
      ]);
    } finally {
      await env.DB.exec('ALTER TABLE heartbeats_offline RENAME TO heartbeats');
    }
  });
});
