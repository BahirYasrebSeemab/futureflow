import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import type { CommitEvidence, StoredVerdict } from '../src/ports';
import { makeApp, pairDevice, T0 } from './helpers';

const commit = (
  sha: string,
  day = '2026-10-09',
  committedAt = '2026-10-09T10:00:00Z',
): CommitEvidence => ({
  sha,
  repo: 'bahir/futureflow',
  day,
  committedAt,
  message: 'fix: login bug',
  additions: 3,
  deletions: 1,
  files: [{ filename: 'src/login.ts', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' }],
});

const verdict = (outcome: StoredVerdict['outcome']): StoredVerdict => ({
  day: '2026-10-09',
  taskId: 't1',
  outcome,
  confidence: 0.9,
  by: 'judge',
  evidenceIds: ['a'],
});

describe('verification repository', () => {
  it('stores the link and resets cursors; deleting removes both', async () => {
    const repo = d1Repos(env.DB).verification;
    await repo.saveLink(
      {
        login: 'bahir',
        tokenSealed: 'v1.x.y',
        repos: ['bahir/futureflow'],
        status: 'ok',
        unreadableRepos: [],
      },
      T0,
      '2026-10-08T12:00:00.000Z',
    );

    expect(await repo.link()).toEqual({
      login: 'bahir',
      tokenSealed: 'v1.x.y',
      repos: ['bahir/futureflow'],
      status: 'ok',
      unreadableRepos: [],
    });
    expect(await repo.cursor('bahir/futureflow')).toBe('2026-10-08T12:00:00.000Z');
    await repo.setLinkStatus('invalid', T0);
    expect((await repo.link())?.status).toBe('invalid');

    await repo.deleteLink();
    expect([await repo.link(), await repo.cursor('bahir/futureflow')]).toEqual([null, null]);
  });

  it('stores commits once, knows their SHAs, and lists a day newest first', async () => {
    const repo = d1Repos(env.DB).verification;
    await repo.addCommits(
      [
        commit('a', '2026-10-09', '2026-10-09T08:00:00Z'),
        commit('b', '2026-10-09', '2026-10-09T09:00:00Z'),
      ],
      T0,
    );
    await repo.addCommits([commit('a'), commit('c', '2026-10-10')], T0);

    expect([...(await repo.knownShas(['a', 'b', 'z']))].sort()).toEqual(['a', 'b']);
    expect((await repo.commitsForDay('2026-10-09')).map((c) => c.sha)).toEqual(['b', 'a']);
    expect((await repo.commitsForDay('2026-10-09'))[0]).toEqual(
      commit('b', '2026-10-09', '2026-10-09T09:00:00Z'),
    );
  });

  it('never overwrites a pass', async () => {
    const repo = d1Repos(env.DB).verification;
    await repo.saveVerdict(verdict('pending'), T0);
    await repo.saveVerdict({ ...verdict('pass'), by: 'owner' }, T0);
    await repo.saveVerdict({ ...verdict('fail'), confidence: 0.99 }, T0);

    expect(await repo.verdictsForDay('2026-10-09')).toEqual([{ ...verdict('pass'), by: 'owner' }]);
  });

  it('knows the newest device offset', async () => {
    const app = makeApp();
    expect(await d1Repos(env.DB).devices.latestOffset()).toBeNull();
    await pairDevice(app, { utcOffsetMinutes: 300 });
    expect(await d1Repos(env.DB).devices.latestOffset()).toBe(300);
  });
});
