# 0010. Word problems: math-engine answers, AI words, strict checks

- Status: accepted
- Date: 2026-10-14

## Context

Spec §10.8 wanted the AI to write word problems with answers and the CAS to re-solve each one.
A spike showed the CAS cannot run on the free Worker: Compute Engine is 1.24 MB gzipped and its first
check takes 640–860 ms of CPU (later ~20 ms) against a 10 ms limit. math-engine's generators alone
are 14 KB gzipped and take ~1 ms. And an AI-written answer is exactly what the owner must never learn
from ("I don't want to learn on wrong teachings").

## Decision

- **Answers come from math-engine**, whose generators are proven by independent oracles (P2). The AI
  only rewrites the exercise as a story.
- **Only exercises with a positive number answer become stories.** A negative answer invites "how
  much less" phrasing that flips the sign the checker expects; a zero answer is degenerate.
  Expression, point and set answers stay plain exercises.
- **Rounding and form instructions are never paraphrased.** "to one decimal place", "Round to the
  nearest cent" and "in terms of π" decide which answer is right, so they are taken out of the
  exercise and appended to the AI's story word for word.
- **A story passes only if** it uses exactly the same numbers (digits; formatting tolerated) and
  exactly the same units and symbols ($, %, °, cm, m, cm², …), has no number words (including
  inflections such as "doubled", "dozens", "once", ordinals), ends with a question, and a judge that
  is **shown the expected answer** says the story's exact answer is that value, in the same units,
  rounding and sign, with probability ≥ 0.9. Rejections are stored with their reasons.
- **Passing stories stay `pending` (not synced) until judge decisions are enabled**
  (`JUDGE_AUTO_DECIDE=on`, spec §14), exactly like verification: Gemini's confidence is self-reported,
  so the word-problem pairs (including unit, rounding and sign changes) belong in the judge eval set
  that gates that switch.
- **The Worker imports `@futureflow/math-engine/generators` only**; ESLint forbids the package root in
  `apps/api`. The phone checks answers with the CAS offline (spec §16.6).
- **Bank size:** topics practised in the last 14 days (word-friendly allowlist), ≤ 3 kept (accepted
  or pending) per topic and ≤ 12 per week, ≤ 6 attempts per topic and ≤ 24 per week (so one hard
  topic cannot use the week up); one problem per upkeep tick, never between 21:00 and 03:59. Seeds are deterministic (FNV-1a of week, topic, index), so problems can be audited.

## Consequences

- No AI-made answer ever reaches the owner; the residual risk is a story whose wording misdescribes the
  calculation, which only the judge can catch — hence the strict threshold and stored rejections, and
  the judge eval set (spec §14) should include word-problem pairs.
- Pure-algebra topics get no stories; the phone practises those as plain exercises.
