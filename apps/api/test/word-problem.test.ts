import type { FetchLike } from '@mflow/ai';
import { DEFAULT_REGISTRY } from '@mflow/math-engine/generators';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import { makeDeps } from '../src/app';
import { makeWordProblem } from '../src/math/word-problem';
import { geminiReply, T0 } from './helpers';

const job = { week: '2026-W42', topicId: 'financial-literacy', difficulty: 3 as const, seed: 11 };
const exercise = DEFAULT_REGISTRY.get('financial-literacy')?.generate(11, 3);

/** Story calls get `story`; judge calls (probabilities schema) get `{ same: { yes } }`. */
function fake(story: string, yes: number) {
  const fetch: FetchLike = async (_url, init) => {
    const body = init.body ?? '';
    return geminiReply(
      body.includes('"same"') ? JSON.stringify({ same: { yes } }) : JSON.stringify({ story }),
    );
  };
  return makeDeps({ ...env, GEMINI_API_KEY: 'g-key' }, { now: () => T0, fetch });
}

const rows = async () =>
  (
    await env.DB.prepare(
      'SELECT status, reason, story, prompt, answer_json FROM problem_bank',
    ).all()
  ).results;

describe('makeWordProblem', () => {
  it('accepts a faithful story and keeps math-engine’s answer', async () => {
    const story = 'A coat costs $110 and the shop takes 40% off. What do you pay?';
    expect(exercise?.prompt).toBe('A $110 item is 40% off. What is the sale price?');

    expect(await makeWordProblem(fake(story, 0.97), job)).toBe('accepted');

    expect(await rows()).toEqual([
      {
        status: 'accepted',
        reason: null,
        story,
        prompt: exercise?.prompt,
        answer_json: JSON.stringify(exercise?.answer),
      },
    ]);
    expect((await d1Repos(env.DB).bank.page(0, 10)).problems[0]?.steps).toEqual(exercise?.steps);
  });

  it('rejects a story the judge does not trust, and stores why', async () => {
    const story = 'A coat costs $110 and you add 40% tax. What do you pay?';
    expect(await makeWordProblem(fake(story, 0.6), job)).toBe('rejected');
    expect((await rows())[0]).toMatchObject({ status: 'rejected', reason: 'judge_disagrees' });
  });

  it('rejects mechanical problems without asking the judge', async () => {
    let judged = false;
    const fetch: FetchLike = async (_url, init) => {
      if ((init.body ?? '').includes('"same"')) judged = true;
      return geminiReply(JSON.stringify({ story: 'A coat costs $110, two days only, 40% off.' }));
    };
    const deps = makeDeps({ ...env, GEMINI_API_KEY: 'g-key' }, { now: () => T0, fetch });

    expect(await makeWordProblem(deps, job)).toBe('rejected');
    expect((await rows())[0]).toMatchObject({ reason: 'number_words,no_question' });
    expect(judged).toBe(false);
  });

  it('stores nothing when the AI is unavailable', async () => {
    const deps = makeDeps({ ...env, GEMINI_API_KEY: undefined }, { now: () => T0 });
    expect(await makeWordProblem(deps, job)).toBe('unavailable');
    expect(await rows()).toEqual([]);
  });
});
