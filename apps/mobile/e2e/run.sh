#!/usr/bin/env bash
# Runs inside the emulator step (CI only): install the release APK, then run the Maestro flows.
set -euo pipefail
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
OUT="$PWD/e2e-out"
mkdir -p "$OUT"
# Keep Maestro's own run folder (screenshots, logs) in the artifact, even when a flow fails.
trap 'cp -r "$HOME/.maestro/tests" "$OUT/maestro-tests" 2> /dev/null || true' EXIT
adb install -r "$APK"
cd "$OUT"
"$HOME/.maestro/bin/maestro" test "$PWD/../apps/mobile/e2e/flows" \
  --test-output-dir "$OUT/maestro" --format junit --output "$OUT/report.xml"
