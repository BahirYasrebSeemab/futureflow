# Future Flow P4c-2: worked examples, mock exams and the word-problem bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the learning loop on the phone (spec §10.2, §10.5, §10.7, §10.8):

- A new topic starts with a **worked example** (every step and the answer), then a **faded example** (the owner finishes the last steps), then practice.
- **Mock exams** for L0–L2 cover every topic at every difficulty, with **Gate A** (L2: 2 mocks ≥ 75% on separate days).
- Accepted **word problems** from the server's bank are served in practice. Their answers always come from the phone's own regeneration.

**Architecture:** Pure helpers (`examples.ts`, `mocks.ts`, `bank.ts`) over math-engine. A new SQLite migration 3 adds tables for seen examples, mock results and bank problems. New screens: `ExampleScreen` (inside Math), `MockScreen` and `MockListScreen`. The sync pulls the bank last, best effort.

**Spec:** `docs/superpowers/specs/2026-10-08-futureflow-v1-design.md` §10.2 (worked and faded examples), §10.5 (learning loop), §10.7 (mocks and gates), §10.8 (word problems), §10.9 (earning). ADRs 0010 (word problems, judge gate) and 0013.

## Global Constraints

- **Machine (1.8 GB of RAM):** never run repo-wide test, coverage or typecheck commands, or `expo export`. Locally use one file at a time with `bun x jest --maxWorkers=1`, and the whole mobile suite only in one worker. CI runs everything.
- Bun only. No AI attribution.
- **Never teach wrong:**
  - Every answer comes from a math-engine generator **on the phone**.
  - A bank problem is regenerated from `topicId + seed + difficulty`. It is skipped unless the regenerated `prompt` equals the bank's `prompt`.
  - The bank's own `answer` field is never used.
  - Shown answers use `displayAnswer`.
- **Earning:** worked and faded examples and mock exams earn **no time**, record no Elo change and change no mastery streak. They are learning and assessment, not practice. Mock attempts are not saved as practice attempts, so they don't count toward math tasks. Bank problems in practice earn exactly like generated ones.
- **Mocks:**
  - The size is `recommendedMockSize` (every topic × difficulties 1–5).
  - The time limit is `problems × 2 minutes`, shown as a countdown. When time runs out, unanswered questions count as wrong.
  - Unreadable input asks again and doesn't advance.
  - There is no feedback during the exam. At the end come the score, then each wrong question with its right answer and steps.
  - Results are kept on the phone. `gatePassed` decides Gate A.
- **Tests** live in `apps/mobile/test/**` and must keep 80% coverage.

## Review Focus

1. **The bank problem's prompt doesn't match the regenerated one** (generator version drift): it is skipped, never shown. Test "a mismatched bank problem is skipped".
2. **A mock's timer runs out with questions unanswered:** they count as wrong, and the result is saved once. Test "time up scores unanswered as wrong".
3. **A mock is left half-way** (navigating away): no result is saved, and Gate A can't be passed by partial mocks. Test "leaving a mock saves nothing".
4. **A worked example is shown only once per topic,** and practice still starts after a skip. Tests "examples once per topic" and "skip goes to practice".
5. **Two good L2 mocks on the same day** don't pass Gate A. Test "same-day mocks don't pass the gate".

---

### Task 1: Storage (migration 3)

- **Tables:**
  - `math_examples(topic_id PK, at)`
  - `mock_results(id PK, day, level, score REAL, result TEXT)`, where `result` is a JSON `MockResult`
  - `math_bank(id PK, seq INTEGER, topic_id, difficulty, problem TEXT, used INTEGER DEFAULT 0)`
  - kv `bank_cursor`
- **`LocalStore` additions** (writes queued):
  - `exampleSeen(topicId)`, `markExampleSeen(topicId, at)`
  - `saveMockResult(id, result)`, `mockResults(): MockResult[]`
  - `saveBankProblems(problems: BankProblem[], next: number)`: `INSERT OR IGNORE` plus the cursor, in one transaction
  - `bankCursor()`
  - `unusedBankProblem(topicId, difficulty): BankProblem | null`, `markBankUsed(id)`
