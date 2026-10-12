import type { FetchLike } from '@mflow/ai';
import type { Plan } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  call,
  geminiReply,
  makeApp,
  pairDevice,
  sampleRoadmap,
  taskSpec,
  type App,
} from './helpers';

type Proposal = { plan: Plan; source: 'ai' | 'template' };
const withKey = { GEMINI_API_KEY: 'g-key' };

async function setup(fetch?: FetchLike) {
  const app = makeApp(undefined, fetch === undefined ? {} : { fetch });
  const { token } = await pairDevice(app);
  const roadmap = sampleRoadmap();
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: roadmap });
  return { app, token, roadmap };
}

const propose = (app: App, token: string, day: string, keyed = false) =>
  call<Proposal>(app, 'POST', `/v1/plans/${day}/propose`, {
    token,
    ...(keyed ? { env: withKey } : {}),
  });

describe('POST /v1/plans/:day/propose', () => {
  it('without AI keys, proposes the template: next open milestones round-robin, at least 3 tasks', async () => {
    const { app, token, roadmap } = await setup();

    const reply = await propose(app, token, '2026-10-09'); // Friday: both skills active

    expect(reply.body.data.source).toBe('template');
    expect(reply.body.data.plan.status).toBe('draft');
    expect(
      reply.body.data.plan.tasks.map((t) => [t.skillId, t.full.title, t.verifier, t.full.seconds]),
    ).toEqual([
      [roadmap.skills[0]?.id, 'Write a debugging checklist', 'github', 1800],
      [roadmap.skills[1]?.id, 'Finish L0 fractions', 'math', 1800],
      [roadmap.skills[0]?.id, 'Practice Debugging', 'github', 1800],
    ]);
    const stored = await call<Plan>(app, 'GET', '/v1/plans/2026-10-09', { token });
    expect(stored.body.data).toEqual(reply.body.data.plan);
  });

  it('leaves out skills resting that day', async () => {
    const { app, token, roadmap } = await setup();
    const reply = await propose(app, token, '2026-10-10'); // Saturday: math rests
    expect(reply.body.data.plan.tasks.map((t) => [t.skillId, t.full.title])).toEqual([
      [roadmap.skills[0]?.id, 'Write a debugging checklist'],
      [roadmap.skills[0]?.id, 'Practice Debugging'],
      [roadmap.skills[0]?.id, 'Practice Debugging (session 2)'],
    ]);
  });

  it('every proposal can be locked, even with one active skill', async () => {
    const { app, token } = await setup();
    await propose(app, token, '2026-10-10');
    const locked = await call<Plan>(app, 'POST', '/v1/plans/2026-10-10/lock', { token });
    expect([locked.status, locked.body.data.status]).toEqual([200, 'locked']);
  });

  it('tops a short AI proposal up from the template so it can lock', async () => {
    let skillId = '';
    const fetch: FetchLike = async () =>
      geminiReply(
        JSON.stringify({
          tasks: [
            {
              skillId,
              title: 'Write a debugging checklist',
              criteria: 'A commit adding CHECKLIST.md',
              minutes: 30,
              when: '20:00 at my desk',
              twoMinuteTitle: 'Open the file',
              twoMinuteCriteria: 'A commit creating it',
            },
          ],
        }),
      );
    const { app, token, roadmap } = await setup(fetch);
    skillId = roadmap.skills[0]?.id ?? '';

    const reply = await propose(app, token, '2026-10-10', true);

    expect(reply.body.data.source).toBe('ai');
    expect(reply.body.data.plan.tasks.map((t) => t.full.title)).toEqual([
      'Write a debugging checklist',
      'Practice Debugging',
      'Practice Debugging (session 2)',
    ]);
    expect(reply.body.data.plan.tasks[0]?.full.criteria).toBe('A commit adding CHECKLIST.md');
  });

  it('uses the AI proposal, keeping only tasks for active skills, and counts the call', async () => {
    const calls: unknown[] = [];
    let skillIds: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      calls.push(JSON.parse(init.body ?? 'null'));
      return geminiReply(
        JSON.stringify({
          tasks: [
            {
              skillId: skillIds[0],
              title: 'Reproduce the login bug with a failing test',
              criteria: 'A commit adding the failing test',
              minutes: 45,
              when: '20:00 after dinner, at my desk',
              twoMinuteTitle: 'Open the bug ticket',
              twoMinuteCriteria: 'A commit touching the test file',
            },
            {
              skillId: skillIds[1],
              title: 'Rest-day math',
              criteria: 'x',
              minutes: 30,
              when: 'never',
              twoMinuteTitle: 'x',
              twoMinuteCriteria: 'x',
            },
          ],
        }),
      );
    };
    const { app, token, roadmap } = await setup(fetch);
    skillIds = [roadmap.skills[0]?.id ?? '', roadmap.skills[1]?.id ?? ''];

    const reply = await propose(app, token, '2026-10-10', true);

    expect(reply.body.data.source).toBe('ai');
    expect(reply.body.data.plan.tasks).toHaveLength(3); // topped up from the template
    expect(reply.body.data.plan.tasks.slice(0, 1)).toEqual([
      {
        id: expect.any(String),
        skillId: skillIds[0],
        when: '20:00 after dinner, at my desk',
        verifier: 'github',
        full: {
          title: 'Reproduce the login bug with a failing test',
          criteria: 'A commit adding the failing test',
          seconds: 2700,
        },
        twoMinute: {
          title: 'Open the bug ticket',
          criteria: 'A commit touching the test file',
          seconds: 120,
        },
      },
    ]);
    const sent = JSON.stringify(calls[0]);
    expect(sent).toContain('"minItems":3'); // the model is asked for a lockable plan
    expect(sent).toContain('Senior software engineer');
    expect(sent).not.toContain('Finish L0 fractions'); // the resting skill's milestones are not sent
    const usage = await env.DB.prepare('SELECT count FROM ai_usage').first<{ count: number }>();
    expect(usage?.count).toBe(1);
  });

  it('falls back to the template when every AI reply is invalid', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls += 1;
      return geminiReply('Here is your plan: work hard!');
    };
    const { app, token } = await setup(fetch);

    const reply = await propose(app, token, '2026-10-09', true);

    expect(reply.body.data.source).toBe('template');
    expect(calls).toBe(4); // two models × (first try + one repair)
  });

  it('refuses a locked plan and an out-of-range day', async () => {
    const { app, token } = await setup();
    const tasks = [taskSpec(), taskSpec(), taskSpec()];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });

    const locked = await propose(app, token, '2026-10-09');
    const far = await propose(app, token, '2026-10-12');

    expect([locked.status, locked.body.error?.code]).toEqual([409, 'plan_locked']);
    expect(far.status).toBe(422);
  });

  it('refuses when no skill is active (no roadmap yet)', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const reply = await propose(app, token, '2026-10-09');
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'nothing_to_plan']);
  });
});
