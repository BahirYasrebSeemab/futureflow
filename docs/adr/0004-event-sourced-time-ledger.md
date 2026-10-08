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
