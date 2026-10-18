# Future Flow P5c-1: emergency unlock and the app picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:**

- **Emergency unlock** from the shield (spec §6.1, §7). A reason of at least 20 characters, a 10-minute wait that can't be skipped, then `unlock_borrow` +10 min. At most 2 a day. The next day's earnings repay it first (`borrow_repay`, already in core and the API).
- **App picker** (spec §8 step 5, "blocked apps"). The owner chooses which installed apps are blocked, and whether games are. Package names and the app list never leave the phone.

**P5c split:**

- **P5c-1 (this plan):** unlock and the picker. Both are about the money and the block list.
- **P5c-2:** Chrome domains and other browsers, picture-in-picture and split screen (windows the guard can see but doesn't count yet), and `UsageStats` reconciliation. All three are about what the guard sees.

**Architecture:**

- **The unlock works offline.** The phone enqueues the `unlock_borrow` event, then tells the guard `grant(id, seconds)`.
  - The meter adds today's grants to the remaining time.
  - Each commit names the unlock ids that its balance already includes (every `unlock_borrow` in the store, sent or not). The meter drops those grants, so nothing counts twice and nothing is lost to a race.
  - Grants from earlier days are dropped.
- **The wait uses the monotonic clock** (spec §6.5): the module's `clock()` returns `{elapsed, bootId}`. Changing the wall clock doesn't shorten the wait; a reboot starts it again. The wait is kept in kv, so leaving the app doesn't reset it.
- **The rule stays in core.** A new `unlockAllowed(dayEvents, reason, rules)` checks the reason and the daily limit. `unlock()` uses it, and the API applies the same check to unlocks the phone sends: a third unlock or a short reason comes back rejected (`unlock_limit`, `unlock_reason`), and the phone buries it.
- **The picker loosens slowly.** Blocking more applies at once. Unblocking an app, or turning games off, applies from the next 04:00. An impulse can't open Instagram tonight.
  - The pure `blocklist.ts` holds `{current, pending: {apps, games, from}}`.
  - The app applies what is due at start-up and after each sync.

**Spec:** §4.3 (ledger kinds), §6.1 (unlock rules), §6.5 (monotonic durations), §7 (shield, never blocked), §8 step 5, §13.3 (privacy). ADRs 0016, 0017.

## Global Constraints

- **Machine (1.8 GB of RAM, no JDK):**
  - Kotlin compiles and is tested only in CI.
  - Locally, run one test file at a time.
  - No repo-wide test, coverage or typecheck commands, Gradle, `expo export` or `prebuild` locally.
- **Kotlin TDD through CI:** stubs plus JUnit, push and see `guard-logic` fail, implement, see it pass. Record the run ids.
- Open the draft PR right after the first push, since CI runs only on PRs.
- **The emulator run is on demand,** once the branch is finished. The E2E build shortens the unlock wait to 5 s (`extra.e2eUnlockWaitSeconds`). Store builds always wait 10 minutes.
- Bun only. No AI attribution.
- **Privacy:**
  - The unlock reason goes to the server (it is the ledger event's `reason`, as the spec intends).
  - Installed apps and chosen packages stay on the phone.
  - Logs carry error names only.

## Review Focus

1. A grant counts exactly once: before its event reaches a commit, and never after.
2. The wait can't be skipped by changing the clock, rebooting, or killing the app.
3. The phone and the server agree on the unlock limit and the reason rule.
4. Unblocking can't take effect before the next day boundary, and blocking more can't be delayed.

---

### Task 1: The unlock rule on the server (core, contracts, API)

- [ ] **RED core:** `unlockAllowed` returns `reason_too_short` for 19 characters after trimming, `daily_limit_reached` with 2 unlocks that day, and null otherwise. `unlock()` behaves as before.
- [ ] **RED API:** a phone `unlock_borrow` with a short reason is rejected (`unlock_reason`). A third one that day, including two in one batch after one already stored, is rejected (`unlock_limit`). A valid one is added.
- [ ] Contracts: the rejected reasons become `future_timestamp | unlock_reason | unlock_limit`.
- [ ] GREEN. Run single files.

### Task 2: Grants in the meter, and the native API

- [ ] **JUnit for `Meter`:**
  - `grant(id, day, seconds)` is idempotent by id, and today's grants add to the remaining time (both with and without a commit that day)
  - `commit(watermark, balance, day, included)` drops the included grants and the grants from earlier days, and keeps the others
- [ ] **`GuardStore`** encodes and decodes grants. An old stored meter without grants still reads.
- [ ] **Module:**
  - `grant(id, seconds)`
  - `commit(watermark, balance, included)`
  - `clock()` → `{elapsed, bootId}`
  - `installedApps()` → `{package, label}` for launcher apps, excluding Future Flow
- [ ] **Shield:** a third button, "Emergency unlock", opens `futureflow://unlock`.

### Task 3: The unlock screen (JS)

- [ ] **Pure `lib/unlock.ts`, tested:**
  - `startWait(reason, clock, now)`
  - `waitLeft(wait, clock)`: ms left; a different boot means start again
  - `finishUnlock(...)`: core `unlock()` with `waitStartedAt` derived from the monotonic wait
- [ ] Store kv `unlock_wait`.
- [ ] **Sync:** `commitBalance` passes the `unlock_borrow` ids in confirmed plus pending.
- [ ] **Screen `/unlock`:**
  - the reason, with a character count
  - "Start the 10-minute wait", then a countdown, then "Unlock 10 minutes"
  - the unlock enqueues the event, calls `grant`, starts a sync, and says it comes off tomorrow's earnings first
  - unlocks left today; at the limit, a message and no form
- [ ] **Tests:**
  - the countdown can't be skipped (the clock hasn't moved)
  - a reboot restarts the wait
  - the limit
  - the event and the grant
  - the commit names the unlock

### Task 4: The app picker (JS and native)

- [ ] **Pure `lib/guard/blocklist.ts`, tested:**
  - `change(state, next, today)`: tightening applies now, loosening goes pending from the next day
  - `effective(state, today)`: applies a pending change once it is due
  - the default is the known social apps plus games
- [ ] Store kv `blocklist`.
- [ ] **`services.ts` and the sync** apply `effective` to `setBlockedApps` at start-up and after each sync.
- [ ] **Screen `/blocked-apps`:**
  - installed apps with switches, known social apps first, and a games switch
  - pending loosening shown as "From tomorrow: …"
- [ ] **The Guard screen:** the effective list, and a "Change" button.
- [ ] Tests.

### Task 5: Emulator flow, ADR 0018 and docs

- [ ] **`run.sh`, after the shield check:**
  - Maestro `unlock.yaml`: open the unlock link, give a reason, wait 5 s, unlock, and see "10 min unlocked"
  - then switch the guard on again and open Settings: no shield this time
  - screenshots of the unlock screen and the picker
- [ ] `docs/adr/0018-unlock-and-picker.md`. A README line. The private learning note 19.
- [ ] One fresh reviewer, fixes test-first, one emulator run, the PR.
