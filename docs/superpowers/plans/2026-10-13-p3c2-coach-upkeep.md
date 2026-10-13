# mflow P3c-2: coach, memory, nightly review, day rollover and guard gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the server side of the daily loop:

- **Day rollover:** expire yesterday's unused time and pay today's base grant at the boundary.
- **Heartbeat gap analysis:** tell "phone off" (not a miss) from "guard disabled" (a miss), and let the owner reclassify a phone-off day the next morning.
- **Coach chat:** the "future self" persona, with a distress guardrail.
- **Coach memory:** weekly summaries, with transcripts deleted after 30 days.
- **Nightly review and proposal:** at the reminder hour, review today and propose tomorrow's plan.

All of this runs on a second, half-hourly upkeep cron.

**Architecture:**

- **Pure core rules:** `analyzeBeats` (heartbeat gaps) and `expireFromBalances` are new in `@mflow/core`.
- **Upkeep steps in the API (`src/upkeep/*`):** `rollover`, `analyzeGuard`, `runNightly` and `runWeekly`. Each step is idempotent: semantic keys for ledger events, unique rows per day or week, and cursors for heartbeats.
- **Coach (`src/coach/*`):** builds a persona prompt from the owner's own roadmap words. It sends minimal context (the latest weekly summary, today's tasks and outcomes, and the last 10 messages), never the full history.

**Tech Stack:** Hono, D1, `@mflow/ai` (talk), `@mflow/core`, Vitest 5 with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-10-08-mflow-v1-design.md` (§6.1–6.5, §8 budget, §9.2–9.3, §11 cron, §13).

**Scope (ruled here):** AI word problems and `GET /math/bank` (spec §10.8) move to **P3c-3**. The CAS has to re-solve every AI problem, and whether math-engine's CAS fits the free Worker's 10 ms CPU limit needs its own spike. Reclassifying a phone-off day as **away** is deferred too: away needs location verification, which can't happen for a past day. **Bad** is supported.

## Global Constraints

- Bun (`bun x`, never `bunx`/`npx`/pnpm), TypeScript `^6`, Vitest `^5.0.3`, ESM, strict.
- **Two cron triggers:**
  - `0 * * * *`: verification (P3c-1, unchanged)
  - `30 * * * *`: upkeep (rollover → guard gaps → nightly → weekly)

  They're separate invocations, so each has its own free-plan budget: 50 D1 queries and 50 subrequests.

- The owner's clock is the newest device's offset with the 04:00 boundary (`ownerDay`, P3c-1).
- **Nightly window:** local time 21:00 (`nightlyReminderHour`) to 03:59, once per day (`nightly_runs`). The review always arrives: if the AI is unavailable, a deterministic template writes it.
- **Gap rule:** a silence longer than 2 × `heartbeatSeconds` (30 min) is a gap. The gap is `phone_off` when the next beat shows a new `bootId` or an uptime shorter than the silence; otherwise it's `guard_disabled`. A beat with `guardEnabled: false` makes the time until the next beat `guard_disabled`.
- **Coach:**
  - Chat is `flourish` (cut at 80% of the budget); the nightly review and the weekly summary are `essential`.
  - Prompts carry roadmap identities, today's task titles and outcomes, the earned and spent minutes, the latest weekly summary and the last 10 messages from the past 7 days. Never location, tokens or device data.
  - The distress guardrail is in every coach system prompt.
- **Retention:** chat messages older than 30 days are deleted once their ISO week has a summary. Any message older than 60 days is deleted regardless (privacy wins over memory).
- **Logs:** counts and categories only. Never message text, summaries or task titles.
- `apps/api` coverage: lines, functions and statements ≥ 90, branches ≥ 85. An upkeep budget test pins a busy 21:30 Monday tick at ≤ 32 D1 statements.
- Commits use the conventional format under the owner's identity. **No AI attribution.** `learning/` is never committed.

## Review Focus

1. **The phone was off from 22:00 to 08:00 (reboot), then the guard was switched off for 2 hours.** Expected: two gaps, `phone_off` then `guard_disabled`. Only the second is a miss. A late beat (under 30 min) is no gap. Pinned in Task 1.
2. **The upkeep runs every half hour.** Expected: `expire` and `base_grant` are written once per day (semantic keys), the nightly review once per day, and the weekly summary once per week. Re-running is harmless. Pinned in Tasks 3, 6 and 7.
3. **The AI is unavailable at 21:00.** Expected: the review still arrives (template), tomorrow's plan is still proposed (template), and coach chat answers 503 so the phone can retry without duplicating the owner's message. Pinned in Tasks 5 and 6.
4. **A coach message suggesting genuine distress.** Expected: the guardrail instruction is present in every coach prompt, and the persona never overrides it. Pinned in Task 5.
5. **Expiry after a bad spend day.** Expected: yesterday's leftover expires only down to the running balance (it pays debt first), and rewards paid for yesterday inside the grace window after expiry stay usable. Pinned in Task 3.

---

## File Structure

```
packages/core/src/guard.ts            analyzeBeats, overlapMs (+ test/guard.test.ts)
packages/core/src/spending.ts         expireFromBalances (expireDay delegates)
packages/contracts/src/coach.ts       CoachMessageRequestSchema, CoachMessageSchema, CoachPageSchema, GuardDaySchema
apps/api/
├─ migrations/0004_coach_upkeep.sql   coach_messages, coach_summaries, nightly_runs, guard_gaps, guard_cursor
├─ src/adapters/d1/coach.ts  upkeep.ts
├─ src/ledger/base-grant.ts           grantBase (shared by /today and rollover)
├─ src/coach/persona.ts               coachSystem, distress guardrail, context prompt
├─ src/upkeep/rollover.ts  guard.ts  nightly.ts  weekly.ts  run.ts
├─ src/routes/coach.ts  guard.ts
└─ test/guard-gaps.test.ts  rollover.test.ts  coach.test.ts  nightly.test.ts  weekly.test.ts  upkeep.test.ts
docs/adr/0009-coach-and-upkeep.md
```

---

### Task 1: Core rules for heartbeat gaps and expiry from balances

**Files:**

- Create: `packages/core/src/guard.ts`, `packages/core/test/guard.test.ts`
- Modify: `packages/core/src/spending.ts`, `packages/core/src/index.ts`, `packages/core/test/spending.test.ts`

**Interfaces:**

- Produces: `Beat = { at: number; bootId: string; uptimeSeconds: number; guardEnabled: boolean }`, `GuardGapKind = 'phone_off' | 'guard_disabled'`, `GuardGap = { kind; from: number; to: number }`, `GAP_FACTOR = 2`.
- Produces: `analyzeBeats(beats, rules): GuardGap[]`. Beats are sorted by `at` internally, and adjacent gaps of the same kind are merged.
- Produces: `overlapMs(gaps, kind, from, to): number`.
- Produces: `expireFromBalances(dayBalance: number, runningBalance: number, ctx): LedgerEvent | null`. `expireDay` now delegates to it.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyzeBeats, overlapMs, type Beat } from '../src/guard';
import { DEFAULT_RULES } from '../src/rules';

const MIN = 60_000;
const beat = (minute: number, over: Partial<Beat> = {}): Beat => ({
  at: minute * MIN,
  bootId: 'boot-1',
  uptimeSeconds: minute * 60 + 3600,
  guardEnabled: true,
  ...over,
});

describe('analyzeBeats', () => {
  it('treats a late beat (under two intervals) as no gap', () => {
    expect(analyzeBeats([beat(0), beat(15), beat(44)], DEFAULT_RULES)).toEqual([]);
  });

  it('calls a silence that ends with a new boot "phone off"', () => {
    const gaps = analyzeBeats(
      [beat(0), beat(600, { bootId: 'boot-2', uptimeSeconds: 120 })],
      DEFAULT_RULES,
    );
    expect(gaps).toEqual([{ kind: 'phone_off', from: 0, to: 600 * MIN }]);
  });

  it('calls a silence that ends with an uptime shorter than the silence "phone off", even with the same boot id', () => {
    const gaps = analyzeBeats([beat(0), beat(120, { uptimeSeconds: 600 })], DEFAULT_RULES);
    expect(gaps).toEqual([{ kind: 'phone_off', from: 0, to: 120 * MIN }]);
  });

  it('calls a silence without a reboot "guard disabled"', () => {
    expect(analyzeBeats([beat(0), beat(120)], DEFAULT_RULES)).toEqual([
      { kind: 'guard_disabled', from: 0, to: 120 * MIN },
    ]);
  });

  it('counts time after a beat reporting the guard off as "guard disabled", merging neighbours', () => {
    const beats = [
      beat(0),
      beat(15, { guardEnabled: false }),
      beat(30, { guardEnabled: false }),
      beat(45),
      beat(60),
    ];
    expect(analyzeBeats(beats, DEFAULT_RULES)).toEqual([
      { kind: 'guard_disabled', from: 15 * MIN, to: 45 * MIN },
    ]);
  });

  it('phone off overnight, then the guard off for two hours: only the second is a miss', () => {
    const beats = [
      beat(0),
      beat(600, { bootId: 'boot-2', uptimeSeconds: 60 }),
      beat(615, { bootId: 'boot-2', uptimeSeconds: 960 }),
      beat(735, { bootId: 'boot-2', uptimeSeconds: 8160 }),
    ];
    expect(analyzeBeats([...beats].reverse(), DEFAULT_RULES)).toEqual([
      { kind: 'phone_off', from: 0, to: 600 * MIN },
      { kind: 'guard_disabled', from: 615 * MIN, to: 735 * MIN },
    ]);
  });
});

describe('overlapMs', () => {
  it('measures how much of a window a kind of gap covers', () => {
    const gaps = [
      { kind: 'phone_off' as const, from: 0, to: 100 },
      { kind: 'guard_disabled' as const, from: 100, to: 200 },
      { kind: 'phone_off' as const, from: 300, to: 400 },
    ];
    expect(overlapMs(gaps, 'phone_off', 50, 350)).toBe(100);
    expect(overlapMs(gaps, 'guard_disabled', 0, 1000)).toBe(100);
  });
});
```

Append to `packages/core/test/spending.test.ts` (add `expireFromBalances` to its import from `../src/spending`):

```ts
describe('expireFromBalances', () => {
  it('expires the smaller of the day leftover and the running balance', () => {
    expect(expireFromBalances(300, 1000, ctx())).toMatchObject({ kind: 'expire', seconds: -300 });
    expect(expireFromBalances(300, 100, ctx())).toMatchObject({ kind: 'expire', seconds: -100 });
  });

  it('expires nothing when either is zero or negative', () => {
    expect(expireFromBalances(0, 500, ctx())).toBeNull();
    expect(expireFromBalances(300, -50, ctx())).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd packages/core test`
