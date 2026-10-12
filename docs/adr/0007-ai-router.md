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
  The evidence is written by the person being judged, so the questions and rules live in the system
  instruction and the evidence is sent as escaped JSON inside `<state>` tags, as data, never
  instructions. The eval set must include injection cases before any auto-pass.
- **Structured output:** zod → JSON Schema → provider, then the same zod validates. One repair retry
  on the same provider, then the next. An optional `guide` schema can be stricter than the parser, so
  one stray item (for example a task for a resting skill) is dropped instead of discarding the answer.
- **Budget guard:** request counters per provider per UTC day in D1 (`ai_usage`). Defaults are
  conservative (100 per Gemini model, 200 for Jev) and set with `GEMINI_DAILY_LIMIT` /
  `JEV_DAILY_LIMIT`: at most half of the AI Studio quota, because Google resets at midnight Pacific.
  `flourish` stops at 80%.
- **Fallbacks:** if every provider fails, plans come from a deterministic template (skills take turns
  offering their next open milestones, padded to the 3-task minimum so the plan can lock), and
  verdicts stay `pending`. A short AI proposal is topped up from the template the same way.
  Nothing is silently passed or failed.
- **Data minimization:** planning prompts carry identities, active skills and their next milestones
  only. Never location, ledger, chat or device data. The only log is one line per failed provider
  call (`ai_provider_failed`: provider name and error category), so a bad key or a rejected schema
  is visible; prompts, replies and keys are never logged.

## Consequences

- Without any key the app still works: plans are templates, judging is unavailable.
- Jev on Workers AI (`typesafe/jev`) is a third-party model billed through AI Gateway credits, so it
  is not a free route either; the direct API keeps the adapter portable to Node.
- Google may change free-tier quotas per model; limits are Worker settings with defaults in
  `apps/api/src/ai.ts`.
- "Sign in with ChatGPT" (plan usage) was considered: it needs a Plus/Pro subscription and is aimed
  at locally run apps, so it could only ever be an optional phone-side talk provider.
