#!/usr/bin/env bash
# Runs inside the emulator step (CI only): install the release APK, then run the Maestro flows.
set -euo pipefail
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
adb install -r "$APK"
mkdir -p e2e-out
cd e2e-out
"$HOME/.maestro/bin/maestro" test ../apps/mobile/e2e/flows --format junit --output report.xml
