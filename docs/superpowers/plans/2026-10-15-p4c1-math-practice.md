# Future Flow P4c-1: math practice on the phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner practises math on the phone, offline:

- An optional placement test finds their level.
- Each problem is chosen by their per-topic rating, so success is predicted at 70–85%.
- Answers are checked on the phone by the real CAS, with hints and worked steps.
- Mastery and spaced reviews are tracked on the phone.
- Correct, in-band, hint-free answers earn math time through core's `earn()`.
- Attempts sync to the server, and a math task in today's locked plan is passed automatically once its target is met.

**Architecture:**

- **Engine:** `@futureflow/math-engine` provides generators, the checker, Elo, mastery, the scheduler and placement, all pure functions. One mobile module (`src/lib/math/engine.ts`) imports the package root, and so the CAS. The lint fence allows that one file only. The CAS warms up in the background when Practice opens. Spike: load 57 ms, first check 674 ms, then 17 ms per check.
- **State:** math state lives in new SQLite tables: progress, item ratings, attempts and seen problems. A pure `practice.ts` serves and grades problems. A pure `rewards.ts` wraps `earn()`.
- **Sync:** the sync engine also pushes attempts.

**Tech Stack:** Expo SDK 57, `@futureflow/math-engine` (Compute Engine CAS), `@futureflow/core` `earn()`, expo-sqlite, Jest + RNTL 13.3 + `renderRouter`, Maestro.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md`:

- §6.3: math tasks pass when a target is hit; `math_reward` is paid on the phone
- §10.3–10.6: checker, placement, learning loop, ratings
- §10.9: only in-band problems earn, repeats earn 0, choice earns half, 45 min/day cap
- §11: `POST /math/attempts`

ADRs 0004, 0011 and 0012.

## Global Constraints

- **Machine:** this laptop has 1.8 GB of RAM.
  - Never run repo-wide `bun run test`, `coverage` or `typecheck`.
  - Never run a local `expo export` now that the bundle includes the CAS.
  - Locally, run one package or one test file at a time, Jest with `--maxWorkers=1`.
  - CI runs everything.
- **Tooling:** Bun only (`bun x`). No AI attribution.
- **CAS import:** only `apps/mobile/src/lib/math/engine.ts` may import the `@futureflow/math-engine` root. Everything else imports from `@/lib/math/engine`.
- **Never teach wrong:** answers come only from math-engine generators and are checked only by math-engine's `checkAnswer`. `unreadable` means "ask again" and never changes a rating or costs anything. After a wrong answer, the correct answer (`answerText`) and the generator's steps are shown.
- **Earning, all through `earn()` (§6.2, §10.9):**
  - only for a correct, typed or choice answer, with the predicted success at serving time ≤ 0.90 (`earnsTime`)
  - only with no hints used and on a problem not seen before (key `topicId:seed:difficulty`)
  - only when today's plan is locked and the snapshot is for the phone's current day
  - zero-second rewards (cap reached) are never enqueued
- **Math task targets (ADR 0013):** the full version passes at ≥ 10 problems answered today with ≥ 70% correct. The 2-minute version (bad day) passes at ≥ 1 correct problem today. The phone only ever sends `pass` (`by: 'code'`); it never sends `fail`.
- **Privacy:** logs carry no prompts, answers or topic names, only event names and error names.
- **Tests:** in `apps/mobile/test/**`, with the 80% coverage gate.

## Review Focus

1. **An unreadable answer** ("abc", an empty string, "2x=") never changes ratings, streaks, rewards or attempts, and the problem stays. Pinned by Task 3 "unreadable changes nothing".
2. **A problem answered again after being wrong, or a re-served seed,** earns nothing. Pinned by Task 3 "a repeated problem never earns".
3. **The daily math cap is reached:** no zero-second reward is enqueued, and the feedback says the cap is reached. Pinned by Task 4 "cap reached".
4. **Before today's plan is locked,** practice works but earns nothing, and the screen says why. Pinned by Task 4 "plan not locked".
5. **The math task target** is met on a bad day with the 2-minute version (1 correct), and `pass` is sent once, never twice. Pinned by Task 6 "small version on a bad day" and "sent once".

---

### Task 1: The CAS on the phone, behind one module

**Files:**

- Create: `apps/mobile/src/lib/math/engine.ts`
- Modify: `eslint.config.js` (exception for that file), `README.md` (no local export)
- Test: `apps/mobile/test/math-engine.test.ts`

**Interfaces:**

- Produces from `@/lib/math/engine`: the re-exports `checkAnswer`, `answerText`, `DEFAULT_REGISTRY`, `ONTARIO_GRAPH`, `nextTopic`, `pickDifficulty`, `earnsTime`, `expectedScore`, `updateRatings`, `initialItemRating`, `newProgress`, `recordAttempt`, `MASTERY_STREAK`, `startPlacement`, `placementProbe`, `recordPlacementAnswer`, `placementProgress`, `QUESTIONS_PER_PROBE` and the types `Problem`, `Difficulty`, `TopicProgress`, `PlacementState`, `CheckOutcome`, `Answer`, plus `warmChecker(): Promise<void>`.

- [ ] **Step 1: Failing test** — `test/math-engine.test.ts`:

```ts
import { checkAnswer, DEFAULT_REGISTRY, ONTARIO_GRAPH, warmChecker } from '@/lib/math/engine';

test('every curriculum topic has a generator on the phone', () => {
  expect(ONTARIO_GRAPH.topics.filter((t) => !DEFAULT_REGISTRY.has(t.id))).toEqual([]);
});

test('the CAS checks expressions on the phone', async () => {
  await warmChecker();
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, '(x+2)(x+3)')).toBe('correct');
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, '(x+2)(x+4)')).toBe('incorrect');
  expect(checkAnswer({ type: 'expression', text: 'x^2+5x+6' }, 'abc')).toBe('unreadable');
});
```

- [ ] **Step 2:** Run `cd apps/mobile && bun x jest --maxWorkers=1 test/math-engine.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/math/engine.ts`:

```ts
// The only module that imports the math-engine root (and so the CAS); see ADR 0013.
import { checkAnswer } from '@futureflow/math-engine';

export {
  answerText,
  checkAnswer,
  DEFAULT_REGISTRY,
  earnsTime,
  expectedScore,
  initialItemRating,
  MASTERY_STREAK,
  newProgress,
  nextTopic,
  ONTARIO_GRAPH,
  pickDifficulty,
  placementProbe,
  placementProgress,
  QUESTIONS_PER_PROBE,
  recordAttempt,
  recordPlacementAnswer,
  startPlacement,
  updateRatings,
} from '@futureflow/math-engine';
export type {
  Answer,
  CheckOutcome,
  Difficulty,
  PlacementState,
  Problem,
  TopicProgress,
} from '@futureflow/math-engine';

/**
 * The CAS's first check costs ~0.7 s (spike); later ones ~17 ms. Practice calls this when it opens
 * so the owner's first answer is checked at warm speed.
 */
