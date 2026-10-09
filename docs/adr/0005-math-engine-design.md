# ADR 0005: Math engine — seeded generators, CAS checking, Elo scheduling

- Status: Accepted
- Date: 2026-10-08

## Context

The owner is rebuilding math from arithmetic toward Ontario MCV4U. Practice must work offline on a
3 GB Android phone, check answers exactly, never hand out a wrong answer key, and adapt difficulty.

## Decision

- **Generators** are pure functions `(seed, difficulty) → Problem` using a seeded PRNG (mulberry32).
  The same seed always gives the same problem on the phone and the server.
- **Answer checking** uses exact rationals for numbers. For expressions it uses Compute Engine's
  `isIdenticallyEqual`, and when that returns `undefined` it falls back to evaluating at 5 sample
  points. Malformed input is `unreadable`, not `incorrect`. "Simplify" problems also constrain the
  answer's _form_ (`maxTerms`, no brackets).
- **Tests use the CAS as an independent oracle**: property tests regenerate thousands of problems
  and re-derive each answer from the prompt text.
- **Elo** per topic for the learner and per (topic, difficulty) for items. The next problem's
  difficulty targets 70–85% predicted success. Problems predicted above 90% success earn no
  phone time.
- **Mastery**: 5 correct in a row without hints. Spaced reviews follow at +1, 3, 7, 16 and 35 days.
  A failed review reopens practice.

## Deviations from spec §10

- **Placement** is a binary search over the whole graph (2 questions per probe, at most 12 problems)
  instead of "start mid-L0, 20–30 problems". It's shorter for a tired learner. Because topics
  assumed mastered get a review due on day 0, wrong assumptions surface immediately.
- **Gates** count passes on **distinct days** for every gate (the spec only says this for B gates).

## Consequences

- No AI is needed to check math, and checking works offline.
- Placement assumes knowledge is roughly monotone along the graph order. The day-0 reviews
  correct it where it isn't (e.g. strong algebra but weak data skills).

## Deferred spec items (recorded after the P2a review)

These spec §10 items are intentionally not in P2a. Each has an owning phase:

| Spec item                                | P2a state                                                                      | Owner                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.2 `Problem.id`                       | Derivable as `${topicId}:${difficulty}:${seed}` (generators are deterministic) | P3: the API stores it                                                                                                                                                  |
| §10.2 `answerType` field                 | It is `answer.type`; a separate field would duplicate it                       | none (deviation)                                                                                                                                                       |
| §10.2 LaTeX prompts and MathJSON answers | Plain-text prompts and canonical text answers                                  | P4: rendering decides; the checker already parses both                                                                                                                 |
| §10.2 worked and faded examples          | Generators ship `steps`; fading is a UI concern over `steps`                   | P4                                                                                                                                                                     |
| §10.5 mastery check of mixed difficulty  | Streak of 5 at the scheduled difficulty                                        | P4: a mastery _check_ is a session-level choice of difficulties (the scheduler targets one band per attempt); the app picks mixed difficulties for the 5-problem check |
| §10.7 timed, final-weighted mock exams   | Even topic coverage; no timer                                                  | P4 (timer); P2d (weighting, plus a coverage check before a gate can pass)                                                                                              |
| §10.1 graph as versioned JSON            | Typed TypeScript constant (type-checked and validated by tests)                | P3, if the server must ship graph updates over the air                                                                                                                 |

## Answer types added in P2c

- `inequality` (`x ≥ 3`; reads `3 ≤ x`, `x >= 3`, `x => 3`). Moved from P2d because linear inequalities are Grade 9.
- Expression `form: 'monomial'`: exponent-law answers must be a single simplified term.
- Number `tolerance`: rounded money answers (to the nearest cent, ±0.005) are correct only when the prompt asks for rounding.
- Input forgiveness: `$`, trailing length/area/volume units, `π`/`pi`, and a `y =` prefix on equation answers.
- Numeric exponents are braced before parsing (`x^12` → `x^{12}`): the CAS reads `^` like LaTeX, where `x^12`
  would mean `x¹·2`. This was found by an oracle test (a wrong `16x` was accepted for `8x^12`) before any lesson used it.

## Step verification

Every worked step is machine-checked. A test-side extractor finds numeric chains (`a op b op c = d`) in every
generator's steps and recomputes them with exact rationals, across the whole registry. Symbolic steps are checked
per generator: each simplification step must equal the original expression, and each equation step must still hold
at the answer. Steps containing powers are covered by each generator's answer oracle.
