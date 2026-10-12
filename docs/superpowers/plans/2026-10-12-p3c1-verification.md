# mflow P3c-1: verification (GitHub link, evidence, judging, verdicts, rewards, hourly cron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server verify the day's work. It links GitHub with an encrypted read-only token and collects the owner's commits as evidence. The AI judge decides GitHub and reading tasks, and the verdicts are stored. Passing tasks pay `task_reward`, and when every task passes the server pays `all_done_bonus`. An hourly cron runs all of this. Until the judge's accuracy has been measured, judge verdicts stay `pending` with a suggestion, and the owner confirms them.

**Architecture:**

- **New modules:** `apps/api/src/github` (REST client), `src/crypto` (AES-GCM secret box), `src/verification` (collector, judging, settlement, run), and `src/scheduled.ts` (the cron).
- **Shared wiring:** routes and cron build the same `Deps` through `makeDeps(env, options)`.
- **Core rules:** `requiredTasks`, `resolveDecision`, `allPassed` and `earn`. Every write is idempotent: commits by SHA, verdicts by `(day, taskId)` (a pass is final), rewards through core and the ledger's business keys.

**Tech Stack:** Hono, D1, Web Crypto (AES-GCM, available in Workers and Node), GitHub REST API version `2026-03-10`, `@mflow/ai` (from P3b), Vitest 5 with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` (§5.2, §6.3, §8, §9.1 step 3, §11 cron, §12, §13.1–13.2, §14 judge eval).

**Scope (P3c split, ruled here):**

- **P3c-1 (this plan):** verification.
- **P3c-2:** coach chat and memory (weekly summaries), the nightly review and proposal at the reminder hour, day rollover (`expire`), heartbeat gap analysis, the word-problem batch and `GET /math/bank`.

## Facts this plan relies on (checked 2026-10-12)

- GitHub REST supports API versions `2026-03-10` and `2022-11-28`. The `2026-03-10` breaking changes don't touch `GET /user`, `GET /repos/{o}/{r}`, `GET /repos/{o}/{r}/commits` or `GET /repos/{o}/{r}/commits/{sha}`. Headers: `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version`, and a `User-Agent` (required). A bad token answers 401.
- List commits: `?since=<ISO 8601>&author=<login>&per_page=100`. The reply is an array of `{ sha, commit: { message, author: { date } } }`, newest first. Recorded from `octocat/Hello-World`: `commit.author.date = "2012-03-06T23:06:50Z"`.
- Get a commit: `{ sha, commit: {...}, stats: { total, additions, deletions }, files: [{ filename, status, additions, deletions, changes, patch? }] }`. `patch` is missing for binary or huge files.
- Cloudflare Workers free plan: **50 subrequests** (outgoing fetches) and 50 D1 queries per invocation. Jev's context window is 32,000 tokens.

## Global Constraints

- Bun (`bun x`, never `bunx`/`npx`/pnpm), TypeScript `^6`, Vitest `^5.0.3`, ESM, strict.
- **The GitHub token is never stored or logged in plain text.** It is sealed with AES-GCM (random 12-byte IV) using `GITHUB_TOKEN_KEY` (a Worker secret: base64 of 32 random bytes) and opened only inside one verification run. Without the key, linking answers 503 and collection reports `key_missing`.
- Per run: **≤ 20 commit-detail fetches**. Each patch is cut to 1,500 characters and each commit to 15 files. A judge's state holds **≤ 40,000 characters** of patches (newest commits first).
- Judge decisions go through core `resolveDecision` (threshold 0.75 → `pending`). **Without `JUDGE_AUTO_DECIDE=on`, every judge verdict is stored as `pending` with a `suggestion`.** Spec §14: measured judge accuracy must be recorded before automatic decisions are enabled.
- If the AI is unavailable, no verdict is written and the next run retries (spec §13.1: never auto pass or fail). A verdict of `pass` is final (spec §13.1: "a passed task stays passed").
- Rewards come from core `earn` (plan must be locked; caps apply; borrow repayment) and are written with `appendEvents` as server events (`device_id` NULL). The phone learns of them through `GET /v1/ledger`.
- The owner may decide only `pending` GitHub or reading verdicts. Math and usage verdicts come from the phone (`by: 'code'`) and are not judged on the server in v1.
- Logs: structured JSON with names, counts and categories only. Never tokens, commit messages, patches, summaries or task titles.
- Coverage for `apps/api`: lines, functions and statements ≥ 90, branches ≥ 85. Commits use the conventional format under the owner's identity. **No AI attribution.** `learning/` is never committed.

## Review Focus

1. **The GitHub token is revoked or expired between runs.** Expected: the link turns `invalid`, later runs make no GitHub calls, the owner sees `status: 'invalid'` (spec: "Reconnect GitHub"), and no verdicts flip. Pinned in Task 5.
2. **A busy day with more new commits than the per-run budget.** Expected: 20 details per run, the cursor and stored SHAs ensure nothing is skipped or fetched twice, and the rest come next run. Pinned in Task 5.
3. **A commit at 03:30 local (before the 04:00 boundary).** Expected: it counts for the previous day, using the owner's device offset. Pinned in Task 5.
4. **The same evidence seen again on the next hourly run, or the AI down.** Expected: no re-judging and no extra AI calls when the evidence is unchanged. AI down → no verdict, retried later. A `pass` is never downgraded. A reward is never paid twice. Pinned in Task 6.
5. **The owner tries to self-pass a GitHub task the judge hasn't seen, or a task that's already decided.** Expected: refused (409/404). Only a `pending` verdict can be decided by hand. Math and usage come from the phone. Pinned in Task 7.

---

## File Structure

```
packages/ai/src/types.ts               FetchLike gains GET (body optional)
packages/contracts/src/verification.ts RepoNameSchema, GithubLinkRequestSchema, GithubLinkSchema,
                                       VerdictRequestSchema, VerdictSchema; TodaySchema gains verdicts
apps/api/
├─ migrations/0003_verification.sql    github_link, github_cursor, github_commits, verdicts
├─ src/crypto/secret-box.ts            importSecretKey, seal, open
├─ src/github/client.ts                githubClient: user, repo, commitsSince, commit
├─ src/adapters/d1/verification.ts     VerificationRepo
├─ src/verification/github.ts          collectGithub (budgeted, cursor-based)
├─ src/verification/judge.ts           questions, states (size-capped), decisions
├─ src/verification/run.ts             requiredFor, gate, settle, runVerification
├─ src/routes/github.ts  verify.ts     link endpoints; POST /verify; POST /verdicts/:taskId
├─ src/scheduled.ts                    runScheduled (hourly cron)
└─ test/secret-box.test.ts  github-client.test.ts  verification-repo.test.ts  github-link.test.ts
   collect.test.ts  verify.test.ts  verdicts.test.ts  scheduled.test.ts
docs/adr/0008-verification.md
```

---

### Task 1: `FetchLike` for GET, and the AES-GCM secret box

**Files:**

- Modify: `packages/ai/src/types.ts`, `packages/ai/test/fakes.ts`
- Create: `apps/api/src/crypto/secret-box.ts`, `apps/api/test/secret-box.test.ts`

**Interfaces:**

- Produces: `FetchLike` init `{ method: 'GET' | 'POST'; headers; body?: string }`.
- Produces: `importSecretKey(base64: string | undefined): Promise<CryptoKey | null>`, `seal(key, plaintext): Promise<string>` (format `v1.<iv b64>.<ciphertext b64>`), and `open(key, sealed): Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/secret-box.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { importSecretKey, open, seal } from '../src/crypto/secret-box';

/** Bytes 0..31, base64. Test-only key. */
export const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const OTHER_KEY = 'HwAeHR0cGxoZGBcWFRQTEhEQDw4NDAsKCQgHBgUEAwI=';

