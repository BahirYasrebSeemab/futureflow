import type { FetchLike } from '@futureflow/ai';
import type { LedgerEvent, TaskSpec } from '@futureflow/core';
import { describe, expect, it } from 'vitest';
import { geminiJudgeReply, githubFake } from './github-fake';
import { call, makeApp, pairDevice, taskSpec, type App } from './helpers';

const TOKEN = 'github_pat_' + 'x'.repeat(40);
const KEYS = { GEMINI_API_KEY: 'g-key' };

async function setup(lock = true) {
  const other: FetchLike = async () => geminiJudgeReply({ done: { yes: 0.9 } });
  const fake = githubFake({ commits: [{ sha: 'a1', date: '2026-10-09T10:00:00Z' }], other });
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/github/link', {
    token,
    body: { token: TOKEN, repos: ['bahir/futureflow'] },
  });
  const tasks: TaskSpec[] = [
    taskSpec('Fix the bug'),
    taskSpec('10 problems', 'math'),
    taskSpec('Phone under 1h', 'usage'),
  ];
  await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
  if (lock) await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
  const decide = (task: TaskSpec | undefined, outcome: 'pass' | 'fail', day = '2026-10-09') =>
    call<{ outcome: string; by: string }>(app, 'POST', `/v1/verdicts/${task?.id}`, {
      token,
      body: { day, outcome },
    });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { app, token, tasks, decide, ledger };
}

describe('POST /v1/verdicts/:taskId', () => {
  it('lets the phone pass math and usage tasks, and pays the all-done bonus when everything passed', async () => {
    const { app, token, tasks, decide, ledger } = await setup();
    await call(app, 'POST', '/v1/verify', { token, env: KEYS }); // GitHub task: pending (suggestion pass)

    const math = await decide(tasks[1], 'pass');
    await decide(tasks[2], 'pass');
    const github = await decide(tasks[0], 'pass'); // the owner confirms the pending judge verdict

    expect([math.body.data.by, github.body.data.by]).toEqual(['code', 'owner']);
    const earned = (await ledger()).filter(
      (e) => e.kind === 'task_reward' || e.kind === 'all_done_bonus',
    );
    expect(earned.map((e) => e.kind).sort()).toEqual([
      'all_done_bonus',
      'task_reward',
      'task_reward',
      'task_reward',
    ]);
    const today = await call<{ verdicts: { outcome: string }[] }>(app, 'GET', '/v1/today', {
      token,
    });
    expect(today.body.data.verdicts.map((v) => v.outcome)).toEqual(['pass', 'pass', 'pass']);
  });

  it('refuses to self-pass a GitHub task the judge has not seen', async () => {
    const { tasks, decide } = await setup();
    const reply = await decide(tasks[0], 'pass');
    expect([reply.status, reply.body.error?.code]).toEqual([409, 'verdict_not_pending']);
  });

  it('a pass is final', async () => {
    const { tasks, decide } = await setup();
    await decide(tasks[1], 'pass');
    const again = await decide(tasks[1], 'fail');
    expect([again.status, again.body.error?.code]).toEqual([409, 'verdict_not_pending']);
  });

  it('refuses an unknown task and another day', async () => {
    const { tasks, decide } = await setup();
    const unknown = await decide(taskSpec(), 'pass');
    const otherDay = await decide(tasks[1], 'pass', '2026-10-10');
    expect([unknown.status, otherDay.status]).toEqual([404, 422]);
  });

  it('refuses before the plan is locked', async () => {
    const { tasks, decide } = await setup(false);
    const reply = await decide(tasks[1], 'pass');
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'plan_not_locked']);
  });
});
