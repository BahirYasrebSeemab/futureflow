# Future Flow P5a: the guard core (Kotlin module, shield, spend accounting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The phone enforces the time ledger on blocked apps (spec §7, §4.3 rule 3, §6.3 Usage):

- A local Expo module `usage-guard` (Kotlin) watches the foreground app with an `AccessibilityService`.
- When the balance runs out inside a blocked app, it shows a native **Shield** activity.
- It counts the time spent in blocked apps. The JS side turns that time into `usage_spend` ledger events and tells the module the balance after each sync.
- Enforcement works with the React Native runtime dead: state lives in `SharedPreferences`.

**P5 split:**

- **P5a (this plan):** the core: blocking, the shield, accounting, the Guard screen.
- **P5b:** staying alive:
  - a `ForegroundService` showing "N min left"
  - a WorkManager watchdog
  - `BOOT_COMPLETED` handling
  - a heartbeat sent from native code with its own copy of the device token
  - the Xiaomi checklist
  - the notification permission
- **P5c:** Chrome domain blocking, emergency unlock on the shield, `UsageStats` reconciliation, and an app picker.

The away location check is already done (P4b).

**Architecture:**

- **Kotlin stays thin and pure where it counts.** The logic lives in plain Kotlin files with no Android imports, under `android/src/main/java/expo/modules/usageguard/logic/`. A standalone Gradle JVM project, `modules/usage-guard/logic-tests`, compiles those same files with JUnit tests. CI runs it as its own fast job.
- **Logic pieces:**
  - `Meter`: balance, spend sessions, watermark and remaining time; an immutable data class.
  - `Gatekeeper`: decides which window events count.
- **Android glue:** `GuardStore` (`SharedPreferences` plus `org.json`), `UsageGuardService`, `ShieldActivity` and `UsageGuardModule` (Expo Modules API).
- **The JS side owns the rules.** A pure `spend.ts` splits sessions at the 04:00 day boundary into `usage_spend` events. The sync collects spend first and commits the balance last.

**Spec:** §4.3 (rules 3, 5 and 6), §6.1 (base allowance), §6.3 (Usage), §7 (the guard), §13.1 (balance unknown → base allowance), §13.3 (privacy), §14 (JUnit for accounting logic). ADRs 0005 (phone-side enforcement) and 0011 (outbox).

## Global Constraints

- **Machine (1.8 GB of RAM, no JDK):**
  - Kotlin compiles and its tests run **only in CI**.
  - Locally, run one Jest file at a time: `bun x jest --maxWorkers=1 test/<file>`.
  - Never run repo-wide commands, Gradle, or `expo export`/`prebuild`.
- **Kotlin TDD through CI:** push the JUnit tests with stub bodies that compile, see the `guard-logic` job fail, then implement and see it pass. Record both run ids in the ledger.
- Bun only. No AI attribution.
- **Privacy:** package names and the app list never leave the phone. The server only sees `usage_spend` seconds. Logs carry no package names.
- **Never blocked:**
  - the default dialer and SMS apps (resolved at runtime)
  - `com.android.phone`, `com.android.emergency`, `com.google.android.dialer`, `com.android.server.telecom`
  - Future Flow itself, including its shield
- **Ignored windows** don't end a session: input methods (keyboards), `com.android.systemui`, and an empty package.
- **Monotonic time:** session lengths come from `SystemClock.elapsedRealtime`. Wall time is used only to assign days. An open session from a previous boot is dropped.
- **Balance unknown, or a new day without a commit:** the base allowance (900 s) minus that day's spend.
- **Defaults:**
  - Blocked apps: Instagram `com.instagram.android`, Threads `com.instagram.barcelona`, TikTok `com.zhiliaoapp.musically` and `com.ss.android.ugc.trill`, YouTube `com.google.android.youtube`, Facebook `com.facebook.katana`, Snapchat `com.snapchat.android`, X `com.twitter.android` and Reddit `com.reddit.frontpage`.
  - Games are blocked too (`ApplicationInfo.CATEGORY_GAME`).
- **Android 13+ restricted settings:** an APK installed from a browser must have "Allow restricted settings" turned on in App info before its accessibility service can be enabled. The Guard screen says so.
- Tests live in `apps/mobile/test/**`. Coverage stays at 80% or above. Kotlin logic gets JUnit.

