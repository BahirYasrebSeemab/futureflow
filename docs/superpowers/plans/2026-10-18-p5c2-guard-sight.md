# Future Flow P5c-2: what the guard sees (browser domains, side windows, usage reconciliation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** close the guard's three blind spots (spec §7):

1. **Browsers** ("Browser loophole").
   - Chrome, Brave and Edge: read the address bar and count time on blocked domains (instagram.com, youtube.com…) like the app.
   - Other known browsers (Firefox, Opera, Samsung Internet, Mi Browser, DuckDuckGo, UC) count as blocked apps by default, so they cost earned time and can be unblocked in the picker.
2. **Side windows.** Picture-in-picture and split screen keep a blocked app visible without focus. Time there is counted. Out of time, the shield comes up; it can't cover a PiP window, so it keeps coming back until the PiP is closed.
3. **Accurate minutes** (`UsageStatsManager.queryEvents`, reconciled against the guard's timeline).
   - Time in blocked apps that the guard didn't count (the service killed or switched off) is added as spend at the next sync.
   - It needs Usage access, a new checklist item.

**Architecture:**

- **Pure Kotlin logic with JUnit, as before:**
  - `Domains.kt`: `hostOf(urlBarText)`, and `domainBlocked(host, domains)` with suffix matching (`m.youtube.com` matches `youtube.com`)
  - `Windows.kt`: `sideBlocked(windows, verdictOf)`, which is true when a visible application window other than the focused one is blocked
  - `Usage.kt`:
    - `foregroundIntervals(events, from, to)` from resumed and paused events
    - `uncovered(intervals, covered)`, interval subtraction
    - `MIN_MISSED_MS` (60 s), so jitter isn't charged
  - `Meter.addMissed(intervals)` appends closed sessions with new seqs. The existing watermark, pending and commit flow carries them to the ledger.
- **Reconciliation runs inside `pendingSpend`,** before the sessions are cut. It covers `[reconciledUntil, now]` against the uncommitted sessions and the open session, and is stored as `reconciledUntil` in `GuardStore`. Sessions from before `reconciledUntil` were committed by earlier syncs, so nothing is charged twice.
- **Domains follow apps.** `BLOCKED_APPS` gives each app its domains. The phone sends `setBlockedDomains` for the apps in the effective blocklist, so unblocking YouTube in the picker unblocks youtube.com too, on the same "from tomorrow" rule.
- **The accessibility service now reads window content,** but uses it only for:
  - the address bar node of the three Chromium browsers (by view id)
  - the root package of each visible application window

  Nothing else is read, and nothing read leaves the phone or reaches a log. The service description and the Guard screen say so.

**Spec:** §7 (browser loophole, accurate minutes), §13.3 (privacy), §14 (manual browser test). ADRs 0016–0018.

## Global Constraints

- Machine limits as before: Kotlin only in CI, one test file at a time locally, no repo-wide commands.
- Kotlin TDD through CI: RED, then GREEN, with the run ids recorded.
- The emulator run is on demand, once, at the end.
- Bun only. No AI attribution.
- **Privacy:**
  - URLs, hosts and package names never leave the phone and are never logged.
  - The server sees only `usage_spend` seconds and their times.
- **Battery:**
  - Content-change events are handled only for the three browser packages.
  - The address bar is read at most every 500 ms per change burst, and never while it is focused (the user is typing).

## Review Focus

1. **Double charging:** reconciled time must never overlap time the guard already counted, nor time a previous sync already sent.
2. Typing in the address bar, a search results page, or a blocked word in a URL path must not count as a blocked domain. `notinstagram.com` must not match.
3. The side-window rule must not count a blocked app that is fully covered, or the keyboard or status bar, as visible.
4. **Fragility:** each browser view id can disappear in an update. When it isn't found, the browser is allowed (fail open), and the ADR says so.

---

### Task 1: Pure Kotlin logic with JUnit

- [ ] **`hostOf`:**
  - with or without a scheme
  - `www.`, ports and user info
  - uppercase hosts
  - search text (spaces, no dot) gives null
  - `chrome://` pages give null
- [ ] **`domainBlocked`:** exact and subdomain matches, not a suffix inside a label, empty lists.
- [ ] **`sideBlocked`:**
  - a PiP or split-screen window of a blocked app counts
  - the focused window is left to the focus rule
  - non-application windows are ignored
- [ ] **`foregroundIntervals`:**
  - pairs of resume and pause per package
  - a resume with no pause is cut at `to`
  - a pause with no resume starts at `from`
  - sorted output
- [ ] **`uncovered`:** subtraction with partial and full overlap, and the minimum length.
- [ ] **`Meter.addMissed`:** new seqs, sessions kept in order, remaining time lowered.
- [ ] RED run, then GREEN run.

### Task 2: Android glue

- [ ] **`usage_guard_service.xml`:**
  - events: window state, windows changed, content changed
  - `canRetrieveWindowContent="true"`
  - `flagRetrieveInteractiveWindows`
  - `notificationTimeout` 300
- [ ] **`UsageGuardService`:**
  - **browser path:** browser package, then find the url bar by id; if it isn't focused, take `hostOf`, then `domainBlocked`, and use that as the verdict
  - **side windows:** on windows changed, scan `windows`, and count while `focusBlocked || sideBlocked`; the shield comes up when out of time and either is true
- [ ] **`UsageReconciler`:**
  - `queryEvents` for the blocked packages and games since `reconciledUntil`
  - add the missed intervals in `pendingSpend`
  - needs Usage access; without it, skip
- [ ] **Module:**
  - `setBlockedDomains(list)`
  - `status().usageAccess`
  - `openSettings('usage')`
- [ ] Strings: the service description and the privacy wording.
- [ ] `guard-compile` green.

### Task 3: JS

- [ ] **`BLOCKED_APPS`:** each entry gets its domains.
- [ ] **`OTHER_BROWSERS`:** packages and names, part of the default blocklist.
- [ ] **`applyBlocklist`:** sends the domains of the effective apps.
- [ ] **Checklist:** "Usage access", Android-reported.
- [ ] **Guard screen:** the privacy line names the address bar.
- [ ] **Tests:** apply sends the domains; unblocking YouTube drops youtube.com only from tomorrow; the checklist item; the default contains the browsers.

### Task 4: Emulator flow, ADR 0019 and docs

- [ ] **`run.sh`, while out of time:**
  - start Chrome with first-run screens off (command-line file and debug app)
  - open `https://m.youtube.com`
  - expect the shield on top
- [ ] **ADR 0019:**
  - reading window content and why it's limited
  - browsers: read three, block the rest
  - the PiP loop
  - reconciliation and its limits
  - fail-open on a changed view id
- [ ] README, the private learning note 20, the review, one emulator run, the PR.
