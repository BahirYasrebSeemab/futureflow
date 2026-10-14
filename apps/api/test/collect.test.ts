import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import { makeDeps } from '../src/app';
import { collectGithub, MAX_COMMIT_FETCHES_PER_RUN } from '../src/verification/github';
import { githubFake, type FakeCommit } from './github-fake';
import { call, makeApp, pairDevice, T0 } from './helpers';

const TOKEN = 'github_pat_' + 'x'.repeat(40);

async function linkWith(fake: ReturnType<typeof githubFake>) {
  const app = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/github/link', {
    token,
    body: { token: TOKEN, repos: ['bahir/futureflow'] },
  });
  fake.urls.length = 0;
  return makeDeps(env, { now: () => T0, fetch: fake.fetch });
}

const shas = async () =>
  (
    await env.DB.prepare('SELECT sha, day FROM github_commits ORDER BY committed_at').all<{
      sha: string;
      day: string;
    }>()
  ).results;

describe('collectGithub', () => {
  it('stores new commits with the day of the device clock (03:30 in Dushanbe is the previous day)', async () => {
    const commits: FakeCommit[] = [
      { sha: 'a', date: '2026-10-09T05:00:00Z' },
      { sha: 'b', date: '2026-10-09T22:30:00Z' }, // 03:30 on the 10th, UTC+5 → still the 9th
      { sha: 'c', date: '2026-10-09T23:30:00Z' }, // 04:30 on the 10th, UTC+5 → the 10th
    ];
    const deps = await linkWith(githubFake({ commits }));

    expect(await collectGithub(deps, 300)).toBe('ok');
    expect(await shas()).toEqual([
      { sha: 'a', day: '2026-10-09' },
      { sha: 'b', day: '2026-10-09' },
      { sha: 'c', day: '2026-10-10' },
    ]);
  });

  it('never fetches a known commit again and moves the cursor', async () => {
    const fake = githubFake({ commits: [{ sha: 'a', date: '2026-10-09T05:00:00Z' }] });
    const deps = await linkWith(fake);
    await collectGithub(deps, 0);
    fake.urls.length = 0;

    await collectGithub(deps, 0);

    expect(fake.urls).toEqual([
      'https://api.github.com/repos/bahir/futureflow/commits?since=2026-10-09T05%3A00%3A00Z&author=bahir&per_page=100',
    ]);
  });

  it('fetches at most 20 commit details per run and gets the rest next run', async () => {
    const commits = Array.from({ length: 25 }, (_, i) => ({
      sha: `s${String(i).padStart(2, '0')}`,
      date: `2026-10-09T${String(i % 24).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`,
    }));
    const fake = githubFake({ commits });
    const deps = await linkWith(fake);

    await collectGithub(deps, 0);
    const first = (await shas()).length;
    await collectGithub(deps, 0);

    expect(first).toBe(MAX_COMMIT_FETCHES_PER_RUN);
    expect((await shas()).length).toBe(25);
  });

  it('marks the link invalid on 401 and then stops calling GitHub', async () => {
    let revoked = false;
    const fake = githubFake({
      status: (url) => (revoked && url.includes('/commits') ? 401 : undefined),
    });
    const deps = await linkWith(fake);
    revoked = true;

    expect(await collectGithub(deps, 0)).toBe('invalid_token');
    fake.urls.length = 0;
    expect(await collectGithub(deps, 0)).toBe('invalid_token');
    expect(fake.urls).toEqual([]);
    const row = await env.DB.prepare('SELECT status FROM github_link').first<{ status: string }>();
    expect(row?.status).toBe('invalid');
  });

  it('reports not_linked and key_missing without calling GitHub', async () => {
    const fake = githubFake();
    expect(await collectGithub(makeDeps(env, { now: () => T0, fetch: fake.fetch }), 0)).toBe(
      'not_linked',
    );
    const deps = await linkWith(fake);
    expect(
      await collectGithub(
        { ...deps, settings: { ...deps.settings, githubTokenKey: undefined } },
        0,
      ),
    ).toBe('key_missing');
    expect(fake.urls).toEqual([]);
  });

  it('keeps the cursor when GitHub fails mid-run', async () => {
    let broken = false;
    const fake = githubFake({
      commits: [{ sha: 'a', date: '2026-10-09T05:00:00Z' }],
      status: (url) => (broken && url.endsWith('/commits/a') ? 502 : undefined),
    });
    const deps = await linkWith(fake);
    broken = true;

    expect(await collectGithub(deps, 0)).toBe('ok');
    const cursor = await env.DB.prepare('SELECT since FROM github_cursor').first<{
      since: string;
    }>();
    expect(cursor?.since).toBe(new Date(T0 - 86_400_000).toISOString());
  });
});

describe('repositories the token cannot read', () => {
  it('reports them on the link until access returns', async () => {
    let blocked = true;
    const fake = githubFake({
      status: (url) => (blocked && url.includes('/commits') ? 403 : undefined),
    });
    const deps = await linkWith(fake);
    const link = async () => (await d1Repos(env.DB).verification.link())?.unreadableRepos;

    expect(await collectGithub(deps, 0)).toBe('repo_unavailable');
    expect(await link()).toEqual(['bahir/futureflow']);

    blocked = false;
    expect(await collectGithub(deps, 0)).toBe('ok');
    expect(await link()).toEqual([]);
  });
});
