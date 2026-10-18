# Future Flow P5b: keeping the guard alive (foreground service, heartbeat, watchdog, Xiaomi checklist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The guard from P5a survives a real phone, and the server can tell "phone off" from "guard off" (spec §6.5, §7 "Staying alive", §6.1 heartbeat every 15 min):

- A **foreground service** keeps the guard's process alive and shows "N min left" in a quiet notification.
- A **native heartbeat** (WorkManager, every 15 min) records a beat even when React Native is dead, queues it while offline, and sends queued beats with its own copy of the device token.
- The same worker is the **watchdog**: it restarts the foreground service if it died, and nudges the owner when the guard was switched off.
- **Boot handling:** after `BOOT_COMPLETED` (and an app update) a beat goes out at once, so a phone-off gap closes quickly.
- **The Guard screen gets a checklist:** notifications, battery, and on Xiaomi phones Autostart and lock-in-recents.

**Architecture:**

- **Doze-proof gap analysis.** Android's Doze can hold a 15-minute job back for hours at night. A late beat must not read as "guard off", so every beat carries `guardSinceUptimeSeconds`: the uptime at which the accessibility service last connected (null when it isn't connected).
  - A silence longer than 2 intervals on the same boot isn't a gap when the next beat shows the guard connected since before the previous beat.
  - The rule lives in core `analyzeBeats`.
- **Late beats are fine.** The phone keeps beats in a FIFO queue and sends them oldest first. The server analyses beats from a cursor in arrival order, so queued beats fill the silence they cover before any gap is drawn.
- **Batch endpoint** `POST /v1/heartbeats` (1 to 96 beats):
  - Duplicates are ignored through a unique index on `(device_id, boot_id, at)`, so a retry after a lost answer is harmless.
  - Beats from the future are dropped and counted, not failed, so the queue always drains.
  - `/v1/heartbeat` stays as it is, plus the new field.
- **Kotlin, as in P5a.**
  - Pure logic under `logic/` with JUnit in `logic-tests`: `BeatQueue`, `sendOutcome`, `minutesLeft`, `watchdogPlan`.
  - Android glue: `HeartbeatWorker`, `BootReceiver`, `GuardForegroundService`, `TokenVault` (Android Keystore AES-GCM), `GuardHealth`.
- **The token copy.** JS hands `(apiUrl, token)` to the module whenever the session is paired, and clears it on unpair. Native code keeps the token encrypted with a Keystore key. A 401 makes native forget the token; JS hands over a new one after pairing again.

**Spec:** §6.1 (heartbeat 15 min), §6.5 (phone off and tamper), §7 (staying alive, `isGuardHealthy`, `openXiaomiSettings`), §11 (`POST /heartbeat`), §13.3 (privacy), §14 (JUnit, Redmi checklist). ADRs 0005, 0016.

## Global Constraints

- **Machine (1.8 GB of RAM, no JDK):**
  - Kotlin compiles only in CI.
  - Locally run one test file at a time: `cd apps/mobile && bun x jest --maxWorkers=1 test/<file>`, or `timeout 300 bun x vitest run test/<file>` in `apps/api` or `packages/core`.
  - Never run repo-wide test, coverage or typecheck commands, Gradle, `expo export` or `prebuild` locally.
- **Kotlin TDD through CI:** push the JUnit tests with stub bodies, see `guard-logic` fail, implement, see it pass. Record both run ids in the ledger.
- **New CI job `guard-compile`:** it runs prebuild and compiles the module's Kotlin only, so an Android compile error shows in minutes, not in the 25-minute emulator run.
- **The emulator run is on demand:** `gh workflow run "Android e2e" --ref feat/p5b-guard-alive`, once the branch is finished.
- Bun only. No AI attribution.
- **Privacy:**
  - A beat carries only times, the boot id, uptime, the UTC offset and two guard flags. No app names.
  - The token is never logged. Logs carry error names only.
- **Notifications:**
  - The foreground notification is on a silent, low-importance channel.
  - The "guard is off" nudge is sent at most once every 6 hours, and only after the guard has been on at least once.
