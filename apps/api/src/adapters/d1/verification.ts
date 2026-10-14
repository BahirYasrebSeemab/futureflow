import { ReadingLogSchema } from '@futureflow/contracts';
import type { ReadingLog } from '@futureflow/contracts';
import { z } from 'zod';
import type { CommitEvidence, GithubLink, StoredVerdict, VerificationRepo } from '../../ports';

type LinkRow = {
  login: string;
  token_sealed: string;
  repos_json: string;
  status: GithubLink['status'];
  unreadable_json: string;
};
type CommitRow = { payload_json: string };
type ReadingRow = {
  id: string;
  day: string;
  title: string;
  source: ReadingLog['source'];
  pages: number | null;
  minutes: number | null;
  summary: string;
};
type VerdictRow = {
  day: string;
  task_id: string;
  outcome: StoredVerdict['outcome'];
  confidence: number;
  by: StoredVerdict['by'];
  suggestion: 'pass' | 'fail' | null;
  evidence_ids_json: string;
};

const StringsSchema = z.array(z.string());
const CommitSchema = z.object({
  sha: z.string(),
  repo: z.string(),
  day: z.string(),
  committedAt: z.string(),
  message: z.string(),
  additions: z.number(),
  deletions: z.number(),
  files: z.array(
    z.object({
      filename: z.string(),
      additions: z.number(),
      deletions: z.number(),
      patch: z.string().optional(),
    }),
  ),
});

