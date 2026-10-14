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
function fake(story: string, yes: number, opts: { autoDecide?: boolean; bodies?: string[] } = {}) {
  const fetch: FetchLike = async (_url, init) => {
    const body = init.body ?? '';
    opts.bodies?.push(body);
    return geminiReply(
      body.includes('"same"') ? JSON.stringify({ same: { yes } }) : JSON.stringify({ story }),
    );
  };
  const decide = (opts.autoDecide ?? true) ? { JUDGE_AUTO_DECIDE: 'on' } : {};
  return makeDeps({ ...env, GEMINI_API_KEY: 'g-key', ...decide }, { now: () => T0, fetch });
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
    const deps = makeDeps(
      { ...env, GEMINI_API_KEY: 'g-key', JUDGE_AUTO_DECIDE: 'on' },
      { now: () => T0, fetch },
    );

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

describe('review fixes', () => {
  const trig = {
    week: '2026-W42',
    topicId: 'right-triangle-trigonometry',
    difficulty: 3 as const,
    seed: 1,
  };
  const trigStory = 'A ramp meets a 90° wall at 54°, and its base runs 3 cm. How tall is the ramp?';

  it("appends the exercise's own rounding instruction and shows the judge the expected answer", async () => {
    const bodies: string[] = [];
    expect(await makeWordProblem(fake(trigStory, 0.95, { bodies }), trig)).toBe('accepted');

    const stored = (await rows())[0] as { story: string };
    expect(stored.story).toBe(`${trigStory} Give your answer to one decimal place.`);
    const judgeCall = bodies.find((b) => b.includes('"same"')) ?? '';
    expect(judgeCall).toContain('expectedAnswer');
    expect(judgeCall).toContain('4.1');
    expect(bodies[0]).not.toContain('decimal place'); // the AI never sees (or rewrites) the instruction
  });

  it('keeps a passing story pending, unsynced, until judge decisions are enabled', async () => {
    expect(await makeWordProblem(fake(trigStory, 0.95, { autoDecide: false }), trig)).toBe(
      'pending',
    );
    expect((await rows())[0]).toMatchObject({ status: 'pending' });
    expect((await d1Repos(env.DB).bank.page(0, 10)).problems).toEqual([]);
  });

  it('rejects a story that switches cm to m, without asking the judge', async () => {
    const bodies: string[] = [];
    const area = {
      week: '2026-W42',
      topicId: 'measurement-and-geometry',
      difficulty: 1 as const,
      seed: 1,
    };
    const story = 'A rug is 8 m long and 2 m wide. How much floor does it cover?';

    expect(await makeWordProblem(fake(story, 0.99, { bodies }), area)).toBe('rejected');

    expect((await rows())[0]).toMatchObject({ reason: 'units_differ' });
    expect(bodies.some((b) => b.includes('"same"'))).toBe(false);
  });

  it('skips an exercise with a negative answer before any AI call', async () => {
    const bodies: string[] = [];
    const negative = { week: '2026-W42', topicId: 'integers', difficulty: 3 as const, seed: 5 };
    expect(DEFAULT_REGISTRY.get('integers')?.generate(5, 3).answer).toMatchObject({
      value: { num: -88 },
    });

    expect(
      await makeWordProblem(
        fake('unused story text that is long enough?', 0.99, { bodies }),
        negative,
      ),
    ).toBe('skipped');

    expect([bodies, await rows()]).toEqual([[], []]);
  });
});
