import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import type { BankEntry } from '../src/ports';
import { call, makeApp, pairDevice, T0 } from './helpers';

const entry = (id: string, topicId = 'percents'): BankEntry => ({
  id,
  topicId,
  difficulty: 3,
  seed: 7,
  story: 'A $110 jacket is 40% off. How much do you pay?',
  prompt: 'A $110 item is 40% off. What is the sale price?',
  answer: { type: 'number', value: { num: 66, den: 1 } },
  hints: ['h'],
  steps: ['s'],
  week: '2026-W42',
  createdAt: T0,
});

describe('problem bank', () => {
  it('pages accepted problems only and counts the week', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const bank = d1Repos(env.DB).bank;
    await bank.add(entry('a'), 'accepted', null);
    await bank.add(entry('b', 'fractions'), 'rejected', 'numbers_differ');
    await bank.add(entry('c'), 'accepted', null);

    const page = await call<{ problems: BankEntry[]; next: number }>(app, 'GET', '/v1/math/bank', {
      token,
    });
    const counts = await bank.weekCounts('2026-W42');

    expect(page.body.data.problems.map((p) => p.id)).toEqual(['a', 'c']);
    expect(page.body.data.problems[0]).toEqual(entry('a'));
    expect([
      counts.kept,
      counts.attempted,
      counts.keptByTopic.get('percents'),
      counts.attemptedByTopic.get('fractions'),
    ]).toEqual([2, 3, 2, 1]);
    const rest = await call<{ problems: BankEntry[] }>(
      app,
      'GET',
      `/v1/math/bank?since=${page.body.data.next}`,
      { token },
    );
    expect(rest.body.data.problems).toEqual([]);
  });

  it('lists recently practised topics by how often they were practised', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const attempt = (topicId: string, day: string) => ({
      id: uuidv7(),
      day,
      at: T0,
      topicId,
      difficulty: 3,
      correct: true,
      answerType: 'typed',
    });
    await call(app, 'POST', '/v1/math/attempts', {
      token,
      body: {
        attempts: [
          attempt('fractions', '2026-10-09'),
          attempt('percents', '2026-10-09'),
          attempt('percents', '2026-10-08'),
          attempt('decimals', '2026-09-01'),
        ],
      },
    });
    expect(await d1Repos(env.DB).telemetry.recentTopics('2026-09-25')).toEqual([
      'percents',
      'fractions',
    ]);
  });
});
