import type { FetchLike } from '@futureflow/ai';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runScheduled } from '../src/scheduled';
import { geminiJudgeReply, githubFake } from './github-fake';
import { call, makeApp, pairDevice, T0, taskSpec } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hourly cron', () => {
  it('runs verification and logs one line without personal data', async () => {
    const other: FetchLike = async () => geminiJudgeReply({ done: { yes: 0.9 } });
    const fake = githubFake({
      commits: [{ sha: 'a1', date: '2026-10-09T10:00:00Z', message: 'secret commit words' }],
      other,
    });
    const app = makeApp(undefined, { fetch: fake.fetch });
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/github/link', {
      token,
      body: { token: 'github_pat_' + 'x'.repeat(40), repos: ['bahir/futureflow'] },
    });
    const tasks = [
      taskSpec('Private task title'),
      taskSpec('Math', 'math'),
      taskSpec('Usage', 'usage'),
    ];
    await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
    await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const run = await runScheduled(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => T0, fetch: fake.fetch },
    );

    expect(run).toEqual({ day: '2026-10-09', github: 'ok', judged: 1 });
    expect(log.mock.calls.map((a) => JSON.parse(String(a[0])) as unknown)).toEqual([
      { level: 'info', event: 'verification_run', day: '2026-10-09', github: 'ok', judged: 1 },
    ]);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('secret commit words');
    expect(logged).not.toContain('Private task title');
  });
});
