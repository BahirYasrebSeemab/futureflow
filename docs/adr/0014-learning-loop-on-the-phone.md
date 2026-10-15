# 0014. The learning loop on the phone: examples, mock exams, the word-problem bank

- Status: accepted
- Date: 2026-10-15

## Context

Spec §10.5 wants each topic to start with a worked example and a faded example before practice.
§10.7 wants timed mock exams that decide the gates. §10.8 sends AI word problems to the phone
through a bank. ADR 0013 brought practice and the CAS to the phone.

## Decision

- **Worked, then faded, then practice.** A topic met for the first time (not mastered, no example
  seen) opens with a worked example: an easy problem with every step and the answer. Then comes a
  faded example: a new problem with all steps but the last, which the owner finishes and the phone
  checks. Either can be skipped. An example is shown once per topic, and reviews skip it.
  Examples use seeds of their own, so they never repeat the practice problem waiting behind them.
- **Examples and mocks earn nothing and change nothing.** No time, no rating, no streak, no
  practice attempt. They are learning and assessment; only practice earns (ADR 0013).
- **Mock exams** (L0–L2 today):
  - Every topic of the level at every difficulty (`recommendedMockSize`), two minutes a question,
    with a countdown.
  - No feedback until the end. Unreadable input asks again. When time is up, every unanswered
    question counts as wrong.
  - The result is saved once, at the end. Leaving early saves nothing, so a partial mock can't
    count.
  - At the end: the score, then each wrong question with its right answer (`displayAnswer`) and
    steps.
- **Gate A** (L2: 2 mocks ≥ 75% on separate days) is computed on the phone with the engine's
  `gatePassed`, which also requires that a mock covered every L2 topic.
- **The word-problem bank is re-verified on the phone.** The phone regenerates each bank problem
  from its topic, seed and difficulty. It keeps only the AI's story, and only when the
  regenerated exercise matches the bank's word for word. The answer, hints and steps are always
  the phone's own; the bank's `answer` field is never used. A mismatch (say, a different generator
  version) is skipped for good. A bank problem earns like any practice problem. The server sends
  only accepted problems, which stay pending until `JUDGE_AUTO_DECIDE` (ADR 0010), so the bank is
  empty for now.
- **Sync:** the bank is pulled last and is optional. A failure is logged and never changes the
  sync status.

## Consequences

- Gates B1–B3 arrive with L3–L5 (P7).
- Mock results stay on the phone. A server copy (for the coach) can come later.