Expected: FAIL. `../src/guard` can't be resolved and `expireFromBalances` isn't exported.

- [ ] **Step 3: Implement**

`packages/core/src/guard.ts`:

```ts
import type { Rules } from './rules';

export type Beat = Readonly<{
  at: number;
  bootId: string;
  uptimeSeconds: number;
  guardEnabled: boolean;
}>;
export type GuardGapKind = 'phone_off' | 'guard_disabled';
export type GuardGap = Readonly<{ kind: GuardGapKind; from: number; to: number }>;

/** A silence longer than this many heartbeat intervals is a gap; one late beat is not. */
export const GAP_FACTOR = 2;

const MS_PER_SECOND = 1_000;

/**
 * Spec §6.5. A gap that ends with a new boot (new boot id, or uptime shorter than the silence)
 * means the phone was off: not a miss. A gap without a reboot, or time after a beat that reported
 * the guard off, means the guard was disabled: a miss. Adjacent gaps of one kind are merged.
 */
export function analyzeBeats(beats: readonly Beat[], rules: Rules): GuardGap[] {
  const sorted = [...beats].sort((a, b) => a.at - b.at);
  const limit = GAP_FACTOR * rules.heartbeatSeconds * MS_PER_SECOND;
  const gaps: GuardGap[] = [];
  const push = (gap: GuardGap) => {
    const last = gaps.at(-1);
    if (last !== undefined && last.kind === gap.kind && last.to === gap.from) {
      gaps[gaps.length - 1] = { ...last, to: gap.to };
    } else {
      gaps.push(gap);
    }
  };
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a === undefined || b === undefined) continue;
    const silence = b.at - a.at;
    if (silence > limit) {
      const rebooted = b.bootId !== a.bootId || b.uptimeSeconds * MS_PER_SECOND < silence;
      push({ kind: rebooted ? 'phone_off' : 'guard_disabled', from: a.at, to: b.at });
    } else if (!a.guardEnabled) {
      push({ kind: 'guard_disabled', from: a.at, to: b.at });
    }
  }
  return gaps;
}

/** Milliseconds of [from, to) covered by gaps of `kind`. */
export function overlapMs(
  gaps: readonly GuardGap[],
  kind: GuardGapKind,
  from: number,
  to: number,
): number {
  return gaps
    .filter((g) => g.kind === kind)
    .reduce((sum, g) => sum + Math.max(0, Math.min(g.to, to) - Math.max(g.from, from)), 0);
}
```

In `packages/core/src/spending.ts`, replace `expireDay` with:

```ts
/** Unused time does not roll over, but it pays off older debt first. */
export function expireFromBalances(
  dayBalance: number,
  runningBalance: number,
  ctx: EventContext,
): LedgerEvent | null {
  const left = Math.min(dayBalance, runningBalance);
  if (left <= 0) return null;
  return { id: ctx.newId(), day: ctx.day, at: ctx.at, kind: 'expire', seconds: -left };
}

/** `history` is the full ledger through `ctx.day`; only `ctx.day`'s leftover can expire. */
export const expireDay = (history: readonly LedgerEvent[], ctx: EventContext): LedgerEvent | null =>
  expireFromBalances(balance(eventsForDay(history, ctx.day)), balance(history), ctx);
```

Add `export * from './guard';` to `packages/core/src/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/core test && bun run --cwd packages/core typecheck && bun run lint`
Expected: PASS; all earlier `expireDay` tests still pass.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write packages/core
git add packages/core
git commit -m "feat(core): heartbeat gap analysis and expiry from balances"
```

---

### Task 2: Contracts, migration 0004 and repositories

**Files:**

- Create: `packages/contracts/src/coach.ts`, `packages/contracts/test/coach.test.ts`, `apps/api/migrations/0004_coach_upkeep.sql`, `apps/api/src/adapters/d1/coach.ts`, `apps/api/src/adapters/d1/upkeep.ts`, `apps/api/test/coach-repo.test.ts`
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/ports.ts`, `apps/api/src/adapters/d1/index.ts`, `apps/api/src/adapters/d1/ledger.ts` (`balanceThrough`), `apps/api/src/adapters/d1/telemetry.ts` (`beatsFrom`, `mathSummary`)

**Interfaces:**

- Produces (contracts): `CoachMessageRequestSchema` (`{ id: uuid, text: 1–2000 trimmed }`), `CoachMessageSchema` (`{ id, role: 'owner' | 'coach', kind: 'chat' | 'review', text, day, replyTo?: string, createdAt }`), `CoachPageSchema` (`{ messages, next }`), `CoachQuerySchema` (`since`, `limit` ≤ 100), and `GuardDaySchema` (`{ day, phoneOffMinutes, guardDisabledMinutes, gaps: { kind, from, to }[] }`).
- Produces (ports, all on new repos):
  - `CoachMessage` (the contract shape)
  - `CoachRepo`:
    - `addOwnerMessage(m): Promise<boolean>` (false = already stored)
    - `replyTo(id): Promise<CoachMessage | null>`
    - `addCoachMessage(m)`
    - `page(since, limit)`
    - `recent(sinceDay, limit)` (newest last)
    - `latestSummary(): Promise<string | null>`
    - `hasSummary(week)`, `saveSummary(week, text, at)`
    - `messagesForWeek(week)`
    - `deleteOld(beforeDay, hardBeforeDay): Promise<number>`
  - `UpkeepRepo`:
    - `nightlyDone(day)`, `markNightly(day, at)`
    - `guardCursor(deviceId)`, `setGuardCursor(deviceId, seq)`
    - `addGaps(deviceId, gaps, dayOf, at)`, `gapsForDay(day)`
    - `devices(): Promise<string[]>` (unrevoked ids)
- Produces: `LedgerRepo.balanceThrough(day): Promise<number>`.
- Produces: `TelemetryRepo.beatsFrom(deviceId, seq, limit): Promise<{ seq; beat: Beat }[]>` (inclusive) and `TelemetryRepo.mathSummary(day): Promise<{ attempts; correct }>`.
- Produces: `Repos.coach` and `Repos.upkeep`.

- [ ] **Step 1: Write the failing tests**

`packages/contracts/test/coach.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CoachMessageRequestSchema, CoachQuerySchema } from '../src';

describe('coach contracts', () => {
  const id = '01920000-0000-7000-8000-000000000001';

  it('accepts a message and trims it', () => {
    expect(CoachMessageRequestSchema.parse({ id, text: '  hi  ' })).toEqual({ id, text: 'hi' });
  });

  it.each([
    ['blank text', { id, text: '   ' }],
    ['text over 2000 characters', { id, text: 'x'.repeat(2001) }],
    ['no client id', { text: 'hi' }],
  ])('rejects %s', (_label, value) => {
    expect(CoachMessageRequestSchema.safeParse(value).success).toBe(false);
  });

  it('pages at most 100 messages', () => {
    expect(CoachQuerySchema.parse({})).toEqual({ since: 0, limit: 50 });
    expect(CoachQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
```

`apps/api/test/coach-repo.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import type { CoachMessage } from '../src/ports';
import { T0 } from './helpers';

const owner = (id: string, day: string, text = 'hi'): CoachMessage => ({
  id,
  role: 'owner',
  kind: 'chat',
  text,
  day,
  createdAt: T0,
});

describe('coach repository', () => {
  it('stores an owner message once and links the reply', async () => {
    const repo = d1Repos(env.DB).coach;
    expect(await repo.addOwnerMessage(owner('m1', '2026-10-09'))).toBe(true);
    expect(await repo.addOwnerMessage(owner('m1', '2026-10-09', 'again'))).toBe(false);
    expect(await repo.replyTo('m1')).toBeNull();
    await repo.addCoachMessage({
      ...owner('r1', '2026-10-09', 'reply'),
      role: 'coach',
      replyTo: 'm1',
    });
    expect((await repo.replyTo('m1'))?.text).toBe('reply');
    const page = await repo.page(0, 10);
    expect(page.messages.map((m) => m.text)).toEqual(['hi', 'reply']);
  });

  it('returns recent messages oldest first and the latest summary', async () => {
    const repo = d1Repos(env.DB).coach;
    await repo.addOwnerMessage(owner('a', '2026-10-01', 'old'));
    await repo.addOwnerMessage(owner('b', '2026-10-08', 'new'));
    await repo.saveSummary('2026-W40', 'week 40', T0);
    await repo.saveSummary('2026-W41', 'week 41', T0);

    expect((await repo.recent('2026-10-02', 10)).map((m) => m.text)).toEqual(['new']);
    expect(await repo.latestSummary()).toBe('week 41');
    expect([await repo.hasSummary('2026-W40'), await repo.hasSummary('2026-W39')]).toEqual([
      true,
      false,
    ]);
    expect((await repo.messagesForWeek('2026-W40')).map((m) => m.text)).toEqual(['old']);
  });

  it('deletes old chat only when its week is summarized, and anything past the hard limit', async () => {
    const repo = d1Repos(env.DB).coach;
    await repo.addOwnerMessage(owner('summarized', '2026-08-31')); // 2026-W36
    await repo.addOwnerMessage(owner('unsummarized', '2026-09-01')); // also W36 → summarized below
    await repo.addOwnerMessage(owner('w35', '2026-08-28')); // 2026-W35, not summarized
    await repo.addOwnerMessage(owner('ancient', '2026-07-01')); // past the hard limit
    await repo.saveSummary('2026-W36', 's', T0);

    const deleted = await repo.deleteOld('2026-09-09', '2026-08-10');

    expect(deleted).toBe(3);
    expect((await repo.page(0, 10)).messages.map((m) => m.id)).toEqual(['w35']);
  });

  it('tracks nightly runs, guard cursors and gaps', async () => {
    const repo = d1Repos(env.DB).upkeep;
    expect(await repo.nightlyDone('2026-10-09')).toBe(false);
    await repo.markNightly('2026-10-09', T0);
    expect(await repo.nightlyDone('2026-10-09')).toBe(true);

    expect(await repo.guardCursor('d1')).toBe(0);
    await repo.setGuardCursor('d1', 7);
    expect(await repo.guardCursor('d1')).toBe(7);

    const gap = { kind: 'phone_off' as const, from: T0, to: T0 + 3_600_000 };
    await repo.addGaps('d1', [gap, gap], () => '2026-10-09', T0);
    expect(await repo.gapsForDay('2026-10-09')).toEqual([gap]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd packages/contracts test -- test/coach.test.ts; bun run --cwd apps/api test -- test/coach-repo.test.ts`