export const d1Verification = (db: D1Database): VerificationRepo => ({
  async link() {
    const row = await db
      .prepare(
        `SELECT login, token_sealed, repos_json, status, unreadable_json FROM github_link WHERE id = 1`,
      )
      .first<LinkRow>();
    return row === null
      ? null
      : {
          login: row.login,
          tokenSealed: row.token_sealed,
          repos: StringsSchema.parse(JSON.parse(row.repos_json)),
          status: row.status,
          unreadableRepos: StringsSchema.parse(JSON.parse(row.unreadable_json)),
        };
  },

  async saveLink(link, at, since) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO github_link (id, login, token_sealed, repos_json, status, linked_at, checked_at)
           VALUES (1, ?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT (id) DO UPDATE SET login = excluded.login, token_sealed = excluded.token_sealed,
             repos_json = excluded.repos_json, status = excluded.status, unreadable_json = '[]',
             linked_at = excluded.linked_at, checked_at = excluded.checked_at`,
        )
        .bind(link.login, link.tokenSealed, JSON.stringify(link.repos), link.status, at),
      db.prepare('DELETE FROM github_cursor'),
      db
        .prepare(`INSERT INTO github_cursor (repo, since) SELECT value, ?2 FROM json_each(?1)`)
        .bind(JSON.stringify(link.repos), since),
    ]);
  },

  async setUnreadable(repos, at) {
    await db
      .prepare('UPDATE github_link SET unreadable_json = ?1, checked_at = ?2 WHERE id = 1')
      .bind(JSON.stringify(repos), at)
      .run();
  },

  async setLinkStatus(status, at) {
    await db
      .prepare('UPDATE github_link SET status = ?1, checked_at = ?2 WHERE id = 1')
      .bind(status, at)
      .run();
  },

  async deleteLink() {
    await db.batch([
      db.prepare('DELETE FROM github_link'),
      db.prepare('DELETE FROM github_cursor'),
    ]);
  },

  async cursor(repo) {
    const row = await db
      .prepare('SELECT since FROM github_cursor WHERE repo = ?1')
      .bind(repo)
      .first<{ since: string }>();
    return row?.since ?? null;
  },

  async setCursor(repo, since) {
    await db
      .prepare(
        `INSERT INTO github_cursor (repo, since) VALUES (?1, ?2)
         ON CONFLICT (repo) DO UPDATE SET since = excluded.since`,
      )
      .bind(repo, since)
      .run();
  },

  async cursors(repos) {
    const { results } = await db
      .prepare(
        'SELECT repo, since FROM github_cursor WHERE repo IN (SELECT value FROM json_each(?1))',
      )
      .bind(JSON.stringify(repos))
      .all<{ repo: string; since: string }>();
    return new Map(results.map((r) => [r.repo, r.since]));
  },

  async saveCollected(commits, cursors, at) {
    const rows = commits.map((c) => ({ ...c, payload: JSON.stringify(c) }));
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO github_commits (sha, repo, day, committed_at, payload_json, captured_at)
           SELECT value->>'sha', value->>'repo', value->>'day', value->>'committedAt', value->>'payload', ?2
           FROM json_each(?1)`,
        )
        .bind(JSON.stringify(rows), at),
      db
        .prepare(
          `INSERT INTO github_cursor (repo, since) SELECT value->>'repo', value->>'since' FROM json_each(?1) WHERE true
           ON CONFLICT (repo) DO UPDATE SET since = excluded.since`,
        )
        .bind(JSON.stringify(cursors)),
    ]);
  },

  async knownShas(shas) {
    if (shas.length === 0) return new Set();
    const { results } = await db
      .prepare('SELECT sha FROM github_commits WHERE sha IN (SELECT value FROM json_each(?1))')
      .bind(JSON.stringify(shas))
      .all<{ sha: string }>();
    return new Set(results.map((r) => r.sha));
  },

  async addCommits(commits, at) {
    if (commits.length === 0) return;
    const rows = commits.map((c) => ({ ...c, payload: JSON.stringify(c) }));
    await db
      .prepare(
        `INSERT OR IGNORE INTO github_commits (sha, repo, day, committed_at, payload_json, captured_at)
         SELECT value->>'sha', value->>'repo', value->>'day', value->>'committedAt', value->>'payload', ?2
         FROM json_each(?1)`,
      )
      .bind(JSON.stringify(rows), at)
      .run();
  },

  async commitsForDay(day) {
    const { results } = await db
      .prepare(
        'SELECT payload_json FROM github_commits WHERE day = ?1 ORDER BY committed_at DESC, sha',
      )
      .bind(day)
      .all<CommitRow>();
    return results.map((r): CommitEvidence => CommitSchema.parse(JSON.parse(r.payload_json)));
  },

  async readingForDay(day) {
    const { results } = await db
      .prepare(
        `SELECT id, day, title, source, pages, minutes, summary FROM reading_logs
         WHERE day = ?1 ORDER BY created_at`,
      )
      .bind(day)
      .all<ReadingRow>();
    return results.map((r) =>
      ReadingLogSchema.parse({
        id: r.id,
        day: r.day,
        title: r.title,
        source: r.source,
        summary: r.summary,
        ...(r.pages === null ? {} : { pages: r.pages }),
        ...(r.minutes === null ? {} : { minutes: r.minutes }),
      }),
    );
  },

  async verdictsForDay(day) {
    const { results } = await db
      .prepare(
        `SELECT day, task_id, outcome, confidence, by, suggestion, evidence_ids_json
         FROM verdicts WHERE day = ?1 ORDER BY decided_at, task_id`,
      )
      .bind(day)
      .all<VerdictRow>();
    return results.map((r) => ({
      day: r.day,
      taskId: r.task_id,
      outcome: r.outcome,
      confidence: r.confidence,
      by: r.by,
      evidenceIds: StringsSchema.parse(JSON.parse(r.evidence_ids_json)),
      ...(r.suggestion === null ? {} : { suggestion: r.suggestion }),
    }));
  },

  async saveVerdict(v, at) {
    await db
      .prepare(
        `INSERT INTO verdicts (day, task_id, outcome, confidence, by, suggestion, evidence_ids_json, decided_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (day, task_id) DO UPDATE SET outcome = excluded.outcome,
           confidence = excluded.confidence, by = excluded.by, suggestion = excluded.suggestion,
           evidence_ids_json = excluded.evidence_ids_json, decided_at = excluded.decided_at
         WHERE verdicts.outcome <> 'pass'`,
      )
      .bind(
        v.day,
        v.taskId,
        v.outcome,
        v.confidence,
        v.by,
        v.suggestion ?? null,
        JSON.stringify(v.evidenceIds),
        at,
      )
      .run();
  },
});
