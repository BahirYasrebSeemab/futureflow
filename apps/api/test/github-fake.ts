import type { FetchLike } from '@mflow/ai';

export type FakeCommit = Readonly<{
  sha: string;
  date: string;
  message?: string;
  patch?: string;
  repo?: string;
}>;

const json = (status: number, body: unknown) => ({
  status,
  text: async () => JSON.stringify(body),
});

/** A GitHub REST double built on the shapes recorded from api.github.com (octocat/Hello-World). */
export function githubFake(
  opts: Readonly<{
    login?: string;
    repos?: readonly string[];
    commits?: readonly FakeCommit[];
    status?: (url: string) => number | undefined;
    other?: FetchLike;
  }> = {},
) {
  const login = opts.login ?? 'bahir';
  const repos = opts.repos ?? ['bahir/mflow'];
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const fetch: FetchLike = async (url, init) => {
    if (!url.startsWith('https://api.github.com/')) {
      if (opts.other === undefined) throw new Error(`unexpected ${url}`);
      return opts.other(url, init);
    }
    urls.push(url);
    headers.push({ ...init.headers });
    const forced = opts.status?.(url);
    if (forced !== undefined) return json(forced, { message: 'forced' });
    const path = new URL(url).pathname;
    if (path === '/user') return json(200, { login, id: 1 });
    for (const repo of repos) {
      const commits = (opts.commits ?? []).filter((c) => (c.repo ?? repos[0]) === repo);
      if (path === `/repos/${repo}`) return json(200, { full_name: repo });
      if (path === `/repos/${repo}/commits`) {
        const since = new URL(url).searchParams.get('since') ?? '';
        const listed = commits
          .filter((c) => c.date >= since)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((c) => ({
            sha: c.sha,
            commit: { message: c.message ?? 'work', author: { name: login, date: c.date } },
          }));
        return json(200, listed);
      }
      const detail = commits.find((c) => path === `/repos/${repo}/commits/${c.sha}`);
      if (detail !== undefined) {
        return json(200, {
          sha: detail.sha,
          commit: { message: detail.message ?? 'work', author: { name: login, date: detail.date } },
          stats: { total: 2, additions: 1, deletions: 1 },
          files: [
            {
              sha: 'f',
              filename: 'README',
              status: 'modified',
              additions: 1,
              deletions: 1,
              changes: 2,
              ...(detail.patch === undefined ? {} : { patch: detail.patch }),
            },
          ],
        });
      }
    }
    return json(404, { message: 'Not Found' });
  };
  return { fetch, urls, headers };
}

/** A Gemini reply carrying a judge answer, for the generateContent endpoint. */
export const geminiJudgeReply = (answer: unknown) => ({
  status: 200,
  text: async () =>
    JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] },
          finishReason: 'STOP',
        },
      ],
    }),
});