## Review Focus

1. **A keyboard or the notification shade opening inside a blocked app** must not end the session and stop the charge. Test (JUnit): "an ignored window keeps the session open".
2. **The screen turning off inside a blocked app** ends the session. Otherwise a phone left on Instagram overnight burns the day. Test (JUnit): "leave closes the open session".
3. **The app dies between enqueueing spend events and committing to the module:** the same sessions come back, and they must not be charged twice. Test (Jest): "spend already recorded is skipped".
4. **A new day arrives and the app isn't opened:** the module doesn't keep yesterday's balance. It starts from the base allowance minus today's spend. Test (JUnit): "a new day without a commit starts from the base allowance".
5. **A reboot in the middle of a session:** the open session from the old boot is dropped, not counted as hours. Test (JUnit): "an open session from another boot is dropped".

---

### Task 1: Pure Kotlin logic with JUnit (CI job `guard-logic`)

- **Files** (in `apps/mobile/modules/usage-guard/android/src/main/java/expo/modules/usageguard/logic/`):
  - **`Meter.kt`:**
    - `data class Session(seq: Long, startWall: Long, ms: Long)`
    - `data class OpenSession(startWall: Long, startElapsed: Long, bootId: String)`
    - `data class Meter(balanceSeconds: Long?, balanceDay: Long?, sessions: List<Session>, open: OpenSession?, nextSeq: Long, baseSeconds: Long = 900)`, with pure methods that return a new `Meter`:
      - `enter(wall, elapsed, bootId)` opens a session if none is open
      - `leave(elapsed)` closes the open one as `Session(nextSeq, startWall, max(0, elapsed - startElapsed))` and drops sessions of 0 ms
      - `pending(wall, elapsed): Pair<Meter, List<Session>>` closes and reopens an open session at now, so long sessions report
      - `commit(watermark, balanceSeconds, day)` drops sessions with `seq <= watermark` and sets the balance and day
      - `restore(bootId)` drops an open session from another boot
      - `remainingMs(elapsed, day, dayOf: (Long) -> Long)`:
        - same day: `balance*1000 - Σ sessions.ms - openMs`
        - otherwise: `base*1000 - Σ (sessions whose dayOf(startWall) == day) - openMs`
  - **`Days.kt`:** `dayIndex(wall: Long, offsetMinutes: Int, boundaryHour: Int = 4): Long` returns `floorDiv(wall + offset*60_000 - boundaryHour*3_600_000, 86_400_000)`.
  - **`Gatekeeper.kt`:**
    - `enum class Verdict { BLOCKED, ALLOWED, IGNORE }`
    - `fun classify(pkg: String?, blocked: Set<String>, blockGames: Boolean, isGame: Boolean, neverBlocked: Set<String>, ignored: Set<String>): Verdict`. Precedence: empty or ignored → `IGNORE`; never-blocked → `ALLOWED`; in `blocked`, or a game when `blockGames` → `BLOCKED`; otherwise `ALLOWED`.
    - `NEVER_BLOCKED_BASE` and `IGNORED_BASE` constants.
- **Harness** (`apps/mobile/modules/usage-guard/logic-tests/`):
  - `settings.gradle.kts`
  - `build.gradle.kts`:
    - plugins: `kotlin("jvm") version "2.2.0"`
    - `sourceSets.main.kotlin.srcDir("../android/src/main/java/expo/modules/usageguard/logic")`
    - test dependencies: `kotlin("test")` and JUnit 5 through `useJUnitPlatform()`
  - tests: `src/test/kotlin/MeterTest.kt`, `DaysTest.kt`, `GatekeeperTest.kt`
- **CI:** a `guard-logic` job in `ci.yml`, path-independent: `actions/setup-java@v5` (temurin 17), then `gradle/actions/setup-gradle@v4` with `gradle-version: '8.14.3'`, then `gradle -p apps/mobile/modules/usage-guard/logic-tests test`.
- **Tests:**
  - enter, leave and remaining on the same day
  - "leave closes the open session"
  - "an ignored window keeps the session open" (Gatekeeper `IGNORE` plus Meter unchanged)
  - "a new day without a commit starts from the base allowance"
  - "an open session from another boot is dropped"
  - commit drops sessions up to the watermark only
  - `pending` splits an open session
  - `dayIndex` around 04:00 for UTC+5 and UTC−4
  - classify precedence (never-blocked beats blocked; games only when `blockGames`)
