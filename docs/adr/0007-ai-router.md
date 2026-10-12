# 0007. AI router: Gemini to talk, Jev to judge, templates when neither answers

- Status: accepted
- Date: 2026-10-11

## Context

mflow needs generated text (coach, plans, reviews, word problems) and typed judgments (did these
commits finish the task? is this reading summary substantial?). It must cost $0/month, never block
the daily loop when an AI is down, and never let an AI decide arithmetic.

## Decision

- **`packages/ai`** is a pure TypeScript router with injected `fetch`, usage counter and day. Providers
  are adapters behind two interfaces (`TalkProvider`, `JudgeProvider`); switching is configuration.
- **talk:** Gemini `generateContent` (free tier), Flash-Lite then Flash. `generateContent` is
  stateless (the newer Interactions API stores interactions server-side by default).
- **judge:** Jev (TypeSafe `POST /v1/systemone`) when `JEV_API_KEY` is set (paid, $0.042 per million
  input tokens), then Gemini asked for probabilities and reshaped into Jev's answers. Gemini's
  confidence is self-reported, not calibrated, so auto-pass waits for the judge eval set (spec §14).
- **Structured output:** zod → JSON Schema → provider, then the same zod validates. One repair retry
  on the same provider, then the next. An optional `guide` schema can be stricter than the parser, so
  one stray item (for example a task for a resting skill) is dropped instead of discarding the answer.
- **Budget guard:** request counters per provider per UTC day in D1 (`ai_usage`). Limits sit well
  below the free tier because Google resets at midnight Pacific. `flourish` stops at 80%.
- **Fallbacks:** if every provider fails, plans come from a deterministic template (next open milestone
  per active skill), and verdicts stay `pending`. Nothing is silently passed or failed.
- **Data minimization:** planning prompts carry identities, active skills and their next milestones
  only. Never location, ledger, chat or device data. The AI layer logs nothing.

## Consequences

- Without any key the app still works: plans are templates, judging is unavailable.
- Jev on Workers AI (`typesafe/jev`) is a third-party model billed through AI Gateway credits, so it
  is not a free route either; the direct API keeps the adapter portable to Node.
- Google may change free-tier quotas per model; limits are constants in `apps/api/src/ai.ts`.
- "Sign in with ChatGPT" (plan usage) was considered: it needs a Plus/Pro subscription and is aimed
  at locally run apps, so it could only ever be an optional phone-side talk provider.
