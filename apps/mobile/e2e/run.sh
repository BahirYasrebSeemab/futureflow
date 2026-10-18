#!/usr/bin/env bash
# Runs inside the emulator step (CI only): install the release APK, then run the Maestro flows.
set -euo pipefail
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
E2E="$PWD/apps/mobile/e2e"
OUT="$PWD/e2e-out"
MAESTRO="$HOME/.maestro/bin/maestro"
mkdir -p "$OUT"
# Keep Maestro's own run folder (screenshots, logs) in the artifact, even when a flow fails.
trap 'cp -r "$HOME/.maestro/tests" "$OUT/maestro-tests" 2> /dev/null || true' EXIT
adb install -r "$APK"
# A slow emulator's own apps (often the launcher) freeze and raise "isn't responding" dialogs over
# ours; testing builds can hide them.
adb shell settings put global hide_error_dialogs 1
cd "$OUT"
"$MAESTRO" test "$E2E/flows/pair-and-today.yaml" \
  --test-output-dir "$OUT/maestro" --format junit --output "$OUT/report.xml"

# The guard: spend today's time on the server so the next sync leaves none, let the app sync, then
# expect the shield over a blocked app.
SERVICE=com.bahiryasreb.futureflow/expo.modules.usageguard.UsageGuardService
guard_on() {
  adb shell settings put secure enabled_accessibility_services "$SERVICE"
  adb shell settings put secure accessibility_enabled 1
}
guard_state() {
  echo "enabled services: $(adb shell settings get secure enabled_accessibility_services | tr -d '\r')"
  adb shell dumpsys accessibility | grep -iE 'futureflow|bound services|enabled services' || true
}
# Force-stopping an app switches its accessibility service off, so stop it first and never again.
adb shell am force-stop com.bahiryasreb.futureflow
guard_on
"$E2E/spend-today.sh"
"$MAESTRO" test "$E2E/flows/guard.yaml" \
  --test-output-dir "$OUT/maestro-guard" --format junit --output "$OUT/report-guard.xml"

# Maestro's UI automation suppresses other accessibility services while connected: stop its driver,
# switch the guard back on, then open Settings (blocked in this build) and look for the shield.
adb shell am force-stop dev.mobile.maestro || true
adb shell am force-stop dev.mobile.maestro.test || true
guard_on
sleep 5
guard_state
adb shell am start -W -n com.android.settings/.Settings
sleep 5
adb exec-out screencap -p > "$OUT/15-shield.png"
top=$(adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1)
echo "top activity: $top"
if ! echo "$top" | grep -q ShieldActivity; then
  guard_state
  echo "The shield did not cover Settings"
  exit 1
fi
echo "The shield covers Settings"

# Browsers (P5c-2): Chrome on a blocked site should get the shield too. Chrome's first-run screens
# are skipped through its debug command line. Fragile by nature (spec §7: an ADR and a manual test),
# so this records a screenshot and a result line rather than failing the run.
if adb shell pm path com.android.chrome | grep -q package; then
  adb shell am set-debug-app --persistent com.android.chrome
  adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
  adb shell input keyevent KEYCODE_HOME
  adb shell am start -W -a android.intent.action.VIEW -d https://m.youtube.com com.android.chrome
  sleep 10
  adb exec-out screencap -p > "$OUT/15b-chrome.png"
  top=$(adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1)
  if echo "$top" | grep -q ShieldActivity; then
    echo "CHROME CHECK: the shield covers youtube.com in Chrome"
  else
    echo "CHROME CHECK: no shield over Chrome (top: $top)"
  fi
else
  echo "CHROME CHECK: Chrome is not on this emulator image"
fi

# Staying alive (P5b): the guard's foreground service runs, and the native heartbeat reached the
# server with the guard on and connected.
services=$(adb shell dumpsys activity services com.bahiryasreb.futureflow)
if ! echo "$services" | grep -q GuardForegroundService || ! echo "$services" | grep -q 'isForeground=true'; then
  echo "$services" | head -40
  echo "The guard's foreground service is not running"
  exit 1
fi
echo "The foreground service runs"
beats=0
for i in $(seq 1 12); do
  beats=$("$E2E/heartbeats.sh" 2> /dev/null || echo 0)
  beats=${beats//[^0-9]/}
  beats=${beats:-0} # anything but a count is no count
  if [ "$beats" -gt 0 ]; then break; fi
  sleep 5
done
if [ "$beats" -eq 0 ]; then
  grep -i heartbeat "$OUT/../wrangler.log" | tail -20 || true
  echo "No heartbeat with the guard on reached the server"
  exit 1
fi
echo "Heartbeats with the guard on: $beats"

# The checklist and the picker, opened through the app's links (Maestro would switch the guard off).
open_link() {
  adb shell input keyevent KEYCODE_HOME
  adb shell am start -W -a android.intent.action.VIEW -d "$1" com.bahiryasreb.futureflow
  sleep 5
}
open_link futureflow://guard
adb exec-out screencap -p > "$OUT/16-guard-checklist.png"
open_link futureflow://blocked-apps
adb exec-out screencap -p > "$OUT/19-blocked-apps.png"

# Emergency unlock (P5c-1): Maestro gives a reason and waits out the (shortened) wait, then with
# the guard back on, Settings opens without the shield.
"$MAESTRO" test "$E2E/flows/unlock.yaml" \
  --test-output-dir "$OUT/maestro-unlock" --format junit --output "$OUT/report-unlock.xml"
adb shell am force-stop dev.mobile.maestro || true
adb shell am force-stop dev.mobile.maestro.test || true
guard_on
sleep 5
adb shell input keyevent KEYCODE_HOME
adb shell am start -W -n com.android.settings/.Settings
sleep 5
adb exec-out screencap -p > "$OUT/20-after-unlock.png"
top=$(adb shell dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1)
echo "top activity after the unlock: $top"
if echo "$top" | grep -q ShieldActivity; then
  guard_state
  echo "The shield still covers Settings after an emergency unlock"
  exit 1
fi
echo "After the unlock, Settings opens"
