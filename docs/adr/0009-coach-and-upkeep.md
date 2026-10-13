# 0009. Coach, memory and the upkeep cron

- Status: accepted
- Date: 2026-10-13

## Context

The daily loop needs a server that rolls days over, notices when the guard was off, reviews the
day at night, proposes tomorrow, and coaches. It must stay within the free plan, protect privacy,
and never leave the owner without a review or a plan when the AI is down.

## Decision

- **Two crons:** `0 * * * *` verification (ADR 0008) and `30 * * * *` upkeep. Separate invocations
  give each its own 50-query / 50-subrequest budget. A test pins a busy upkeep tick (Monday 21:30:
  rollover, gaps, nightly AI review and proposal, weekly summary) at ≤ 32 D1 statements, measured
  32 after sharing one owner context per tick and batching writes (47 before). Upkeep steps are idempotent: `expire` and
  `base_grant` by business key, `nightly_runs` per day, summaries per ISO week, heartbeat cursors.
- **Rollover:** yesterday's leftover expires down to the running balance (debt first, core
  `expireFromBalances`); today's base grant is paid. Rewards paid for yesterday later in the grace
  window stay usable.
- **Guard gaps (spec §6.5):** a silence over 2 heartbeats is a gap; a new boot id or an uptime
  shorter than the silence means "phone off" (not a miss), otherwise "guard disabled" (a miss), as
  does time after a beat reporting the guard off. After ≥ 16 h of phone-off yesterday, the owner may
  declare yesterday a bad day the next morning (away needs location, so it is not offered).
- **Coach (spec §9.2–9.3):** the system prompt is built from the owner's identities and whys, with
  the distress guardrail in every prompt. Context is the latest weekly summary, today's tasks and
  outcomes, earned/spent minutes, and the last 10 messages from 7 days. Chat is `flourish`; a down
  AI answers 503 and the owner's message is kept, so a retry with the same id is answered once.
- **Nightly (spec §6.2):** from 21:00 to 03:59 once a day: a review (AI, or a plain template) and,
  if tomorrow has no plan yet, a proposal (AI with template fallback).
- **Memory:** on Mondays, last week's chat is summarized (`essential`, retried each tick). Chat older
  than 30 days is deleted once its week is summarized; everything older than 60 days is deleted.

## Consequences

- The owner always gets a review and a draft for tomorrow, AI or not.
- AI word problems and `GET /math/bank` are a separate phase (P3c-3): the CAS must re-solve each
  problem, and whether it fits the free Worker's 10 ms CPU limit needs a spike.
- Push notifications (≤ 2 a day) are sent by the phone (P4) when a review or proposal appears.