- **Android facts to respect:**
  - Android 14+ needs a foreground service type: `specialUse`, with `FOREGROUND_SERVICE_SPECIAL_USE` and the subtype property.
  - Android 13+ asks for `POST_NOTIFICATIONS` at runtime. Without it, the service still runs but its notification is hidden.
  - A foreground service may start from the background here because the app has a system-bound accessibility service. Starts are still wrapped in try/catch.
  - Force stop cancels WorkManager jobs and switches the accessibility service off. The server sees that as a gap without a reboot, which is right.

## Review Focus

1. A beat delayed by Doze while the guard stayed connected must not become a `guard_disabled` gap. A guard switched off and on in between must.
2. The queue: oldest first, removed only after a 2xx, bounded (7 days), and a 401 doesn't lose beats.
3. The token copy: encrypted at rest, cleared on unpair, never logged.
4. The foreground service's start and stop follow the accessibility service, and nothing crashes when Android refuses a start.
5. The checklist only shows a tick for things Android can actually report.

---

### Task 1: Doze-aware gaps and the batch endpoint (core, contracts, API)

**Files:**

- `packages/contracts/src/api.ts`: `HeartbeatSchema` gains `guardSinceUptimeSeconds` (int ≥ 0, nullable, optional); new `HeartbeatBatchSchema` and `HeartbeatBatchResponseSchema`.
- `packages/core/src/guard.ts` and `test/guard.test.ts`: `Beat.guardSinceUptimeSeconds?: number | null`, and the Doze rule.
- `apps/api/migrations/0006_heartbeat_since.sql`: the new column, plus a unique index on `(device_id, boot_id, at)`.
- `apps/api/src/ports.ts`, `adapters/d1/telemetry.ts`, `adapters/d1/upkeep.ts`: `addHeartbeats(deviceId, beats, receivedAt): Promise<number>` (`INSERT OR IGNORE`), and the column read back.
- `apps/api/src/routes/telemetry.ts`: `POST /heartbeats`. `/heartbeat` uses the same insert.
- `apps/api/test/telemetry.test.ts`, `test/guard-gaps.test.ts`.

- [ ] RED core: a 3-hour silence, same boot, where `b.guardSinceUptimeSeconds <= a.uptimeSeconds` and `a.guardEnabled`, gives no gap.
- [ ] RED core: the same silence with `guardSince` after `a`'s uptime, or null, gives `guard_disabled`.
- [ ] RED core: a reboot is still `phone_off`; beats without the field behave as before.
- [ ] GREEN core.
- [ ] RED API: a batch of 3 is stored (201, `added: 3`); the same batch again gives `added: 0`; a future beat inside a batch is dropped and counted in `rejected`; 97 beats → 400; the device's UTC offset comes from the last beat.
- [ ] RED API: queued beats sent late close the silence they cover (guard-gaps test through the batch endpoint).
- [ ] GREEN API. Run the single files with vitest.

### Task 2: Pure Kotlin logic with JUnit

**Files:** `logic/Beats.kt`, `logic/Watchdog.kt`; `logic-tests/src/test/kotlin/BeatsTest.kt`, `WatchdogTest.kt`.

- `data class Beat(at, bootId, uptimeSeconds, utcOffsetMinutes, guardEnabled, guardSinceUptimeSeconds: Long?)`
- `data class BeatQueue(beats: List<Beat> = emptyList(), capacity: Int = 672)`:
  - `add` drops the oldest beyond capacity
  - `batch(size)` returns the oldest `size` beats
  - `drop(n)` removes the first n
- `enum SendOutcome { SENT, KEEP, UNLINK, DISCARD }` and `sendOutcome(status: Int?)`:
  - 2xx → SENT
  - 401 → UNLINK (keep the beats)
  - 400 and 413 → DISCARD (they can never pass)
  - other statuses or a network failure (null) → KEEP
