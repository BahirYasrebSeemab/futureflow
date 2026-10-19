# Deploying the API (Cloudflare Workers + D1)

Once, from a terminal on your machine. Everything stays on Cloudflare's free plan. In Claude Code,
prefix each command with `!` to run it in the session (`! bun x wrangler login`).

## 1. Log in

```sh
cd apps/api
bun x wrangler login          # opens the browser; allow access
```

## 2. Create the database

```sh
bun x wrangler d1 create futureflow
```

Copy the printed `database_id` into `apps/api/wrangler.jsonc` (it replaces the zeros) and commit
it. The id is not a secret.

```sh
bun run migrate:remote        # creates the tables in the real database
```

## 3. Deploy

```sh
bun run deploy
```

It prints the address, like `https://futureflow-api.<your-subdomain>.workers.dev`. The two cron
triggers (hourly verification, half-hourly upkeep) are set up by the deploy.

## 4. Secrets

Secrets live only in Cloudflare, never in the repo. Each command asks for the value.

```sh
openssl rand -base64 24 | bun x wrangler secret put SETUP_CODE        # pairing code; keep a copy to pair the phone
openssl rand -base64 32 | bun x wrangler secret put GITHUB_TOKEN_KEY  # seals the GitHub token at rest
bun x wrangler secret put GEMINI_API_KEY                               # https://aistudio.google.com/apikey
bun x wrangler secret put JEV_API_KEY                                  # optional, judge only (paid, cents a day)
```

To see the pairing code again later you can't read it back: put a new one (the old phone stays
paired). Leave `JUDGE_AUTO_DECIDE` unset until `docs/judge-eval/report.md` says it may be turned on
(ADR 0020).

## 5. Check

```sh
URL=https://futureflow-api.<your-subdomain>.workers.dev
curl -s "$URL/v1/health"                                     # {"ok":true,"data":{"status":"ok"},...}
curl -s -o /dev/null -w '%{http_code}\n' "$URL/v1/today"     # 401: needs a paired phone
```

## 6. The phone

Build the APK with this address (see "Release" in the README), install it on the phone, and pair
with the `SETUP_CODE`.

## Later

- New migrations or code: `bun run migrate:remote && bun run deploy`.
- Logs: `bun x wrangler tail` (no personal data is logged).
- A new phone: put a new `SETUP_CODE`, then pair the new phone with it.