Expected: FAIL. The schemas aren't exported, and `repos.coach` and `repos.upkeep` don't exist.

- [ ] **Step 3: Implement the contracts and the migration**

`packages/contracts/src/coach.ts`:

```ts
import { z } from 'zod';
import { DayKeySchema } from './schemas';

export const CoachMessageRequestSchema = z.object({
  /** Client-generated (UUIDv7): a retried send finds its message and its reply. */
  id: z.uuid(),
  text: z.string().trim().min(1).max(2000),
});

export const CoachMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['owner', 'coach']),
  kind: z.enum(['chat', 'review']),
  text: z.string(),
  day: DayKeySchema,
  replyTo: z.string().optional(),
  createdAt: z.number().int(),
});

export const CoachQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CoachPageSchema = z.object({
  messages: z.array(CoachMessageSchema),
  next: z.number().int().nonnegative(),
});

export const GuardDaySchema = z.object({
  day: DayKeySchema,
  phoneOffMinutes: z.number().int().nonnegative(),
  guardDisabledMinutes: z.number().int().nonnegative(),
  gaps: z.array(
    z.object({ kind: z.enum(['phone_off', 'guard_disabled']), from: z.number(), to: z.number() }),
  ),
});

export type CoachMessage = z.infer<typeof CoachMessageSchema>;
```

Add `export * from './coach';` to `packages/contracts/src/index.ts`.

`apps/api/migrations/0004_coach_upkeep.sql`:

```sql
-- P3c-2: coach chat and memory, nightly runs, heartbeat gaps.

CREATE TABLE coach_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'coach')),
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'review')),
  text TEXT NOT NULL,
  day TEXT NOT NULL,
  week TEXT NOT NULL,
  reply_to TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX coach_messages_day ON coach_messages (day);
CREATE INDEX coach_messages_week ON coach_messages (week);

CREATE TABLE coach_summaries (
  week TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE nightly_runs (
  day TEXT PRIMARY KEY,
  done_at INTEGER NOT NULL
);

CREATE TABLE guard_cursor (
  device_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL
);

CREATE TABLE guard_gaps (
  device_id TEXT NOT NULL,
  from_at INTEGER NOT NULL,
  to_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('phone_off', 'guard_disabled')),
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, from_at)
);
CREATE INDEX guard_gaps_day ON guard_gaps (day);
```

- [ ] **Step 4: Implement the ports and adapters**

Append to `apps/api/src/ports.ts` (type imports: `CoachMessage` from `@mflow/contracts`; `Beat`, `GuardGap` from `@mflow/core`), and add `coach: CoachRepo; upkeep: UpkeepRepo;` to `Repos`:

```ts
export type { CoachMessage } from '@mflow/contracts';

export interface CoachRepo {
  /** False when a message with this id is already stored (a retried send). */
  addOwnerMessage(message: CoachMessage): Promise<boolean>;
  replyTo(ownerMessageId: string): Promise<CoachMessage | null>;
  addCoachMessage(message: CoachMessage): Promise<void>;
  page(since: number, limit: number): Promise<{ messages: CoachMessage[]; next: number }>;
  /** Messages on or after `sinceDay`, oldest first, at most `limit` (the newest ones). */
  recent(sinceDay: string, limit: number): Promise<CoachMessage[]>;
  latestSummary(): Promise<string | null>;
  hasSummary(week: string): Promise<boolean>;
  saveSummary(week: string, text: string, at: number): Promise<void>;
  messagesForWeek(week: string): Promise<CoachMessage[]>;
  /** Deletes messages before `beforeDay` whose week is summarized, and all before `hardBeforeDay`. */
  deleteOld(beforeDay: string, hardBeforeDay: string): Promise<number>;
}

export interface UpkeepRepo {
  nightlyDone(day: string): Promise<boolean>;
  markNightly(day: string, at: number): Promise<void>;
  devices(): Promise<string[]>;
  guardCursor(deviceId: string): Promise<number>;
  setGuardCursor(deviceId: string, seq: number): Promise<void>;
  addGaps(
    deviceId: string,
    gaps: readonly GuardGap[],
    dayOf: (at: number) => string,
    at: number,
  ): Promise<void>;
  gapsForDay(day: string): Promise<GuardGap[]>;
}
```

Add to `LedgerRepo`: `/** Sum of all events on or before `day`. */ balanceThrough(day: string): Promise<number>;`. Add to `TelemetryRepo`: `beatsFrom(deviceId: string, seq: number, limit: number): Promise<{ seq: number; beat: Beat }[]>;` and `mathSummary(day: string): Promise<{ attempts: number; correct: number }>;`.

In `apps/api/src/adapters/d1/ledger.ts`, add:

```ts
  async balanceThrough(day) {
    const row = await db
      .prepare('SELECT COALESCE(SUM(seconds), 0) AS balance FROM ledger_events WHERE day <= ?1')
      .bind(day)
      .first<{ balance: number }>();
    return row?.balance ?? 0;
  },
```

In `apps/api/src/adapters/d1/telemetry.ts`, add:

```ts
  async beatsFrom(deviceId, seq, limit) {
    const { results } = await db
      .prepare(
        `SELECT seq, at, boot_id, uptime_seconds, guard_enabled FROM heartbeats
         WHERE device_id = ?1 AND seq >= ?2 ORDER BY seq LIMIT ?3`,
      )
      .bind(deviceId, seq, limit)
      .all<{ seq: number; at: number; boot_id: string; uptime_seconds: number; guard_enabled: number }>();
    return results.map((r) => ({
      seq: r.seq,
      beat: { at: r.at, bootId: r.boot_id, uptimeSeconds: r.uptime_seconds, guardEnabled: r.guard_enabled === 1 },
    }));
  },

  async mathSummary(day) {
    const row = await db
      .prepare('SELECT count(*) AS attempts, COALESCE(SUM(correct), 0) AS correct FROM math_attempts WHERE day = ?1')
      .bind(day)
      .first<{ attempts: number; correct: number }>();
    return { attempts: row?.attempts ?? 0, correct: row?.correct ?? 0 };
  },
```

`apps/api/src/adapters/d1/coach.ts`:

```ts
import { isoWeekKey } from '@mflow/core';
import type { CoachMessage, CoachRepo } from '../../ports';

type Row = {
  seq: number;
  id: string;
  role: CoachMessage['role'];
  kind: CoachMessage['kind'];
  text: string;
  day: string;
  reply_to: string | null;
  created_at: number;
};

const COLUMNS = 'seq, id, role, kind, text, day, reply_to, created_at';

const toMessage = (r: Row): CoachMessage => ({
  id: r.id,
  role: r.role,
  kind: r.kind,
  text: r.text,
  day: r.day,
  ...(r.reply_to === null ? {} : { replyTo: r.reply_to }),
  createdAt: r.created_at,
});

export const d1Coach = (db: D1Database): CoachRepo => {
  const insert = (m: CoachMessage, orIgnore: boolean) =>
    db
      .prepare(
        `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO coach_messages
           (id, role, kind, text, day, week, reply_to, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(m.id, m.role, m.kind, m.text, m.day, isoWeekKey(m.day), m.replyTo ?? null, m.createdAt)
      .run();

  return {
    async addOwnerMessage(m) {
      return (await insert(m, true)).meta.changes === 1;
    },
    async replyTo(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE reply_to = ?1`)
        .bind(id)
        .first<Row>();
      return row === null ? null : toMessage(row);
    },
    async addCoachMessage(m) {
      await insert(m, true);
    },
    async page(since, limit) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
        .bind(since, limit)
        .all<Row>();
      return { messages: results.map(toMessage), next: results.at(-1)?.seq ?? since };
    },
    async recent(sinceDay, limit) {
      const { results } = await db
        .prepare(
          `SELECT ${COLUMNS} FROM (SELECT ${COLUMNS} FROM coach_messages WHERE day >= ?1
           ORDER BY seq DESC LIMIT ?2) ORDER BY seq`,
        )
        .bind(sinceDay, limit)
        .all<Row>();
      return results.map(toMessage);
    },
    async latestSummary() {
      const row = await db
        .prepare('SELECT text FROM coach_summaries ORDER BY week DESC LIMIT 1')
        .first<{ text: string }>();
      return row?.text ?? null;
    },
    async hasSummary(week) {
      return (
        (await db.prepare('SELECT 1 FROM coach_summaries WHERE week = ?1').bind(week).first()) !==
        null
      );
    },
    async saveSummary(week, text, at) {
      await db
        .prepare(
          `INSERT INTO coach_summaries (week, text, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (week) DO NOTHING`,
        )
        .bind(week, text, at)
        .run();
    },
    async messagesForWeek(week) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM coach_messages WHERE week = ?1 ORDER BY seq`)
        .bind(week)
        .all<Row>();
      return results.map(toMessage);
    },
    async deleteOld(beforeDay, hardBeforeDay) {
      const result = await db
        .prepare(
          `DELETE FROM coach_messages WHERE day < ?2
             OR (day < ?1 AND week IN (SELECT week FROM coach_summaries))`,
        )
        .bind(beforeDay, hardBeforeDay)
        .run();
      return result.meta.changes;
    },
  };
};
```

`apps/api/src/adapters/d1/upkeep.ts`:

```ts
import type { GuardGap } from '@mflow/core';
import type { UpkeepRepo } from '../../ports';

export const d1Upkeep = (db: D1Database): UpkeepRepo => ({
  async nightlyDone(day) {
    return (
      (await db.prepare('SELECT 1 FROM nightly_runs WHERE day = ?1').bind(day).first()) !== null
    );
  },
  async markNightly(day, at) {
    await db
      .prepare('INSERT OR IGNORE INTO nightly_runs (day, done_at) VALUES (?1, ?2)')
      .bind(day, at)
      .run();
  },
  async devices() {
    const { results } = await db
      .prepare('SELECT id FROM devices WHERE revoked_at IS NULL ORDER BY created_at')
      .all<{ id: string }>();
    return results.map((r) => r.id);
  },
  async guardCursor(deviceId) {
    const row = await db
      .prepare('SELECT seq FROM guard_cursor WHERE device_id = ?1')
      .bind(deviceId)
      .first<{ seq: number }>();
    return row?.seq ?? 0;
  },
  async setGuardCursor(deviceId, seq) {
    await db
      .prepare(
        `INSERT INTO guard_cursor (device_id, seq) VALUES (?1, ?2)
         ON CONFLICT (device_id) DO UPDATE SET seq = excluded.seq`,
      )
      .bind(deviceId, seq)
      .run();
  },
  async addGaps(deviceId, gaps, dayOf, at) {
    if (gaps.length === 0) return;
    const rows = gaps.map((g) => ({ ...g, day: dayOf(g.from) }));
    await db
      .prepare(
        `INSERT OR IGNORE INTO guard_gaps (device_id, from_at, to_at, kind, day, created_at)
         SELECT ?2, value->>'from', value->>'to', value->>'kind', value->>'day', ?3 FROM json_each(?1)`,
      )
      .bind(JSON.stringify(rows), deviceId, at)
      .run();
  },
  async gapsForDay(day) {
    const { results } = await db
      .prepare('SELECT kind, from_at, to_at FROM guard_gaps WHERE day = ?1 ORDER BY from_at')
      .bind(day)
      .all<{ kind: GuardGap['kind']; from_at: number; to_at: number }>();
    return results.map((r) => ({ kind: r.kind, from: r.from_at, to: r.to_at }));
  },
});
```

Add `coach: d1Coach(db)` and `upkeep: d1Upkeep(db)` to `d1Repos`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd packages/contracts test && bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bun x prettier --write packages/contracts apps/api
git add packages/contracts apps/api
git commit -m "feat(api): storage for coach messages, summaries, nightly runs and guard gaps"
```

