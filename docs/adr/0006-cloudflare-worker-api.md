# 0006. Cloudflare Worker API (Hono + D1)

- Status: accepted
- Date: 2026-10-09

## Context

The phone works offline and enforces the time ledger itself. The server is the source of truth that
several writers (phone now, cron and verifiers in P3c) sync with. It must cost $0/month, run reliable
cron on the free tier, and stay easy to port to Node later (the owner will rewrite it to learn Node).

## Decision

- **Cloudflare Workers + Hono + D1.** Free plan: 100k requests/day, 10 ms CPU per request, 5 cron
  triggers, D1 with 5M row reads and 100k row writes per day.
- **Layers:** routes (Hono + zod at the edge) → `@mflow/core` (rules) → ports (`src/ports.ts`) →
  D1 adapters (`src/adapters/d1`). Only adapters and `src/index.ts` touch Workers APIs. A Node port
  replaces `adapters/d1` (e.g. with SQLite or Postgres) and serves the same Hono app with `@hono/node-server`.
- **Auth:** the phone generates a device token (32 random bytes, base64url) and registers it with
  a one-time `SETUP_CODE` (a Worker secret). Only the token's SHA-256 hash is stored. Pairing a
  new phone means rotating `SETUP_CODE`. The device row and the used code are written in one
  transaction, so a code pairs exactly once. A retry with the same code and token (its first answer
  was lost) gets 200 with the same device; because the phone made the token, nothing is lost.
  Revocation sets `devices.revoked_at`.
- **Ledger sync:** the server reuses core's `mergeEvents` (same id or same business key = already
  stored; a repayment of a dropped reward is dropped). `ledger_events.id` and
  `ledger_events.semantic_key` are UNIQUE, so a racing duplicate is a no-op (`INSERT OR IGNORE`).
  A `borrow_repay` is inserted in a second statement of the same transaction, and only if its
  reward row is stored, so a repayment of a duplicate reward is never paid, even across batches
  or racing requests. Bulk values travel as one JSON parameter through `json_each`, because D1 allows 100 bound
  parameters per statement. Pulls page by a server sequence (`seq`), not by time, so clock skew
  can't hide events. Events stamped more than 5 minutes ahead are rejected.
- **Client ids for everything a retry could duplicate:** events, reading logs, math attempts and
  away windows carry a client-generated UUIDv7, so a retried request finds what it already wrote.
- **"Today" is the device's day:** `dayKeyFor(now, device.utcOffsetMinutes, 04:00)`. The offset is
  set at pairing and refreshed by every heartbeat.
- **Base grant:** `GET /today` writes the day's `base_grant` if no writer has (spec §6.3). It is
  idempotent through core's `earn` and the business key.
- **Errors:** every response is the `{ ok, data, error }` envelope. Messages are fixed text (never
  input or SQL). Unhandled errors log one JSON line with the error name and route only.
- **Tests:** `@cloudflare/vitest-plugin` runs tests inside `workerd` against a real local D1 with the
  real migrations. Storage is shared within a test file, so `test/setup.ts` empties every table
  before each test. The clock, ids and rate limiter are injected through `createApp(options)`.

## Consequences

- The phone is trusted for the amounts it earns (single owner in v1). The server doesn't yet
  recompute caps for phone-written rewards. Recomputing caps on the server is a product-version task.
- `totals()` scans the whole ledger on each `/today`. That's fine for one owner for years (~20k
  rows/year); a daily balance snapshot is the fix if it ever matters.
- `compatibility_date` must not be newer than the `workerd` bundled with the test plugin.
- AI (`/plans/:date/propose`) is P3b. Verifiers, cron, coach and onboarding are P3c.
