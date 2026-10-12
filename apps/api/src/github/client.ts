import type { FetchLike } from '@mflow/ai';
import { err, ok, type Result } from '@mflow/core';
import { z } from 'zod';
import type { CommitFile } from '../ports';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_API_VERSION = '2026-03-10';
/** Long diffs are cut: the judge needs the gist, and Jev's context is 32k tokens. */
export const MAX_PATCH_CHARS = 1500;
export const MAX_FILES_PER_COMMIT = 15;
const CUT = '\n…[cut]';

export type GithubError =
  'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'unavailable' | 'invalid_output';

export type CommitSummary = Readonly<{ sha: string; date: string }>;
export type CommitDetail = Readonly<{
  sha: string;
  message: string;
  date: string;
  additions: number;
  deletions: number;
  files: readonly CommitFile[];
}>;

export interface GithubClient {
  user(): Promise<Result<{ login: string }, GithubError>>;
  repo(name: string): Promise<Result<true, GithubError>>;
  /** Commits by `author` at or after `since` (ISO 8601), oldest first (one page of 100). */
  commitsSince(
    repo: string,
    since: string,
    author: string,
  ): Promise<Result<CommitSummary[], GithubError>>;
  commit(repo: string, sha: string): Promise<Result<CommitDetail, GithubError>>;
}

const UserSchema = z.object({ login: z.string() });
const CommitHead = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string(), author: z.object({ date: z.string() }).nullable() }),
});
const ListSchema = z.array(CommitHead);
const DetailSchema = CommitHead.extend({
  stats: z.object({ additions: z.number(), deletions: z.number() }).optional(),
  files: z
    .array(
      z.object({
        filename: z.string(),
        additions: z.number(),
        deletions: z.number(),
        patch: z.string().optional(),
      }),
    )
    .optional(),
});

const STATUS_ERRORS: Readonly<Record<number, GithubError>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
};

const cut = (patch: string): string =>
  patch.length <= MAX_PATCH_CHARS ? patch : `${patch.slice(0, MAX_PATCH_CHARS)}${CUT}`;

export function githubClient(token: string, fetch: FetchLike): GithubClient {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<Result<T, GithubError>> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetch(`${GITHUB_API}${path}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': GITHUB_API_VERSION,
          'user-agent': 'mflow',
        },
      });
    } catch {
      return err('unavailable');
    }
    if (res.status < 200 || res.status >= 300)
      return err(STATUS_ERRORS[res.status] ?? 'unavailable');
    try {
      const parsed = schema.safeParse(JSON.parse(await res.text()));
      return parsed.success ? ok(parsed.data) : err('invalid_output');
    } catch {
      return err('invalid_output');
    }
  }

  return {
    async user() {
      const res = await get('/user', UserSchema);
      return res.ok ? ok({ login: res.value.login }) : res;
    },
    async repo(name) {
      const res = await get(`/repos/${name}`, z.object({}));
      return res.ok ? ok(true as const) : res;
    },
    async commitsSince(repo, since, author) {
      const query = new URLSearchParams({ since, author, per_page: '100' });
      const res = await get(`/repos/${repo}/commits?${query.toString()}`, ListSchema);
      if (!res.ok) return res;
      return ok(
        res.value
          .map((c) => ({ sha: c.sha, date: c.commit.author?.date ?? '' }))
          .filter((c) => c.date !== '')
          .reverse(),
      );
    },
    async commit(repo, sha) {
      const res = await get(`/repos/${repo}/commits/${sha}`, DetailSchema);
      if (!res.ok) return res;
      const c = res.value;
      return ok({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author?.date ?? '',
        additions: c.stats?.additions ?? 0,
        deletions: c.stats?.deletions ?? 0,
        files: (c.files ?? []).slice(0, MAX_FILES_PER_COMMIT).map((f) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          ...(f.patch === undefined ? {} : { patch: cut(f.patch) }),
        })),
      });
    },
  };
}
