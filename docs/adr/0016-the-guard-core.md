# 0016. The guard core: a thin Kotlin meter, rules in TypeScript

- Status: accepted
- Date: 2026-10-17

## Context

Only the phone can block apps (ADR 0005), and it must keep blocking when the React Native runtime
is dead (spec §7). The ledger and day rules already live in TypeScript (`core`). The laptop used
for development has no JDK and too little memory for Gradle, so Kotlin builds only in CI.

## Decision

- **A local Expo module, `usage-guard`, with:**
  - an `AccessibilityService` that listens only to window changes (no window content)
  - a native **Shield** activity, built in code, that covers a blocked app when the time is gone
  - its state in `SharedPreferences`
- **The Kotlin side is a meter, not a rulebook.** A pure, immutable `Meter` holds:
  - the last balance the app committed, and the day of that commit
  - closed spend sessions, numbered by `seq`
  - the open session, timed with the monotonic clock

  Remaining time = the balance − uncommitted sessions − the open session. On a day with no commit
  (or before the first one) it is the base allowance minus that day's spend (spec §13.1).

- **The app turns sessions into ledger events.** At the start of each sync it takes the
  uncommitted sessions, splits them at 04:00, and queues `usage_spend` events. In the same
  transaction it stores the highest `seq`, so a crash before the commit can't charge twice.
- **The commit.** After a pull that reached the end, the app commits `(seq, balance)`. The meter
  drops the sessions up to `seq`, because the balance already counts them. Debt is committed as
  zero.
- **Not counted:** keyboards and the status bar don't end a session. The screen turning off does.
  An open session from before a reboot is dropped.
- **Never blocked:** the default dialer, the SMS app, phone and emergency apps, and Future Flow.
- **Privacy:** package names and the block list never leave the phone. The server only sees
  seconds.
- **Tests:** the pure Kotlin logic compiles in a plain JVM Gradle project (`logic-tests`) with
  JUnit, run by its own CI job. The service and shield are driven on the emulator: the flow
  switches on the service, spends the day's time, and expects the shield over Settings (blocked
  in the emulator build only).

## Consequences

- **Restricted settings:** Android 13+ hides the accessibility switch for an APK installed from a
  browser until "Allow restricted settings" is turned on in App info. The Guard screen walks
  through it.
- **Not yet built:**
  - **P5b:** keeping the guard alive (a foreground service with "N min left", a watchdog, boot
    handling), a native heartbeat (until then, the gap analysis sees no beats from the phone),
    and the Xiaomi checklist.
  - **P5c:** Chrome domains, the emergency unlock on the shield, `UsageStats` reconciliation, and
    choosing the blocked apps.
- **A session's time is charged when the app syncs.** Until then, the meter enforces it locally.