- `clearServerCopy` keeps them all (they are the phone's own learning record; the bank only re-downloads).
- **Tests** (in `store.test.ts`):
  - the round-trips
  - "bank cursor advances with the page"
  - "an unused bank problem is returned once it is marked used, then not again"
  - the schema version is 3
- **Commit:** `feat: store worked-example marks, mock results and the word-problem bank`

### Task 2: Worked and faded examples

- **Pure** (`src/lib/math/examples.ts`):
  - `exampleProblem(topicId, seed): Problem`, generated at difficulty 1
  - `fadedSteps(steps): { shown: string[]; hidden: number }`, which keeps the first `max(1, steps.length - 1)` steps (the last is the owner's to finish) and always hides at least the answer line
- **Hook and screen** (`src/screens/math/example.tsx`, used by `MathScreen`): when the next problem's topic has `exampleSeen === false` and the topic isn't mastered, Math shows the **worked example**:
  - "Worked example · {topic}", the prompt, every step, and "Answer: {displayAnswer}"
  - a `try-faded` button opens the **faded example**: a new problem from the same topic with `fadedSteps`, plus the answer input and `check-faded`
  - the result reads "Correct" or "Not quite. The answer is X" plus the full steps
  - `start-practice` then marks the example seen and serves practice
  - a `skip-example` button marks it seen and goes straight to practice
- **Tests** (`examples.test.ts` + `math-screen.test.tsx`):
  - `fadedSteps` for 1, 2 and 4 steps
  - "a new topic opens with a worked example"
  - "the faded example is checked but earns nothing and records no attempt"
  - "examples once per topic"
  - "skip goes to practice"
  - "a review topic skips examples"
- Update the existing math-screen tests that expect a problem straight away: mark the first topic's example seen in their setup.
- **Commit:** `feat: open each new topic with a worked and a faded example`

### Task 3: Mock exams and Gate A

- **Pure** (`src/lib/math/mocks.ts`):
  - `startMock(level, seed) → { level, problems, endsAt }`, using `buildMockExam(ONTARIO_GRAPH, DEFAULT_REGISTRY, level, seed, recommendedMockSize(...))` and `endsAt = startedAt + problems.length * 120_000`
  - `finishMock(exam, outcomes: (CheckOutcome | null)[], day): MockResult`, where `null` (unanswered) counts as incorrect
  - `gateProgress(results): { passes: number; required: 2; passed: boolean }` for Gate A, through `gatePassed` and distinct days
- **Screens:**
  - `MockListScreen` (`/mocks`): one row per level L0–L2 (topic count, problem count, "Best: 82%"), plus Gate A progress "1 of 2 passing L2 mocks (75%+), on different days"
  - `MockScreen` (`/mock?level=L2`): "Question n of N", a countdown `mm:ss`, the prompt, the answer input and `mock-next`. Unreadable input asks again. The last question shows `mock-finish`.
  - At the end, or when time runs out: score "You scored 31 of 40 (78%)", then the wrong questions, each with `displayAnswer` and its steps
  - The result is saved once. Leaving early saves nothing (no result until finish).
  - A Math screen link `open-mocks` ("Mock exams") opens the list.
- **Tests** (`mocks.test.ts` + `mock-screen.test.tsx`):
  - pure scoring
  - "time up scores unanswered as wrong" (fake timers)
  - "leaving a mock saves nothing"
  - "same-day mocks don't pass the gate"
  - "two passing L2 mocks on two days pass Gate A"
  - "a mock shows no feedback until the end"
  - the list shows the best score
- **Commit:** `feat: add timed mock exams for L0–L2 and track Gate A on the phone`

### Task 4: The word-problem bank

- **API:** `getBank(since: number, limit = 50) → ApiResult<{ problems: BankProblem[]; next: number }>` at `GET /v1/math/bank`, validated with `BankProblemSchema`.
- **Sync:** after the attempts push, pull bank pages until a short page, bounded by `MAX_ROUNDS`. Bank failures **don't** change the sync status, because the bank is optional, and are logged by name.
- **Pure** (`src/lib/math/bank.ts`): `verifiedBankProblem(bank: BankProblem): Problem | null` regenerates from `topicId`, `seed` and `difficulty`.
  - It returns `null` when the generator is missing or `regenerated.prompt !== bank.prompt`.
  - Otherwise it returns `{ ...regenerated, prompt: bank.story }`, keeping the generator's answer, hints and steps.
- **Serving:** `nextProblem` asks the store for an unused bank problem at the chosen topic and difficulty. If `verifiedBankProblem` passes, it is served (`Served.key` = `bank:${id}`), and once graded it is `markBankUsed`. A mismatched one is marked used and skipped.
- **Tests:**
  - `bank.test.ts`: match, mismatch and unknown topic
  - `sync.test.ts`: "bank pages are pulled after attempts" and "a bank failure keeps the sync ok"
  - `math-screen.test.tsx`:
    - "a verified bank problem is served with its story"
    - "a mismatched bank problem is skipped"
    - "a bank problem earns like any other"
- **Commit:** `feat: serve accepted word problems, re-verified on the phone`

### Task 5: Emulator flow, ADR 0014 and docs

- **Maestro:** after the practice feedback screenshot:
  - Back, then `open-mocks` → screenshot `09-mocks`
  - tap the L0 row → screenshot `10-mock-question`
  - Back
- **Docs:**
  - ADR 0014: the learning loop on the phone (examples, mocks and gates, bank re-verification; no earning for examples and mocks)
  - README line
- Commit, push, open the PR, run the final review, then apply fixes per the standing workflow.
