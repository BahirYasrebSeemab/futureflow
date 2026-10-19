# 0019. What the guard sees: browser sites, side windows, and Android's usage log

- Status: accepted
- Date: 2026-10-18

## Context

After ADRs 0016–0018 the guard watched only which app had focus. Three gaps remained (spec §7):

- **Browsers.** instagram.com in Chrome cost nothing.
- **Side windows.** YouTube in picture-in-picture, or in the other half of a split screen, played
  uncounted.
- **Missed time.** While the service was killed or switched off, nothing was counted at all.

## Decision

- **The accessibility service reads a little window content** (`canRetrieveWindowContent`,
  `flagRetrieveInteractiveWindows`), and only this:
  - the root package of each visible application window
  - the address bar of Chrome, Brave and Edge, found by its view id (`…:id/url_bar`)

  Nothing read leaves the phone or reaches a log. The service description and the Guard screen
  say so. Android shows a stronger warning when the service is switched on; that's the cost.

- **Browsers:**
  - In Chrome, Brave and Edge the host in the address bar decides. A blocked domain or a subdomain
    of one (`m.youtube.com`) counts and shields like the app. `notyoutube.com`, a blocked word in
    the path, search text and `chrome://` pages don't.
  - The bar is read at most every 500 ms while the page changes (a playing video can't put it off),
    and never while it's focused, so typing doesn't count.
  - Chrome hides the bar while a page scrolls or plays full screen, so a re-read that misses it
    keeps the last host. Only a new window without a bar forgets it.
  - Only a scheme at the very start counts (`…?u=https://…` can't hide the host); trailing dots and
    `view-source:` are stripped.
  - **YouTube is free by default** (the owner's choice, 2026-10-19: it's where they learn). It stays
    a known app, so the picker can block it, and then its sites, again.
  - **Sites follow apps:** each app in `BLOCKED_APPS` lists its sites, and a site is blocked
    exactly while its app is. Unblocking YouTube in the picker unblocks youtube.com on the same
    "from tomorrow" rule (ADR 0018).
  - **Other known browsers** (Firefox, Opera, Samsung Internet, Mi Browser, DuckDuckGo, UC…) can't
    be read, so they are in the default blocklist: they cost earned time like a social app, and
    the owner can unblock them in the picker. Plain browsing is free in Chrome.
  - **Fail open:** view ids aren't an API. If a browser update moves the bar, the guard finds no
    host and allows the browser. The Redmi checklist covers it.
- **Side windows.** On every windows change the guard lists the visible application windows. Any
  blocked one, focused or not, counts (`visibleBlocked`): tapping the other half of a split screen
  moves focus without a window-state event. The meter runs while the focused app or a visible one
  is blocked, and only while the screen is on and unlocked.
  - Out of time, the shield comes up. It can't cover a picture-in-picture window, so it isn't
    relaunched while Future Flow or the shield is in front; the next switch to another app brings
    it back. Using the phone means closing the PiP.
- **Android's usage log** (`UsageStatsManager.queryEvents`, with the owner's Usage access):
  - `pendingSpend` first reconciles `[reconciledUntil, now]`, at most the last 24 hours. The log is
    read outside the guard's lock. It builds the blocked apps' foreground intervals (per app,
    while any of its screens is resumed), subtracts what the meter already counts (uncommitted
    sessions and the open one), and adds the uncovered pieces of at least a minute as sessions.
  - Screen off, the lock screen and a shutdown end every interval at that moment. A boot drops
    what was open (a phone that died with Instagram in front charges nothing after it died).
    Stopped and destroyed screens close like a pause.
  - Sessions from before `reconciledUntil` were committed by earlier syncs, so nothing is charged
    twice. The first check only starts the clock.
  - Browsers are left to the address bar; the usage log can't see sites.
  - The checklist gains "Usage access".

## Consequences

- **Verified where:**
  - JUnit: hosts, domain matching, side windows, interval building and subtraction, missed
    sessions
  - Jest: sites follow apps, browsers in the default, the checklist
  - Emulator run: Chrome on youtube.com while out of time, recorded but not fatal, since Chrome's
    first-run screens make it flaky
  - Redmi: the PiP loop, split screen, Mi Browser blocked, a killed guard's time charged at the
    next sync
- A blocked app fully covered by another (not visible) isn't counted, and shouldn't be.
- **Reading content costs a little battery:** content-change events are handled only for the
  three browsers in front.
- **Lists saved before this change** get the other browsers once (`version` 2); an unblock after
  that sticks.
- **Still not covered:**
  - in-app browsers (a link opened inside Instagram is Instagram anyway) and web views in other apps
  - web apps installed from Chrome (they have no address bar), translate and AMP proxies
  - browsers not on either list
  - a Google search _for_ "instagram.com" counts as the site while the query shows in the bar
  - an app blocked during the day is reconciled back to the last sync