export function warmChecker(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      checkAnswer({ type: 'expression', text: 'x+1' }, '1+x');
      resolve();
    }, 0);
  });
}
```

`eslint.config.js`: add `ignores: ['apps/mobile/src/lib/math/engine.ts']` to the mobile `no-restricted-imports` block, and change its message to "Import from @/lib/math/engine (ADR 0013)".
`README.md`, phone section: "The phone bundle includes the CAS and is built only in CI or EAS. Never run `expo export` on a small machine."

- [ ] **Step 4:** Run the test (PASS), then `bun x eslint apps/mobile` (clean). Temporarily import the root from another file and check that lint fails; then remove the import.
- [ ] **Step 5: Commit** — `feat: bring the CAS to the phone behind one module, warmed in the background`

---

### Task 2: Math state on the phone

**Files:**

- Modify: `src/lib/store/migrations.ts` (migration 2), `src/lib/store/types.ts`, `src/lib/store/sqlite-store.ts`
- Test: `test/store.test.ts`

**Interfaces:**

- Migration 2:

```sql
CREATE TABLE math_progress (topic_id TEXT PRIMARY KEY, progress TEXT NOT NULL);
CREATE TABLE math_items (item_key TEXT PRIMARY KEY, rating REAL NOT NULL);
CREATE TABLE math_attempts (id TEXT PRIMARY KEY, day TEXT NOT NULL, at INTEGER NOT NULL,
  attempt TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
CREATE TABLE math_seen (problem_key TEXT PRIMARY KEY, at INTEGER NOT NULL);
```

- `LocalStore` additions (writes go through the write queue):

```ts
mathProgress(): Promise<Map<string, TopicProgress>>;
saveMathProgress(items: readonly TopicProgress[]): Promise<void>;   // upsert
itemRating(key: string): Promise<number | null>;
saveItemRating(key: string, rating: number): Promise<void>;
saveAttempt(attempt: MathAttempt): Promise<void>;                    // INSERT OR IGNORE
attemptsOn(day: string): Promise<MathAttempt[]>;                     // oldest first
unsentAttempts(limit?: number): Promise<MathAttempt[]>;
markAttemptsSent(ids: readonly string[]): Promise<void>;
hasSeen(key: string): Promise<boolean>;
markSeen(key: string, at: number): Promise<void>;
placement(): Promise<PlacementRecord | null>;  // kv 'placement'
savePlacement(p: PlacementRecord): Promise<void>;
```

- `type PlacementRecord = { state: PlacementState; done: boolean }`, kept in kv.
- `TopicProgress` and `MathAttempt` are imported as types (`@/lib/math/engine` and `@futureflow/contracts`).
- `clearServerCopy` keeps every math table and the `placement` key (they are the phone's own).

- [ ] **Step 1: Failing tests** — add to `test/store.test.ts`:

```ts
const attempt = (i: number, day = '2026-10-14') => ({
  id: `01920000-0000-7000-8000-${String(i).padStart(12, '0')}`,
  day,
  at: NOW + i,
  topicId: 'fractions',
  difficulty: 3,
  correct: i % 2 === 0,
  answerType: 'typed' as const,
});

test('math progress and item ratings round-trip and upsert', async () => {
  const { store } = await open();
  const p = { topicId: 'fractions', rating: 1050, streak: 2, mastered: false, reviewStage: 0 };
  await store.saveMathProgress([p]);
  await store.saveMathProgress([{ ...p, streak: 3 }]);
  expect([...(await store.mathProgress()).values()]).toEqual([{ ...p, streak: 3 }]);
  expect(await store.itemRating('fractions:3')).toBeNull();
  await store.saveItemRating('fractions:3', 1180.5);
  expect(await store.itemRating('fractions:3')).toBe(1180.5);
});

test('attempts are kept per day, sent in batches, and survive clearing the server copy', async () => {
  const { store } = await open();
  await store.saveAttempt(attempt(1));
  await store.saveAttempt(attempt(1));
  await store.saveAttempt(attempt(2, '2026-10-13'));
  expect(await store.attemptsOn('2026-10-14')).toEqual([attempt(1)]);
  expect(await store.unsentAttempts()).toEqual([attempt(1), attempt(2, '2026-10-13')]);
  await store.markAttemptsSent([attempt(1).id]);
  expect(await store.unsentAttempts()).toEqual([attempt(2, '2026-10-13')]);
  await store.markSeen('fractions:7:3', NOW);
  await store.savePlacement({ state: { low: 3, high: 3, correctAtProbe: 0 }, done: true });
  await store.clearServerCopy();
  expect([
    await store.attemptsOn('2026-10-14'),
    await store.hasSeen('fractions:7:3'),
    await store.hasSeen('fractions:8:3'),
    await store.placement(),
  ]).toEqual([
    [attempt(1)],
    true,
    false,
    { state: { low: 3, high: 3, correctAtProbe: 0 }, done: true },
  ]);
});
```

Also update the migrate test: `SCHEMA_VERSION` is now 2.

- [ ] **Step 2:** Run `bun x jest --maxWorkers=1 test/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Append migration 2. Add the methods:
  - `mathProgress` parses each row and skips rows that fail a zod `TopicProgress` shape.
  - `saveMathProgress` uses `INSERT … ON CONFLICT(topic_id) DO UPDATE`, one JSON parameter through `json_each`.
  - `unsentAttempts` runs `WHERE sent = 0 ORDER BY at, rowid LIMIT ?`.
- [ ] **Step 4:** Run the test (PASS).
- [ ] **Step 5: Commit** — `feat: keep math progress, ratings, attempts and placement on the phone`

---

### Task 3: Serving and grading problems (pure)

**Files:**

- Create: `src/lib/math/practice.ts`
- Test: `test/practice.test.ts`

**Interfaces:**

```ts
export type Served = Readonly<{
  problem: Problem;
  topicId: string;
  difficulty: Difficulty;
  seed: number;
  key: string; // `${topicId}:${seed}:${difficulty}`
  expected: number; // predicted success at serving time
  isReview: boolean;
  learnerRating: number;
  itemRating: number;
}>;
export type MathState = Readonly<{
  progress: ReadonlyMap<string, TopicProgress>;
  itemRating: (key: string) => number | undefined; // `${topicId}:${difficulty}`
}>;
export function serveProblem(
  state: MathState,
  today: string,
  seed: number,
  topicOverride?: string,
): Served | null;
export type NoRewardReason = 'wrong' | 'too_easy' | 'used_hints' | 'repeat';
export type Graded =
  | { outcome: 'unreadable' }
  | {
      outcome: 'correct' | 'incorrect';
      progress: TopicProgress;
      itemKey: string;
      itemRating: number;
      attempt: MathAttempt;
      earns: boolean;
      reason: NoRewardReason | null;
      answer: string; // answerText(problem.answer)
    };
export function gradeAttempt(
  served: Served,
  given: string,
  ctx: {
    usedHints: boolean;
    seenBefore: boolean;
    today: string;
    at: number;
    id: string;
    current: TopicProgress;
  },
): Graded;
```

Rules:

- `serveProblem`:
  - Topic: `topicOverride` ?? `nextTopic(ONTARIO_GRAPH, progress, today)`; null when there is none.
  - Learner rating: `progress.get(topic)?.rating ?? 1000`.
  - Difficulty: `pickDifficulty(learner, d => itemRating(\`${topic}:${d}\`) ?? initialItemRating(d))`.
  - `isReview`: the topic is mastered and its review is due.
  - `expected = expectedScore(learner, item)`.
- `gradeAttempt`:
  - An unreadable answer changes nothing.
  - Otherwise: `updateRatings(learner, item, correct)`, then `recordAttempt(current, {correct, usedHints, isReview}, newLearner, today)`.
  - `earns = correct && earnsTime(expected) && !usedHints && !seenBefore`; `reason` is the first failing rule in that order.

- [ ] **Step 1: Failing tests** — `test/practice.test.ts`:

```ts
import { gradeAttempt, serveProblem } from '@/lib/math/practice';
import { newProgress } from '@/lib/math/engine';

const empty = { progress: new Map(), itemRating: () => undefined };
const ctx = (over = {}) => ({
  usedHints: false,
  seenBefore: false,
  today: '2026-10-14',
  at: 1,
  id: '01920000-0000-7000-8000-000000000001',
  current: newProgress('whole-number-operations'),
  ...over,
});

test('a fresh learner starts at the first topic, in the target band', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(served.topicId).toBe('whole-number-operations');
  expect(served.expected).toBeGreaterThanOrEqual(0.7);
  expect(served.expected).toBeLessThanOrEqual(0.85);
  expect(served.key).toBe(`whole-number-operations:42:${served.difficulty}`);
  expect(serveProblem(empty, '2026-10-14', 42)!.problem.prompt).toBe(served.problem.prompt);
});

test('a correct answer raises the rating, counts toward mastery and earns', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  const g = gradeAttempt(served, answerOf(served), ctx());
  expect(g).toMatchObject({ outcome: 'correct', earns: true, reason: null });
  if (g.outcome === 'unreadable') throw new Error();
  expect(g.progress.rating).toBeGreaterThan(1000);
  expect(g.progress.streak).toBe(1);
  expect(g.attempt).toMatchObject({
    topicId: served.topicId,
    correct: true,
    answerType: 'typed',
    day: '2026-10-14',
  });
  expect(g.itemRating).toBeLessThan(served.itemRating);
});

test('unreadable changes nothing', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(gradeAttempt(served, 'abc', ctx())).toEqual({ outcome: 'unreadable' });
  expect(gradeAttempt(served, '', ctx())).toEqual({ outcome: 'unreadable' });
});

test('a wrong answer shows the right one, resets the streak and earns nothing', () => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  const g = gradeAttempt(
    served,
    '-999999',
    ctx({ current: { ...newProgress(served.topicId), streak: 3 } }),
  );
  expect(g).toMatchObject({
    outcome: 'incorrect',
    earns: false,
    reason: 'wrong',
    answer: answerOf(served),
  });
  if (g.outcome === 'unreadable') throw new Error();
  expect(g.progress.streak).toBe(0);
});

test.each([
  ['used_hints', { usedHints: true }],
  ['repeat', { seenBefore: true }],
])('a correct answer earns nothing when %s', (reason, over) => {
  const served = serveProblem(empty, '2026-10-14', 42)!;
  expect(gradeAttempt(served, answerOf(served), ctx(over))).toMatchObject({
    outcome: 'correct',
    earns: false,
    reason,
  });
});

test('too easy (predicted above 90%) earns nothing', () => {
  const strong = {
    progress: new Map([
      ['whole-number-operations', { ...newProgress('whole-number-operations'), rating: 2400 }],
    ]),
    itemRating: () => undefined,
  };
  const served = serveProblem(strong, '2026-10-14', 42)!;
  expect(served.expected).toBeGreaterThan(0.9);
  expect(
    gradeAttempt(
      served,
      answerOf(served),
      ctx({ current: strong.progress.get('whole-number-operations')! }),
    ),
  ).toMatchObject({ earns: false, reason: 'too_easy' });
});

test('a due review is served first and marked as a review', () => {
  const due = { ...newProgress('fractions'), mastered: true, nextReviewDay: '2026-10-14' };
  const served = serveProblem(
    { progress: new Map([['fractions', due]]), itemRating: () => undefined },
    '2026-10-14',
    7,
  )!;
  expect([served.topicId, served.isReview]).toEqual(['fractions', true]);
});
```

`answerOf` is a test helper: `(s: Served) => answerText(s.problem.answer)`, imported from `@/lib/math/engine`. It works for number and expression answers. For a `choice` answer it returns the option text, and `checkAnswer` expects the index, so the helper must return `String(answer.correctIndex)` for choices.

- [ ] **Step 2:** Run `bun x jest --maxWorkers=1 test/practice.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `practice.ts` per the rules (≈80 lines). `attempt.answerType` is `'choice'` when `problem.answer.type === 'choice'`, otherwise `'typed'`.
- [ ] **Step 4:** Run the test (PASS).
- [ ] **Step 5: Commit** — `feat: serve problems in the target band and grade them on the phone`

---

### Task 4: Math rewards through core `earn()` (pure)

**Files:**

- Create: `src/lib/math/rewards.ts`
- Test: `test/math-rewards.test.ts`

**Interfaces:**

```ts
export type RewardInput = Readonly<{
  confirmed: readonly LedgerEvent[];
  pending: readonly LedgerEvent[];
  day: string;
  currentDay: string;
  planLocked: boolean;
  attemptId: string;
  answerType: 'typed' | 'choice';
  at: number;
  newId: () => string;
}>;
export type RewardResult =
  | { events: LedgerEvent[]; seconds: number }
  | { events: []; reason: 'plan_not_locked' | 'cap_reached' | 'not_today' | 'already_granted' };
export function mathReward(input: RewardInput): RewardResult;
```

Rules:

- `not_today` when `day !== currentDay`.
- Merge `confirmed` + `pending` with `mergeEvents`. Day events are those with `day === day`, and `outstandingBorrow` is computed over all events.
- Call `earn(dayEvents, { kind: 'math_reward', attemptId, answerType }, { day, at, newId }, DEFAULT_RULES, { planLocked, outstandingBorrow })`.
- `plan_not_locked` and `already_granted` pass through.
- A reward of 0 seconds becomes `cap_reached`, with no events.

- [ ] **Step 1: Failing tests** — `test/math-rewards.test.ts`:

```ts
import { mathReward } from '@/lib/math/rewards';
import { ledgerEvent } from './support/fakes';

let n = 0;
const newId = () => `01920000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const base = {
  confirmed: [],
  pending: [],
  day: '2026-10-14',
  currentDay: '2026-10-14',
  planLocked: true,
  attemptId: 'a1',
  answerType: 'typed' as const,
  at: 1,
  newId,
};

test('a typed correct answer pays 3 minutes', () => {
  const r = mathReward(base);
  expect(r).toMatchObject({ seconds: 180 });
  if (!('seconds' in r)) throw new Error();
  expect(r.events).toEqual([
    expect.objectContaining({ kind: 'math_reward', seconds: 180, refId: 'a1', day: '2026-10-14' }),
  ]);
});

test('plan not locked', () => {
  expect(mathReward({ ...base, planLocked: false })).toEqual({
    events: [],
    reason: 'plan_not_locked',
  });
});

test('cap reached: no zero-second event', () => {
  const full = Array.from({ length: 15 }, (_, i) =>
    ledgerEvent(100 + i, { kind: 'math_reward', seconds: 180, refId: `x${i}` }),
  );
  expect(mathReward({ ...base, confirmed: full })).toEqual({ events: [], reason: 'cap_reached' });
});

test('the same attempt is never paid twice', () => {
  const paid = ledgerEvent(1, { kind: 'math_reward', seconds: 180, refId: 'a1' });
  expect(mathReward({ ...base, pending: [paid] })).toEqual({
    events: [],
    reason: 'already_granted',
  });
});

test('a reward repays borrowed time first', () => {
  const borrow = ledgerEvent(2, { kind: 'unlock_borrow', seconds: 600 });
  const r = mathReward({ ...base, confirmed: [borrow] });
  if (!('seconds' in r)) throw new Error();
  expect(r.events.map((e) => [e.kind, e.seconds])).toEqual([
    ['math_reward', 180],
    ['borrow_repay', -180],
  ]);
});

test('not the current day', () => {
  expect(mathReward({ ...base, day: '2026-10-13' })).toEqual({ events: [], reason: 'not_today' });
});
```

- [ ] **Step 2:** Run (FAIL). **Step 3:** Implement. **Step 4:** Run (PASS).
- [ ] **Step 5: Commit** — `feat: pay math time through core earn(), never past the daily cap`

---

### Task 5: Attempts sync

**Files:**

- Modify: `src/lib/api/client.ts` (`pushMathAttempts`), `src/lib/sync.ts`, `test/support/fakes.ts`
- Test: `test/api-client.test.ts`, `test/sync.test.ts`

**Interfaces:**

- `pushMathAttempts(attempts: readonly MathAttempt[]): Promise<ApiResult<LedgerSyncResult>>` → `POST /v1/math/attempts` with `{ attempts }`. The response has the same shape as the ledger push.
- `SyncDeps.api` adds `'pushMathAttempts'`. After the ledger push, the sync pushes unsent attempts in batches of 500 (`MAX_ATTEMPTS_PER_BATCH`), marking `added`, `ignored` and `rejected` as sent. Rejected attempts are future-dated and can never be accepted. Failures map to statuses as for ledger events.
- `SyncReport` is unchanged. Attempts are not counted in it.

- [ ] **Step 1: Failing tests.**
  - api-client: `pushMathAttempts` posts to `/v1/math/attempts`.
  - sync:
    - "math attempts are pushed and marked sent": 2 unsent → 1 call → 0 unsent.
    - "an offline attempt push keeps them unsent and stops the sync": the status is `offline`.
- [ ] **Step 2–4:** RED → implement (`pushAttempts(deps)`, bounded by `MAX_ROUNDS`) → GREEN.
- [ ] **Step 5: Commit** — `feat: sync math attempts to the server`

---

### Task 6: Math tasks pass themselves

**Files:**

- Create: `src/lib/math/tasks.ts`
- Test: `test/math-tasks.test.ts`

**Interfaces:**

```ts
export const MATH_TASK = { problems: 10, minRate: 0.7, smallCorrect: 1 } as const;
export type TaskTarget = { met: boolean; answered: number; correct: number; label: string };
export function mathTarget(attempts: readonly MathAttempt[], small: boolean): TaskTarget;
export function checkMathTasks(
  deps: { api: Pick<Api, 'decideVerdict'>; store: LocalStore },
  today: Today,
  currentDay: string,
): Promise<string[]>; // ids of tasks it passed
```

Rules:

- `label` for the full version: `"${answered} of 10 problems, ${pct}% correct (needs 70%)"`; small: `"${correct} of 1 correct problem"`.
- `checkMathTasks` only runs when `today.day === currentDay` and the plan is locked. It checks each task with `verifier === 'math'` that isn't excused (away and not kept) and has no `pass` verdict.
  - When the target is met, it calls `decideVerdict(task.id, { day, outcome: 'pass' })`.
  - On `ok`, or a `verdict_not_pending` refusal, it records kv `math_task_passed:<taskId>`, so it never sends twice.
  - It skips tasks already recorded.

- [ ] **Step 1: Failing tests** (`test/math-tasks.test.ts`, using `testServices`, a locked `sampleToday` whose task 1 is `verifier: 'math'`, and attempts saved to the store):
  - "10 problems at 70% passes the full version" (7 of 10 correct → pass sent with outcome `pass`)
  - "9 problems or 60% does not"
  - "small version on a bad day" (`dayRecord.kind === 'bad'`, 1 correct → pass)
  - "sent once" (a second call sends nothing)
  - "an already decided task is recorded and not retried"
  - "excused on an away day → nothing sent"
  - "a draft plan or another day → nothing sent"
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5: Commit** — `feat: pass a day's math task when its target is met on the phone`

---

### Task 7: Placement and Practice screens

**Files:**

- Create:
  - `src/screens/math/use-practice.ts`
  - `src/screens/math/index.tsx` (`MathScreen`)
  - `src/screens/math/placement.tsx` (`PlacementScreen`)
  - `src/screens/math/answer-input.tsx`
  - `src/app/math.tsx`, `src/app/math-placement.tsx`
- Modify: `src/screens/root-stack.tsx` (add both to the paired group), `src/screens/today/index.tsx` (a "Math" button `open-math`; a math task shows its `mathTarget` label)
- Test: `test/math-screen.test.tsx`

**Behavior (Math screen):**

- **First open:** with no progress and placement not done, it shows "Find your level" with two options:
  - "Take the placement test" (`start-placement`): "About 20–30 problems. It doesn't earn time."
  - "Start from the beginning" (`skip-placement`), which saves the placement as done with nothing known.
- **Otherwise it serves a problem:**
  - It shows the topic title, "Review" when `isReview`, the prompt (`problem-prompt`) and the mastery count "`streak` of 5 in a row".
  - Answer: `answer-input` (TextInput), with helper keys inserting `^`, `/`, `(`, `)`, `√`, `π` and `x`, each 48 dp and labelled.
  - Buttons: `check` (disabled while the input is empty), `hint` (shows the next hint, marks hints used) and `show-answer` (counts as wrong: grades with an empty-match `'?'` → incorrect).
- **After checking:**
  - **Correct:** "Correct" plus the reward line: "+3 min", or the reason ("Too easy to earn time", "Earns nothing after a hint", "Already seen, so no time", "Lock today's plan to earn time", "Today's math time is used up").
  - **Incorrect:** "Not quite. The answer is X", then the steps.
  - **Unreadable:** "I couldn't read that. Write it like 3/4, 2.5 or 2x+1." The input is kept and the problem stays.
  - `next` serves a new problem.
- **Persistence:** after a correct or incorrect grade, the hook:
  - saves progress, the item rating, the attempt and `markSeen`
  - computes the reward with `mathReward`, using the confirmed/pending ledger, the saved snapshot (`planLocked`, `day`) and the phone's `currentDay`
  - enqueues the reward events, then runs `checkMathTasks`
- `warmChecker()` runs on mount.

**Behavior (Placement screen):**

- It walks `ONTARIO_GRAPH.topics` with `placementProbe` and serves the probe topic at difficulty 3 (seed random).
- Unreadable means ask again. Correct or incorrect goes through `recordPlacementAnswer` (no rating changes, no reward, but the attempt is saved and synced).
- When the probe is `null`, it calls `placementProgress` → `saveMathProgress`, saves the placement `{done: true}`, and shows "You start at: <topic title>" with a `go-practice` button.

**Tests (`test/math-screen.test.tsx`, using `testServices` with a locked snapshot; `Math.random` mocked for deterministic seeds):**

- "first open offers placement or a start from the beginning"
- "start from the beginning serves the first topic"
- "a correct answer with a locked plan earns 3 minutes and is saved" (the attempt is in the store, a reward event is pending)
- "an unreadable answer asks again and saves nothing"
- "a wrong answer shows the right answer and the steps"
- "a hint marks the answer as earning nothing"
- "plan not locked: correct answers say how to earn"
- "placement: two right answers at each probe move up; finishing saves progress and offers practice" (generate expected answers through `answerText` of the same seeded problem)
- "Today shows Math and a math task's progress"

- [ ] **Steps:** tests RED → implement → GREEN (`bun x jest --maxWorkers=1 test/math-screen.test.tsx`, then the whole mobile suite with `--maxWorkers=1`) → commit `feat: add placement and Practice: problems in your band, checked on the phone`

---

### Task 8: Emulator flow and docs

**Files:**

- Modify: `apps/mobile/e2e/flows/pair-and-today.yaml`, `README.md`
- Create: `docs/adr/0013-math-practice-on-the-phone.md`

- [ ] **Step 1: Maestro**, appended after the bad-day screenshot:
  - `tapOn: { id: 'open-math' }`, then `tapOn: { id: 'skip-placement' }`
  - wait for `problem-prompt` (screenshot `07-practice`)
  - `tapOn: { id: 'answer-input' }`, `inputText: '-1'`, `hideKeyboard`, `tapOn: { id: 'check' }`
  - wait for `Not quite.*` (screenshot `08-feedback`)
- [ ] **Step 2: ADR 0013:**
  - the CAS on the phone (spike numbers, one import module, background warm-up, the bundle built only in the cloud)
  - local math state
  - the earning rules (in band ≤ 0.90, no hints, no repeats, plan locked, cap) through core `earn()`
  - math task targets (10 problems at ≥ 70%; 2-minute version 1 correct; only `pass` is sent)
  - placement doesn't earn
  - deferred to P4c-2: worked and faded examples, mock exams and gates, the word-problem bank
- [ ] **Step 3:** README phone section: "Math practice on the phone: placement, problems in your band, checked by the CAS."
- [ ] **Step 4:** `bun x prettier --check` on the changed files; commit; push; open the PR; read the emulator screenshots.