- **Commits:**
  - `test: pin the guard's accounting rules in JUnit` (RED in CI)
  - `feat: count blocked-app time and remaining balance in pure Kotlin` (GREEN)

### Task 2: The native module (service, shield, store, Expo bridge)

Use the `expo:expo-module` skill for the SDK 57 module layout.

- **Files** (in `apps/mobile/modules/usage-guard/`):
  - `expo-module.config.json` (`platforms: ["android"]`, `android.modules: ["expo.modules.usageguard.UsageGuardModule"]`)
  - `android/build.gradle`, following the skill's template for a local module
  - `android/src/main/AndroidManifest.xml`:
    - the service with `BIND_ACCESSIBILITY_SERVICE` and meta-data `@xml/usage_guard_service`
    - `ShieldActivity`: `excludeFromRecents`, `taskAffinity=""`, `launchMode=singleInstance`, no title
    - `<queries>` for the dialer and SMS intents
  - `android/src/main/res/xml/usage_guard_service.xml`: `typeWindowStateChanged`, `flagDefault`, `canRetrieveWindowContent=false`, plus a description string resource saying what it reads and that nothing leaves the phone
  - `GuardStore.kt`:
    - a `synchronized` read-modify-write of the `Meter`, the blocked set and `blockGames` in `SharedPreferences("futureflow.guard")` using `org.json`
    - `update { meter -> meter' }`
  - `UsageGuardService.kt`:
    - `onServiceConnected`: restore with the current boot id (`Settings.Global.BOOT_COUNT`)
    - `onAccessibilityEvent`: classify the package; on `BLOCKED`, `enter`, then shield when `remainingMs <= 0`, otherwise post a check at the remaining time; on `ALLOWED`, `leave` and cancel the check
    - a screen-off receiver calls `leave`
    - the shield goes home through `performGlobalAction(GLOBAL_ACTION_HOME)`, then starts `ShieldActivity`
    - games are found through `ApplicationInfo.category` and cached
    - the default dialer and SMS packages are resolved and added to never-blocked
  - `ShieldActivity.kt`:
    - a layout built in code: "Out of time" and "Earn more by finishing a task in Future Flow."
    - buttons "Open Future Flow" (launches our package) and "Go home"
    - back goes home
  - `UsageGuardModule.kt` (Expo `Module`, name `UsageGuard`):
    - `status()` returns `{ enabled }`, checking `ENABLED_ACCESSIBILITY_SERVICES` for our component
    - `setBlockedApps(pkgs: List<String>, blockGames: Boolean)`
    - `pendingSpend()` returns `{ sessions: [{ seq, start, ms }] }`
    - `commit(watermark: Long, balanceSeconds: Long)`
    - `openSettings()` opens `ACTION_ACCESSIBILITY_SETTINGS`
  - **`index.ts`:** `requireOptionalNativeModule('UsageGuard')` and a typed `UsageGuardNative | null`.
- **Verified by:** the CI `e2e` job (Gradle `assembleRelease` compiles it), and the Task 5 emulator flow.
- **Commit:** `feat: add the usage-guard module with an accessibility service and a native shield`

### Task 3: Spend events and the sync (JS)

- **Port** (`src/lib/guard/types.ts`):
  - `type SpendSession = { seq: number; start: number; ms: number }`
  - `interface Guard { status(): Promise<{ available: boolean; enabled: boolean }>; setBlockedApps(pkgs: readonly string[], blockGames: boolean): Promise<void>; pendingSpend(): Promise<SpendSession[]>; commit(watermark: number, balanceSeconds: number): Promise<void>; openSettings(): Promise<void>; }`
  - `DEFAULT_BLOCKED_APPS` (the list above)
  - a `noGuard` adapter (`available: false`) for Jest and for platforms without the module
  - `src/lib/guard/native.ts` wraps `index.ts` and is excluded from coverage like `location.ts`
