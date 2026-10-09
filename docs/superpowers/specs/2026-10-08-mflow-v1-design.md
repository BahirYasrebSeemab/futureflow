# mflow v1 — Design Spec

- **Date:** 2026-10-08
- **Status:** Draft, awaiting owner review
- **Owner:** Bahir Yasreb Seemab

---

## 1. Summary

mflow is an Android app that makes you **earn your social-media time with verified progress** toward the person you want to become. An AI "future self" turns your target identity into skills and a roadmap. Each night it proposes the next day's plan. During the day it verifies the work with real evidence (GitHub diffs, math answers checked by a computer algebra system, reading logs) and pays out phone time from a ledger. A native Android guard enforces that ledger on Instagram, TikTok, games and similar apps.

The design follows the ideas in _Atomic Habits_: identity-based habits, implementation intentions, habit stacking, the Goldilocks rule, the 2-minute rule, "never miss twice", and habit tracking.

### 1.1 Who it is for

v1 has one user: the owner. It runs on the owner's phone (Redmi A5, about 3 GB RAM, Android, HyperOS/MIUI). Multi-user product concerns are out of scope (see §3.3), but the architecture must not block them.

### 1.2 Owner's identities for v1

1. **Senior software engineer.** Evidence comes from GitHub.
2. **Strong at math, enough to earn Ontario Grade 11–12 math credits as a mature student in Toronto.** The owner starts at about **arithmetic level** after a long break from math.
3. **Reader.** Physical books and PDFs, logged with short "what I learned" summaries.

### 1.3 Success criteria for v1

- The owner uses mflow daily for 30 consecutive days without uninstalling it or disabling the guard for more than one day in total.
- Every task that pays out time is backed by stored evidence plus a verdict.
- Math progress is measurable: a placement result at day 0 and rating/mastery growth on the knowledge graph by day 30.
- Running cost is **$0/month**, or at most about $2 in the worst case where free tiers disappear.
- The repo is good enough to show in a portfolio: a clean architecture, ADRs, tests at every layer, green CI, and a README with a demo.

---

## 2. Research findings that shape the design

### 2.1 Toronto mature-student route (owner is 18+)

Findings (sources in §17):

- **OSSD** = 30 credits (18 compulsory, including **3 math** and **4 English**), plus the literacy requirement (OLC4O).
- A **mature student** is 18+ and enrolled to get an OSSD. TDSB adult day schools (for example CALC, Yorkdale ALC) serve this group.
- **On registration**, new students without a recent Ontario transcript write an **English/ESL assessment, and possibly math and science**. The results set placement.
- **Grade 9–10:** up to **16 credits** can be granted through _individual assessment / equivalency_. **There is no challenge exam for Grades 9–10.**
- **Grade 11–12:** up to **10 of 14** credits can be granted through either equivalency or **challenge**. **At least 4 Grade 11–12 credits must be earned by taking courses.** Grade 12 English must be completed.
- **Equivalency credits carry no percentage grade and do not count as prerequisites** for college or university.
- **A challenge works like a final exam:** formal tests are worth 70% and other assessment 30%. **The percentage goes on the transcript, and so does a fail** once the final test stage has started.
- Free adult high-school programs require eligible residency status (citizen, PR, refugee). This depends on the owner's immigration status, which mflow does not handle.
- PLAR eligibility at CALC includes having a **Grade 10 English credit or equivalent**.

**What this means for mflow:**

1. Gate A, _"TDSB math placement ready"_: strong Grade 9–10 mastery (MTH1W, MPM2D) so the placement assessment and the equivalency go well.
2. Gate B, _"Challenge-ready"_ for each Grade 11–12 course (MCR3U, then MHF4U, then MCV4U). Because fails are recorded, mflow only marks a course challenge-ready after **repeated mock exams at ≥ 80%**.
3. University CS and engineering programs generally require graded **MHF4U and MCV4U**. Equivalency (ungraded) does not satisfy that, so the strategy is to **challenge or take** those courses with a high mark. The owner should confirm the details with a TDSB guidance counsellor. mflow's job is making the owner ready.
4. **English is also a gate** (placement assessment, PLAR eligibility, Grade 12 English). It is out of scope for v1 but is the **first v1.1 track** (§3.2).

