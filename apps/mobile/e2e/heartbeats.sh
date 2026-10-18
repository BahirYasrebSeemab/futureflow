#!/usr/bin/env bash
# CI only: prints how many beats in the local D1 say the guard was on and connected.
set -euo pipefail
API="$(cd "$(dirname "$0")/../../api" && pwd)"
cd "$API"
bun x wrangler d1 execute futureflow --local --json --command \
  "SELECT COUNT(*) AS n FROM heartbeats WHERE guard_enabled = 1 AND guard_since_uptime IS NOT NULL" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)[0]["results"][0]["n"])'