---

### Task 3: Day rollover (`expire` yesterday, `base_grant` today)

**Files:**

- Create: `apps/api/src/ledger/base-grant.ts`, `apps/api/src/upkeep/rollover.ts`, `apps/api/test/rollover.test.ts`
- Modify: `apps/api/src/routes/today.ts` (use `grantBase`)

**Interfaces:**

- Consumes: `expireFromBalances`, `earn`, `addDays` (core); `ownerDay` (P3c-1); `LedgerRepo.balanceThrough` (Task 2); `appendEvents`.
- Produces:
  - `grantBase(deps, day, dayEvents, outstandingBorrow): Promise<LedgerEvent[]>` returns the events written.
  - `rollover(deps): Promise<{ expiredSeconds: number; granted: boolean } | null>`, which is `null` before any device is paired.
- Rule: it expires yesterday's leftover once (the `expire` business key) and pays today's base grant once. It is safe every half hour.

- [ ] **Step 1: Write the failing test**

`apps/api/test/rollover.test.ts`:

```ts
import type { LedgerEvent } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { rollover } from '../src/upkeep/rollover';
import { call, event, makeApp, pairDevice, type Clock } from './helpers';

async function setup(events: LedgerEvent[]) {
  const clock: Clock = { now: Date.UTC(2026, 9, 10, 4, 30) }; // the 10th, just after the boundary
  const app = makeApp(clock);
  const { token } = await pairDevice(app);
  if (events.length > 0) await call(app, 'POST', '/v1/ledger/events', { token, body: { events } });
  const deps = makeDeps(env, { now: () => clock.now });
  const ledger = async () =>
    (await call<{ events: LedgerEvent[] }>(app, 'GET', '/v1/ledger', { token })).body.data.events;
  return { deps, ledger, clock };
}

describe('rollover', () => {
  it("expires yesterday's leftover and pays today's base grant, once", async () => {
    const yesterday = '2026-10-09';
    const { deps, ledger } = await setup([
      event({ kind: 'base_grant', seconds: 900, day: yesterday, at: Date.UTC(2026, 9, 9, 8) }),
      event({ kind: 'usage_spend', seconds: -300, day: yesterday, at: Date.UTC(2026, 9, 9, 9) }),
    ]);

    expect(await rollover(deps)).toEqual({ expiredSeconds: 600, granted: true });
    expect(await rollover(deps)).toEqual({ expiredSeconds: 0, granted: false });

    const kinds = (await ledger()).map((e) => [e.kind, e.day, e.seconds]);
    expect(kinds).toContainEqual(['expire', yesterday, -600]);
    expect(kinds).toContainEqual(['base_grant', '2026-10-10', 900]);
    expect(kinds.filter(([k]) => k === 'expire')).toHaveLength(1);
  });

  it('lets unused time pay off earlier debt instead of expiring', async () => {
    const { deps } = await setup([
      event({
        kind: 'usage_spend',
        seconds: -1200,
        day: '2026-10-08',
        at: Date.UTC(2026, 9, 8, 9),
      }),
      event({ kind: 'base_grant', seconds: 900, day: '2026-10-09', at: Date.UTC(2026, 9, 9, 8) }),
    ]);
    expect((await rollover(deps))?.expiredSeconds).toBe(0); // running balance −300: nothing to expire
  });

  it('does nothing before a device is paired', async () => {
    expect(await rollover(makeDeps(env, { now: () => Date.UTC(2026, 9, 10, 5) }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/rollover.test.ts`
Expected: FAIL. `../src/upkeep/rollover` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/ledger/base-grant.ts`:

```ts
import { DEFAULT_RULES, earn, type LedgerEvent } from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from './append';

/** "Paid at the day boundary, or on the first sync of the day" (spec §6.3); returns what was written. */
export async function grantBase(
  deps: Deps,
  day: string,
  dayEvents: readonly LedgerEvent[],
  outstandingBorrow: number,
): Promise<LedgerEvent[]> {
  const now = deps.now();
  const grant = earn(
    dayEvents,
    { kind: 'base_grant' },
    { day, at: now, newId: deps.newId },
    DEFAULT_RULES,
    {
      planLocked: false,
      outstandingBorrow,
    },
  );
  if (!grant.ok) return [];
  const written = await appendEvents(deps.repos.ledger, grant.value, null, now);
  return grant.value.filter((e) => written.includes(e.id));
}
```

In `apps/api/src/routes/today.ts`, replace the inline `earn`/`appendEvents` block with:

```ts
const paid = await grantBase(deps, day, dayEvents, totals.outstandingBorrow);
```

(import `grantBase`; remove the unused `earn`/`DEFAULT_RULES`/`appendEvents` imports.)

`apps/api/src/upkeep/rollover.ts`:

```ts
import { addDays, expireFromBalances } from '@mflow/core';
import type { Deps } from '../env';
import { appendEvents } from '../ledger/append';
import { grantBase } from '../ledger/base-grant';
import { ownerDay } from '../verification/run';

/**
 * At the boundary: yesterday's unused time expires (after paying older debt, core rule), and today's
 * base grant is paid. Both are once per day by business key, so every upkeep tick may call this.
 * Rewards paid for yesterday later, inside the grace window, are not expired: earned time stays usable.
 */