### 2.2 Fastest reliable way to rebuild math from arithmetic

These are evidence-based techniques, and mflow implements each one directly:

| Technique                                    | What it means                                                           | mflow mechanism                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Mastery learning on a prerequisite graph** | Don't move on until the prerequisites are solid                         | Knowledge graph from arithmetic to MCV4U; a topic unlocks only when its prerequisites are mastered |
| **Worked examples, then faded examples**     | Beginners learn faster by studying solved examples before solving alone | Every topic: a worked example, then a partially solved one, then full practice                     |
| **Retrieval practice**                       | Recalling builds memory better than rereading                           | Practice is always answer-producing, never passive                                                 |
| **Spaced repetition**                        | Reviews at growing intervals                                            | Per-topic review schedule                                                                          |
| **Interleaving**                             | Mixing old and new problem types                                        | Review problems are mixed into new-topic sessions                                                  |
| **Desirable difficulty (~85% rule)**         | Learning is fastest at a high but imperfect success rate                | Elo-based selection targets 70–85% success                                                         |
| **Immediate feedback**                       | Know right away whether you were correct                                | CAS checks instantly; hint after a miss, full solution after the second miss                       |

mflow does not promise a date. It **forecasts** an ETA for each gate from the owner's measured mastery rate.

### 2.3 AI and cost

