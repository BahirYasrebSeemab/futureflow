import { dayKeyFor, DEFAULT_RULES } from '@mflow/core';
import { importSecretKey, open } from '../crypto/secret-box';
import type { Deps } from '../env';
import { githubClient } from '../github/client';
import type { CommitEvidence } from '../ports';

/** Free Workers allow 50 outgoing requests per invocation; commit details are the expensive part. */
export const MAX_COMMIT_FETCHES_PER_RUN = 20;

export type CollectStatus =
  'ok' | 'repo_unavailable' | 'not_linked' | 'invalid_token' | 'key_missing';

/** Fine-grained tokens answer 403/404 (not 401) for a repository they lost access to. */
const LOST_ACCESS = new Set(['forbidden', 'not_found']);

/** Fetches the owner's new commits on the linked repositories and stores them as evidence. */
export async function collectGithub(deps: Deps, utcOffsetMinutes: number): Promise<CollectStatus> {
  const store = deps.repos.verification;
  const link = await store.link();
  if (link === null) return 'not_linked';
  if (link.status === 'invalid') return 'invalid_token';
  const key = await importSecretKey(deps.settings.githubTokenKey);
  const token = key === null ? null : await open(key, link.tokenSealed);
  if (token === null) return 'key_missing';

  const client = githubClient(token, deps.fetch);
  let budget = MAX_COMMIT_FETCHES_PER_RUN;
  const unreadable: string[] = [];
  for (const repo of link.repos) {
    if (budget === 0) break;
    const since = (await store.cursor(repo)) ?? new Date(deps.now()).toISOString();
    const listed = await client.commitsSince(repo, since, link.login);
    if (!listed.ok) {
      if (listed.error === 'unauthorized') {
        await store.setLinkStatus('invalid', deps.now());
        return 'invalid_token';
      }
      if (LOST_ACCESS.has(listed.error)) unreadable.push(repo);
      continue;
    }
    const known = await store.knownShas(listed.value.map((c) => c.sha));
    const collected: CommitEvidence[] = [];
    let cursor = since;
    for (const summary of listed.value) {
      if (known.has(summary.sha)) {
        cursor = summary.date;
        continue;
      }
      if (budget === 0) break;
      budget -= 1;
      const detail = await client.commit(repo, summary.sha);
      if (!detail.ok) {
        if (detail.error === 'unauthorized') {
          await store.setLinkStatus('invalid', deps.now());
          return 'invalid_token';
        }
        break;
      }
      const { date, ...commit } = detail.value;
      collected.push({
        ...commit,
        repo,
        committedAt: date,
        day: dayKeyFor(
          Date.parse(detail.value.date),
          utcOffsetMinutes,
          DEFAULT_RULES.dayBoundaryHour,
        ),
      });
      cursor = summary.date;
    }
    await store.addCommits(collected, deps.now());
    if (cursor !== since) await store.setCursor(repo, cursor);
  }
  if (JSON.stringify(unreadable) !== JSON.stringify(link.unreadableRepos)) {
    await store.setUnreadable(unreadable, deps.now());
  }
  return unreadable.length === 0 ? 'ok' : 'repo_unavailable';
}
