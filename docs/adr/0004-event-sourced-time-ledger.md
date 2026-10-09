# ADR 0004: Event-sourced time ledger

- Status: Accepted
- Date: 2026-10-08

## Context

Phone time is earned (tasks, math, bonus), spent (blocked apps), borrowed (emergency unlock) and
expired, on an offline-capable phone and a server that must agree.

## Decision

Store every change as an append-only `LedgerEvent` with a client-generated unique id and integer
seconds (signed). Balance = sum of events. Merging = idempotent union by id. Corrections
are new `correction` events; nothing is updated or deleted.

## Alternatives

- **Mutable `balance` column:** concurrent writers lose updates, there's no audit trail, and offline merges are hard.
- **CRDT counters:** they solve merging, but give no per-change reasons for the coach and the nightly review.

## Consequences

- Every balance is explainable ("why 37 minutes?").
- Retries are safe.
- Reads sum events. Per-day volume is small (< 200 events), so no snapshots are needed in v1.

## Amendment (2026-10-08, after Phase 1 review)

- **Two identities per event.** Besides its unique `id`, an event has a _business key_:
  `(day, kind)` for `base_grant`, `all_done_bonus` and `expire`; `(kind, refId)` for
  `task_reward` and `math_reward`. `mergeEvents` keeps only the first event per key, so a grant
  created by both the offline phone and the server is paid once. A `borrow_repay` pointing at a
  dropped reward is dropped with it.
- **Expiry pays debt first.** `expireDay` reads the full history and expires
  `min(today's leftover, running balance)`. Unused time first repays an earlier overspend, and only
  the rest expires. Debt never silently lowers every future day's allowance.