export async function rollover(
  deps: Deps,
): Promise<{ expiredSeconds: number; granted: boolean } | null> {
  if ((await deps.repos.devices.latestOffset()) === null) return null;
  const { day } = await ownerDay(deps);
  const yesterday = addDays(day, -1);
  const { ledger } = deps.repos;
  const now = deps.now();

  const [yesterdayEvents, running] = await Promise.all([
    ledger.forDay(yesterday),
    ledger.balanceThrough(yesterday),
  ]);
  const dayBalance = yesterdayEvents.reduce((sum, e) => sum + e.seconds, 0);
  const alreadyExpired = yesterdayEvents.some((e) => e.kind === 'expire');
  const expire = alreadyExpired
    ? null
    : expireFromBalances(dayBalance, running, { day: yesterday, at: now, newId: deps.newId });
  const expired = expire === null ? [] : await appendEvents(ledger, [expire], null, now);

  const [todayEvents, totals] = await Promise.all([ledger.forDay(day), ledger.totals()]);
  const granted = await grantBase(deps, day, todayEvents, totals.outstandingBorrow);
  return {
    expiredSeconds: expire !== null && expired.includes(expire.id) ? -expire.seconds : 0,
    granted: granted.length > 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS (the `/today` tests are unchanged and still green).

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): day rollover expires yesterday and pays today's base grant"
```

---

### Task 4: Guard gaps from heartbeats, `GET /v1/guard/:day`, and the phone-off bad-day reclassification

**Files:**

- Create: `apps/api/src/upkeep/guard.ts`, `apps/api/src/routes/guard.ts`, `apps/api/test/guard-gaps.test.ts`
- Modify: `apps/api/src/routes/day-types.ts` (yesterday allowed after a phone-off day), `apps/api/src/app.ts`

**Interfaces:**

- Consumes: `analyzeBeats`, `overlapMs`, `dayKeyFor`, `parseDayKey`, `DEFAULT_RULES` (core); `UpkeepRepo`, `TelemetryRepo.beatsFrom` (Task 2); `openDays` (P3c-1).
- Produces: `MAX_BEATS_PER_RUN = 500` and `analyzeGuard(deps): Promise<number>` (gaps stored). For each device, it reads beats from its cursor **inclusive** (so the silence that spans the previous run is seen), stores the gaps, and moves the cursor to the last seq.
- Produces: `dayWindow(day, offset): { from: number; to: number }` (the day's [04:00, next 04:00) in UTC ms) and `guardDay(deps, day, offset): Promise<GuardDay>`.
- Produces: `PHONE_OFF_RECLASSIFY_HOURS = 16`.
- Routes:
  - `GET /v1/guard/:day` → `GuardDay`.
  - `POST /v1/day-type` now also accepts **yesterday** inside the grace window when phone-off gaps cover ≥ 16 h of it.

- [ ] **Step 1: Write the failing test**

`apps/api/test/guard-gaps.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { analyzeGuard } from '../src/upkeep/guard';
import { call, makeApp, pairDevice, type App, type Clock } from './helpers';

const H = 3_600_000;
const DAY9 = Date.UTC(2026, 9, 9, 4); // the 9th's day starts at 04:00 UTC (offset 0)

async function setup() {
  const clock: Clock = { now: DAY9 };
  const app: App = makeApp(clock);
  const { token } = await pairDevice(app);
  const beat = async (
    at: number,
    bootId = 'boot-1',
    uptimeSeconds = 99_999,
    guardEnabled = true,
  ) => {
    clock.now = at;
    await call(app, 'POST', '/v1/heartbeat', {
      token,
      body: { at, bootId, uptimeSeconds, utcOffsetMinutes: 0, guardEnabled },
    });
  };
  const analyze = () => analyzeGuard(makeDeps(env, { now: () => clock.now }));
  return { app, token, clock, beat, analyze };
}

describe('guard gaps', () => {
  it('stores a reboot gap as phone off and a silent gap as guard disabled, across runs', async () => {
    const { app, token, beat, analyze } = await setup();
    await beat(DAY9);
    await analyze(); // cursor now at the first beat
    await beat(DAY9 + 10 * H, 'boot-2', 60); // phone off for 10 h
    await beat(DAY9 + 10.25 * H, 'boot-2', 960);
    await beat(DAY9 + 12.25 * H, 'boot-2', 8160); // 2 h silence, no reboot
    expect(await analyze()).toBe(2);
    expect(await analyze()).toBe(0);

    const day = await call<{ phoneOffMinutes: number; guardDisabledMinutes: number }>(
      app,
      'GET',
      '/v1/guard/2026-10-09',
      { token },
    );
    expect([day.body.data.phoneOffMinutes, day.body.data.guardDisabledMinutes]).toEqual([600, 120]);
  });

  it('lets the owner reclassify yesterday as a bad day after a day with the phone off', async () => {
    const { app, token, clock, beat, analyze } = await setup();
    await beat(DAY9);
    await beat(DAY9 + 20 * H, 'boot-2', 60); // off 20 of the 9th's 24 h
    await analyze();
    clock.now = Date.UTC(2026, 9, 10, 8); // the 10th, morning (grace window)

    const reply = await call(app, 'POST', '/v1/day-type', {
      token,
      body: { day: '2026-10-09', kind: 'bad' },
    });

    expect([reply.status, reply.body.data]).toEqual([201, { day: '2026-10-09', kind: 'bad' }]);
  });

  it('refuses to reclassify yesterday when the phone was mostly on', async () => {
    const { app, token, clock, beat, analyze } = await setup();
    await beat(DAY9);
    await beat(DAY9 + 3 * H, 'boot-2', 60);
    await analyze();
    clock.now = Date.UTC(2026, 9, 10, 8);

    const reply = await call(app, 'POST', '/v1/day-type', {
      token,
      body: { day: '2026-10-09', kind: 'bad' },
    });

    expect([reply.status, reply.body.error?.code]).toEqual([422, 'day_out_of_range']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/guard-gaps.test.ts`
Expected: FAIL. `../src/upkeep/guard` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/upkeep/guard.ts`:

```ts
import {
  analyzeBeats,
  dayKeyFor,
  DEFAULT_RULES,
  overlapMs,
  parseDayKey,
  type GuardGap,
} from '@mflow/core';
import type { Deps } from '../env';

export const MAX_BEATS_PER_RUN = 500;
/** "If the phone was off for a whole day" (spec §6.5), with slack for a few minutes on. */
export const PHONE_OFF_RECLASSIFY_HOURS = 16;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** A day's span in UTC ms: from its 04:00 on the owner's clock to the next day's 04:00. */
export function dayWindow(day: string, utcOffsetMinutes: number): { from: number; to: number } {
  const from =
    parseDayKey(day) + DEFAULT_RULES.dayBoundaryHour * HOUR_MS - utcOffsetMinutes * MINUTE_MS;
  return { from, to: from + 24 * HOUR_MS };
}

export type GuardDay = Readonly<{
  day: string;
  phoneOffMinutes: number;
  guardDisabledMinutes: number;
  gaps: GuardGap[];
}>;

export async function guardDay(
  deps: Deps,
  day: string,
  utcOffsetMinutes: number,
): Promise<GuardDay> {
  const gaps = await deps.repos.upkeep.gapsForDay(day);
  const { from, to } = dayWindow(day, utcOffsetMinutes);
  const minutes = (kind: GuardGap['kind']) =>
    Math.round(overlapMs(gaps, kind, from, to) / MINUTE_MS);
  return {
    day,
    phoneOffMinutes: minutes('phone_off'),
    guardDisabledMinutes: minutes('guard_disabled'),
    gaps,
  };
}

/** Turns new heartbeats into stored gaps for every device. Returns how many gaps were found. */
export async function analyzeGuard(deps: Deps): Promise<number> {
  const { upkeep, telemetry, devices } = deps.repos;
  const offset = (await devices.latestOffset()) ?? 0;
  const dayOf = (at: number) => dayKeyFor(at, offset, DEFAULT_RULES.dayBoundaryHour);
  let found = 0;
  for (const deviceId of await upkeep.devices()) {
    const cursor = await upkeep.guardCursor(deviceId);
    const rows = await telemetry.beatsFrom(deviceId, cursor, MAX_BEATS_PER_RUN);
    if (rows.length < 2) continue;
    const gaps = analyzeBeats(
      rows.map((r) => r.beat),
      DEFAULT_RULES,
    );
    await upkeep.addGaps(deviceId, gaps, dayOf, deps.now());
    const last = rows.at(-1);
    if (last !== undefined) await upkeep.setGuardCursor(deviceId, last.seq);
    found += gaps.length;
  }
  return found;
}
```

Note: re-reading from the cursor inclusive means the last beat of the previous run is analyzed again as the start of the next silence. Gaps fully inside the earlier window were already stored, and `INSERT OR IGNORE` on `(device_id, from_at)` keeps them once. **The returned count includes re-found duplicates.** The test's second `analyze()` expects 0 because only the cursor beat remains (fewer than 2 rows).

`apps/api/src/routes/guard.ts`:

```ts
import { DayKeySchema } from '@mflow/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { ok } from '../http/envelope';
import { valid } from '../http/validate';
import { guardDay } from '../upkeep/guard';

export const guardRoutes = new Hono<AppEnv>().get(
  '/guard/:day',
  valid('param', z.object({ day: DayKeySchema })),
  async (c) =>
    ok(c, await guardDay(c.var.deps, c.req.valid('param').day, c.var.device.utcOffsetMinutes)),
);
```

Register `authed.route('/', guardRoutes);` in `app.ts`.

In `apps/api/src/routes/day-types.ts`, change the bad-day day check from `if (day !== deviceToday(device, now)) return fail(c, 'day_out_of_range');` to:

```ts
const today = deviceToday(device, now);
if (day !== today && !(await phoneWasOff(deps, day, device.utcOffsetMinutes, now))) {
  return fail(c, 'day_out_of_range');
}
```

with, above the routes:

```ts
/** Yesterday may become a bad day next morning when the phone was off for (nearly) all of it (spec §6.5). */
async function phoneWasOff(deps: Deps, day: string, offset: number, now: number): Promise<boolean> {
  const [yesterday] = openDays(now, offset);
  if (yesterday !== day || openDays(now, offset).length < 2) return false;
  const { phoneOffMinutes } = await guardDay(deps, day, offset);
  return phoneOffMinutes >= PHONE_OFF_RECLASSIFY_HOURS * 60;
}
```

(imports: `type Deps` from `../env`, `openDays` from `../verification/run`, `guardDay` and `PHONE_OFF_RECLASSIFY_HOURS` from `../upkeep/guard`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS (the existing "bad day only for today" test still answers 422 for tomorrow).

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): heartbeat gaps tell phone-off from guard-disabled"
```

---

### Task 5: Coach persona and chat (`POST`/`GET /v1/coach/messages`)

**Files:**

- Create: `apps/api/src/coach/persona.ts`, `apps/api/src/routes/coach.ts`, `apps/api/test/coach.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/http/envelope.ts` (`coach_unavailable`)

**Interfaces:**

- Consumes: `Ai.talkText` (P3b); `Roadmap` (P3b); `CoachRepo` (Task 2); `PlanRepo`, `VerificationRepo.verdictsForDay`, `LedgerRepo.forDay`; `deviceToday`, `addDays`.
- Produces:
  - `DISTRESS_GUARDRAIL` (exact text, tested)
  - `coachSystem(roadmap): string`
  - `CoachFacts = { day; tasks: { title; outcome }[]; earnedMinutes; spentMinutes }`
  - `coachPrompt({ summary, facts, history, message }): string`
  - `todayFacts(deps, day): Promise<CoachFacts>`
  - `RECENT_DAYS = 7`, `RECENT_MESSAGES = 10`
- Routes:
  - `POST /v1/coach/messages` with `{ id, text }`:
    - stores the owner message (idempotent by id)
    - an existing reply → 200 `{ message, reply }`
    - otherwise `talkText` (`flourish`) → 201 `{ message, reply }`
    - AI unavailable → 503 `coach_unavailable` (the message stays stored, so a retry with the same id gets a reply)
  - `GET /v1/coach/messages?since&limit` → a `CoachPage`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/coach.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { DISTRESS_GUARDRAIL } from '../src/coach/persona';
import { call, geminiReply, makeApp, pairDevice, sampleRoadmap, type App } from './helpers';

type Sent = {
  systemInstruction: { parts: { text: string }[] };
  contents: { parts: { text: string }[] }[];
};

async function setup(
  reply: (n: number) => ReturnType<typeof geminiReply> | 'down' = () =>
    geminiReply('Ship the login fix first.'),
) {
  const sent: Sent[] = [];
  const fetch: FetchLike = async (_url, init) => {
    sent.push(JSON.parse(init.body ?? '{}') as Sent);
    const r = reply(sent.length);
    if (r === 'down') return { status: 503, text: async () => '{}' };
    return r;
  };
  const app: App = makeApp(undefined, { fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
  const send = (text: string, id = uuidv7()) =>
    call<{ message: { id: string; text: string }; reply: { text: string; replyTo: string } }>(
      app,
      'POST',
      '/v1/coach/messages',
      {
        token,
        body: { id, text },
        env: { GEMINI_API_KEY: 'g-key' },
      },
    );
  return { app, token, send, sent };
}

describe('coach chat', () => {
  it('answers as the future self, with the guardrail and only minimal context', async () => {
    const { send, sent } = await setup();

    const reply = await send('What should I do first tomorrow?');

    expect(reply.status).toBe(201);
    expect(reply.body.data.reply).toMatchObject({
      text: 'Ship the login fix first.',
      replyTo: reply.body.data.message.id,
    });
    const system = sent[0]?.systemInstruction.parts[0]?.text ?? '';
    expect(system).toContain('Senior software engineer');
    expect(system).toContain('Build things that last');
    expect(system).toContain(DISTRESS_GUARDRAIL);
    const prompt = sent[0]?.contents[0]?.parts[0]?.text ?? '';
    expect(prompt).toContain('What should I do first tomorrow?');
  });

  it('sends only the last 10 messages, not the full history', async () => {
    const { send, sent } = await setup();
    for (let i = 0; i < 12; i++) await send(`message ${i}`);
    const prompt = sent.at(-1)?.contents[0]?.parts[0]?.text ?? '';
    expect(prompt).not.toContain('message 0\n');
    expect(prompt).toContain('message 10');
  });

  it('answers 503 when the AI is down, and a retry with the same id gets one reply', async () => {
    let down = true;
    const { app, token, send } = await setup(() => (down ? 'down' : geminiReply('Back.')));
    const id = uuidv7();

    const first = await send('hello', id);
    down = false;
    const retry = await send('hello', id);
    const again = await send('hello', id);
    const page = await call<{ messages: { role: string }[] }>(app, 'GET', '/v1/coach/messages', {
      token,
    });

    expect([first.status, first.body.error?.code]).toEqual([503, 'coach_unavailable']);
    expect([retry.status, again.status]).toEqual([201, 200]);
    expect(page.body.data.messages.map((m) => m.role)).toEqual(['owner', 'coach']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/coach.test.ts`
Expected: FAIL. `../src/coach/persona` can't be resolved.

- [ ] **Step 3: Implement**

Add to `ERRORS` (with the 503s): `coach_unavailable: [503, 'The coach cannot answer right now. Try again soon.'],`.

`apps/api/src/coach/persona.ts`:

```ts
import type { Roadmap } from '@mflow/contracts';
import type { Deps } from '../env';
import type { CoachMessage } from '../ports';

export const RECENT_DAYS = 7;
export const RECENT_MESSAGES = 10;

/** Spec §9.2: genuine distress overrides the persona. Kept verbatim in every coach prompt. */
export const DISTRESS_GUARDRAIL =
  'If a message suggests genuine distress (hopelessness, self-harm, crisis), drop the coaching persona ' +
  'completely: answer plainly, warmly and supportively, do not mention tasks or time, encourage them ' +
  'to reach out to someone they trust, and if they may be in danger, to contact local emergency services.';

/** Spec §9.2: "you, a few years from now, who already became it", built from the owner's own words. */
export function coachSystem(roadmap: Roadmap): string {
  const identities = roadmap.identities
    .map((i) => `- ${i.title}: ${i.why}${i.deadline === undefined ? '' : ` (by ${i.deadline})`}`)
    .join('\n');
  return [
    'You are the owner, a few years from now, after you already became:',
    identities,
    'Speak as that future self to your past self.',
    'Rules: be specific and evidence-based, refer to the facts given, keep it short (at most 120 words).',
    'No generic motivation. Never do arithmetic for math practice: the app checks math itself.',
    DISTRESS_GUARDRAIL,
  ].join('\n');
}

export type CoachFacts = Readonly<{
  day: string;
  tasks: readonly Readonly<{ title: string; outcome: string }>[];
  earnedMinutes: number;
  spentMinutes: number;
}>;

/** Only what the coach needs: no location, tokens or device data. */
export async function todayFacts(deps: Deps, day: string): Promise<CoachFacts> {
  const [plan, verdicts, events] = await Promise.all([
    deps.repos.plans.get(day),
    deps.repos.verification.verdictsForDay(day),
    deps.repos.ledger.forDay(day),
  ]);
  const outcome = new Map(verdicts.map((v) => [v.taskId, v.outcome]));
  const minutes = (kinds: readonly string[]) =>
    Math.round(
      Math.abs(events.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.seconds, 0)) /
        60,
    );
  return {
    day,
    tasks: (plan?.tasks ?? []).map((t) => ({
      title: t.full.title,
      outcome: outcome.get(t.id) ?? 'not checked yet',
    })),
    earnedMinutes: minutes(['base_grant', 'task_reward', 'all_done_bonus', 'math_reward']),
    spentMinutes: minutes(['usage_spend']),
  };
}

export function coachPrompt(input: {
  summary: string | null;
  facts: CoachFacts;
  history: readonly CoachMessage[];
  message: string;
}): string {
  const lines = [
    `Last week, in short: ${input.summary ?? 'no summary yet.'}`,
    `Today (${input.facts.day}): earned ${input.facts.earnedMinutes} min, spent ${input.facts.spentMinutes} min.`,
    'Tasks:',
    ...(input.facts.tasks.length === 0
      ? ['- no plan locked']
      : input.facts.tasks.map((t) => `- ${t.title}: ${t.outcome}`)),
    '',
    'Recent conversation:',
    ...input.history.map((m) => `${m.role === 'owner' ? 'Me' : 'You'}: ${m.text}`),
    '',
    `Me: ${input.message}`,
    'You:',
  ];
  return lines.join('\n');
}
```

`apps/api/src/routes/coach.ts`:

```ts
import { CoachMessageRequestSchema, CoachQuerySchema } from '@mflow/contracts';
import { addDays } from '@mflow/core';
import { Hono } from 'hono';
import {
  coachPrompt,
  coachSystem,
  RECENT_DAYS,
  RECENT_MESSAGES,
  todayFacts,
} from '../coach/persona';
import type { AppEnv } from '../env';
import { deviceToday } from '../http/day';
import { fail, ok } from '../http/envelope';
import { valid } from '../http/validate';

export const coachRoutes = new Hono<AppEnv>()
  .get('/coach/messages', valid('query', CoachQuerySchema), async (c) => {
    const { since, limit } = c.req.valid('query');
    return ok(c, await c.var.deps.repos.coach.page(since, limit));
  })
  .post('/coach/messages', valid('json', CoachMessageRequestSchema), async (c) => {
    const { deps, device } = c.var;
    const { id, text } = c.req.valid('json');
    const now = deps.now();
    const day = deviceToday(device, now);
    const message = {
      id,
      role: 'owner' as const,
      kind: 'chat' as const,
      text,
      day,
      createdAt: now,
    };

    const isNew = await deps.repos.coach.addOwnerMessage(message);
    const existing = isNew ? null : await deps.repos.coach.replyTo(id);
    if (existing !== null) return ok(c, { message, reply: existing });

    const [roadmap, summary, facts, recent] = await Promise.all([
      deps.repos.roadmap.get(),
      deps.repos.coach.latestSummary(),
      todayFacts(deps, day),
      deps.repos.coach.recent(addDays(day, -RECENT_DAYS), RECENT_MESSAGES + 1),
    ]);
    const history = recent.filter((m) => m.id !== id).slice(-RECENT_MESSAGES);
    const answer = await deps.ai.talkText({
      system: coachSystem(roadmap),
      prompt: coachPrompt({ summary, facts, history, message: text }),
      importance: 'flourish',
    });
    if (!answer.ok) return fail(c, 'coach_unavailable');

    const reply = {
      id: deps.newId(),
      role: 'coach' as const,
      kind: 'chat' as const,
      text: answer.value.trim(),
      day,
      replyTo: id,
      createdAt: deps.now(),
    };
    await deps.repos.coach.addCoachMessage(reply);
    return ok(c, { message, reply }, 201);
  });
```

Register `authed.route('/', coachRoutes);` in `app.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): coach chat as the owner's future self, with a distress guardrail"
```

---

### Task 6: Nightly review and tomorrow's proposal

**Files:**

- Create: `apps/api/src/upkeep/nightly.ts`, `apps/api/test/nightly.test.ts`

**Interfaces:**

- Consumes: `coachSystem`, `todayFacts` (Task 5); `guardDay` (Task 4); `TelemetryRepo.mathSummary`, `VerificationRepo.readingForDay` (P3c-1); `aiTasks`, `templateTasks`, `activeSkills` (P3b); `createDraft`, `editDraft`, `addDays`, `DEFAULT_RULES` (core); `UpkeepRepo.nightlyDone/markNightly`; `ownerDay`.
- Produces:
  - `ReviewFacts = CoachFacts & { unlocks; readingLogs; math: { attempts; correct }; phoneOffMinutes; guardDisabledMinutes }`
  - `isNightly(now, offset): boolean` (local 21:00–03:59)
  - `templateReview(facts): string`
  - `runNightly(deps): Promise<{ day: string; review: 'ai' | 'template'; proposed: boolean } | null>`
- Rules:
  - It runs once per day inside the window.
  - The review is a coach message with `kind: 'review'`.
  - The proposal for tomorrow is written only when tomorrow has no plan yet and some skill is active.

- [ ] **Step 1: Write the failing test**

`apps/api/test/nightly.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import type { Plan } from '@mflow/core';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { makeDeps } from '../src/app';
import { isNightly, runNightly, templateReview } from '../src/upkeep/nightly';
import { call, geminiReply, makeApp, pairDevice, sampleRoadmap, type Clock } from './helpers';

const NIGHT = Date.UTC(2026, 9, 9, 21, 30); // 21:30 on the 9th (offset 0)

async function setup(fetch?: FetchLike, keyed = false) {
  const clock: Clock = { now: NIGHT };
  const app = makeApp(clock, fetch === undefined ? {} : { fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
  const deps = () =>
    makeDeps(
      { ...env, ...(keyed ? { GEMINI_API_KEY: 'g-key' } : {}) },
      { now: () => clock.now, ...(fetch === undefined ? {} : { fetch }) },
    );
  return { app, token, clock, deps };
}

describe('nightly', () => {
  it('is open from 21:00 to 03:59 on the owner clock', () => {
    expect(
      [20.99, 21, 23.5, 3.99, 4].map((h) => isNightly(Date.UTC(2026, 9, 9) + h * 3_600_000, 0)),
    ).toEqual([false, true, true, true, false]);
    expect(isNightly(Date.UTC(2026, 9, 9, 16, 0), 300)).toBe(true); // 21:00 in Dushanbe
  });

  it('without AI, writes a template review and proposes tomorrow, once', async () => {
    const { app, token, deps } = await setup();

    const first = await runNightly(deps());
    const second = await runNightly(deps());

    expect(first).toEqual({ day: '2026-10-09', review: 'template', proposed: true });
    expect(second).toBeNull();
    const page = await call<{ messages: { kind: string; text: string }[] }>(
      app,
      'GET',
      '/v1/coach/messages',
      { token },
    );
    expect(page.body.data.messages.map((m) => m.kind)).toEqual(['review']);
    const tomorrow = await call<Plan>(app, 'GET', '/v1/plans/2026-10-10', { token });
    expect(tomorrow.body.data.status).toBe('draft');
  });

  it('writes the review with the AI from the day facts, and keeps a plan the owner already drafted', async () => {
    const prompts: string[] = [];
    const fetch: FetchLike = async (_url, init) => {
      prompts.push(init.body ?? '');
      return geminiReply('You read and coded today. Tomorrow: the checklist.');
    };
    const { app, token, deps } = await setup(fetch, true);
    await call(app, 'PUT', '/v1/plans/2026-10-10', {
      token,
      body: { tasks: [] },
    });

    const result = await runNightly(deps());

    expect(result).toEqual({ day: '2026-10-09', review: 'ai', proposed: false });
    expect(prompts[0]).toContain('phone off');
  });

  it('does nothing outside the window', async () => {
    const { clock, deps } = await setup();
    clock.now = Date.UTC(2026, 9, 9, 15);
    expect(await runNightly(deps())).toBeNull();
  });

  it('the template review states the facts plainly', () => {
    const text = templateReview({
      day: '2026-10-09',
      tasks: [
        { title: 'Fix the bug', outcome: 'pass' },
        { title: 'Read', outcome: 'pending' },
      ],
      earnedMinutes: 35,
      spentMinutes: 20,
      unlocks: 1,
      readingLogs: 1,
      math: { attempts: 10, correct: 8 },
      phoneOffMinutes: 0,
      guardDisabledMinutes: 45,
    });
    expect(text).toContain('1 of 2 tasks passed');
    expect(text).toContain('8 of 10 math problems right');
    expect(text).toContain('guard was off for 45 min');
    expect(text).toContain('1 emergency unlock');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/nightly.test.ts`
Expected: FAIL. `../src/upkeep/nightly` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/upkeep/nightly.ts`:

```ts
import { addDays, createDraft, DEFAULT_RULES, editDraft } from '@mflow/core';
import { coachSystem, todayFacts, type CoachFacts } from '../coach/persona';
import type { Deps } from '../env';
import { activeSkills, aiTasks, templateTasks } from '../planning/propose';
import { ownerDay } from '../verification/run';
import { guardDay } from './guard';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export type ReviewFacts = CoachFacts &
  Readonly<{
    unlocks: number;
    readingLogs: number;
    math: Readonly<{ attempts: number; correct: number }>;
    phoneOffMinutes: number;
    guardDisabledMinutes: number;
  }>;

/** Spec §6.2: the night review opens at the reminder hour and lasts until the day boundary. */
export function isNightly(now: number, utcOffsetMinutes: number): boolean {
  const hour =
    ((((now + utcOffsetMinutes * MINUTE_MS) % (24 * HOUR_MS)) + 24 * HOUR_MS) % (24 * HOUR_MS)) /
    HOUR_MS;
  return hour >= DEFAULT_RULES.nightlyReminderHour || hour < DEFAULT_RULES.dayBoundaryHour;
}

/** Plain facts, used when the AI is unavailable: the review always arrives. */
export function templateReview(f: ReviewFacts): string {
  const passed = f.tasks.filter((t) => t.outcome === 'pass').length;
  const parts = [
    f.tasks.length === 0
      ? 'No plan was locked today.'
      : `${passed} of ${f.tasks.length} tasks passed.`,
    `You earned ${f.earnedMinutes} min and spent ${f.spentMinutes} min.`,
  ];
  if (f.math.attempts > 0)
    parts.push(`${f.math.correct} of ${f.math.attempts} math problems right.`);
  if (f.readingLogs > 0)
    parts.push(`${f.readingLogs} reading log${f.readingLogs === 1 ? '' : 's'}.`);
  if (f.unlocks > 0) parts.push(`${f.unlocks} emergency unlock${f.unlocks === 1 ? '' : 's'}.`);
  if (f.guardDisabledMinutes > 0)
    parts.push(`The guard was off for ${f.guardDisabledMinutes} min: that counts as a miss.`);
  if (f.phoneOffMinutes > 0)
    parts.push(`The phone was off for ${f.phoneOffMinutes} min (not a miss).`);
  return parts.join(' ');
}

async function reviewFacts(deps: Deps, day: string, offset: number): Promise<ReviewFacts> {
  const [base, events, logs, math, guard] = await Promise.all([
    todayFacts(deps, day),
    deps.repos.ledger.forDay(day),
    deps.repos.verification.readingForDay(day),
    deps.repos.telemetry.mathSummary(day),
    guardDay(deps, day, offset),
  ]);
  return {
    ...base,
    unlocks: events.filter((e) => e.kind === 'unlock_borrow').length,
    readingLogs: logs.length,
    math,
    phoneOffMinutes: guard.phoneOffMinutes,
    guardDisabledMinutes: guard.guardDisabledMinutes,
  };
}

const describeFacts = (f: ReviewFacts): string =>
  [
    `Day ${f.day}. Tasks: ${f.tasks.map((t) => `${t.title} (${t.outcome})`).join('; ') || 'none locked'}.`,
    `Earned ${f.earnedMinutes} min, spent ${f.spentMinutes} min, ${f.unlocks} emergency unlocks.`,
    `Reading logs: ${f.readingLogs}. Math: ${f.math.correct}/${f.math.attempts} right.`,
    `Guard off ${f.guardDisabledMinutes} min (a miss); phone off ${f.phoneOffMinutes} min (not a miss).`,
  ].join('\n');

/** Once a night: the coach's review of today, then a draft plan for tomorrow if none exists. */
export async function runNightly(
  deps: Deps,
): Promise<{ day: string; review: 'ai' | 'template'; proposed: boolean } | null> {
  const offset = await deps.repos.devices.latestOffset();
  if (offset === null || !isNightly(deps.now(), offset)) return null;
  const { day } = await ownerDay(deps);
  if (await deps.repos.upkeep.nightlyDone(day)) return null;

  const [facts, roadmap] = await Promise.all([
    reviewFacts(deps, day, offset),
    deps.repos.roadmap.get(),
  ]);
  const written = await deps.ai.talkText({
    system: coachSystem(roadmap),
    prompt: `Write tonight's review in 3 to 5 short sentences, specific to these facts:\n${describeFacts(facts)}`,
    importance: 'essential',
  });
  await deps.repos.coach.addCoachMessage({
    id: deps.newId(),
    role: 'coach',
    kind: 'review',
    text: written.ok ? written.value.trim() : templateReview(facts),
    day,
    createdAt: deps.now(),
  });

  const tomorrow = addDays(day, 1);
  let proposed = false;
  if (
    (await deps.repos.plans.get(tomorrow)) === null &&
    activeSkills(roadmap, tomorrow).length > 0
  ) {
    const tasks =
      (await aiTasks(deps.ai, roadmap, tomorrow, deps.newId)) ??
      templateTasks(roadmap, tomorrow, deps.newId);
    const draft = editDraft(createDraft(tomorrow, []), tasks);
    if (draft.ok) proposed = await deps.repos.plans.save(draft.value, deps.now());
  }

  await deps.repos.upkeep.markNightly(day, deps.now());
  return { day, review: written.ok ? 'ai' : 'template', proposed };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS. If the `PUT /v1/plans/2026-10-10` with `tasks: []` is refused (a draft may be empty, per `editDraft`), the test still holds, because the plan exists afterwards. If it answers 4xx, change the test to use `[taskSpec()]` and record a ruling.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): nightly review and tomorrow's proposal at the reminder hour"
```

---

### Task 7: Weekly memory (summaries and 30-day retention)

**Files:**

- Create: `apps/api/src/upkeep/weekly.ts`, `apps/api/test/weekly.test.ts`

**Interfaces:**

- Consumes: `CoachRepo` (Task 2); `coachSystem` (Task 5); `isoWeekKey`, `weekdayOf`, `addDays` (core); `ownerDay`.
- Produces: `RETENTION_DAYS = 30`, `HARD_RETENTION_DAYS = 60`, and `runWeekly(deps): Promise<{ summarized: string | null; deleted: number }>`.
- Rules:
  - On the owner's Monday, if last week has no summary and has messages, `talkText` (`essential`) writes one, retried on every tick of that Monday until it succeeds.
  - Every tick deletes chat older than 30 days whose week is summarized, and everything older than 60 days.

- [ ] **Step 1: Write the failing test**

`apps/api/test/weekly.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { d1Repos } from '../src/adapters/d1';
import { makeDeps } from '../src/app';
import { runWeekly } from '../src/upkeep/weekly';
import { geminiReply, makeApp, pairDevice, T0, type Clock } from './helpers';

const MONDAY = Date.UTC(2026, 9, 12, 10); // Monday the 12th; last week is 2026-W41 (5–11 Oct)

async function setup(fetch?: FetchLike) {
  const clock: Clock = { now: MONDAY };
  await pairDevice(makeApp(clock));
  const repo = d1Repos(env.DB).coach;
  const msg = (id: string, day: string) =>
    repo.addOwnerMessage({
      id,
      role: 'owner',
      kind: 'chat',
      text: `note ${id}`,
      day,
      createdAt: T0,
    });
  const deps = () =>
    makeDeps(
      { ...env, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, ...(fetch === undefined ? {} : { fetch }) },
    );
  return { clock, repo, msg, deps };
}

describe('weekly memory', () => {
  it("summarizes last week's chat once on Monday", async () => {
    let calls = 0;
    const { repo, msg, deps } = await setup(async () => {
      calls += 1;
      return geminiReply('Shipped two fixes; reading slipped midweek.');
    });
    await msg('a', '2026-10-07');

    const first = await runWeekly(deps());
    const second = await runWeekly(deps());

    expect(first.summarized).toBe('2026-W41');
    expect(second.summarized).toBeNull();
    expect(calls).toBe(1);
    expect(await repo.latestSummary()).toBe('Shipped two fixes; reading slipped midweek.');
  });

  it('retries a failed summary on a later Monday tick', async () => {
    let down = true;
    const { msg, deps } = await setup(async () =>
      down ? { status: 503, text: async () => '{}' } : geminiReply('ok'),
    );
    await msg('a', '2026-10-07');

    expect((await runWeekly(deps())).summarized).toBeNull();
    down = false;
    expect((await runWeekly(deps())).summarized).toBe('2026-W41');
  });

  it('only summarizes on Monday, and deletes old chat by the retention rules', async () => {
    const { clock, repo, msg, deps } = await setup(async () => geminiReply('s'));
    await msg('old-summarized', '2026-09-01');
    await msg('old-unsummarized', '2026-09-08');
    await msg('ancient', '2026-08-01');
    await repo.saveSummary('2026-W36', 'w36', T0);
    clock.now = Date.UTC(2026, 9, 14, 10); // Wednesday

    const result = await runWeekly(deps());

    expect(result).toEqual({ summarized: null, deleted: 2 });
    expect((await repo.page(0, 10)).messages.map((m) => m.id)).toEqual(['old-unsummarized']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/weekly.test.ts`
Expected: FAIL. `../src/upkeep/weekly` can't be resolved.

- [ ] **Step 3: Implement**

`apps/api/src/upkeep/weekly.ts`:

```ts
import { addDays, isoWeekKey, weekdayOf } from '@mflow/core';
import { coachSystem } from '../coach/persona';
import type { Deps } from '../env';
import { ownerDay } from '../verification/run';

/** Spec §9.3: chat transcripts are kept 30 days, then summarized and deleted. */
export const RETENTION_DAYS = 30;
/** Past this, chat is deleted even without a summary: privacy wins over memory. */
export const HARD_RETENTION_DAYS = 60;
const MONDAY = 1;

export async function runWeekly(
  deps: Deps,
): Promise<{ summarized: string | null; deleted: number }> {
  if ((await deps.repos.devices.latestOffset()) === null) return { summarized: null, deleted: 0 };
  const { day } = await ownerDay(deps);
  const { coach } = deps.repos;

  let summarized: string | null = null;
  const lastWeek = isoWeekKey(addDays(day, -7));
  if (weekdayOf(day) === MONDAY && !(await coach.hasSummary(lastWeek))) {
    const messages = await coach.messagesForWeek(lastWeek);
    if (messages.length > 0) {
      const written = await deps.ai.talkText({
        system: coachSystem(await deps.repos.roadmap.get()),
        prompt: [
          `Summarize week ${lastWeek} of our conversation in at most 5 sentences: what I worked on,`,
          'what slipped, and what I said I would change. This summary replaces the transcript.',
          '',
          ...messages.map((m) => `${m.role === 'owner' ? 'Me' : 'You'} (${m.day}): ${m.text}`),
        ].join('\n'),
        importance: 'essential',
      });
      if (written.ok) {
        await coach.saveSummary(lastWeek, written.value.trim(), deps.now());
        summarized = lastWeek;
      }
    }
  }

  const deleted = await coach.deleteOld(
    addDays(day, -RETENTION_DAYS),
    addDays(day, -HARD_RETENTION_DAYS),
  );
  return { summarized, deleted };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): weekly coach summaries and 30-day transcript retention"
```

---

### Task 8: The upkeep cron (dispatch, logging and the budget test)

**Files:**

- Create: `apps/api/src/upkeep/run.ts`, `apps/api/test/upkeep.test.ts`
- Modify: `apps/api/src/scheduled.ts`, `apps/api/src/index.ts`, `apps/api/wrangler.jsonc`, `apps/api/worker-configuration.d.ts` (regenerated)

**Interfaces:**

- Consumes: `rollover`, `analyzeGuard`, `runNightly`, `runWeekly` (Tasks 3–7); `makeDeps`.
- Produces:
  - `UPKEEP_CRON = '30 * * * *'`, `VERIFY_CRON = '0 * * * *'`
  - `runUpkeep(env, options?): Promise<UpkeepRun>`, where `UpkeepRun = { rolledOver: boolean; gaps: number; nightly: 'ai' | 'template' | null; summarized: string | null; deleted: number }`
  - Logs one line `{ level: 'info', event: 'upkeep_run', ... }`.
  - The `scheduled` export dispatches by `controller.cron`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/upkeep.test.ts`:

```ts
import type { FetchLike } from '@mflow/ai';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runUpkeep } from '../src/scheduled';
import {
  call,
  countingDb,
  geminiReply,
  makeApp,
  pairDevice,
  sampleRoadmap,
  taskSpec,
  type Clock,
} from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A busy tick: Monday 21:30, nightly + weekly + rollover + guard all do work. */
const D1_BUDGET = 32;

describe('upkeep cron', () => {
  it('runs every step within the free-plan budget and logs counts only', async () => {
    const clock: Clock = { now: Date.UTC(2026, 9, 12, 8) }; // Monday the 12th
    const fetch: FetchLike = async () => geminiReply('Private review words.');
    const app = makeApp(clock, { fetch });
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
    await call(app, 'PUT', '/v1/plans/2026-10-12', {
      token,
      body: { tasks: [taskSpec('Private task'), taskSpec(), taskSpec()] },
    });
    await call(app, 'POST', '/v1/coach/messages', {
      token,
      body: { id: '01920000-0000-7000-8000-0000000000c1', text: 'last week note' },
    });
    await env.DB.prepare("UPDATE coach_messages SET day = '2026-10-07', week = '2026-W41'").run();
    for (const [h, boot, up] of [
      [8, 'b1', 9999],
      [9, 'b1', 99_999],
      [11, 'b2', 60],
    ] as const) {
      clock.now = Date.UTC(2026, 9, 12, h);
      await call(app, 'POST', '/v1/heartbeat', {
        token,
        body: {
          at: clock.now,
          bootId: boot,
          uptimeSeconds: up,
          utcOffsetMinutes: 0,
          guardEnabled: true,
        },
      });
    }
    clock.now = Date.UTC(2026, 9, 12, 21, 30);
    const counted = countingDb(env.DB);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const run = await runUpkeep(
      { ...env, DB: counted.db, GEMINI_API_KEY: 'g-key' },
      { now: () => clock.now, fetch },
    );

    expect(run).toEqual({
      rolledOver: true,
      gaps: 2,
      nightly: 'ai',
      summarized: '2026-W41',
      deleted: 0,
    });
    expect(counted.count()).toBeLessThanOrEqual(D1_BUDGET);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('upkeep_run');
    expect(logged).not.toContain('Private');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/api test -- test/upkeep.test.ts`
Expected: FAIL. `runUpkeep` isn't exported.

- [ ] **Step 3: Implement**

`apps/api/src/upkeep/run.ts`:

```ts
import type { Deps } from '../env';
import { analyzeGuard } from './guard';
import { runNightly } from './nightly';
import { rollover } from './rollover';
import { runWeekly } from './weekly';

export type UpkeepRun = Readonly<{
  rolledOver: boolean;
  gaps: number;
  nightly: 'ai' | 'template' | null;
  summarized: string | null;
  deleted: number;
}>;

/** The half-hourly upkeep: each step is idempotent, so a missed or repeated tick is harmless. */
export async function upkeep(deps: Deps): Promise<UpkeepRun> {
  const rolled = await rollover(deps);
  const gaps = await analyzeGuard(deps);
  const nightly = await runNightly(deps);
  const weekly = await runWeekly(deps);
  return {
    rolledOver: rolled !== null && (rolled.granted || rolled.expiredSeconds > 0),
    gaps,
    nightly: nightly?.review ?? null,
    summarized: weekly.summarized,
    deleted: weekly.deleted,
  };
}
```

Append to `apps/api/src/scheduled.ts`:

```ts
import { upkeep, type UpkeepRun } from './upkeep/run';

export const VERIFY_CRON = '0 * * * *';
export const UPKEEP_CRON = '30 * * * *';

/** The half-hourly tick (spec §11): rollover, guard gaps, nightly review, weekly memory. */
export async function runUpkeep(env: Bindings, options: AppOptions = {}): Promise<UpkeepRun> {
  const run = await upkeep(makeDeps(env, options));
  console.log(JSON.stringify({ level: 'info', event: 'upkeep_run', ...run }));
  return run;
}
```

(Move the import to the top of the file.)

`apps/api/src/index.ts`, with the `scheduled` handler:

```ts
  scheduled(controller, env, ctx) {
    ctx.waitUntil(controller.cron === UPKEEP_CRON ? runUpkeep(env) : runScheduled(env));
  },
```

(import `runUpkeep` and `UPKEEP_CRON` from `./scheduled`).

In `apps/api/wrangler.jsonc`, set `"triggers": { "crons": ["0 * * * *", "30 * * * *"] }` and update its comment to "Hourly verification and half-hourly upkeep (2 of the 5 free cron triggers)". Then run `bun run --cwd apps/api types`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/api test && bun run typecheck && bun run lint`
Expected: PASS. If the count is over 32, batch the hottest step (the measured count tells you where) and record a ruling with the before and after numbers, as P3c-1 did.

- [ ] **Step 5: Commit**

```bash
bun x prettier --write apps/api
git add apps/api
git commit -m "feat(api): half-hourly upkeep cron for rollover, guard, nightly and weekly"
```

---

### Task 9: ADR 0009, README and the full gate

**Files:**

- Create: `docs/adr/0009-coach-and-upkeep.md`
- Modify: `README.md`

- [ ] **Step 1: Write ADR 0009**

`docs/adr/0009-coach-and-upkeep.md`:

```markdown
# 0009. Coach, memory and the upkeep cron

- Status: accepted
- Date: 2026-10-13

## Context

The daily loop needs a server that rolls days over, notices when the guard was off, reviews the
day at night, proposes tomorrow, and coaches. It must stay within the free plan, protect privacy,
and never leave the owner without a review or a plan when the AI is down.

## Decision

- **Two crons:** `0 * * * *` verification (ADR 0008) and `30 * * * *` upkeep. Separate invocations
  give each its own 50-query / 50-subrequest budget. Upkeep steps are idempotent: `expire` and
  `base_grant` by business key, `nightly_runs` per day, summaries per ISO week, heartbeat cursors.
- **Rollover:** yesterday's leftover expires down to the running balance (debt first, core
  `expireFromBalances`); today's base grant is paid. Rewards paid for yesterday later in the grace
  window stay usable.
- **Guard gaps (spec §6.5):** a silence over 2 heartbeats is a gap; a new boot id or an uptime
  shorter than the silence means "phone off" (not a miss), otherwise "guard disabled" (a miss), as
  does time after a beat reporting the guard off. After ≥ 16 h of phone-off yesterday, the owner may
  declare yesterday a bad day the next morning (away needs location, so it is not offered).
- **Coach (spec §9.2–9.3):** the system prompt is built from the owner's identities and whys, with
  the distress guardrail in every prompt. Context is the latest weekly summary, today's tasks and
  outcomes, earned/spent minutes, and the last 10 messages from 7 days. Chat is `flourish`; a down
  AI answers 503 and the owner's message is kept, so a retry with the same id is answered once.
- **Nightly (spec §6.2):** from 21:00 to 03:59 once a day: a review (AI, or a plain template) and,
  if tomorrow has no plan yet, a proposal (AI with template fallback).
- **Memory:** on Mondays, last week's chat is summarized (`essential`, retried each tick). Chat older
  than 30 days is deleted once its week is summarized; everything older than 60 days is deleted.

## Consequences

- The owner always gets a review and a draft for tomorrow, AI or not.
- AI word problems and `GET /math/bank` are a separate phase (P3c-3): the CAS must re-solve each
  problem, and whether it fits the free Worker's 10 ms CPU limit needs a spike.
- Push notifications (≤ 2 a day) are sent by the phone (P4) when a review or proposal appears.
```

- [ ] **Step 2: Update the README**

Append:

```markdown
## Coach and upkeep

A half-hourly cron rolls the day over, finds heartbeat gaps (phone off vs. guard disabled), writes
the nightly review and tomorrow's draft plan at 21:00, and summarizes last week's chat on Mondays.
Coach chat: `POST /v1/coach/messages`. See `docs/adr/0009-coach-and-upkeep.md`.
```

- [ ] **Step 3: Run the full gate**

Run: `bun run format:check && bun run lint && bun run typecheck && bun run coverage`
Expected: all clean, and coverage thresholds are met.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0009-coach-and-upkeep.md README.md
git commit -m "docs: ADR 0009 for the coach and upkeep cron"
```