- `minutesLeft(remainingMs)` = ceil to whole minutes, never below 0.
- `data class WatchdogPlan(startForeground: Boolean, nudge: Boolean)` and `watchdogPlan(enabled, connected, foregroundRunning, everEnabled, lastNudgeAt, now)`:
  - start the foreground service when connected and it isn't running
  - nudge when not enabled, everEnabled, and no nudge in the last 6 hours

- [ ] RED: tests with stub bodies, then push and see `guard-logic` fail (record the run id).
- [ ] GREEN: implement, then push and see it pass (record the run id).

### Task 3: Android glue (heartbeat, watchdog, boot, foreground service, token vault, health)

**Files:**

- `build.gradle` (`androidx.work:work-runtime-ktx`)
- `AndroidManifest.xml`: permissions `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and `INTERNET`; the service and the receiver
- `strings.xml`
- `TokenVault.kt`, `HeartbeatStore.kt`, `HeartbeatWorker.kt`, `BootReceiver.kt`, `GuardForegroundService.kt`, `GuardHealth.kt`
- `UsageGuardService.kt` (connected-since, start and stop the foreground service, a beat on connect, a notification refresh on enter, leave and commit)
- `UsageGuardModule.kt`
- `index.ts`
- `.github/workflows/ci.yml` (`guard-compile`)

- [ ] Module API:
  - `link(apiUrl, token)`: stores both, schedules the periodic work and sends a beat now
  - `unlink()`
  - `status()` → `{enabled, connected, foreground, notifications, batteryUnrestricted, xiaomi}`
  - `openSettings(kind)` for `accessibility | notifications | battery | autostart`, falling back to App info
- [ ] **Worker:**
  - records a beat
  - then sends batches of 96, oldest first, until the queue is empty or a send fails
  - then follows `watchdogPlan`
  - it is unique periodic work (15 min, KEEP), plus a unique one-time "beat now"
- [ ] **Foreground service:**
  - `specialUse`, low-importance channel
  - "N min left today" or "Out of time"; tapping it opens Future Flow
  - recomputes the text every 30 s while open, and on refresh
- [ ] **Boot receiver:** on `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, schedule the work and send a beat now.
- [ ] Add the `guard-compile` CI job, push, and see it compile.

### Task 4: JS: the token hand-off and the checklist

**Files:**

- `src/lib/guard/types.ts`: `GuardStatus` gains `connected`, `foreground`, `notifications`, `batteryUnrestricted`, `xiaomi`; `Guard` gains `link`, `unlink`, `openSettings(kind)` and `requestNotifications`
- `native.ts`: `requestNotifications` uses `PermissionsAndroid` on Android 13+, otherwise opens the settings
- `src/lib/app.tsx`: links when paired, unlinks when unpaired, failures logged by name
- `src/screens/guard.tsx`
- `src/lib/store`: kv flags for the self-reported Xiaomi steps
- `test/guard-screen.test.tsx`, `test/app-link.test.tsx` (or the existing screens test), `test/support/fakes.ts`

- [ ] RED: once the session is paired, `link(apiUrl, token)` is called; after forget, `unlink()`; a failing `link` doesn't stop the app.
- [ ] RED: the checklist:
  - notifications off → "Allow notifications" calls `requestNotifications`
  - battery restricted → "Remove battery limits" calls `openSettings('battery')`
  - on Xiaomi: Autostart opens settings, and "Lock in recents" is a step the owner ticks, kept in kv
  - every item with a known state shows done or not done
- [ ] GREEN, one Jest file at a time.

### Task 5: Emulator flow, ADR 0017 and docs

- [ ] `run.sh`, after the shield check:
  - the app's services list shows `GuardForegroundService` in the foreground
  - local D1 has a heartbeat with `guard_enabled = 1` and a non-null `guard_since_uptime`
  - screenshot `16-guard-checklist`
- [ ] `docs/adr/0017-keeping-the-guard-alive.md`: the foreground service type, the Doze rule, the token copy, the batch endpoint and why `/heartbeat` stays, the nudge limit, and what is left for P5c.
- [ ] README guard line. The learning note `learning/18-p5b-guard-alive.md` (private).
- [ ] Final review (one fresh reviewer), fixes test-first, the emulator run once, the PR.
