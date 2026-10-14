import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { nextJob, runBankStep } from '../src/math/bank-step';
import { ownerContext } from '../src/upkeep/owner';
import { call, geminiReply, makeApp, pairDevice, T0 } from './helpers';

describe('nextJob', () => {
  const counts = (byTopic: Record<string, number>, accepted = 0, attempted = 0) => ({
    accepted,
    attempted,
    byTopic: new Map(Object.entries(byTopic)),
  });

  it('fills the most practised word topic first, three per topic', () => {
    expect(nextJob('2026-W42', ['factoring', 'percents', 'fractions'], counts({}))).toMatchObject({
      topicId: 'percents',
      difficulty: 2,
    });
    expect(
      nextJob('2026-W42', ['percents', 'fractions'], counts({ percents: 3 }, 3, 3)),
    ).toMatchObject({
      topicId: 'fractions',
    });
  });

  it('stops at the weekly totals', () => {
    expect(nextJob('2026-W42', ['percents'], counts({}, 12, 12))).toBeNull();
    expect(nextJob('2026-W42', ['percents'], counts({}, 0, 24))).toBeNull();
    expect(nextJob('2026-W42', ['factoring'], counts({}))).toBeNull();
  });
});

describe('runBankStep', () => {
  it('makes one problem for a recently practised topic', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await call(app, 'POST', '/v1/math/attempts', {
      token,
      body: {
        attempts: [
          {
            id: uuidv7(),
            day: '2026-10-09',
            at: T0,
            topicId: 'percents',
            difficulty: 2,
            correct: true,
            answerType: 'typed',
          },
        ],
      },
    });
    const fetch: FetchLike = async (_url, init) =>
      geminiReply(
        (init.body ?? '').includes('"same"')
          ? JSON.stringify({ same: { yes: 0.95 } })
          : JSON.stringify({ story: 'A shop sells many coats today. How much do they cost?' }),
      );
    const deps = makeDeps({ ...env, GEMINI_API_KEY: 'g-key' }, { now: () => T0, fetch });

    const result = await runBankStep(deps, await ownerContext(deps));

    expect(['accepted', 'rejected']).toContain(result);
    const row = await env.DB.prepare('SELECT topic_id, week FROM problem_bank').first();
    expect(row).toEqual({ topic_id: 'percents', week: '2026-W41' });
  });

  it('does nothing without recent practice', async () => {
    const deps = makeDeps(env, { now: () => T0 });
    await pairDevice(makeApp());
    expect(await runBankStep(deps, await ownerContext(deps))).toBeNull();
  });
});