- **Pure** (`src/lib/guard/spend.ts`): `spendEvents(sessions, afterSeq, newId): { events: LedgerEvent[]; seq: number }`.
  - It skips `seq <= afterSeq`.
  - It splits each session at local 04:00 boundaries, using `dayKeyFor(at, localOffsetMinutes(at), 4)`.
  - Each part becomes one `usage_spend` of `round(ms / 1000)` seconds (parts under 1 s are dropped), with `at` = the part's end.
  - It returns the highest seq seen.
- **Store:**
  - `enqueueSpend(events, seq)`: the outbox insert plus kv `guard_spend_seq` in one transaction
  - `spendSeq()`
  - kv `guard_spend_seq` is not in `SERVER_KEYS`
- **Sync:** `SyncDeps.guard?: Guard`.
  - **Before push:** `collectSpend`: `pendingSpend()` → `spendEvents(…, spendSeq())` → `enqueueSpend`. A failure is logged by name and never changes the status.
  - **At the end, whatever the status:** if `ledgerComplete()`, `guard.commit(spendSeq(), max(0, projectBalance(confirmed, pending)))`. This is best effort.
- **Wiring:**
  - `services.ts` passes the native guard.
  - At startup, after load, `setBlockedApps(DEFAULT_BLOCKED_APPS + e2eBlockedApps, true)`. `extra.e2eBlockedApps` is `['com.android.settings']` only when `E2E=1`.
- **Tests:**
  - `spend.test.ts`: a split across 04:00; rounding; "spend already recorded is skipped"; a negative or zero `ms` is dropped
  - `store.test.ts`: `enqueueSpend` is atomic with its seq
  - `sync.test.ts`:
    - "spend is queued before the push and sent in the same sync"
    - "the balance is committed after the pull"
    - "no commit before the ledger is complete"
    - "a guard failure keeps the sync ok"
- **Commit:** `feat: turn blocked-app time into usage_spend and hand the balance to the guard`

### Task 4: The Guard screen

- **`/guard` (`GuardScreen`):**
  - Status: "The guard is on" or "The guard is off" (`guard-status`). On Android without the module: "The guard needs the Android app."
  - A `guard-enable` button opens the accessibility settings. The status re-checks on focus.
  - The help text gives the steps:
    1. Settings → Accessibility → Future Flow → On.
    2. If Android says "Restricted setting": App info → ⋮ → "Allow restricted settings", then try again.
  - It lists what is blocked (the default apps by name, plus "Games"), and says: "Which apps you open stays on this phone. Only minutes spent are sent."
- **More:** a `more-guard` row, first: "Guard: Block apps when your time runs out".
- **Today:** when the guard is available but off, a warning banner, "The guard is off", with an `open-guard` button.
- **Tests** (`guard-screen.test.tsx`): on and off states; the enable button calls `openSettings`; More navigates; the Today banner shows only when the guard is available and off.
- **Commit:** `feat: show the guard's state and how to turn it on`

### Task 5: Emulator flow, ADR 0016 and docs

- **`e2e/run.sh`:**
  1. After install, enable the service with `adb shell settings put secure enabled_accessibility_services com.bahiryasreb.futureflow/expo.modules.usageguard.UsageGuardService` and `accessibility_enabled 1`.
  2. Run `pair-and-today.yaml`.
  3. Seed a `usage_spend` of −7200 s for the emulator's current day into the local D1. The day comes from `adb shell date +%z` and the 04:00 boundary.
  4. Run `guard.yaml`:
     - open the app → Today (the sync pulls the spend and commits a balance of 0)
     - More → Guard: screenshot `14-guard`, expect "The guard is on"
     - `launchApp: com.android.settings` → expect "Out of time": screenshot `15-shield`
     - tap "Go home"
- **ADR 0016:**
  - the guard's split: a thin Kotlin meter versus the JS rules, the watermark commit, and the fallback to the base allowance
  - no package names leave the phone
  - why the accessibility service is used, and the restricted-settings step
  - the P5b and P5c follow-ups
- **README:** a line about the guard.
- Push, open the PR, then the final review and fixes. Merge only when told.
