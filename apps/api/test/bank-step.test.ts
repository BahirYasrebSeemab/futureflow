import type { FetchLike } from '@futureflow/ai';
import { DEFAULT_REGISTRY } from '@futureflow/math-engine/generators';
import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import { makeDeps } from '../src/app';
import { MAX_TOPIC_ATTEMPTS, nextJob, runBankStep, storyableSeed } from '../src/math/bank-step';
import { runUpkeep } from '../src/scheduled';
import { ownerContext } from '../src/upkeep/owner';
import { call, geminiReply, makeApp, pairDevice, T0, type Clock } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const counts = (
  kept: Record<string, number>,
  attempted: Record<string, number> = kept,
): Parameters<typeof nextJob>[2] => ({
  kept: Object.values(kept).reduce((a, b) => a + b, 0),
  attempted: Object.values(attempted).reduce((a, b) => a + b, 0),
  keptByTopic: new Map(Object.entries(kept)),
  attemptedByTopic: new Map(Object.entries(attempted)),
});

describe('nextJob', () => {
  it('fills the most practised word topic first, three kept per topic', () => {
    expect(nextJob('2026-W42', ['factoring', 'percents', 'fractions'], counts({}))).toMatchObject({
      topicId: 'percents',
      difficulty: 2,
      n: 0,
    });
    expect(nextJob('2026-W42', ['percents', 'fractions'], counts({ percents: 3 }))).toMatchObject({
      topicId: 'fractions',
    });
  });

  it('moves on from a topic whose stories keep failing', () => {
    const job = nextJob(
      '2026-W42',
      ['right-triangle-trigonometry', 'percents'],
      counts({}, { 'right-triangle-trigonometry': MAX_TOPIC_ATTEMPTS }),
    );
    expect(job).toMatchObject({ topicId: 'percents' });
  });

  it('stops at the weekly totals', () => {
    expect(nextJob('2026-W42', ['percents'], counts({ fractions: 12 }))).toBeNull();
    expect(nextJob('2026-W42', ['percents'], counts({}, { fractions: 24 }))).toBeNull();
    expect(nextJob('2026-W42', ['factoring'], counts({}))).toBeNull();
  });
});

describe('storyableSeed', () => {
  it('finds, deterministically, a seed whose exercise has a positive number answer', () => {
    const job = { week: '2026-W42', topicId: 'integers', difficulty: 3 as const, n: 0 };
    const seed = storyableSeed(job);
    expect(seed).not.toBeNull();
    expect(seed).toBe(storyableSeed(job));
    const answer = DEFAULT_REGISTRY.get('integers')?.generate(seed ?? 0, 3).answer;
    expect(answer).toMatchObject({ type: 'number' });
    expect(answer?.type === 'number' && answer.value.num > 0).toBe(true);
  });
});

async function practise(app: ReturnType<typeof makeApp>, token: string, topicId: string) {
  await call(app, 'POST', '/v1/math/attempts', {
    token,
    body: {
      attempts: [
        {
          id: uuidv7(),
          day: '2026-10-09',
          at: T0,
          topicId,
          difficulty: 2,
          correct: true,
          answerType: 'typed',
        },
      ],
    },
  });
}

const storyFetch =
  (story: string): FetchLike =>
  async (_url, init) =>
    geminiReply(
      (init.body ?? '').includes('"same"')
        ? JSON.stringify({ same: { yes: 0.95 } })
        : JSON.stringify({ story }),
    );

describe('runBankStep', () => {
  it('makes one problem for a recently practised topic and records exactly why it failed', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await practise(app, token, 'percents');
    const deps = makeDeps(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => T0, fetch: storyFetch('A shop sells many coats today. How much do they cost?') },
    );

    expect(await runBankStep(deps, await ownerContext(deps))).toBe('rejected');

    const row = await env.DB.prepare(
      'SELECT topic_id, week, status, reason FROM problem_bank',
    ).first();
    expect(row).toEqual({
      topic_id: 'percents',
      week: '2026-W41',
      status: 'rejected',
      reason: 'numbers_differ,units_differ',
    });
    const counted = await d1Repos(env.DB).bank.weekCounts('2026-W41');
    expect(counted.attemptedByTopic.get('percents')).toBe(1);
  });

  it('does nothing without recent practice', async () => {
    const deps = makeDeps(env, { now: () => T0 });
    await pairDevice(makeApp());
    expect(await runBankStep(deps, await ownerContext(deps))).toBeNull();
  });
});

describe('the bank step and the nightly window', () => {
  it('never runs between 21:00 and 03:59, even after tonight’s review is done', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 9, 22, 30) };
    const app = makeApp(clock);
    const { token } = await pairDevice(app);
    await practise(app, token, 'percents');
    await d1Repos(env.DB).upkeep.markNightly('2026-10-09', T0);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetch = storyFetch('A shop sells many coats today. How much do they cost?');

    const night = await runUpkeep(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, fetch },
    );
    clock.now = Date.UTC(2026, 9, 10, 15);
    const day = await runUpkeep(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, fetch },
    );

    expect([night.nightly, night.wordProblem]).toEqual([null, null]);
    expect(day.wordProblem).toBe('rejected');
  });
});
