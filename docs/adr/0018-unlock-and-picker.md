# 0018. Emergency unlock and the app picker

- Status: accepted
- Date: 2026-10-18

## Context

The shield from ADR 0016 has no way out in a real emergency, and the blocked apps were a fixed list
in the code. The spec asks for both (§6.1, §7, §8 step 5):

- **Unlock:** a reason of at least 20 characters, a 10-minute wait that can't be skipped, then 10
  borrowed minutes, at most twice a day. Tomorrow's earnings repay it first.
- **Picker:** the owner chooses the blocked apps.

Both are easy ways around the guard, so both need care.

## Decision

- **The unlock lives in the app, reached from the shield.** A third shield button opens
  `futureflow://unlock`. The screen asks for the reason, keeps the wait in kv (leaving the app
  doesn't reset it), counts down, then enqueues `unlock_borrow`.
- **The wait uses the monotonic clock.** The module's `clock()` returns `{elapsed, bootId}`.
  Changing the time doesn't shorten the wait, and a reboot starts it again. Core's `unlock()` gets a
  `waitStartedAt` derived from the monotonic wait.
- **The guard learns of the unlock at once, offline included.** `grant(id, seconds)` adds the time
  to the meter for today. Every commit names the `unlock_borrow` ids its balance already includes
  (all of them in the store, sent or not), and the meter drops those grants. So the time counts
  exactly once, whatever order the sync and the unlock run in. Grants from earlier days are dropped.
- **The server checks what it can.** Core's new `unlockAllowed` (reason length and daily limit) is
  used by the phone before unlocking and by `POST /v1/ledger/events` on arrival. A short reason or a
  third unlock that day comes back `rejected` (`unlock_reason`, `unlock_limit`), and the phone buries
  it under that reason. Only the phone can see the wait.
- **An unlock follows the ledger.** It is a +10-minute event, so debt takes its share first. The
  screen says so ("You owe 4 min, so this unlock leaves you 6 min").
- **Blocking more applies now; unblocking waits for the next day.** The pure `blocklist.ts` keeps
  `{current, pending: {apps, games, from}}`. Turning an app on, or games on, applies at once.
  Turning anything off goes pending until the next day key (04:00). The app applies a pending change
  at start-up and at the start of every sync, so it lands even if the app wasn't open at 04:00.
- **The picker lists launcher apps** from the module (`installedApps()`), known social apps first.
  The list and the choice stay on the phone, in kv, kept across re-pairing.

## Consequences

- **Verified:** grants in JUnit; the unlock rule in Vitest (core and API); the wait, the screen, the
  commit's `included` and the picker in Jest. The emulator run unlocks (with a 5-second wait in the
  E2E build only) and checks that Settings then opens without the shield.
- The unlock reason reaches the server, as the ledger event's `reason` (the nightly review counts
  unlocks). Package names never do.
- If the server rejects an unlock the phone allowed (they share one rule, so only if they disagree),
  its grant stays until the day ends.
- An unblocked app stays blocked until 04:00 even if the owner changes their mind back and forth;
  re-blocking cancels the pending change.
- **Left for P5c-2:** Chrome domains and other browsers, picture-in-picture and split screen, and
  `UsageStats` reconciliation.
