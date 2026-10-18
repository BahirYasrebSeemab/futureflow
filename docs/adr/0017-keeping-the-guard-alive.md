# 0017. Keeping the guard alive: a foreground service, a native heartbeat, Doze-proof gaps

- Status: accepted
- Date: 2026-10-18

## Context

The guard from ADR 0016 runs inside an accessibility service. On a low-memory phone with
HyperOS/MIUI (the owner's Redmi), the system kills background processes freely. The server must
also tell "phone off" (not a miss) from "guard off" (a miss) by heartbeats every 15 minutes
(spec §6.5). Until now nothing on the phone sent them.

Three facts shaped the design:

- **JavaScript can't be the sender.** The React Native runtime isn't running when the app is
  closed, so beats have to come from native code. That code needs its own copy of the device token.
- **Doze holds jobs back.** A phone asleep at night can delay a 15-minute job by hours. With "a
  silence longer than 2 intervals is a gap", every night would read as the guard switched off.
- **The phone is often offline.** A beat that can't be sent must not be lost, or the gap would be
  invented by the network.

## Decision

- **A foreground service** (`GuardForegroundService`, type `specialUse`) runs while the
  accessibility service is connected.
  - It raises the process to foreground priority.
  - It shows "N min left today" (or "Out of time for today") on a silent, low-importance channel.
  - The accessibility service starts and stops it. Android lets an app with a system-bound
    accessibility service start one from the background, but a refused `startForeground` must
    never take the guard's process down: it is caught, the service stops itself, and the watchdog
    retries. It isn't sticky, and it leaves by itself when the guard is gone (stopping it before
    it entered the foreground would crash the app).
- **A native heartbeat** (`HeartbeatWorker`, WorkManager unique periodic work, every 15 min):
  - records a beat into a FIFO queue in `SharedPreferences` (up to a week)
  - then sends the queue oldest first, 96 beats per request, to the new `POST /v1/heartbeats`
  - removes exactly the beats a 2xx stored (by identity, so two senders lose nothing)
  - on a 401 it forgets the token; on a 400 or 413 it drops the batch; on any other failure it
    keeps everything for the next run
  - beats belong to a pairing: none are recorded while unpaired, and unlinking (unpair or a 401)
    drops the queue, so old beats never draw gaps for a pairing that didn't exist yet
  - also sends a beat at once after pairing, a boot, an app update, and the guard reconnecting
- **Doze-proof gaps.** Each beat carries `guardSinceUptimeSeconds`: the uptime at which the
  accessibility service last connected in this process (null when it isn't connected). In core
  `analyzeBeats`, a long silence on the same boot isn't a gap when:
  - the beat before it reported the guard on, and
  - the beat after it shows the guard connected since before the beat before it.

  A guard switched off and back on in between has a later "since", so its silence still counts.
  A beat with the guard listed as on but `since` null (Android stopped the service and left it
  switched on) counts as off. That's why the field is required on the wire: a stored null must
  mean "not running", never "not sent".

- **The token copy.** JS hands `(apiUrl, token)` to the module whenever the session is paired
  (start-up included) and calls `unlink` on unpair. Native code seals the token with AES-GCM under
  an Android Keystore key, as expo-secure-store does. It is never logged.
- **The batch endpoint** dedupes on a unique `(device_id, boot_id, at)`, so a resend after a lost
  answer adds nothing. It drops and counts beats from the future instead of failing the request,
  so the phone's queue always drains. `POST /v1/heartbeat` (spec §11) stays and takes the new
  field too.
- **The watchdog** is the same worker:
  - it restarts the foreground service if the accessibility service is connected and the
    foreground service isn't running
  - when the guard has been down for 10 minutes (switched off, or on but not running) after having
    been on, it posts "The guard is off", at most once every 6 hours; the nudge opens the Guard
    screen. The 10 minutes let a boot reconnect the service first.
  - the Guard screen and Today say "The guard isn't running" for a listed-but-stopped service
- **The checklist** on the Guard screen ("Keep it running"):
  - notifications (the runtime permission on Android 13+, otherwise the app's notification
    settings) and battery limits, ticked from what Android reports
  - on Xiaomi phones: battery saver "No restrictions", Autostart, and lock in recents. Android
    can't report these, so the owner ticks them (battery also ticks when Android reports it).
  - Onboarding isn't gated on the checklist (spec §8 step 6). There is no onboarding flow that
    "finishes", and a gate would trap the emulator run; Today's banner covers a guard that is off.

## Consequences

- One more permission set: foreground service (special use), notifications, boot, battery and
  internet. The special-use subtype says why.
- **What's verified where:**
  - the queue, the send outcomes, minutes left and the watchdog: JUnit in CI
  - the Doze rule and the endpoint: Vitest
  - the hand-off and the checklist: Jest
  - in the emulator run: the foreground service is running, and a beat with the guard on and
    connected reaches the local server
  - Doze itself, Xiaomi's screens and the boot path need the Redmi checklist
- Force stop still switches the guard off and cancels the jobs until the app opens again. The
  server sees a silence without a reboot, which is a miss: correct.
- If MIUI kills the process while the phone sleeps, the accessibility service reconnects with a
  new "since", so that night's silence counts as guard off. Better a rare false miss than trusting
  delivery timing.
- **Left for P5c:** Chrome domains, emergency unlock on the shield, `UsageStats` reconciliation
  (which also closes the picture-in-picture gap), and an app picker.