describe('secret box (AES-GCM)', () => {
  it('opens what it sealed, with a fresh IV each time', async () => {
    const key = await importSecretKey(TEST_KEY);
    if (key === null) throw new Error('key');
    const a = await seal(key, 'github_pat_secret');
    const b = await seal(key, 'github_pat_secret');

    expect(a).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('github_pat_secret');
    expect(await open(key, a)).toBe('github_pat_secret');
  });

  it('refuses tampered text, another key, and malformed input', async () => {
    const key = await importSecretKey(TEST_KEY);
    const other = await importSecretKey(OTHER_KEY);
    if (key === null || other === null) throw new Error('key');
    const sealed = await seal(key, 'secret');
    const [v, iv, ct] = sealed.split('.');
    const flipped = `${v}.${iv}.${(ct ?? '').slice(0, -4)}AAA=`;

    expect(await open(key, flipped)).toBeNull();
    expect(await open(other, sealed)).toBeNull();
    expect(await open(key, 'v2.a.b')).toBeNull();
    expect(await open(key, 'v1.%%%.###')).toBeNull();
  });

  it('only accepts a 32-byte base64 key', async () => {
    expect(await importSecretKey(undefined)).toBeNull();
    expect(await importSecretKey('c2hvcnQ=')).toBeNull();
    expect(await importSecretKey('not base64!')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/secret-box.test.ts`
Expected: FAIL. `../src/crypto/secret-box` can't be resolved.

- [ ] **Step 3: Implement**

In `packages/ai/src/types.ts`, change the `FetchLike` init type to:

```ts
  init: Readonly<{
    method: 'GET' | 'POST';
    headers: Readonly<Record<string, string>>;
    body?: string;
  }>,
```

In `packages/ai/test/fakes.ts`, change the recorded body to:

```ts
calls.push({
  url,
  headers: { ...init.headers },
  body: init.body === undefined ? undefined : (JSON.parse(init.body) as unknown),
});
```

`apps/api/src/crypto/secret-box.ts`:

```ts
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The AES-256-GCM key from a Worker secret (base64 of 32 random bytes), or null if absent/invalid. */
export async function importSecretKey(base64: string | undefined): Promise<CryptoKey | null> {
  if (base64 === undefined) return null;
  const raw = fromBase64(base64);
  if (raw === null || raw.length !== KEY_BYTES) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts with a fresh random IV. The output names its format version for later key rotation. */
export async function seal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/** Decrypts, or null when the text is malformed, tampered with, or sealed with another key. */
export async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  const [version, ivText, ciphertextText] = sealed.split('.');
  if (version !== VERSION || ivText === undefined || ciphertextText === undefined) return null;
  const iv = fromBase64(ivText);
  const ciphertext = fromBase64(ciphertextText);
  if (iv === null || ciphertext === null) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test -- test/secret-box.test.ts && bun run --cwd packages/ai test && bun run typecheck && bun run lint`
Expected: PASS; typecheck and lint are clean. (If TypeScript rejects `Uint8Array` as `BufferSource` in `importKey`/`decrypt`, pass `raw.buffer`/`ciphertext.buffer` sliced to the view and record a ruling.)

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/ai apps/api
git add packages/ai apps/api
git commit -m "feat(api): AES-GCM secret box; FetchLike supports GET"
```

---

### Task 2: Contracts, migration 0003 and the verification repository

**Files:**

- Create: `packages/contracts/src/verification.ts`, `packages/contracts/test/verification.test.ts`, `apps/api/migrations/0003_verification.sql`, `apps/api/src/adapters/d1/verification.ts`, `apps/api/test/verification-repo.test.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/api.ts` (`TodaySchema.verdicts`), `apps/api/src/ports.ts`, `apps/api/src/adapters/d1/devices.ts`, `apps/api/src/adapters/d1/index.ts`, `apps/api/vitest.config.ts` (`GITHUB_TOKEN_KEY` binding), `apps/api/test/env.d.ts`

**Interfaces:**

- Produces (contracts): `RepoNameSchema`, `GithubLinkRequestSchema` (`{ token: 20–255 chars, repos: 1–10 unique }`), `GithubLinkSchema` (`{ login, repos, status: 'ok' | 'invalid' }`), `VerdictRequestSchema` (`{ day, outcome: 'pass' | 'fail' }`), `VerdictSchema`, and `TodaySchema.verdicts: Verdict[]`.
- Produces (ports):
  - `GithubLink = { login; tokenSealed; repos: readonly string[]; status: 'ok' | 'invalid' }`
  - `CommitFile = { filename; additions; deletions; patch?: string }`
  - `CommitEvidence = { sha; repo; day; committedAt: string; message; additions; deletions; files: readonly CommitFile[] }`
  - `StoredVerdict = Verdict & { day: string; suggestion?: 'pass' | 'fail' }`
- Produces: `VerificationRepo`, with:
  - `link()`
  - `saveLink(link, at, since: string)` (upserts the link and resets every repo cursor to `since`)
  - `setLinkStatus(status, at)`, `deleteLink()`
  - `cursor(repo): Promise<string | null>`, `setCursor(repo, since)`
  - `knownShas(shas): Promise<Set<string>>`, `addCommits(commits, at)`, `commitsForDay(day)` (newest first)
  - `readingForDay(day): Promise<ReadingLog[]>`
  - `verdictsForDay(day)`, `saveVerdict(v, at)` (never overwrites a `pass`)
- Produces: `Repos.verification`; `DeviceRepo.latestOffset(): Promise<number | null>` (the newest unrevoked device).

- [ ] **Step 1: Write the failing tests**

`packages/contracts/test/verification.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GithubLinkRequestSchema, TodaySchema, VerdictSchema } from '../src';

describe('GithubLinkRequestSchema', () => {
  const token = 'github_pat_' + 'x'.repeat(40);

  it('accepts owner/name repositories', () => {
    expect(
      GithubLinkRequestSchema.safeParse({ token, repos: ['bahir/mflow', 'a.b/c-d_e'] }).success,
    ).toBe(true);
  });

  it.each([
    ['a short token', { token: 'short', repos: ['a/b'] }],
    ['no repository', { token, repos: [] }],
    ['a repository without an owner', { token, repos: ['mflow'] }],
    ['a URL instead of a name', { token, repos: ['https://github.com/a/b'] }],
    ['a repeated repository', { token, repos: ['a/b', 'a/b'] }],
  ])('rejects %s', (_label, value) => {
    expect(GithubLinkRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('VerdictSchema and TodaySchema', () => {
  const verdict = {
    day: '2026-10-09',
    taskId: '01920000-0000-7000-8000-000000000001',
    outcome: 'pending',
    confidence: 0.9,
    by: 'judge',
    evidenceIds: ['7fd1a60'],
    suggestion: 'pass',
  };

  it('round-trips a pending verdict with a suggestion inside today', () => {
    expect(VerdictSchema.parse(verdict)).toEqual(verdict);
    const today = {
      day: '2026-10-09',
      serverTime: 1,
      plan: null,
      dayRecord: null,
      balanceSeconds: 0,
      earnedTodaySeconds: 0,
      verdicts: [verdict],
    };
    expect(TodaySchema.parse(today)).toEqual(today);
  });
});
```

`apps/api/test/verification-repo.test.ts`:

```ts
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
  repo: 'bahir/mflow',
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
      { login: 'bahir', tokenSealed: 'v1.x.y', repos: ['bahir/mflow'], status: 'ok' },
      T0,
      '2026-10-08T12:00:00.000Z',
    );

    expect(await repo.link()).toEqual({
      login: 'bahir',
      tokenSealed: 'v1.x.y',
      repos: ['bahir/mflow'],
      status: 'ok',
    });
    expect(await repo.cursor('bahir/mflow')).toBe('2026-10-08T12:00:00.000Z');
    await repo.setLinkStatus('invalid', T0);
    expect((await repo.link())?.status).toBe('invalid');

    await repo.deleteLink();
    expect([await repo.link(), await repo.cursor('bahir/mflow')]).toEqual([null, null]);
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd packages/contracts test -- test/verification.test.ts; bun run --cwd apps/api test -- test/verification-repo.test.ts`
Expected: FAIL. The schemas aren't exported, and `repos.verification` doesn't exist.

- [ ] **Step 3: Implement the contracts**

`packages/contracts/src/verification.ts`:

```ts
import { z } from 'zod';
import { DayKeySchema } from './schemas';

/** `owner/name`, as GitHub spells it. */
export const RepoNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/);

export const GithubLinkRequestSchema = z
  .object({
    /** A fine-grained, read-only token (Contents + Metadata). Sealed at rest, never echoed. */
    token: z.string().trim().min(20).max(255),
    repos: z.array(RepoNameSchema).min(1).max(10),
  })
  .refine((r) => new Set(r.repos).size === r.repos.length, {
    message: 'repositories must be unique',
    path: ['repos'],
  });

export const GithubLinkSchema = z.object({
  login: z.string(),
  repos: z.array(RepoNameSchema),
  status: z.enum(['ok', 'invalid']),
});

export const VerdictRequestSchema = z.object({
  day: DayKeySchema,
  outcome: z.enum(['pass', 'fail']),
});

export const VerdictSchema = z.object({
  day: DayKeySchema,
  taskId: z.string(),
  outcome: z.enum(['pass', 'fail', 'pending']),
  confidence: z.number().min(0).max(1),
  by: z.enum(['code', 'judge', 'coach', 'owner']),
  evidenceIds: z.array(z.string()),
  /** For a pending judge verdict: what the judge would decide. */
  suggestion: z.enum(['pass', 'fail']).optional(),
});
```

In `packages/contracts/src/api.ts`, add `import { VerdictSchema } from './verification';` and add `verdicts: z.array(VerdictSchema),` as the last field of `TodaySchema`. Add `export * from './verification';` to `packages/contracts/src/index.ts`.

- [ ] **Step 4: Implement the migration, ports and adapter**

`apps/api/migrations/0003_verification.sql`:

```sql
-- P3c-1: GitHub link (token sealed with AES-GCM), commit evidence, verdicts.

CREATE TABLE github_link (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  login TEXT NOT NULL,
  token_sealed TEXT NOT NULL,
  repos_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'invalid')),
  linked_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);

CREATE TABLE github_cursor (
  repo TEXT PRIMARY KEY,
  since TEXT NOT NULL
);

CREATE TABLE github_commits (
  sha TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  day TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX github_commits_day ON github_commits (day, committed_at);

CREATE TABLE verdicts (
  day TEXT NOT NULL,
  task_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'pending')),
  confidence REAL NOT NULL,
  by TEXT NOT NULL CHECK (by IN ('code', 'judge', 'coach', 'owner')),
  suggestion TEXT CHECK (suggestion IN ('pass', 'fail')),
  evidence_ids_json TEXT NOT NULL,
  decided_at INTEGER NOT NULL,
  PRIMARY KEY (day, task_id)
);
```

Append to `apps/api/src/ports.ts` (merge `Verdict` into the core import and `ReadingLog` is already imported), and add `verification: VerificationRepo;` to `Repos`. Also add `latestOffset(): Promise<number | null>;` to `DeviceRepo`:

```ts
export type GithubLink = Readonly<{
  login: string;
  tokenSealed: string;
  repos: readonly string[];
  status: 'ok' | 'invalid';
}>;

export type CommitFile = Readonly<{
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}>;

export type CommitEvidence = Readonly<{
  sha: string;
  repo: string;
  day: string;
  committedAt: string;
  message: string;
  additions: number;
  deletions: number;
  files: readonly CommitFile[];
}>;

export type StoredVerdict = Verdict & Readonly<{ day: string; suggestion?: 'pass' | 'fail' }>;

export interface VerificationRepo {
  link(): Promise<GithubLink | null>;
  /** Upserts the link and resets every repository cursor to `since` (ISO 8601). */
  saveLink(link: GithubLink, at: number, since: string): Promise<void>;
  setLinkStatus(status: GithubLink['status'], at: number): Promise<void>;
  deleteLink(): Promise<void>;
  cursor(repo: string): Promise<string | null>;
  setCursor(repo: string, since: string): Promise<void>;
  knownShas(shas: readonly string[]): Promise<Set<string>>;
  addCommits(commits: readonly CommitEvidence[], at: number): Promise<void>;
  /** The day's commits, newest first. */
  commitsForDay(day: string): Promise<CommitEvidence[]>;
  readingForDay(day: string): Promise<ReadingLog[]>;
  verdictsForDay(day: string): Promise<StoredVerdict[]>;
  /** Upserts by (day, task); a stored `pass` is final and is never overwritten. */
  saveVerdict(verdict: StoredVerdict, at: number): Promise<void>;
}
```

Add to `d1Devices` in `apps/api/src/adapters/d1/devices.ts`:

```ts
  async latestOffset() {
    const row = await db
      .prepare(
        `SELECT utc_offset_minutes FROM devices WHERE revoked_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .first<{ utc_offset_minutes: number }>();
    return row?.utc_offset_minutes ?? null;
  },
```

`apps/api/src/adapters/d1/verification.ts`:

```ts
import { ReadingLogSchema } from '@mflow/contracts';
import type { ReadingLog } from '@mflow/contracts';
import { z } from 'zod';
import type { CommitEvidence, GithubLink, StoredVerdict, VerificationRepo } from '../../ports';

type LinkRow = {
  login: string;
  token_sealed: string;
  repos_json: string;
  status: GithubLink['status'];
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
      .prepare('SELECT login, token_sealed, repos_json, status FROM github_link WHERE id = 1')
      .first<LinkRow>();
    return row === null
      ? null
      : {
          login: row.login,
          tokenSealed: row.token_sealed,
          repos: StringsSchema.parse(JSON.parse(row.repos_json)),
          status: row.status,
        };
  },

  async saveLink(link, at, since) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO github_link (id, login, token_sealed, repos_json, status, linked_at, checked_at)
           VALUES (1, ?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT (id) DO UPDATE SET login = excluded.login, token_sealed = excluded.token_sealed,
             repos_json = excluded.repos_json, status = excluded.status,
             linked_at = excluded.linked_at, checked_at = excluded.checked_at`,
        )
        .bind(link.login, link.tokenSealed, JSON.stringify(link.repos), link.status, at),
      db.prepare('DELETE FROM github_cursor'),
      db
        .prepare(`INSERT INTO github_cursor (repo, since) SELECT value, ?2 FROM json_each(?1)`)
        .bind(JSON.stringify(link.repos), since),
    ]);
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
```

Add `verification: d1Verification(db)` to `d1Repos`.

In `apps/api/vitest.config.ts`, add `GITHUB_TOKEN_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='` to the miniflare `bindings` (the test-only key from Task 1). In `apps/api/test/env.d.ts`, add `GITHUB_TOKEN_KEY?: string;` and `JUDGE_AUTO_DECIDE?: string;`.

In `apps/api/src/routes/today.ts`, add `verdicts: await deps.repos.verification.verdictsForDay(day),` to the returned object, so the API keeps matching the contract.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd packages/contracts test && bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS everywhere. The existing `/today` tests still pass, because they assert specific fields or use `toEqual` on objects that now need `verdicts: []`. Update the one `toEqual` in `today.test.ts` ("pays the base grant…") to include `verdicts: []`, and record a ruling.

- [ ] **Step 6: Commit**

```bash
bun x prettier --write packages/contracts apps/api
git add packages/contracts apps/api
git commit -m "feat(api): verification storage for GitHub link, commit evidence and verdicts"
```

---

### Task 3: GitHub REST client

**Files:**

- Create: `apps/api/src/github/client.ts`, `apps/api/test/github-client.test.ts`, `apps/api/test/github-fake.ts`

**Interfaces:**

- Consumes: `FetchLike` (Task 1); `Result`, `ok`, `err` (core).
- Produces:
  - `GITHUB_API = 'https://api.github.com'`, `GITHUB_API_VERSION = '2026-03-10'`
  - `MAX_PATCH_CHARS = 1500`, `MAX_FILES_PER_COMMIT = 15`
  - `GithubError = 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'unavailable' | 'invalid_output'`
  - `CommitSummary = { sha; date }`, `CommitDetail = { sha; message; date; additions; deletions; files: CommitFile[] }`
  - `GithubClient` with `user()`, `repo(name)`, `commitsSince(repo, since, author)` (oldest first) and `commit(repo, sha)`
  - `githubClient(token, fetch): GithubClient`
- Produces (tests): `githubFake(opts)`, which returns `{ fetch, urls, headers }`. It serves `/user`, the linked repos, commit lists and details from a list of fake commits, and `geminiJudgeReply`.

- [ ] **Step 1: Write the fake and the failing test**

`apps/api/test/github-fake.ts`:

```ts
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
```

`apps/api/test/github-client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/github-client.test.ts`
Expected: FAIL. `../src/github/client` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/github/client.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test -- test/github-client.test.ts && bun run --cwd apps/api typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): GitHub REST client for user, repo and commit evidence"
```

---

### Task 4: `makeDeps`, settings, and the GitHub link endpoints

**Files:**

- Create: `apps/api/src/routes/github.ts`, `apps/api/test/github-link.test.ts`
- Modify: `apps/api/src/env.ts`, `apps/api/src/app.ts`, `apps/api/src/http/envelope.ts`, `apps/api/.dev.vars.example`

**Interfaces:**

- Consumes: `githubClient` (Task 3), `importSecretKey`/`seal` (Task 1), `VerificationRepo.saveLink/link/deleteLink` (Task 2), `GithubLinkRequestSchema` (Task 2).
- Produces:
  - `Bindings` gains `GITHUB_TOKEN_KEY?` and `JUDGE_AUTO_DECIDE?`.
  - `Deps` gains `fetch: FetchLike` and `settings: { githubTokenKey?: string; judgeAutoDecide: boolean }`.
  - `makeDeps(env, options): Deps`, exported from `app.ts` and used by the middleware and the cron.
- Produces (errors):
  - `github_key_missing` (503)
  - `github_token_invalid` (422)
  - `github_repo_unavailable` (422)
  - `github_unavailable` (502)
- Routes:
  - `PUT /v1/github/link` → `{ login, repos, status: 'ok' }`. It checks the token (`GET /user`) and every repo, seals the token, and sets the cursors to linkedAt − 24 h.
  - `GET /v1/github/link` → the link without the token, or 404.
  - `DELETE /v1/github/link` → `{ deleted: true }`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/github-link.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, T0, type App } from './helpers';
import { githubFake } from './github-fake';

const TOKEN = 'github_pat_' + 'x'.repeat(40);

async function linked(
  fake = githubFake(),
  body: object = { token: TOKEN, repos: ['bahir/mflow'] },
) {
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  const reply = await call<{ login: string; repos: string[]; status: string }>(
    app,
    'PUT',
    '/v1/github/link',
    {
      token,
      body,
    },
  );
  return { app, token, reply, fake };
}

describe('GitHub link', () => {
  it('checks the token and repositories, seals the token and starts cursors a day back', async () => {
    const { app, token, reply } = await linked();

    expect(reply.body.data).toEqual({ login: 'bahir', repos: ['bahir/mflow'], status: 'ok' });
    const row = await env.DB.prepare('SELECT token_sealed FROM github_link').first<{
      token_sealed: string;
    }>();
    expect(row?.token_sealed.startsWith('v1.')).toBe(true);
    expect(row?.token_sealed).not.toContain(TOKEN);
    const cursor = await env.DB.prepare('SELECT since FROM github_cursor').first<{
      since: string;
    }>();
    expect(cursor?.since).toBe(new Date(T0 - 86_400_000).toISOString());
    const got = await call(app, 'GET', '/v1/github/link', { token });
    expect(got.body.data).toEqual({ login: 'bahir', repos: ['bahir/mflow'], status: 'ok' });
    expect(JSON.stringify(got.body)).not.toContain(TOKEN);
  });

  it('refuses a token GitHub rejects, storing nothing', async () => {
    const { reply } = await linked(
      githubFake({ status: (url) => (url.endsWith('/user') ? 401 : undefined) }),
    );
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'github_token_invalid']);
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM github_link').first<{ n: number }>(),
    ).toEqual({ n: 0 });
  });

  it('refuses a repository the token cannot read', async () => {
    const { reply } = await linked(githubFake(), {
      token: TOKEN,
      repos: ['bahir/mflow', 'bahir/secret'],
    });
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'github_repo_unavailable']);
  });

  it('answers 502 when GitHub is down', async () => {
    const { reply } = await linked(githubFake({ status: () => 503 }));
    expect([reply.status, reply.body.error?.code]).toEqual([502, 'github_unavailable']);
  });

  it('is disabled without the sealing key', async () => {
    const fake = githubFake();
    const app = makeApp(undefined, { fetch: fake.fetch });
    const { token } = await pairDevice(app);
    const reply = await call(app, 'PUT', '/v1/github/link', {
      token,
      body: { token: TOKEN, repos: ['bahir/mflow'] },
      env: { GITHUB_TOKEN_KEY: undefined },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([503, 'github_key_missing']);
    expect(fake.urls).toEqual([]);
  });

  it('unlinks', async () => {
    const { app, token } = await linked();
    expect((await call(app, 'DELETE', '/v1/github/link', { token })).body.data).toEqual({
      deleted: true,
    });
    expect((await call(app, 'GET', '/v1/github/link', { token })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/github-link.test.ts`
Expected: FAIL. `/v1/github/link` isn't a route.

- [ ] **Step 3: Implement**

Add to `ERRORS` in `apps/api/src/http/envelope.ts` (keep status order):

```ts
  github_token_invalid: [422, 'GitHub rejected the token. Create a new fine-grained, read-only token.'],
  github_repo_unavailable: [422, 'One of the repositories cannot be read with this token.'],
  github_unavailable: [502, 'GitHub is not answering right now. Try again later.'],
  github_key_missing: [503, 'GitHub linking is not configured on the server.'],
```

In `apps/api/src/env.ts`:

- Add `GITHUB_TOKEN_KEY?: string;` and `/** "on" lets confident judge verdicts pass or fail tasks on their own (spec §14). */ JUDGE_AUTO_DECIDE?: string;` to `Bindings`.
- Add to `Deps`:

```ts
/** Outgoing HTTP (AI providers, GitHub); tests pass a fake. */
fetch: FetchLike;
settings: Readonly<{ githubTokenKey?: string; judgeAutoDecide: boolean }>;
```

(with `import type { Ai, FetchLike } from '@mflow/ai';`).

In `apps/api/src/app.ts`, add `makeDeps` above `createApp` and use it in the middleware:

```ts
/** Everything a request or a cron run needs, from the Worker env plus test overrides. */
export function makeDeps(env: Bindings, options: AppOptions = {}): Deps {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? (() => uuidv7());
  const fetchImpl = options.fetch ?? timeoutFetch;
  const limit =
    options.limiter ?? (async (key: string) => (await env.RATE_LIMITER.limit({ key })).success);
  const repos = d1Repos(env.DB);
  return {
    now,
    newId,
    repos,
    limit,
    fetch: fetchImpl,
    ai: aiFromEnv(env, repos.aiUsage, fetchImpl, now),
    settings: {
      githubTokenKey: env.GITHUB_TOKEN_KEY,
      judgeAutoDecide: env.JUDGE_AUTO_DECIDE === 'on',
    },
  };
}
```

Replace the deps middleware with:

```ts
app.use('*', async (c, next) => {
  c.set('deps', makeDeps(c.env, options));
  await next();
});
```

Remove the now-unused `now`/`newId` locals from `createApp` and add the imports (`Bindings`, `Deps` types from `./env`). Register `authed.route('/', githubRoutes);`.

`apps/api/src/routes/github.ts`:

```ts
import { GithubLinkRequestSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import { importSecretKey, seal } from '../crypto/secret-box';
import type { AppEnv } from '../env';
import { githubClient, type GithubError } from '../github/client';
import { fail, ok, type ErrorCode } from '../http/envelope';
import { valid } from '../http/validate';

/** A new link looks one day back, so today's earlier commits still count. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

const linkError = (error: GithubError): ErrorCode =>
  error === 'unauthorized'
    ? 'github_token_invalid'
    : error === 'not_found' || error === 'forbidden'
      ? 'github_repo_unavailable'
      : 'github_unavailable';

export const githubRoutes = new Hono<AppEnv>()
  .get('/github/link', async (c) => {
    const link = await c.var.deps.repos.verification.link();
    return link === null
      ? fail(c, 'not_found')
      : ok(c, { login: link.login, repos: link.repos, status: link.status });
  })
  .put('/github/link', valid('json', GithubLinkRequestSchema), async (c) => {
    const { deps } = c.var;
    const body = c.req.valid('json');
    const key = await importSecretKey(deps.settings.githubTokenKey);
    if (key === null) return fail(c, 'github_key_missing');

    const client = githubClient(body.token, deps.fetch);
    const user = await client.user();
    if (!user.ok) return fail(c, linkError(user.error));
    for (const repo of body.repos) {
      const checked = await client.repo(repo);
      if (!checked.ok) return fail(c, linkError(checked.error));
    }

    const now = deps.now();
    await deps.repos.verification.saveLink(
      {
        login: user.value.login,
        tokenSealed: await seal(key, body.token),
        repos: body.repos,
        status: 'ok',
      },
      now,
      new Date(now - LOOKBACK_MS).toISOString(),
    );
    return ok(c, { login: user.value.login, repos: body.repos, status: 'ok' as const });
  })
  .delete('/github/link', async (c) => {
    await c.var.deps.repos.verification.deleteLink();
    return ok(c, { deleted: true });
  });
```

Append to `apps/api/.dev.vars.example`:

```
# Key that seals the GitHub token at rest (base64 of 32 random bytes): openssl rand -base64 32
GITHUB_TOKEN_KEY=
# "on" lets confident judge verdicts decide tasks alone. Keep off until the judge eval is recorded.
JUDGE_AUTO_DECIDE=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): link GitHub with a sealed read-only token"
```

---

### Task 5: Collect commit evidence (budgeted, cursor-based)

**Files:**

- Create: `apps/api/src/verification/github.ts`, `apps/api/test/collect.test.ts`

**Interfaces:**

- Consumes: `Deps` (`repos.verification`, `fetch`, `settings.githubTokenKey`, `now`), `githubClient`, `importSecretKey`, `open`, `dayKeyFor`, `DEFAULT_RULES`.
- Produces: `MAX_COMMIT_FETCHES_PER_RUN = 20`, `CollectStatus = 'ok' | 'not_linked' | 'invalid_token' | 'key_missing'`, and `collectGithub(deps, utcOffsetMinutes): Promise<CollectStatus>`.
- Rules:
  - A link marked `invalid` makes no calls.
  - A 401 marks it `invalid`.
  - Other errors stop that repo for this run without moving its cursor.
  - Known SHAs are never fetched again.
  - A commit's day is `dayKeyFor(Date.parse(date), offset, 4)`.
  - After a repo, its cursor moves to the date of the last commit processed.

- [ ] **Step 1: Write the failing test**

`apps/api/test/collect.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
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
    body: { token: TOKEN, repos: ['bahir/mflow'] },
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
      'https://api.github.com/repos/bahir/mflow/commits?since=2026-10-09T05%3A00%3A00Z&author=bahir&per_page=100',
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/collect.test.ts`
Expected: FAIL. `../src/verification/github` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/verification/github.ts`:

```ts
import { dayKeyFor, DEFAULT_RULES } from '@mflow/core';
import { importSecretKey, open } from '../crypto/secret-box';
import type { Deps } from '../env';
import { githubClient } from '../github/client';
import type { CommitEvidence } from '../ports';

/** Free Workers allow 50 outgoing requests per invocation; commit details are the expensive part. */
export const MAX_COMMIT_FETCHES_PER_RUN = 20;

export type CollectStatus = 'ok' | 'not_linked' | 'invalid_token' | 'key_missing';

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
  for (const repo of link.repos) {
    if (budget === 0) break;
    const since = (await store.cursor(repo)) ?? new Date(deps.now()).toISOString();
    const listed = await client.commitsSince(repo, since, link.login);
    if (!listed.ok) {
      if (listed.error === 'unauthorized') {
        await store.setLinkStatus('invalid', deps.now());
        return 'invalid_token';
      }
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
      collected.push({
        ...detail.value,
        repo,
        committedAt: detail.value.date,
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
  return 'ok';
}
```

Note: `CommitDetail` has `date`; the stored evidence keeps `committedAt`. The spread copies `date` too; strip it by building the object explicitly if the repository test's `toEqual` objects to the extra key (`CommitSchema` parsing drops unknown keys, so stored payloads read back clean).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): collect commit evidence with a per-run budget and cursors"
```

---

### Task 6: Judging, settlement and `POST /v1/verify`

**Files:**

- Create: `apps/api/src/verification/judge.ts`, `apps/api/src/verification/run.ts`, `apps/api/src/routes/verify.ts`, `apps/api/test/verify.test.ts`
- Modify: `apps/api/src/app.ts` (register routes), `apps/api/test/helpers.ts` (`taskSpec` verifier parameter)

**Interfaces:**

- Consumes: `collectGithub` (Task 5); `Ai.judge` (P3b); core `requiredTasks`, `resolveDecision`, `allPassed`, `earn`, `sumKind`, `dayKeyFor`, `DEFAULT_RULES`, `Decision`, `TaskVersion`, `Plan`, `RequiredTask`; `appendEvents` (P3a).
- Produces (judge.ts):
  - `githubQuestions`, `readingQuestions`, `READING_PASS_LEVEL = 3`
  - `MAX_STATE_PATCH_CHARS = 40_000`
  - `githubState(task, commits)`, `readingState(task, logs)`
  - `noulDecision(answer)`, `scoreDecision(answer, passLevel)`
  - `judgeGithub(ai, task, commits)`, `judgeReading(ai, task, logs)`, both returning `Promise<Decision | null>`
- Produces (run.ts):
  - `ownerDay(deps): Promise<string>`
  - `requiredFor(deps, plan): Promise<RequiredTask[]>`
  - `gate(verdict, decision, day, autoDecide): StoredVerdict`
  - `settle(deps, plan, required): Promise<void>` (pays every passed task's reward, plus the bonus when all pass; idempotent)
  - `runVerification(deps): Promise<VerificationRun>`, with `VerificationRun = { day; github: CollectStatus; judged: number }`
- Route: `POST /v1/verify` → `{ day, github, judged, verdicts }`.
- Rules:
  - Judge only GitHub or reading tasks that are required today, have evidence, aren't `pass`, and whose evidence changed since the last verdict.
  - AI unavailable → no verdict.
  - Without `autoDecide`, every judge verdict is `pending` with a `suggestion`.
  - The reading pass probability is P(score ≥ 3), and its confidence is max(P, 1 − P).

- [ ] **Step 1: Write the failing test**

Change `taskSpec` in `apps/api/test/helpers.ts` to accept a verifier:

```ts
export const taskSpec = (
  title = 'Ship one PR',
  verifier: TaskSpec['verifier'] = 'github',
): TaskSpec => ({
  id: uuidv7(),
  skillId: 'swe',
  when: '20:00 at my desk',
  verifier,
  full: { title, criteria: 'a merged PR', seconds: 1200 },
  twoMinute: { title: 'Open the repo', criteria: 'one commit', seconds: 300 },
});
```

`apps/api/test/verify.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import type { LedgerEvent, TaskSpec } from '@mflow/core';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { geminiJudgeReply, githubFake, type FakeCommit } from './github-fake';
import { call, makeApp, pairDevice, taskSpec, type App } from './helpers';

const TOKEN = 'github_pat_' + 'x'.repeat(40);
type Verdict = {
  taskId: string;
  outcome: string;
  confidence: number;
  by: string;
  suggestion?: string;
  evidenceIds: string[];
};
type Run = { day: string; github: string; judged: number; verdicts: Verdict[] };

/** Gemini answers both judge question sets; counts calls. */
function judgeFake(done: number, substance: Record<string, number>) {
  let calls = 0;
  const other: FetchLike = async (_url, init) => {
    calls += 1;
    const body = init.body ?? '';
    return geminiJudgeReply(body.includes('"done"') ? { done: { yes: done } } : { substance });
  };
  return { other, calls: () => calls };
}

async function setup(
  opts: {
    commits?: FakeCommit[];
    judge?: ReturnType<typeof judgeFake>;
    autoDecide?: boolean;
    lock?: boolean;
  } = {},
) {
  const judge =
    opts.judge ?? judgeFake(0.92, { '0': 0, '1': 0, '2': 0.1, '3': 0.3, '4': 0.4, '5': 0.2 });
  const fake = githubFake({
    commits: opts.commits ?? [{ sha: 'a1', date: '2026-10-09T10:00:00Z', message: 'fix: login' }],
    other: judge.other,
  });
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  const keys = { GEMINI_API_KEY: 'g-key', ...(opts.autoDecide ? { JUDGE_AUTO_DECIDE: 'on' } : {}) };
  await call(app, 'PUT', '/v1/github/link', {
    token,
    body: { token: TOKEN, repos: ['bahir/mflow'] },
  });
  const tasks: TaskSpec[] = [
    taskSpec('Fix the login bug'),
    taskSpec('Read 10 pages', 'reading'),
    taskSpec('10 problems', 'math'),
  ];
  await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
  if (opts.lock !== false) await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
  const verify = () => call<Run>(app, 'POST', '/v1/verify', { token, env: keys });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { app, token, tasks, verify, ledger, judge, fake, keys };
}

describe('POST /v1/verify', () => {
  it('without automatic decisions, stores a pending verdict with the judge suggestion and pays nothing', async () => {
    const { tasks, verify, ledger } = await setup();

    const run = (await verify()).body.data;

    expect(run).toMatchObject({ day: '2026-10-09', github: 'ok', judged: 1 });
    expect(run.verdicts).toEqual([
      {
        day: '2026-10-09',
        taskId: tasks[0]?.id,
        outcome: 'pending',
        confidence: 0.92,
        by: 'judge',
        suggestion: 'pass',
        evidenceIds: ['a1'],
      },
    ]);
    expect((await ledger()).filter((e) => e.kind === 'task_reward')).toEqual([]);
  });

  it('with automatic decisions, a confident pass pays the task reward once', async () => {
    const { tasks, verify, ledger, judge } = await setup({ autoDecide: true });

    await verify();
    const callsAfterFirst = judge.calls();
    await verify();

    const rewards = (await ledger()).filter((e) => e.kind === 'task_reward');
    expect(rewards.map((e) => [e.refId, e.seconds])).toEqual([[tasks[0]?.id, 1200]]);
    expect(judge.calls()).toBe(callsAfterFirst); // unchanged evidence: no new judge call
  });

  it('keeps a low-confidence judgment pending even with automatic decisions', async () => {
    const { verify } = await setup({
      autoDecide: true,
      judge: judgeFake(0.6, { '0': 1, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }),
    });
    const run = (await verify()).body.data;
    expect(run.verdicts[0]).toMatchObject({
      outcome: 'pending',
      suggestion: 'pass',
      confidence: 0.6,
    });
  });

  it('judges a reading log by the probability its score is 3 or more', async () => {
    const { app, token, tasks, verify, keys } = await setup({ autoDecide: true, commits: [] });
    await call(app, 'POST', '/v1/reading', {
      token,
      body: {
        id: uuidv7(),
        day: '2026-10-09',
        title: 'Atomic Habits',
        source: 'book',
        pages: 12,
        summary: 'Systems beat goals; habits compound.',
      },
      env: keys,
    });

    const run = (await verify()).body.data;

    expect(run.verdicts).toEqual([
      expect.objectContaining({
        taskId: tasks[1]?.id,
        outcome: 'pass',
        by: 'judge',
        confidence: expect.closeTo(0.9, 5),
      }),
    ]);
  });

  it('writes no verdict while the AI is unavailable, and judges once it is back', async () => {
    const { app, token, verify } = await setup();
    const noAi = await call<Run>(app, 'POST', '/v1/verify', { token });
    const withAi = await verify();
    expect([noAi.body.data.verdicts.length, withAi.body.data.verdicts.length]).toEqual([0, 1]);
  });

  it('does nothing before the plan is locked', async () => {
    const { verify, judge } = await setup({ lock: false });
    const run = (await verify()).body.data;
    expect([run.judged, run.verdicts, judge.calls()]).toEqual([0, [], 0]);
  });

  it('never re-judges or downgrades a pass when new evidence arrives', async () => {
    const commits: FakeCommit[] = [{ sha: 'a1', date: '2026-10-09T10:00:00Z' }];
    const { verify, judge } = await setup({ autoDecide: true, commits });
    await verify();
    const calls = judge.calls();
    commits.push({ sha: 'b2', date: '2026-10-09T11:00:00Z' });

    const run = (await verify()).body.data;

    expect(run.verdicts[0]).toMatchObject({ outcome: 'pass', evidenceIds: ['a1'] });
    expect(judge.calls()).toBe(calls);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/verify.test.ts`
Expected: FAIL. `/v1/verify` isn't a route.

- [ ] **Step 3: Implement the judge**

`apps/api/src/verification/judge.ts`:

```ts
import type { Ai, Answer, Questions } from '@mflow/ai';
import type { ReadingLog } from '@mflow/contracts';
import type { Decision, TaskVersion } from '@mflow/core';
import type { CommitEvidence } from '../ports';

export const githubQuestions: Questions = {
  done: {
    type: 'noul',
    instructions: "Do the commits complete the task, as the task's criteria describe?",
    criteria: {
      true: 'The commits clearly do what the criteria ask',
      false: 'The commits do not do it, or only partly',
    },
  },
};

export const READING_PASS_LEVEL = 3;

export const readingQuestions: Questions = {
  substance: {
    type: 'score',
    instructions:
      'How substantial are these reading notes as evidence that the reading was understood and meets the task?',
    criteria: [
      'No real summary',
      'Only the title or a phrase',
      'A vague sentence with no idea from the reading',
      'Names the main idea',
      'The main idea in their own words, with a detail',
      'A clear own-words summary with an insight or an application',
    ],
  },
};

/** Patch text across all commits in one judge call (newest first); messages and stats always fit. */
export const MAX_STATE_PATCH_CHARS = 40_000;

export function githubState(task: TaskVersion, commits: readonly CommitEvidence[]) {
  let budget = MAX_STATE_PATCH_CHARS;
  return {
    task: { title: task.title, criteria: task.criteria },
    commits: commits.map((c) => ({
      repo: c.repo,
      message: c.message,
      additions: c.additions,
      deletions: c.deletions,
      files: c.files.map((f) => {
        const patch = f.patch !== undefined && f.patch.length <= budget ? f.patch : undefined;
        if (patch !== undefined) budget -= patch.length;
        return {
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          ...(patch === undefined ? {} : { patch }),
        };
      }),
    })),
  };
}

export const readingState = (task: TaskVersion, logs: readonly ReadingLog[]) => ({
  task: { title: task.title, criteria: task.criteria },
  readingLogs: logs.map((l) => ({
    title: l.title,
    source: l.source,
    summary: l.summary,
    ...(l.pages === undefined ? {} : { pages: l.pages }),
    ...(l.minutes === undefined ? {} : { minutes: l.minutes }),
  })),
});

const certainty = (p: number): number => Math.max(p, 1 - p);

export function noulDecision(answer: Answer | undefined): Decision | null {
  if (answer?.type !== 'noul') return null;
  return { pass: answer.noul >= 0.5, confidence: certainty(answer.noul) };
}

/** Pass when the probability of a score at or above `passLevel` is at least one half. */
export function scoreDecision(answer: Answer | undefined, passLevel: number): Decision | null {
  if (answer?.type !== 'score') return null;
  const atOrAbove = Object.entries(answer.probabilities)
    .filter(([level]) => Number(level) >= passLevel)
    .reduce((sum, [, p]) => sum + p, 0);
  const p = Math.min(1, atOrAbove);
  return { pass: p >= 0.5, confidence: certainty(p) };
}

export async function judgeGithub(
  ai: Ai,
  task: TaskVersion,
  commits: readonly CommitEvidence[],
): Promise<Decision | null> {
  const res = await ai.judge(githubState(task, commits), githubQuestions);
  return res.ok ? noulDecision(res.value.done) : null;
}

export async function judgeReading(
  ai: Ai,
  task: TaskVersion,
  logs: readonly ReadingLog[],
): Promise<Decision | null> {
  const res = await ai.judge(readingState(task, logs), readingQuestions);
  return res.ok ? scoreDecision(res.value.substance, READING_PASS_LEVEL) : null;
}
```

- [ ] **Step 4: Implement the run and settlement**

`apps/api/src/verification/run.ts`:

```ts
import {
  allPassed,
  dayKeyFor,
  DEFAULT_RULES,
  earn,
  requiredTasks,
  resolveDecision,
  sumKind,
  type Decision,
  type EarnRequest,
  type LedgerEvent,
  type Plan,
  type RequiredTask,
  type Verdict,
} from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import type { StoredVerdict } from '../ports';
import { collectGithub, type CollectStatus } from './github';
import { judgeGithub, judgeReading } from './judge';

export type VerificationRun = Readonly<{ day: string; github: CollectStatus; judged: number }>;

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** The owner's current day: the newest device's offset and the 04:00 boundary. */
export async function ownerDay(deps: Deps): Promise<{ day: string; offset: number }> {
  const offset = (await deps.repos.devices.latestOffset()) ?? 0;
  return { day: dayKeyFor(deps.now(), offset, DEFAULT_RULES.dayBoundaryHour), offset };
}

export async function requiredFor(deps: Deps, plan: Plan): Promise<RequiredTask[]> {
  const [entry, roadmap] = await Promise.all([
    deps.repos.days.entry(plan.day),
    deps.repos.roadmap.get(),
  ]);
  const rest = new Map<string, number>();
  for (const s of roadmap.skills) if (s.restWeekday !== undefined) rest.set(s.id, s.restWeekday);
  return requiredTasks(plan, entry?.record, rest);
}

/** Without automatic decisions every judge verdict waits for the owner, carrying its suggestion. */
export function gate(
  verdict: Verdict,
  decision: Decision,
  day: string,
  autoDecide: boolean,
): StoredVerdict {
  const suggestion = decision.pass ? 'pass' : 'fail';
  if (verdict.outcome === 'pending' || !autoDecide)
    return { ...verdict, day, outcome: 'pending', suggestion };
  return { ...verdict, day };
}

/** Pays each passed task's reward, then the all-done bonus. Idempotent through core and the ledger. */
export async function settle(
  deps: Deps,
  plan: Plan,
  required: readonly RequiredTask[],
): Promise<void> {
  const { ledger, verification } = deps.repos;
  const now = deps.now();
  const verdicts = await verification.verdictsForDay(plan.day);
  let events: LedgerEvent[] = await ledger.forDay(plan.day);
  let { outstandingBorrow } = await ledger.totals();
  const ctx = { day: plan.day, at: now, newId: deps.newId };

  const pay = async (req: EarnRequest): Promise<void> => {
    const earned = earn(events, req, ctx, DEFAULT_RULES, {
      planLocked: plan.status === 'locked',
      outstandingBorrow,
    });
    if (!earned.ok) return;
    await appendEvents(ledger, earned.value, null, now);
    events = [...events, ...earned.value];
    outstandingBorrow = Math.max(0, outstandingBorrow + sumKind(earned.value, 'borrow_repay'));
  };

  const passed = new Set(verdicts.filter((v) => v.outcome === 'pass').map((v) => v.taskId));
  for (const r of required) {
    if (passed.has(r.taskId))
      await pay({ kind: 'task_reward', taskId: r.taskId, seconds: r.version.seconds });
  }
  if (allPassed(required, verdicts)) await pay({ kind: 'all_done_bonus' });
}

/** Collect evidence, judge what changed, pay what passed. Safe to run any number of times. */
export async function runVerification(deps: Deps): Promise<VerificationRun> {
  const { day, offset } = await ownerDay(deps);
  const github = await collectGithub(deps, offset);
  const plan = await deps.repos.plans.get(day);
  if (plan === null || plan.status !== 'locked') return { day, github, judged: 0 };

  const store = deps.repos.verification;
  const required = await requiredFor(deps, plan);
  const [verdicts, commits, logs] = await Promise.all([
    store.verdictsForDay(day),
    store.commitsForDay(day),
    store.readingForDay(day),
  ]);

  let judged = 0;
  for (const r of required) {
    const task = plan.tasks.find((t) => t.id === r.taskId);
    if (task === undefined || (task.verifier !== 'github' && task.verifier !== 'reading')) continue;
    const previous = verdicts.find((v) => v.taskId === r.taskId);
    if (previous?.outcome === 'pass') continue;
    const ids = task.verifier === 'github' ? commits.map((c) => c.sha) : logs.map((l) => l.id);
    if (ids.length === 0) continue;
    if (previous !== undefined && sameIds(previous.evidenceIds, ids)) continue;

    const decision =
      task.verifier === 'github'
        ? await judgeGithub(deps.ai, r.version, commits)
        : await judgeReading(deps.ai, r.version, logs);
    if (decision === null) continue; // AI unavailable: no verdict, the next run tries again
    const resolved = resolveDecision(r.taskId, ids, decision, 'judge', DEFAULT_RULES);
    await store.saveVerdict(
      gate(resolved, decision, day, deps.settings.judgeAutoDecide),
      deps.now(),
    );
    judged += 1;
  }

  await settle(deps, plan, required);
  return { day, github, judged };
}
```

`apps/api/src/routes/verify.ts`:

```ts
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { runVerification } from '../verification/run';

export const verifyRoutes = new Hono<AppEnv>().post('/verify', async (c) => {
  const { deps } = c.var;
  const run = await runVerification(deps);
  return ok(c, { ...run, verdicts: await deps.repos.verification.verdictsForDay(run.day) });
});
```

Register `authed.route('/', verifyRoutes);` in `app.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): judge GitHub and reading tasks, store verdicts and pay rewards"
```

---

### Task 7: `POST /v1/verdicts/:taskId` (owner and phone decisions) and verdicts in `/today`

**Files:**

- Modify: `apps/api/src/routes/verify.ts`, `apps/api/src/http/envelope.ts`
- Create: `apps/api/test/verdicts.test.ts`

**Interfaces:**

- Consumes: `requiredFor`, `settle`, `ownerDay` (Task 6); `VerdictRequestSchema` (Task 2).
- Produces: `POST /v1/verdicts/:taskId` with `{ day, outcome }` → the stored verdict. It requires:
  - `day` = the device's today (else 422 `day_out_of_range`)
  - a locked plan (else 422 `plan_not_locked`)
  - the task to be required today (else 404)
- Who decides:
  - Math and usage tasks: `by: 'code'` (the phone computes them), unless the task already passed (409 `verdict_not_pending`).
  - GitHub and reading tasks: `by: 'owner'`, only when a `pending` verdict exists (else 409 `verdict_not_pending`).
  - After saving, `settle` runs.
- Produces (errors): `plan_not_locked` (422) and `verdict_not_pending` (409).

- [ ] **Step 1: Write the failing test**

`apps/api/test/verdicts.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import type { LedgerEvent, TaskSpec } from '@mflow/core';
import { describe, expect, it } from 'vitest';
import { geminiJudgeReply, githubFake } from './github-fake';
import { call, makeApp, pairDevice, taskSpec, type App } from './helpers';

const TOKEN = 'github_pat_' + 'x'.repeat(40);
const KEYS = { GEMINI_API_KEY: 'g-key' };

async function setup(lock = true) {
  const other: FetchLike = async () => geminiJudgeReply({ done: { yes: 0.9 } });
  const fake = githubFake({ commits: [{ sha: 'a1', date: '2026-10-09T10:00:00Z' }], other });
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/github/link', {
    token,
    body: { token: TOKEN, repos: ['bahir/mflow'] },
  });
  const tasks: TaskSpec[] = [
    taskSpec('Fix the bug'),
    taskSpec('10 problems', 'math'),
    taskSpec('Phone under 1h', 'usage'),
  ];
  await call(app, 'PUT', '/v1/plans/2026-10-09', { token, body: { tasks } });
  if (lock) await call(app, 'POST', '/v1/plans/2026-10-09/lock', { token });
  const decide = (task: TaskSpec | undefined, outcome: 'pass' | 'fail', day = '2026-10-09') =>
    call<{ outcome: string; by: string }>(app, 'POST', `/v1/verdicts/${task?.id}`, {
      token,
      body: { day, outcome },
    });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { app, token, tasks, decide, ledger };
}

describe('POST /v1/verdicts/:taskId', () => {
  it('lets the phone pass math and usage tasks, and pays the all-done bonus when everything passed', async () => {
    const { app, token, tasks, decide, ledger } = await setup();
    await call(app, 'POST', '/v1/verify', { token, env: KEYS }); // GitHub task: pending (suggestion pass)

    const math = await decide(tasks[1], 'pass');
    await decide(tasks[2], 'pass');
    const github = await decide(tasks[0], 'pass'); // the owner confirms the pending judge verdict

    expect([math.body.data.by, github.body.data.by]).toEqual(['code', 'owner']);
    const earned = (await ledger()).filter(
      (e) => e.kind === 'task_reward' || e.kind === 'all_done_bonus',
    );
    expect(earned.map((e) => e.kind).sort()).toEqual([
      'all_done_bonus',
      'task_reward',
      'task_reward',
      'task_reward',
    ]);
    const today = await call<{ verdicts: { outcome: string }[] }>(app, 'GET', '/v1/today', {
      token,
    });
    expect(today.body.data.verdicts.map((v) => v.outcome)).toEqual(['pass', 'pass', 'pass']);
  });

  it('refuses to self-pass a GitHub task the judge has not seen', async () => {
    const { tasks, decide } = await setup();
    const reply = await decide(tasks[0], 'pass');
    expect([reply.status, reply.body.error?.code]).toEqual([409, 'verdict_not_pending']);
  });

  it('a pass is final', async () => {
    const { tasks, decide } = await setup();
    await decide(tasks[1], 'pass');
    const again = await decide(tasks[1], 'fail');
    expect([again.status, again.body.error?.code]).toEqual([409, 'verdict_not_pending']);
  });

  it('refuses an unknown task and another day', async () => {
    const { tasks, decide } = await setup();
    const unknown = await decide(taskSpec(), 'pass');
    const otherDay = await decide(tasks[1], 'pass', '2026-10-10');
    expect([unknown.status, otherDay.status]).toEqual([404, 422]);
  });

  it('refuses before the plan is locked', async () => {
    const { tasks, decide } = await setup(false);
    const reply = await decide(tasks[1], 'pass');
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'plan_not_locked']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/verdicts.test.ts`
Expected: FAIL. `/v1/verdicts/...` isn't a route (404 envelopes).

- [ ] **Step 3: Implement**

Add to `ERRORS` in `envelope.ts`: `verdict_not_pending: [409, 'Only a pending verdict can be decided by hand.'],` (with the 409s) and `plan_not_locked: [422, 'Lock the plan first.'],` (with the 422s).

Add to `apps/api/src/routes/verify.ts`:

```ts
import { VerdictRequestSchema } from '@mflow/contracts';
import { z } from 'zod';
import { deviceToday } from '../http/day';
import { fail } from '../http/envelope';
import { valid } from '../http/validate';
import { requiredFor, settle } from '../verification/run';

const TaskParam = z.object({ taskId: z.string().min(1).max(64) });
/** Verifiers the phone computes itself; GitHub and reading go through the judge first. */
const PHONE_VERIFIED = new Set(['math', 'usage']);
```

and chain on `verifyRoutes`:

```ts
  .post('/verdicts/:taskId', valid('param', TaskParam), valid('json', VerdictRequestSchema), async (c) => {
    const { deps, device } = c.var;
    const { taskId } = c.req.valid('param');
    const { day, outcome } = c.req.valid('json');
    if (day !== deviceToday(device, deps.now())) return fail(c, 'day_out_of_range');

    const plan = await deps.repos.plans.get(day);
    if (plan === null || plan.status !== 'locked') return fail(c, 'plan_not_locked');
    const required = await requiredFor(deps, plan);
    const task = plan.tasks.find((t) => t.id === taskId);
    if (task === undefined || !required.some((r) => r.taskId === taskId)) return fail(c, 'not_found');

    const previous = (await deps.repos.verification.verdictsForDay(day)).find((v) => v.taskId === taskId);
    const byPhone = PHONE_VERIFIED.has(task.verifier);
    if (previous?.outcome === 'pass' || (!byPhone && previous?.outcome !== 'pending')) {
      return fail(c, 'verdict_not_pending');
    }
    const verdict = {
      day,
      taskId,
      outcome,
      confidence: 1,
      by: byPhone ? ('code' as const) : ('owner' as const),
      evidenceIds: previous?.evidenceIds ?? [],
    };
    await deps.repos.verification.saveVerdict(verdict, deps.now());
    await settle(deps, plan, required);
    return ok(c, verdict);
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): owner and phone verdicts, all-done bonus, verdicts in today"
```

---

### Task 8: The hourly cron

**Files:**

- Create: `apps/api/src/scheduled.ts`, `apps/api/test/scheduled.test.ts`
- Modify: `apps/api/src/index.ts`, `apps/api/wrangler.jsonc` (`triggers.crons`), `apps/api/worker-configuration.d.ts` (regenerated)

**Interfaces:**

- Consumes: `makeDeps` (Task 4), `runVerification` (Task 6).
- Produces: `runScheduled(env, options?): Promise<VerificationRun>`, which logs one line `{ level: 'info', event: 'verification_run', day, github, judged }`. The Worker export gains `scheduled(controller, env, ctx)`, which calls `ctx.waitUntil(runScheduled(env))`. Cron: `"0 * * * *"` (1 of 5 free triggers).

- [ ] **Step 1: Write the failing test**

`apps/api/test/scheduled.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
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
      body: { token: 'github_pat_' + 'x'.repeat(40), repos: ['bahir/mflow'] },
    });
    const tasks = [taskSpec('Private task title'), taskSpec(), taskSpec()];
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/scheduled.test.ts`
Expected: FAIL. `../src/scheduled` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/scheduled.ts`:

```ts
import { makeDeps, type AppOptions } from './app';
import type { Bindings } from './env';
import { runVerification, type VerificationRun } from './verification/run';

/** The hourly tick (spec §11): collect GitHub evidence, judge, pay. Logs counts only. */
export async function runScheduled(
  env: Bindings,
  options: AppOptions = {},
): Promise<VerificationRun> {
  const run = await runVerification(makeDeps(env, options));
  console.log(JSON.stringify({ level: 'info', event: 'verification_run', ...run }));
  return run;
}
```

`apps/api/src/index.ts`:

```ts
import { createApp } from './app';
import type { Bindings } from './env';
import { runScheduled } from './scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Bindings>;
```

Add to `apps/api/wrangler.jsonc` (top level): `"triggers": { "crons": ["0 * * * *"] },`. Then run `bun run --cwd apps/api types`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): hourly cron runs verification"
```

---

### Task 9: ADR 0008, README and the full gate

**Files:**

- Create: `docs/adr/0008-verification.md`
- Modify: `README.md` (deploy steps: `GITHUB_TOKEN_KEY`; the verification overview)

- [ ] **Step 1: Write ADR 0008**

`docs/adr/0008-verification.md`:

```markdown
# 0008. Verification: evidence, judge, owner confirmation, rewards

- Status: accepted
- Date: 2026-10-12

## Context

mflow pays phone time for verified work. GitHub and reading tasks need judgment; math and phone
usage are computed by the phone. The owner benefits from every "pass", so the judge must not be
easy to fool, and nothing may be silently passed or failed (spec §6.3, §13.1).

## Decision

- **GitHub link:** a fine-grained, read-only token (Contents + Metadata), checked with `GET /user`
  and each repository, sealed with AES-256-GCM (random IV, `v1.` format) under `GITHUB_TOKEN_KEY`
  (Worker secret), opened only during a run. A 401 marks the link `invalid`; runs then stop calling
  GitHub until the owner relinks.
- **Evidence:** the owner's commits per repository from a cursor (one day back at link time),
  stored once per SHA with its day on the owner's clock. At most 20 commit details per run (the
  free plan allows 50 subrequests per invocation); the rest come next hour. Patches are cut to
  1,500 characters, 15 files per commit, 40,000 patch characters per judge call (Jev: 32k tokens).
- **Judging:** GitHub tasks ask Jev's `noul` "do the commits complete the task?"; reading tasks ask
  a 0–5 `score`, passing on P(score ≥ 3). Confidence is max(p, 1 − p), and core `resolveDecision`
  turns anything under 0.75 into `pending`. Tasks are re-judged only when their evidence changes;
  AI down means no verdict, retried next run.
- **Owner confirmation first:** until the judge eval set (spec §14, with prompt-injection cases) is
  recorded, `JUDGE_AUTO_DECIDE` stays off and every judge verdict is `pending` with a `suggestion`.
  Only a pending GitHub/reading verdict can be decided by hand; math and usage verdicts come from
  the phone. A `pass` is final.
- **Rewards:** `settle` pays each passed task's reward and the all-done bonus through core `earn`
  as server events. It is idempotent, so the route, the owner's confirmation and the cron can all
  call it.
- **Cron:** hourly (`0 * * * *`, 1 of 5 free triggers), logging counts only.

## Consequences

- With auto-decide off, the owner taps "confirm" for judged tasks; the judge still does the work of
  reading diffs and summaries and says what it thinks.
- The phone is trusted for math and usage verdicts in v1 (single owner); server-side math checks
  are a product-version task.
- Only one page (100) of commits per repository per run is listed; days with more commits per repo
  are not expected for one owner.
```

- [ ] **Step 2: Update the README**

In the README's API deploy block, after `secret put SETUP_CODE`, add:

```bash
openssl rand -base64 32 | bun x wrangler secret put GITHUB_TOKEN_KEY --cwd apps/api
```

Append a short section:

```markdown
## Verification

The hourly cron (and `POST /v1/verify`) collects your commits on linked repositories, asks the
judge about GitHub and reading tasks, and pays rewards for passed tasks. Until the judge's accuracy
is measured, judge verdicts wait for your confirmation (`POST /v1/verdicts/:taskId`). See
`docs/adr/0008-verification.md`.
```

- [ ] **Step 3: Run the full gate**

Run: `bun run format:check && bun run lint && bun run typecheck && bun run coverage`
Expected: all clean, and coverage thresholds are met in every package.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0008-verification.md README.md
git commit -m "docs: ADR 0008 for verification and README updates"
```
