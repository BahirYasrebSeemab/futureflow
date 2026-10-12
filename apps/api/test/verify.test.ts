import type { FetchLike } from '@mflow/ai';
import type { LedgerEvent, TaskSpec } from '@mflow/core';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { geminiJudgeReply, githubFake, type FakeCommit } from './github-fake';
import { call, makeApp, pairDevice, taskSpec, type App } from './helpers';

const TOKEN = 'github_pat_' + 'x'.repeat(40);
type Verdict = {
  taskId: string;
  outcome: string;
  confidence: number;
  by: string;
  suggestion?: string;
  evidenceIds: string[];
};
type Run = { day: string; github: string; judged: number; verdicts: Verdict[] };

/** Gemini answers both judge question sets; counts calls. */
function judgeFake(done: number, substance: Record<string, number>) {
  let calls = 0;
  const other: FetchLike = async (_url, init) => {
    calls += 1;
    const body = init.body ?? '';
    return geminiJudgeReply(body.includes('"done"') ? { done: { yes: done } } : { substance });
  };
  return { other, calls: () => calls };
}

async function setup(
  opts: {
    commits?: FakeCommit[];
    judge?: ReturnType<typeof judgeFake>;
    autoDecide?: boolean;
    lock?: boolean;
  } = {},
) {
  const judge =
    opts.judge ?? judgeFake(0.92, { '0': 0, '1': 0, '2': 0.1, '3': 0.3, '4': 0.4, '5': 0.2 });
  const fake = githubFake({
    commits: opts.commits ?? [{ sha: 'a1', date: '2026-10-09T10:00:00Z', message: 'fix: login' }],
    other: judge.other,
  });
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  const keys = { GEMINI_API_KEY: 'g-key', ...(opts.autoDecide ? { JUDGE_AUTO_DECIDE: 'on' } : {}) };
  await call(app, 'PUT', '/v1/github/link', {
    token,
    body: { token: TOKEN, repos: ['bahir/mflow'] },
  });
  const tasks: TaskSpec[] = [
    taskSpec('Fix the login bug'),
    taskSpec('Read 10 pages', 'reading'),
    taskSpec('10 problems', 'math'),
  ];
  await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
  if (opts.lock !== false) await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
  const verify = () => call<Run>(app, 'POST', '/v1/verify', { token, env: keys });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { app, token, tasks, verify, ledger, judge, fake, keys };
}

describe('POST /v1/verify', () => {
  it('without automatic decisions, stores a pending verdict with the judge suggestion and pays nothing', async () => {
    const { tasks, verify, ledger } = await setup();

    const run = (await verify()).body.data;

    expect(run).toMatchObject({ day: '2026-10-09', github: 'ok', judged: 1 });
    expect(run.verdicts).toEqual([
      {
        day: '2026-10-09',
        taskId: tasks[0]?.id,
        outcome: 'pending',
        confidence: 0.92,
        by: 'judge',
        suggestion: 'pass',
        evidenceIds: ['a1'],
      },
    ]);
    expect((await ledger()).filter((e) => e.kind === 'task_reward')).toEqual([]);
  });

  it('with automatic decisions, a confident pass pays the task reward once', async () => {
    const { tasks, verify, ledger, judge } = await setup({ autoDecide: true });

    await verify();
    const callsAfterFirst = judge.calls();
    await verify();

    const rewards = (await ledger()).filter((e) => e.kind === 'task_reward');
    expect(rewards.map((e) => [e.refId, e.seconds])).toEqual([[tasks[0]?.id, 1200]]);
    expect(judge.calls()).toBe(callsAfterFirst); // unchanged evidence: no new judge call
  });

  it('keeps a low-confidence judgment pending even with automatic decisions', async () => {
    const { verify } = await setup({
      autoDecide: true,
      judge: judgeFake(0.6, { '0': 1, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }),
    });
    const run = (await verify()).body.data;
    expect(run.verdicts[0]).toMatchObject({
      outcome: 'pending',
      suggestion: 'pass',
      confidence: 0.6,
    });
  });

  it('judges a reading log by the probability its score is 3 or more', async () => {
    const { app, token, tasks, verify, keys } = await setup({ autoDecide: true, commits: [] });
    await call(app, 'POST', '/v1/reading', {
      token,
      body: {
        id: uuidv7(),
        day: '2026-10-09',
        title: 'Atomic Habits',
        source: 'book',
        pages: 12,
        summary: 'Systems beat goals; habits compound.',
      },
      env: keys,
    });

    const run = (await verify()).body.data;

    expect(run.verdicts).toEqual([
      expect.objectContaining({
        taskId: tasks[1]?.id,
        outcome: 'pass',
        by: 'judge',
        confidence: expect.closeTo(0.9, 5),
      }),
    ]);
  });

  it('with the AI down, evidence leaves a pending verdict the owner can decide; the judge retries later', async () => {
    const { app, token, tasks, verify, ledger } = await setup();
    const noAi = (await call<Run>(app, 'POST', '/v1/verify', { token })).body.data;

    expect(noAi.verdicts).toEqual([
      {
        day: '2026-10-09',
        taskId: tasks[0]?.id,
        outcome: 'pending',
        confidence: 0,
        by: 'judge',
        evidenceIds: [],
      },
    ]);
    const withAi = (await verify()).body.data;
    expect(withAi.verdicts[0]).toMatchObject({
      outcome: 'pending',
      suggestion: 'pass',
      evidenceIds: ['a1'],
    });

    const decided = await call(app, 'POST', `/v1/verdicts/${tasks[0]?.id}`, {
      token,
      body: { day: '2026-10-09', outcome: 'pass' },
    });
    expect(decided.status).toBe(200);
    expect((await ledger()).some((e) => e.kind === 'task_reward' && e.refId === tasks[0]?.id)).toBe(
      true,
    );
  });

  it('with the GitHub token dead, GitHub tasks become pending so the owner can still decide', async () => {
    const fake = githubFake({ status: (url) => (url.includes('/commits') ? 401 : undefined) });
    const app: App = makeApp(undefined, { fetch: fake.fetch });
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/github/link', {
      token,
      body: { token: TOKEN, repos: ['bahir/mflow'] },
    });
    const tasks = [taskSpec('Fix the bug'), taskSpec('Read', 'reading'), taskSpec('Math', 'math')];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });

    const run = (await call<Run>(app, 'POST', '/v1/verify', { token })).body.data;

    expect(run.github).toBe('invalid_token');
    expect(run.verdicts).toEqual([
      {
        day: '2026-10-09',
        taskId: tasks[0]?.id,
        outcome: 'pending',
        confidence: 0,
        by: 'judge',
        evidenceIds: [],
      },
    ]);
  });

  it('does nothing before the plan is locked', async () => {
    const { verify, judge } = await setup({ lock: false });
    const run = (await verify()).body.data;
    expect([run.judged, run.verdicts, judge.calls()]).toEqual([0, [], 0]);
  });

  it('never re-judges or downgrades a pass when new evidence arrives', async () => {
    const commits: FakeCommit[] = [{ sha: 'a1', date: '2026-10-09T10:00:00Z' }];
    const { verify, judge } = await setup({ autoDecide: true, commits });
    await verify();
    const calls = judge.calls();
    commits.push({ sha: 'b2', date: '2026-10-09T11:00:00Z' });

    const run = (await verify()).body.data;

    expect(run.verdicts[0]).toMatchObject({ outcome: 'pass', evidenceIds: ['a1'] });
    expect(judge.calls()).toBe(calls);
  });
});
