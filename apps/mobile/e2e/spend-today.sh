#!/usr/bin/env bash
# CI only: writes a usage_spend for the emulator's current day straight into the local D1, so the
# phone's next pull leaves no time and the guard has to shield. 16 min against the 15-min base: a
# minute of debt, so the later emergency unlock still leaves 9 minutes.
set -euo pipefail
API="$(cd "$(dirname "$0")/../../api" && pwd)"
offset=$(adb shell date +%z | tr -d '\r') # like +0000 or -0400
minutes=$((10#${offset:1:2} * 60 + 10#${offset:3:2}))
if [ "${offset:0:1}" = "-" ]; then minutes=$((-minutes)); fi
now=$(date +%s)
# Days turn at 04:00 local (spec §4.3 rule 6).
day=$(date -u -d "@$((now + minutes * 60 - 4 * 3600))" +%F)
id=$(cat /proc/sys/kernel/random/uuid)
cd "$API"
bun x wrangler d1 execute futureflow --local --command \
  "INSERT INTO ledger_events (id, day, at, kind, seconds, received_at)
   VALUES ('$id', '$day', $((now * 1000)), 'usage_spend', -960, $((now * 1000)))"
echo "Spent 16 min on $day"
