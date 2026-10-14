# 0012. Planning, day types and the on-device away check

- Status: accepted
- Date: 2026-10-14

## Context

Spec §6.2–6.4: the owner edits and locks a 3–5 task plan the night before (or that morning),
declares bad and away days, and away days are verified by distance from home with **coordinates
never leaving the phone**. The judge's verdicts stay `pending` until its accuracy is measured
(`JUDGE_AUTO_DECIDE`, ADR 0008), so someone has to decide them. ADR 0011 set the phone's ports.

## Decision

- **Planning is online-only.** The server owns plans and locking, so the phone keeps edits local
  until Save and shows "Planning needs a connection." when offline. **Lock saves first** and locks
  only if the save worked, so an edit can't be lost or locked half-saved. Switching between today
  and tomorrow is blocked while there are unsaved edits.
- **Plan rules are checked on the phone first** (`plan-draft.ts`): every field filled, 5–120
  minutes, 3–5 tasks to lock. The server checks again; the phone just explains sooner.
- **Bad and away days** use the existing routes behind a confirmation. Away ids are made on the
  phone, so a retried request finds the window it already created.
- **Away check:**
  - Android coarse location only. Fine and background location are blocked in the app config.
  - The home location lives in SecureStore and never leaves the phone.
  - At most hourly on an away day, just before a sync, the phone measures the distance and sends
    only `yes` / `no` / `unknown` and the distance rounded to 10 km.
  - `AWAY_MIN_KM = 25`: a coarse fix can be 2–3 km off, and a trip is farther than a commute.
    It changes if the owner asks.
  - No permission or no fix sends `unknown`, which counts toward the 2 unverified away days a month.
- **Owner decisions:** a task the judge left `pending` shows the judge's suggestion and two
  buttons. "I did it" warns that it pays the task's time. Nothing is decided silently.
- **Earned today** counts only work (task rewards, the all-done bonus, math). The free daily
  allowance is shown on its own line. The server's `earnedTodaySeconds` counts both, for the cap.
- **Navigation stays a Stack** (Today → Plan, Away, Diagnostics). Tabs come when Math and Coach
  give the app more top-level areas.

## Consequences

- The away check runs only while the app is open; there is no background location, by design.
- An away day without a home location set always reads `unknown`.
- Planning needs a connection; the plan the owner is looking at is the server's.
