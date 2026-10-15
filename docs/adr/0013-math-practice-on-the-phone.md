# 0013. Math practice on the phone

- Status: accepted
- Date: 2026-10-15

## Context

Spec §10 puts practice on the phone, offline: problems are generated and checked there, and
math time is paid there (§6.3). The checker's expression answers need the CAS (Compute Engine).
On the free Worker the CAS can't run (ADR 0010), and this laptop (1.8 GB of RAM) can't bundle it.

## Decision

- **The real CAS runs on the phone.** A spike on an Android emulator (Hermes release build)
  measured: loading 57 ms, the first check 674 ms, then 17 ms per check, 20/20 right. The JS
  bundle grows from 3.6 MB to 9.1 MB. Hand-writing a smaller parser was the riskier way to teach
  something wrong, so we didn't.
  - One module (`src/lib/math/engine.ts`) imports the math-engine root; ESLint blocks it
    everywhere else.
  - Practice warms the CAS in the background when it opens, so the owner's first answer is
    checked at warm speed.
  - The bundle is built only in CI or EAS; never on a small machine.
- **Answers come only from math-engine generators and are checked only by its checker.**
  "Unreadable" means ask again and never costs anything. After a wrong answer the screen shows
  the right answer and the generator's worked steps. "Show answer" is an honest wrong attempt.
- **Problem choice:** reviews due first, then the next topic in the knowledge graph. The
  difficulty is picked so the predicted success is 70–85% (per-topic Elo for the owner, per
  topic-and-difficulty Elo for items).
- **Earning (§10.9), through core `earn()`**, so the phone and server share caps and rules:
  - the answer was correct, predicted success ≤ 0.90 when served, no hints, a problem not seen
    before (`topic:seed:difficulty`)
  - today's plan is locked and the snapshot is for the phone's current day
  - 3 min (half for multiple choice), at most 45 min of math a day, never a 0-second event
- **Math tasks:** the full version passes after ≥ 10 problems today with ≥ 70% correct; the
  2-minute version (bad day) after 1 correct problem. The phone sends only `pass`; a day that
  ends short simply has no pass.
- **Placement** is a binary search over the topics (two right answers mark a topic known, one
  wrong marks it not), at difficulty 3. It doesn't earn time. Topics placed as known come back as
  reviews due today, so a lucky guess is caught at once.
- **State:** math progress, item ratings, attempts, seen problems and the placement live in the
  phone's SQLite. They are the phone's own: "Pair again" keeps them. Attempts sync to
  `POST /v1/math/attempts`.

## Consequences

- A slow phone may still show a short pause if the owner answers before the warm-up finishes.
- Worked and faded examples, mastery checks as their own step, mock exams and gates, and the
  word-problem bank come in P4c-2.
- Math tasks use one target for every math task; per-topic tasks would need the plan to name a
  topic (later).