- **Gemini API free tier** (Flash / Flash-Lite) for anything that needs generated text: the coach, planning, word problems. Free-tier content may be used by Google to improve its products, so mflow sends only what each feature needs.
- **Jev** (TypeSafe AI, released September 2026) for typed decisions (Choice / Score / Noul). It costs $0.042 per million input tokens, has no free tier, and is unreliable at arithmetic and dates. Used only for judging; **never for math**.
- **On-device LLMs are excluded.** The Redmi A5's 3 GB RAM is below the ~8 GB that Gemma-class models need, and the phone doesn't support Gemini Nano.
- **Cloudflare Workers free plan:** 100k requests/day, 10 ms CPU per invocation (time waiting on network calls doesn't count), 5 cron triggers. **D1 free plan:** 5 GB storage, 5M row reads and 100k row writes per day.
- **EAS free plan:** 15 Android builds/month, OTA updates for up to 1K monthly active users.

---

## 3. Scope

### 3.1 In v1

- Onboarding: identities, skill breakdown, GitHub connection, math placement, roadmap, settings, Xiaomi survival checklist.
- Nightly review plus plan proposal; edit and lock; morning fallback.
- Day types: normal, rest (per skill), bad, away.
- Verifiers: **GitHub, Math, Reading, Usage**.
- Event-sourced time ledger with earning rules and caps.
- Android guard: app blocking, Chrome domain blocking, shield, emergency unlock, tamper and phone-off detection.
- Math engine: knowledge graph **L0–L2 (arithmetic through Grade 10)** fully built; **L3–L5 (MCR3U, MHF4U, MCV4U)** have their graph defined, and their generators are filled in during later milestones of the same v1 roadmap (see §15).
- Future-self coach chat.
- Cloudflare Worker backend, CI, ADRs, tests.

### 3.2 v1.1 (next, already designed for)

- **English track** (placement, PLAR, ENG4U): daily writing prompts scored against a rubric, plus reading in English.
- **LeetCode verifier** (checks accepted submissions through LeetCode's unofficial GraphQL API).

### 3.3 Later / product version (not designed here)

- iPhone (Screen Time API module), laptop/browser extension.
- **Prayer tracking.**
- "Any skill" evidence packs (camera, GPS, photo progress). Packs are **data on built-in evidence tools**, because app stores forbid downloading new code.
- Multi-user accounts, subscriptions, Play Store accessibility-policy review.
- Rewriting the backend in Node, done by the owner as a learning project. Hono keeps the HTTP layer portable.

---

## 4. Architecture

### 4.1 System view

```
┌──────────── Phone (Expo app, Android) ──────────┐       ┌──── Cloudflare (free) ───────┐
│ React Native UI: plan, coach, math, reading     │       │ Worker (Hono)                │
│ math-engine (generate + check, offline)         │◄─────►│  REST API /v1/*              │
│ expo-sqlite: outbox, plan cache, math progress  │ HTTPS │  AI router → Gemini / Jev    │
│ Kotlin module "usage-guard":                    │       │  Verifiers: GitHub, Reading  │
│   AccessibilityService (foreground app, URLs)   │       │ Cron: hourly tick, weekly    │
│   UsageStats (minute accounting)                │       │ D1 (source of truth)         │
│   Native Shield Activity, ForegroundService     │       └──────────────────────────────┘
│   SharedPreferences: balance + blocklist        │
└─────────────────────────────────────────────────┘
```

### 4.2 Monorepo layout (Bun workspaces, TypeScript everywhere)

```
mflow/
├─ apps/
│  ├─ mobile/                 Expo app (EAS)
│  │  └─ modules/usage-guard/ Kotlin Expo module
│  └─ api/                    Cloudflare Worker (Hono)
├─ packages/
│  ├─ core/        pure domain: ledger, allowance, day types, plan lifecycle,
│  │               verifier interface, skill progress. No I/O.
│  ├─ contracts/   zod schemas for the API and AI outputs (the edges only)
│  ├─ math-engine/ knowledge graph, generators, checker, Elo, scheduler
│  └─ ai/          talk()/judge() router + provider adapters + budget guard
├─ docs/adr/  docs/superpowers/{specs,plans}/
└─ learning/   (gitignored: the owner's private learning notes)
```

### 4.3 Architectural rules

1. **Hexagonal (ports and adapters).** `core` defines the rules as pure functions and declares ports (interfaces). Apps provide adapters (D1, SQLite, HTTP, Gemini, GitHub). `core` imports nothing from apps or frameworks.
2. **zod only at the edges.** It validates HTTP bodies, AI outputs, GitHub responses and stored JSON. Internal code uses plain TypeScript types inferred from or mapped to the schemas.
3. **Only the phone enforces.** The server can't block apps, so the phone holds a local balance and enforces it offline.
4. **Event-sourced time ledger.** Balance = sum of append-only events. Events are never updated or deleted. Corrections are new events.
5. **Idempotency everywhere.** Every client-originated event has a client-generated UUIDv7. The server ignores duplicates.
6. **Time.** The day boundary is **04:00 local** in the device timezone. Durations use a monotonic clock (`SystemClock.elapsedRealtime`) and are reconciled against server time.
7. **Portability.** The domain and HTTP layers avoid Workers-only APIs, except in the adapter layer (D1, cron, env bindings).

---

## 5. Domain model (`packages/core`)

```ts
type Identity = { id; title; why; deadline? }; // "Senior software engineer"
type Skill = { id; identityId; name; rubric; restWeekday? }; // "Debugging", rest on Fri
type Milestone = { id; skillId; title; targetDate?; doneAt? };
type TaskVersion = { title; criteria; seconds };
type TaskSpec = {
  id;
  skillId;
  when;
  verifier: VerifierKind;
  full: TaskVersion;
  twoMinute: TaskVersion;
};
type Plan = { date; status: 'draft' | 'locked'; tasks: TaskSpec[]; lockedAt? };
type DayType = 'normal' | 'bad' | 'away'; // rest is per skill, derived
type AwayWindow = {
  id;
  place;
  from;
  to;
  keptTaskIds;
  verified: 'pending' | 'yes' | 'no' | 'unknown';
}; // core stores one DayRecord per day the window covers
type Evidence = { id; taskId?; kind; ref; capturedAt; payload }; // commit SHA, attempt id…
type Verdict = { evidenceId; taskId; outcome: 'pass' | 'fail' | 'pending'; confidence; by };
type LedgerEvent = { id; day; at; kind; seconds; reason?; refId? }; // integer seconds; rules are configured in seconds too
type VerifierKind = 'github' | 'math' | 'reading' | 'usage';
```

### 5.1 Ledger event kinds

`base_grant` · `task_reward` · `all_done_bonus` · `math_reward` · `usage_spend` · `unlock_borrow` · `borrow_repay` · `expire` · `correction`

### 5.2 Verifier port

```ts
interface Verifier<E> {
  kind: VerifierKind;
  collect(ctx): Promise<E[]>; // gather new evidence
  judge(task: TaskSpec, evidence: E[]): Promise<Verdict>; // pass / fail / pending
}
```

GitHub, Math, Reading and Usage implement this interface. Future packs (LeetCode, English, prayer, camera) add new implementations without changing `core`.

---

## 6. Daily loop

### 6.1 Defaults (all configurable, stored as one `Rules` object in `core`)

| Rule                     | Default                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| Day boundary             | 04:00 local                                                          |
| Nightly reminder         | 21:00                                                                |
| Base allowance           | 15 min                                                               |
| Daily cap (all earnings) | 120 min                                                              |
| Math reward              | 3 min per correct in-band problem, cap 45 min/day                    |
| All-tasks-done bonus     | 15 min                                                               |
| Plan size                | 3–5 tasks                                                            |
| Unused time              | expires at the day boundary                                          |
| Emergency unlock         | ≥20-character reason, 10 min wait, grants 10 min borrowed, max 2/day |
| Heartbeat                | every 15 min                                                         |

### 6.2 Night

1. **Nightly review** (server, triggered by the hourly tick at the user's reminder hour). It gathers today's verdicts, math results, reading, usage, unlocks and guard gaps. The coach (`talk`) writes a short, specific review.
2. **Plan proposal.** The coach proposes 3–5 tasks from roadmap milestones, skill state, today's results, rest days and recent misses. Each task has a `verifier`, `criteria`, `when` (time and anchor habit), and `minutes`.
3. **Edit and lock.** The owner edits the draft. The coach can push back if the plan is too light or too heavy (Goldilocks). **Lock** makes the plan immutable.
4. **Fallback.** If there's no locked plan by the day boundary, the owner can lock it in the morning. **Until a plan is locked, only `base_grant` is paid.**

### 6.3 Day

- `base_grant` is paid at the day boundary (or on the first sync of the day).
- **GitHub:** the hourly cron fetches new commits for linked repos, then calls `judge` once per open GitHub task. A pass emits `task_reward`.
- **Math:** the phone checks attempts and emits `math_reward` (in band, capped). A math _task_ passes when its target is hit (for example "10 problems from Topic X with ≥70% correct").
- **Reading:** a log entry gets a Score (0–5) for substance. A score of 3 or more passes the reading task.
- **Usage:** the guard emits `usage_spend` (1 min per minute spent in blocked apps or domains).
- When every task passes, `all_done_bonus` is paid.
- **Low-confidence verdicts** become `pending`. The coach asks the owner one question, and a `talk`-based decision resolves it. The system never silently approves or rejects.

### 6.4 Day types

|          | Rest                            | Bad                                    | Away                                                      |
| -------- | ------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Scope    | one skill                       | whole day                              | whole day (time window)                                   |
| Declared | in settings (weekday per skill) | that day, one tap                      | in advance or same day                                    |
| Effect   | no tasks for that skill         | tasks shrink to their 2-minute version | owner picks which tasks to keep; the rest are **excused** |
| Limit    | 1 per skill per week            | 1 per week                             | unlimited if verified; 2 unverified per month             |
| Streak   | unaffected                      | preserved                              | excused tasks don't count as misses                       |

**Away verification:** the phone gets a **coarse** location at the window start and whenever the app opens during the window. It computes the distance to home **on the device** and sends only `{ away: boolean, distanceKm: rounded to 10 }`. **Coordinates never leave the phone.** If the owner is found at home during a declared away window, away mode is cancelled and the excused tasks count again. If location is unavailable, the day is marked `unknown` and counts against the 2-per-month allowance.

**Safety nets:** after a missed day, the next proposed plan is lighter and framed as the comeback ("never miss twice"). Every passed task counts as an identity **vote** shown in the UI.

### 6.5 Phone off and tamper

- **Phone off** is detected by a heartbeat gap followed by `BOOT_COMPLETED` or a reset uptime. It's labeled "Phone off" and is **not** a miss. If the phone was off for a whole day, the next morning the owner may reclassify that day as bad or away.
- **Guard disabled** means a heartbeat gap without a reboot, or the accessibility service turned off. It's shown in the nightly review and counts as a miss for that day.
- **Clock tampering:** durations come from the monotonic clock, and the server rejects events timestamped well in the future.

---

## 7. Android guard (`apps/mobile/modules/usage-guard`, Kotlin)

| Concern              | Mechanism                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foreground detection | `AccessibilityService` (`TYPE_WINDOW_STATE_CHANGED`)                                                                                                                        |
| Accurate minutes     | `UsageStatsManager.queryEvents`, reconciled against the accessibility timeline                                                                                              |
| Blocking             | Launch the native **Shield Activity** over the blocked app (no overlay permission needed)                                                                                   |
| Browser loophole     | Read Chrome's URL bar node through accessibility and match a domain blocklist. Known to be fragile; covered by an ADR and a manual test                                     |
| Staying alive        | `ForegroundService` with a notification showing "N min left"; a WorkManager watchdog; the onboarding Xiaomi checklist (Autostart, No battery restrictions, lock in recents) |
| Works without JS     | Balance and blocklist live in `SharedPreferences`, so the service and shield work even if the React Native runtime is dead                                                  |
| Never blocked        | Dialer, SMS, emergency apps, mflow itself                                                                                                                                   |

**Module API (TS):** `setBlockedApps(pkgs)`, `setBlockedDomains(domains)`, `setBalance(minutes, asOf)`, `getUsage(from, to)`, `drainSpendEvents()`, `isGuardHealthy()`, `openXiaomiSettings(kind)`, event `onShieldAction`.

**Emergency unlock flow (on the shield):** reason of at least 20 characters, a 10-minute non-skippable countdown, then `unlock_borrow` +10. The next day's earnings are reduced first through `borrow_repay`.

---

## 8. AI layer (`packages/ai`)

```ts
talk(purpose: TalkPurpose, context): Promise<string | T>          // coach, plan, review, word problems
judge(question: Choice | Score | Noul, state): Promise<Decision>  // { value, probabilities?, confidence }
```

- **Providers:** `talk`: Gemini Flash-Lite, then Gemini Flash, then Groq. `judge`: **Jev** when a key is configured, otherwise Gemini with a JSON schema that imitates the Jev output shape. Providers are adapters behind one interface, so switching is configuration only.
- **Structured output:** every structured call gets a JSON schema produced from zod. The output is validated; on failure the call retries once with a repair prompt, then moves to the next provider.
- **Confidence threshold:** `judge` results below 0.75 confidence become `pending` (§6.3).
- **Budget guard:** daily counters per provider in D1. At 80% of the free quota, non-essential `talk` (chat flourish) is cut. Verification always keeps priority.
- **Data minimization:** prompts contain only what the call needs. No location, ever.

---

## 9. Coach and onboarding

### 9.1 Onboarding (about 20 min, conversational)

1. Identities (1–3) with _why_ and deadline.
2. The coach proposes skills for each identity; the owner edits them. For math, the skills are the knowledge-graph levels.
3. Evidence baseline: connect GitHub with a **fine-grained, read-only** token (stored in D1, encrypted with AES-GCM using a key held in Worker secrets; see §13.2), which gives a repo scan and baseline levels. Then the **math diagnostic** (§10.4).
4. Roadmap milestones per skill. Re-planned at most monthly.
5. Settings: blocked apps and domains, rest weekday per skill, home location (stays on the device), reminder time.
6. Xiaomi checklist, which must pass `isGuardHealthy()` before onboarding finishes.

### 9.2 Persona

"You, a few years from now, who already became it." The system prompt is built from the owner's own onboarding words.

- Rules: specific, evidence-based, short. No generic motivation.
- At most 2 push notifications a day.
- **Distress guardrail:** if a message suggests genuine distress, the coach drops the tough persona and responds plainly and supportively.

### 9.3 Memory

The server stores a profile, **weekly summaries**, skill state, and the current day's evidence. Full chat history isn't resent on each call. Chat transcripts are kept for 30 days, then summarized and deleted.

---

## 10. Math engine (`packages/math-engine`)

### 10.1 Knowledge graph (data, versioned JSON)

`Level → Topic`, where each topic lists its prerequisite topics.

| Level                   | Covers                                                                                                                                                      | Gate                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **L0 Arithmetic**       | whole-number operations, negatives, order of operations, factors and multiples, fractions, decimals, percents, ratios and rates, exponents and square roots | —                            |
| **L1 Grade 9 (MTH1W)**  | algebraic expressions, linear equations and inequalities, linear relations and graphs, slope, measurement and geometry basics, data                         | —                            |
| **L2 Grade 10 (MPM2D)** | systems of linear equations, analytic geometry, factoring, quadratic relations, right-triangle trig, sine and cosine laws                                   | **Gate A: placement ready**  |
| **L3 MCR3U**            | function characteristics, exponential functions, sequences and series plus financial math, trigonometric functions                                          | **Gate B1: challenge-ready** |
| **L4 MHF4U**            | polynomial and rational functions, exponential and logarithmic functions, trig functions and identities, combining functions                                | **Gate B2**                  |
| **L5 MCV4U**            | rates of change, derivatives and applications, vectors, lines and planes                                                                                    | **Gate B3**                  |

The topic lists for L1–L5 must be checked against the current Ontario curriculum documents (dcp.edu.gov.on.ca) when each level's generators are built. Each check is recorded in that level's plan.

### 10.2 Generators

`generate(seed, difficulty) → Problem { id, topicId, difficulty, prompt (LaTeX), answer (MathJSON), answerType, hints[], steps[] }`

- Deterministic: a seeded PRNG means the same seed always gives the same problem.
- Every generator also produces a **worked example** and a **faded example** (some steps blanked out).
- **Property tests** (fast-check): for thousands of seeds, the answer is verified against the problem by substituting it back or recomputing it.

### 10.3 Checker

| answerType          | Rule                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `number`            | exact rational match, or relative tolerance 1e-6 for decimals                          |
| `expression`        | Compute Engine simplifies `a − b` to 0; **fallback:** evaluate both at 5 random points |
| `set`               | unordered match of elements using the number/expression rules                          |
| `interval`, `point` | structural comparison                                                                  |
| `choice`            | exact match (earns half reward)                                                        |

Input uses a custom keypad (x², √, fraction, π, parentheses) that produces plain text, which is parsed into MathJSON and rendered as a preview.

### 10.4 Diagnostic (placement)

An adaptive walk over the graph. It starts mid-L0, steps down on misses and up on passes, and finds the **knowledge frontier**: the mastered topics whose dependents are not yet mastered. It takes about 20–30 problems and sets initial per-topic Elo ratings.

### 10.5 Learning loop per topic

worked example, then faded example, then practice (Elo-targeted at 70–85%), then **mastery check** (5 in a row, mixed difficulty, no hints), then spaced reviews at 1, 3, 7, 16 and 35 days, interleaved with new work. A failed review reopens practice.

### 10.6 Ratings

- Per-topic Elo for the owner. Each generator template has its own difficulty rating, starting from its difficulty parameter and updated from results.
- **Problem selection:** pick the next topic by priority (reviews due, then the current roadmap topic, then frontier topics), then pick the difficulty so the predicted success probability is between 0.70 and 0.85.

### 10.7 Mock exams and gates

A timed mock exam covers a level's topics, weighted like a course final. **Gate A** passes after 2 mock exams at ≥ 75%. **Gates B1–B3** pass after **3 mock exams at ≥ 80% across separate days**, because real challenge fails are recorded on the transcript.

### 10.8 AI word problems

A weekly cron asks `talk` for a batch of word problems for the current topics, each with a structured answer. **The CAS re-solves every one.** Mismatches are discarded. Survivors go into the problem bank, which syncs to the phone.

### 10.9 Earning (anti-farming)

Only in-band problems earn time (predicted success ≤ 0.90). Repeated problems earn 0. Choice problems earn half. Daily math cap is 45 min.

---

## 11. API (`apps/api`, Hono, `/v1`, envelope `{ ok, data, error }`)

| Method + path                                                               | Purpose                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| `POST /device/pair`                                                         | one-time pairing with a setup code → device token   |
| `GET /today`                                                                | plan, day type, balance snapshot, pending questions |
| `POST /plans/:date/propose` · `PUT /plans/:date` · `POST /plans/:date/lock` | plan lifecycle                                      |
| `POST /ledger/events` (batch, idempotent) · `GET /ledger?since=`            | ledger sync                                         |
| `POST /math/attempts` (batch) · `GET /math/bank?since=`                     | math sync                                           |
| `POST /reading`                                                             | reading log entry                                   |
| `POST /day-type` · `POST /away` · `POST /away/:id/verdict`                  | day types                                           |
| `POST /coach/messages` · `GET /coach/messages`                              | chat                                                |
| `POST /heartbeat`                                                           | guard liveness (includes `bootId` / uptime)         |
| `POST /onboarding/*`                                                        | identities, skills, roadmap, GitHub link            |

**Cron (2 of 5 triggers):** `hourly` (GitHub collect and judge, day rollover, nightly review and plan proposal at the reminder hour, heartbeat gap analysis); `weekly` (word-problem batch, coach weekly summary).

---

## 12. Storage

**D1 tables:** `devices`, `identities`, `skills`, `milestones`, `plans`, `tasks`, `evidence`, `verdicts`, `ledger_events`, `day_types`, `away_windows`, `heartbeats`, `reading_logs`, `math_attempts`, `math_ratings`, `problem_bank`, `coach_messages`, `coach_summaries`, `ai_usage`, `github_cursor`. Schema changes go through numbered SQL migrations (`wrangler d1 migrations`).

**Phone (expo-sqlite):** `outbox` (unsent events), `plan_cache`, `math_progress`, `problem_bank`, `settings`. The guard's state lives in `SharedPreferences`.

---

## 13. Errors, security, privacy

### 13.1 Failure handling

| Failure                           | Behavior                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| AI output invalid                 | 1 repair retry, then next provider                                                                  |
| All AI unavailable or over budget | plan = next roadmap tasks (deterministic template); verdicts become `pending`; never auto pass/fail |
| GitHub token invalid              | notify "Reconnect GitHub"; tasks become `pending`                                                   |
| Rebase / force-push               | verdicts are keyed to commit SHA; a passed task stays passed                                        |
| Cron run fails                    | logged; the next run resumes from `github_cursor`                                                   |
| Sync duplicate                    | ignored (UUIDv7 id)                                                                                 |
| Phone balance unknown             | default to the base allowance                                                                       |
| D1 error                          | 5xx with envelope, no internal details leaked                                                       |

### 13.2 Security

- Secrets (Gemini, Jev, GitHub token encryption key) live only in Worker secrets. The repo ships only `.env.example` / `.dev.vars.example`.
- The device token is 32 random bytes, **stored as a SHA-256 hash**, and sent as `Authorization: Bearer`.
- zod validation on every request body and query. Size limits on bodies.
- Rate limiting per device token (Workers Rate Limiting binding).
- The GitHub token is fine-grained, read-only (contents and metadata), and encrypted at rest with AES-GCM.
- Logs are structured JSON with **no personal data**: no chat text, summaries or location.

### 13.3 Privacy

Location never leaves the phone. Free-tier AI calls are minimized. Personal data never enters the repo.

---

## 14. Testing and CI

| Layer         | Tool                                                                                     | Target                                                               |
| ------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `core`        | Vitest, TDD                                                                              | ≥ 90% coverage; all rules in §6 have tests                           |
| `math-engine` | Vitest + fast-check                                                                      | property test per generator; checker equivalence table               |
| `contracts`   | Vitest                                                                                   | schema round-trip tests                                              |
| `ai`          | Vitest with recorded fixtures; **judge eval set** (~50 hand-labeled diffs and summaries) | measured judge accuracy recorded in an ADR before enabling auto-pass |
| `api`         | `@cloudflare/vitest-pool-workers` with local D1                                          | every endpoint + cron handlers                                       |
| `mobile`      | Jest + React Native Testing Library; **Maestro** E2E                                     | onboarding, lock plan, solve and earn, emergency unlock              |
| `usage-guard` | JUnit for accounting logic; a **manual device checklist** on the Redmi                   | survival, shield, phone-off vs tamper                                |

**CI (GitHub Actions):** install, lint, type-check, test, coverage gate ≥ 80% overall, on every push and PR. **EAS build only on `v*` tags.**

---

## 15. Delivery phases (each gets its own implementation plan, written when the phase starts)

| Phase                    | Deliverable                                                                                                             | Why this order                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **P1 Foundation**        | Monorepo, tooling, CI, `contracts` skeleton, **`core`** (ledger, rules, day types, plan lifecycle) with TDD, first ADRs | Everything depends on the domain rules; pure TS, fastest feedback                |
| **P2 Math engine L0–L2** | Graph, generators, checker, Elo, scheduler, diagnostic, mock exams                                                      | Math is the most urgent personal goal; pure TS                                   |
| **P3 API**               | Hono Worker, D1 migrations, auth, ledger sync, plans, AI router, GitHub and Reading verifiers, cron                     | Makes the domain real on a server                                                |
| **P4 Mobile app**        | Expo app shell, sync/outbox, plan UI, math UI, reading log, coach chat, onboarding                                      | The owner can start using mflow here (with soft blocking via notifications only) |
| **P5 Guard**             | Kotlin module, shield, usage accounting, Chrome domains, Xiaomi survival, heartbeat, away location check                | The hardest native part, built once the loop works                               |
| **P6 Ship**              | Maestro E2E, judge eval, README + demo GIF, EAS release `v1.0.0`                                                        | Portfolio-ready                                                                  |
| **P7 Math L3–L5**        | MCR3U, MHF4U, MCV4U generators and mock exams                                                                           | Built as the owner approaches each level                                         |

---

## 16. Decisions to record as ADRs

1. TypeScript monorepo with Bun workspaces; `bun x` for tools (no Turborepo yet: YAGNI)
2. Hexagonal core; zod only at the edges
3. Cloudflare Workers + Hono + D1 over a Node server (cron reliability on free tier; Node rewrite later)
4. Event-sourced time ledger
5. Phone-side enforcement and offline-first sync with idempotent events
6. Math checked on the phone (offline; 10 ms CPU limit)
7. AI split: Jev for judge, Gemini for talk; provider-agnostic router
8. No on-device LLM (3 GB RAM)
9. Location verdict computed on the device (privacy by design)
10. Accessibility service + native shield; Chrome URL reading is fragile
11. Expo + EAS dev builds; EAS builds only on tags (15/month budget)
12. Gates: challenge-readiness thresholds because fails are recorded

---

## 17. Sources

- TDSB CALC 21+ PLAR: https://sites.google.com/tdsb.on.ca/cityadultstudentservices/plar
- TDSB Adult High Schools: https://www.tdsb.on.ca/Adult-Learners/Adult-Credit-Programs/Adult-High-Schools
- TDSB adult assessments (CALC, YALC): https://sites.google.com/tdsb.on.ca/cityadultstudentservices/registration/assessments
- Ontario PPM 132 (mature-student PLAR): https://www.ontario.ca/document/education-ontario-policy-and-program-direction/policyprogram-memorandum-132
- YRDSB PLAR FAQ (challenge 70/30, transcript recording): https://www2.yrdsb.ca/schools-programs/school-programs-nav/school-programs/prior-learning-assessment-and-recognition-1
- Ontario adult learning — OSSD: https://www.ontario.ca/page/adult-learning-ontario-high-school-diploma
- Ontario secondary math curriculum: https://www.dcp.edu.gov.on.ca/en/curriculum/secondary-mathematics
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Jev (InfoQ): https://www.infoq.com/news/2026/10/typesafe-ai-jev-released/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Expo pricing: https://expo.dev/pricing
- Gemma 4 on Android (RAM): https://dev.to/rahul_patwa_f99f19cd1519b/gemma-4-on-android-complete-developer-guide-to-on-device-ai-f5b
- ML Kit GenAI (Gemini Nano devices): https://developers.google.com/ml-kit/genai
