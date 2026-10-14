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
- **A story is accepted only if** it uses exactly the same numbers (digits; formatting tolerated), no
  number words, ends with a question, and a judge says "same calculation, same answer" with
  probability ≥ 0.9. Rejections are stored with their reasons for review; only accepted stories sync.
- **The Worker imports `@mflow/math-engine/generators` only**; ESLint forbids the package root in
  `apps/api`. The phone checks answers with the CAS offline (spec §16.6).
- **Bank size:** topics practised in the last 14 days (word-friendly allowlist), ≤ 3 accepted per
  topic and ≤ 12 per week, ≤ 24 attempts per week; one problem per upkeep tick, never in the nightly
  window. Seeds are deterministic (FNV-1a of week, topic, index), so problems can be audited.

## Consequences

- No AI-made answer ever reaches the owner; the residual risk is a story whose wording misdescribes the
  calculation, which only the judge can catch — hence the strict threshold and stored rejections, and
  the judge eval set (spec §14) should include word-problem pairs.
- Pure-algebra topics get no stories; the phone practises those as plain exercises.
