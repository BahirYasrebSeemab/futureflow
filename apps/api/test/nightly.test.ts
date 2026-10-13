import type { FetchLike } from '@mflow/ai';
import type { Plan } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { isNightly, runNightly, templateReview } from '../src/upkeep/nightly';
import { call, geminiReply, makeApp, pairDevice, sampleRoadmap, type Clock } from './helpers';

const NIGHT = Date.UTC(2026, 9, 9, 21, 30); // 21:30 on the 9th (offset 0)

async function setup(fetch?: FetchLike, keyed = false) {
  const clock: Clock = { now: NIGHT };
  const app = makeApp(clock, fetch === undefined ? {} : { fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
  const deps = () =>
    makeDeps(
      { ...env, ...(keyed ? { GEMINI_API_KEY: 'g-key' } : {}) },
      { now: () => clock.now, ...(fetch === undefined ? {} : { fetch }) },
    );
  return { app, token, clock, deps };
}

describe('nightly', () => {
  it('is open from 21:00 to 03:59 on the owner clock', () => {
    expect(
      [20.99, 21, 23.5, 3.99, 4].map((h) => isNightly(Date.UTC(2026, 9, 9) + h * 3_600_000, 0)),
    ).toEqual([false, true, true, true, false]);
    expect(isNightly(Date.UTC(2026, 9, 9, 16, 0), 300)).toBe(true); // 21:00 in Dushanbe
  });

  it('without AI, writes a template review and proposes tomorrow, once', async () => {
    const { app, token, deps } = await setup();

    const first = await runNightly(deps());
    const second = await runNightly(deps());

    expect(first).toEqual({ day: '2026-10-09', review: 'template', proposed: true });
    expect(second).toBeNull();
    const page = await call<{ messages: { kind: string; text: string }[] }>(
      app,
      'GET',
      '/v1/coach/messages',
      { token },
    );
    expect(page.body.data.messages.map((m) => m.kind)).toEqual(['review']);
    const tomorrow = await call<Plan>(app, 'GET', '/v1/plans/2026-10-10', { token });
    expect(tomorrow.body.data.status).toBe('draft');
  });

  it('writes the review with the AI from the day facts, and keeps a plan the owner already drafted', async () => {
    const prompts: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      prompts.push(init.body ?? '');
      return geminiReply('You read and coded today. Tomorrow: the checklist.');
    };
    const { app, token, deps } = await setup(fetch, true);
    await call(app, 'PUT', '/v1/plans/2026-10-10', {
      token,
      body: { tasks: [] },
    });

    const result = await runNightly(deps());

    expect(result).toEqual({ day: '2026-10-09', review: 'ai', proposed: false });
    expect(prompts[0]).toContain('phone off');
  });

  it('does nothing outside the window', async () => {
    const { clock, deps } = await setup();
    clock.now = Date.UTC(2026, 9, 9, 15);
    expect(await runNightly(deps())).toBeNull();
  });

  it('the template review states the facts plainly', () => {
    const text = templateReview({
      day: '2026-10-09',
      tasks: [
        { title: 'Fix the bug', outcome: 'pass' },
        { title: 'Read', outcome: 'pending' },
      ],
      earnedMinutes: 35,
      spentMinutes: 20,
      unlocks: 1,
      readingLogs: 1,
      math: { attempts: 10, correct: 8 },
      phoneOffMinutes: 0,
      guardDisabledMinutes: 45,
    });
    expect(text).toContain('1 of 2 tasks passed');
    expect(text).toContain('8 of 10 math problems right');
    expect(text).toContain('guard was off for 45 min');
    expect(text).toContain('1 emergency unlock');
  });
});

describe('nightly after a failure part-way', () => {
  it('a retry after a failed proposal writes no second review and makes no second review call', async () => {
    const reviewPrompts: number[] = [];
    let run = 0;
    const fetch: FetchLike = async (_url, init) => {
      if ((init.body ?? '').includes("Write tonight's review")) reviewPrompts.push(run);
      return geminiReply('Good day.');
    };
    const { app, token, deps } = await setup(fetch, true);
    const base = deps();
    let failOnce = true;
    const flaky = {
      ...base,
      repos: {
        ...base.repos,
        plans: {
          ...base.repos.plans,
          save: async (...args: Parameters<typeof base.repos.plans.save>) => {
            if (failOnce) {
              failOnce = false;
              throw new Error('D1 hiccup');
            }
            return base.repos.plans.save(...args);
          },
        },
      },
    };

    await expect(runNightly(flaky)).rejects.toThrow('D1 hiccup');
    run = 1;
    const retry = await runNightly(flaky);

    const page = await call<{ messages: { kind: string }[] }>(app, 'GET', '/v1/coach/messages', {
      token,
    });
    expect(page.body.data.messages.filter((m) => m.kind === 'review')).toHaveLength(1);
    expect(retry?.proposed).toBe(true);
    expect(retry?.review).toBe('kept');
    expect(reviewPrompts).toEqual([0]); // the review was asked for once, on the first run only
  });
});
