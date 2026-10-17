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
