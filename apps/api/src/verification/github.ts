import { dayKeyFor, DEFAULT_RULES } from '@futureflow/core';
import { importSecretKey, open } from '../crypto/secret-box';
import type { Deps } from '../env';
import { githubClient, type CommitSummary } from '../github/client';
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
  const now = new Date(deps.now()).toISOString();
  const cursors = await store.cursors(link.repos);

  // 1. List each repository (one subrequest each); a 401 ends the run, 403/404 marks the repo.
  const unreadable: string[] = [];
  const listings: { repo: string; since: string; commits: CommitSummary[] }[] = [];
  for (const repo of link.repos) {
    const since = cursors.get(repo) ?? now;
    const listed = await client.commitsSince(repo, since, link.login);
    if (listed.ok) listings.push({ repo, since, commits: listed.value });
    else if (listed.error === 'unauthorized') return markInvalid(deps);
    else if (LOST_ACCESS.has(listed.error)) unreadable.push(repo);
  }

  // 2. Fetch details for new commits within the budget, oldest first per repository.
  const known = await store.knownShas(listings.flatMap((l) => l.commits.map((c) => c.sha)));
  const collected: CommitEvidence[] = [];
  const moved: { repo: string; since: string }[] = [];
  let budget = MAX_COMMIT_FETCHES_PER_RUN;
  let tokenDied = false;
  for (const { repo, since, commits } of listings) {
    let cursor = since;
    for (const summary of commits) {
      if (!known.has(summary.sha)) {
        if (budget === 0) break;
        budget -= 1;
        const detail = await client.commit(repo, summary.sha);
        if (!detail.ok) {
          tokenDied = detail.error === 'unauthorized';
          break;
        }
        const { date, ...commit } = detail.value;
        collected.push({
          ...commit,
          repo,
          committedAt: date,
          day: dayKeyFor(Date.parse(date), utcOffsetMinutes, DEFAULT_RULES.dayBoundaryHour),
        });
      }
      cursor = summary.date;
    }
    if (cursor !== since) moved.push({ repo, since: cursor });
    if (tokenDied) break;
  }

  // 3. One write for all evidence and cursors; then the link's health.
  await store.saveCollected(collected, moved, deps.now());
  if (tokenDied) return markInvalid(deps);
  if (JSON.stringify(unreadable) !== JSON.stringify(link.unreadableRepos)) {
    await store.setUnreadable(unreadable, deps.now());
  }
  return unreadable.length === 0 ? 'ok' : 'repo_unavailable';
}

async function markInvalid(deps: Deps): Promise<CollectStatus> {
  await deps.repos.verification.setLinkStatus('invalid', deps.now());
  return 'invalid_token';
}
