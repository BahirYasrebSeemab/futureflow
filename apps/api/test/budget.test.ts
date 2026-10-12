import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runScheduled } from '../src/scheduled';
import { geminiJudgeReply, githubFake } from './github-fake';
import { call, countingDb, makeApp, pairDevice, T0, taskSpec } from './helpers';

/**
 * Free Workers: 50 D1 queries and 50 subrequests per invocation. This busy run measured 29 statements
 * (54 before batching); the guard sits a little above it to catch regressions and leave room for P3c-2.
 */
const D1_BUDGET = 32;
const FETCH_BUDGET = 40;

describe('free-plan budget of one busy hourly run', () => {
  it('stays within the D1 query and subrequest limits', async () => {
    const repos = ['bahir/a', 'bahir/b', 'bahir/c', 'bahir/d', 'bahir/e'];
    const commits = Array.from({ length: 25 }, (_, i) => ({
      sha: `c${String(i).padStart(2, '0')}`,
      repo: repos[i % repos.length],
      date: `2026-10-09T${String(5 + (i % 6)).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`,
    }));
    let aiCalls = 0;
    const other: FetchLike = async (_url, init) => {
      aiCalls += 1;
      return geminiJudgeReply(
        (init.body ?? '').includes('"done"')
          ? { done: { yes: 0.95 } }
          : { substance: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 1, '5': 0 } },
      );
    };
    const fake = githubFake({ repos, commits, other });
    const app = makeApp(undefined, { fetch: fake.fetch });
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/github/link', {
      token,
      body: { token: 'github_pat_' + 'x'.repeat(40), repos },
    });
    const tasks = [
      taskSpec('A'),
      taskSpec('B'),
      taskSpec('C'),
      taskSpec('Read', 'reading'),
      taskSpec('Math', 'math'),
    ];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
    await call(app, 'POST', '/v1/reading', {
      token,
      body: {
        id: '01920000-0000-7000-8000-0000000000aa',
        day: '2026-10-09',
        title: 'Book',
        source: 'book',
        summary: 'Ideas.',
      },
    });
    fake.urls.length = 0;
    const counted = countingDb(env.DB);

    await runScheduled(
      { ...env, DB: counted.db, GEMINI_API_KEY: 'g-key', JUDGE_AUTO_DECIDE: 'on' },
      { now: () => T0, fetch: fake.fetch },
    );

    expect(counted.count()).toBeLessThanOrEqual(D1_BUDGET);
    expect(fake.urls.length + aiCalls).toBeLessThanOrEqual(FETCH_BUDGET);
  });
});
