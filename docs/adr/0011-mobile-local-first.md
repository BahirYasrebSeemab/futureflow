# 0011. Phone app: local-first store, outbox sync, cloud-tested

- Status: accepted
- Date: 2026-10-14

## Context

The phone enforces the time budget, offline included (spec §4.3, ADR 0004), so it needs its own copy
of the ledger and of today's plan. The API is a free Worker reached over a phone network that comes
and goes. The development machine is a WSL box with 1.8 GB of RAM: it can't run an Android emulator
or Gradle, and Metro runs out of memory transforming the CAS (`@cortex-js/compute-engine`).

## Decision

- **SQLite is the phone's source of truth** (expo-sqlite). Tables: `outbox` (unsent events),
  `dead_letters` (events the server refused), `ledger` (server-confirmed events) and `kv`. The spec's
  `plan_cache` is the `today` snapshot in `kv`; `settings` will live in `kv` too.
- **The balance shown is local:** `balance(mergeEvents(confirmed, pending))` from `@futureflow/core`,
  so it is right offline and never counts an event twice.
- **Sync is one bounded, single-flight run:** push the outbox in batches of 500, then fetch
  `/v1/today` (which may write the day's base grant), then pull the ledger from the saved cursor, so
  the pull brings the grant back. Each loop stops after 20 rounds. A second caller shares the running
  sync.
- **Failures are sorted by what to do next:** network, 5xx and 429 stop the run and keep everything
  for later. 401 stops it as `unauthorized`, and Today offers "Pair again", which wipes local data.
  A refusal that can never succeed (a future timestamp, a contract error) moves those events to
  `dead_letters`. They leave the balance and appear in Diagnostics. Retrying them forever would
  block the queue.
- **Pairing:** the phone invents the device token and saves it in SecureStore _before_ the request,
  so a retry after a lost answer is recognised by the server (ADR 0006). SecureStore holds only the
  token and the device id. Neither is ever logged.
- **Ports and adapters**, as in the API: `Api` (typed fetch client that validates every response
  with `@futureflow/contracts`), `LocalStore` (SQL behind a small `SqlDb` interface) and
  `SecretStore`. Tests run the real SQL through a `node:sqlite` shim of the expo-sqlite async API.
- **No TanStack Query:** the local store already is the cache. Screens read it after each sync and
  keep showing saved data, with a banner, when a refresh fails.
- **The CAS is not in the phone bundle yet.** ESLint forbids importing the
  `@futureflow/math-engine` root in `apps/mobile`. P4c decides between a lighter on-phone checker,
  bundling only in the cloud, or more WSL memory.

## Testing and builds

- Jest (jest-expo) with React Native Testing Library ~13.3 and Expo Router's `renderRouter`
  (RNTL 14's async render breaks it). Coverage gate: 80%.
- GitHub Actions bundles the app for Android (Metro + Hermes) on every push.
- The `Android e2e` workflow builds a release APK, starts the Worker locally with `wrangler dev`,
  and drives the app on an emulator with Maestro (pair → Today → Diagnostics). Screenshots are kept
  as the `android-e2e` artifact. EAS's own Maestro jobs need a paid plan; GitHub's free minutes
  don't.
- EAS Build (free: 15 Android builds a month) makes the APK the owner installs (`preview` profile).
- Bun installs a hoisted `node_modules` (`bunfig.toml`), because React Native tooling can't see
  packages in Bun's isolated layout. The root pins Babel 7, because Expo can't use Babel 8.

## Consequences

- Until the first sync, Today shows "Loading" or "Retry", not a balance. The spec's "balance
  unknown → base allowance" rule belongs to the guard (P5), which enforces it.
- Dead letters are visible only in Diagnostics for now.
- `transformIgnorePatterns` copies jest-expo's default list plus `uuid`. It must be updated when
  jest-expo changes its default.
