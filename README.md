# mflow

Earn your scroll time. mflow is an Android app where an AI "future you" turns who you want to
become into skills and daily plans, verifies the work with real evidence (GitHub diffs, math
answers checked by a CAS, reading logs), and pays out social-media time from an event-sourced
ledger that a native guard enforces.

> Status: Phase 1 (foundation). See `docs/superpowers/specs/` for the design and `docs/adr/` for decisions.

## Repo layout

| Path                   | What                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core`        | Pure domain rules: time model, ledger, earning, plans, day types, verdicts                     |
| `packages/contracts`   | zod schemas for data crossing system edges                                                     |
| `packages/math-engine` | Ontario math knowledge graph, problem generators, CAS answer checking, Elo, mastery, placement |
| `docs/adr`             | Architecture Decision Records                                                                  |

## Develop

    bun install
    bun run test        # all packages
    bun run coverage    # with coverage gates
    bun run lint && bun run typecheck

## API (`apps/api`)

Cloudflare Worker (Hono + D1). See `docs/adr/0006-cloudflare-worker-api.md`.

```bash
bun run --cwd apps/api test          # tests inside workerd with a local D1
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then set SETUP_CODE
bun run --cwd apps/api migrate:local
bun run --cwd apps/api dev           # http://localhost:8787/v1/health
```

First deploy (owner only):

```bash
bun x wrangler login
bun x wrangler d1 create mflow       # put the printed id into apps/api/wrangler.jsonc
bun x wrangler secret put SETUP_CODE --cwd apps/api
openssl rand -base64 32 | bun x wrangler secret put GITHUB_TOKEN_KEY --cwd apps/api
bun x wrangler d1 migrations apply mflow --remote --cwd apps/api
bun x wrangler deploy --cwd apps/api
```

## AI (`packages/ai`)

`talk()` (Gemini, free tier) and `judge()` (Jev when a key is set, else Gemini) behind one router with
structured output, one repair retry, provider fallback and a daily budget. See `docs/adr/0007-ai-router.md`.
Without keys, plans come from a deterministic template.

```bash
bun x wrangler secret put GEMINI_API_KEY --cwd apps/api   # optional, free: https://aistudio.google.com/apikey
bun x wrangler secret put JEV_API_KEY --cwd apps/api      # optional, paid
```

## Verification

The hourly cron (and `POST /v1/verify`) collects your commits on linked repositories, asks the
judge about GitHub and reading tasks, and pays rewards for passed tasks. Until the judge's accuracy
is measured, judge verdicts wait for your confirmation (`POST /v1/verdicts/:taskId`). Only commits
on each repository's default branch, authored with an email on your GitHub account, count. See
`docs/adr/0008-verification.md`.

## Coach and upkeep

A half-hourly cron rolls the day over, finds heartbeat gaps (phone off vs. guard disabled), writes
the nightly review and tomorrow's draft plan at 21:00, and summarizes past weeks of chat (deleted after 30 days).
Coach chat: `POST /v1/coach/messages`. See `docs/adr/0009-coach-and-upkeep.md`.

## Word problems

The upkeep cron turns exercises from topics you practised into real-world word problems: math-engine
makes the exercise and its answer, the AI only writes the story, and strict checks (same numbers, no
number words, the same units, rounding instructions kept word for word, and a judge that sees the
answer at ≥ 0.9) decide. Stories stay pending until judge decisions are enabled. The phone syncs them with `GET /v1/math/bank`. See
`docs/adr/0010-word-problems.md`.
