# Future Flow

Earn your scroll time. Future Flow is an Android app where an AI "future you" turns who you want to
become into skills and daily plans, verifies the work with real evidence (GitHub diffs, math
answers checked by a CAS, reading logs), and pays out social-media time from an event-sourced
ledger that a native guard enforces.

> Status: Phase 4 (phone app). See `docs/superpowers/specs/` for the design and `docs/adr/` for decisions.

## Repo layout

| Path                   | What                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core`        | Pure domain rules: time model, ledger, earning, plans, day types, verdicts                     |
| `packages/contracts`   | zod schemas for data crossing system edges                                                     |
| `packages/math-engine` | Ontario math knowledge graph, problem generators, CAS answer checking, Elo, mastery, placement |
| `packages/ai`          | AI router: Gemini talk, Jev judge, structured output, budgets                                  |
| `apps/api`             | Cloudflare Worker (Hono + D1): sync, plans, verification, coach, crons                         |
| `apps/mobile`          | Expo app: pairing, local SQLite store, outbox sync, Today                                      |
| `docs/adr`             | Architecture Decision Records                                                                  |

## Develop

    bun install
    bun run test        # all packages
    bun run coverage    # with coverage gates
    bun run lint && bun run typecheck

## Phone app (`apps/mobile`)

Expo SDK 57, Android first. Design: [ADR 0011](docs/adr/0011-mobile-local-first.md).

```sh
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL
bun run --cwd apps/api dev                     # local Worker on :8787 (SETUP_CODE in .dev.vars)
bun run --cwd apps/mobile start                # Expo dev server: Expo Go or an emulator
bun run --cwd apps/mobile test                 # Jest, with real SQL through node:sqlite
```

- Plan today or tomorrow (propose, edit, add, lock), declare a bad day or an away trip, and answer
  for tasks the checker left pending. Away days are checked on the phone; the location never
  leaves it ([ADR 0012](docs/adr/0012-planning-and-day-types-on-the-phone.md)).
- CI bundles the app for Android. The `Android e2e` workflow pairs a release build with a local Worker
  on an emulator and saves screenshots as the `android-e2e` artifact.
- Installable APK with EAS Build (free plan: 15 Android builds a month). In `apps/mobile`:
  `bun x eas-cli login`, `bun x eas-cli init`, then
  `bun x eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://<worker-url> --visibility plaintext`
  and `bun x eas-cli build -p android --profile preview`.

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
bun x wrangler d1 create futureflow       # put the printed id into apps/api/wrangler.jsonc
bun x wrangler secret put SETUP_CODE --cwd apps/api
openssl rand -base64 32 | bun x wrangler secret put GITHUB_TOKEN_KEY --cwd apps/api
bun x wrangler d1 migrations apply futureflow --remote --cwd apps/api
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
