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

# The guard: switch on its accessibility service (as the owner does in Settings), spend today's
# time on the server so the next sync leaves none, then expect the shield over a blocked app.
adb shell settings put secure enabled_accessibility_services \
  com.bahiryasreb.futureflow/expo.modules.usageguard.UsageGuardService
adb shell settings put secure accessibility_enabled 1
"$E2E/spend-today.sh"
"$MAESTRO" test "$E2E/flows/guard.yaml" \
  --test-output-dir "$OUT/maestro-guard" --format junit --output "$OUT/report-guard.xml"
