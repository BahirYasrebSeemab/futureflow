import { describe, expect, it } from 'vitest';
import { GITHUB_API_VERSION, githubClient, MAX_PATCH_CHARS } from '../src/github/client';
import { githubFake } from './github-fake';

describe('githubClient', () => {
  it('sends the token, the API version and a user agent', async () => {
    const fake = githubFake();
    expect(await githubClient('tok', fake.fetch).user()).toEqual({
      ok: true,
      value: { login: 'bahir' },
    });
    expect(fake.headers[0]).toEqual({
      authorization: 'Bearer tok',
      accept: 'application/vnd.github+json',
      'x-github-api-version': GITHUB_API_VERSION,
      'user-agent': 'mflow',
    });
  });

  it('lists commits since a time by author, oldest first', async () => {
    const fake = githubFake({
      commits: [
        { sha: 'old', date: '2026-10-09T08:00:00Z' },
        { sha: 'new', date: '2026-10-09T09:00:00Z' },
        { sha: 'older', date: '2026-10-07T09:00:00Z' },
      ],
    });
    const result = await githubClient('tok', fake.fetch).commitsSince(
      'bahir/mflow',
      '2026-10-08T00:00:00Z',
      'bahir',
    );

    expect(result).toEqual({
      ok: true,
      value: [
        { sha: 'old', date: '2026-10-09T08:00:00Z' },
        { sha: 'new', date: '2026-10-09T09:00:00Z' },
      ],
    });
    expect(fake.urls[0]).toBe(
      'https://api.github.com/repos/bahir/mflow/commits?since=2026-10-08T00%3A00%3A00Z&author=bahir&per_page=100',
    );
  });

  it('reads a commit with its files, cutting long patches', async () => {
    const long = '+'.repeat(MAX_PATCH_CHARS + 50);
    const fake = githubFake({
      commits: [{ sha: 'a1', date: '2026-10-09T08:00:00Z', message: 'fix: bug', patch: long }],
    });

    const result = await githubClient('tok', fake.fetch).commit('bahir/mflow', 'a1');

    if (!result.ok) throw new Error(result.error);
    expect(result.value).toMatchObject({
      sha: 'a1',
      message: 'fix: bug',
      additions: 1,
      deletions: 1,
    });
    expect(result.value.files[0]?.patch).toHaveLength(MAX_PATCH_CHARS + '\n…[cut]'.length);
    expect(result.value.files[0]?.patch?.endsWith('\n…[cut]')).toBe(true);
  });

  it('keeps a binary file without a patch', async () => {
    const fake = githubFake({ commits: [{ sha: 'b1', date: '2026-10-09T08:00:00Z' }] });
    const result = await githubClient('tok', fake.fetch).commit('bahir/mflow', 'b1');
    expect(result.ok && result.value.files).toEqual([
      { filename: 'README', additions: 1, deletions: 1 },
    ]);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [502, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, error) => {
    const fake = githubFake({ status: () => status });
    expect(await githubClient('tok', fake.fetch).repo('bahir/mflow')).toEqual({ ok: false, error });
  });

  it('maps a network failure to unavailable and an odd body to invalid_output', async () => {
    const down = githubClient('tok', async () => {
      throw new Error('down');
    });
    const odd = githubClient('tok', async () => ({ status: 200, text: async () => '[1,2]' }));
    expect(await down.user()).toEqual({ ok: false, error: 'unavailable' });
    expect(await odd.user()).toEqual({ ok: false, error: 'invalid_output' });
  });
});
