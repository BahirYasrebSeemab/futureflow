#!/usr/bin/env bash
# CI only: turns a fixed set of the emulator run's screenshots into the README's demo GIF
# (2 s a frame). Usage: demo-gif.sh <e2e-out dir>. Needs ImageMagick.
set -euo pipefail
OUT="$1"
FRAMES="$OUT/demo"
rm -rf "$FRAMES"
mkdir -p "$FRAMES"
i=0
for name in 02-today 04-plan-draft 05-plan-locked 07-practice 08-feedback 13-roadmap \
  15-shield 17-unlock-reason 18-unlocked 16-guard-checklist; do
  f=$(find "$OUT" -name "$name.png" -not -path "$FRAMES/*" | head -1)
  [ -n "$f" ] || continue
  i=$((i + 1))
  cp "$f" "$FRAMES/$(printf %02d "$i").png"
done
if [ "$i" -eq 0 ]; then
  echo "No screenshots for the demo"
  exit 0
fi
# ImageMagick stitches stills well (the runner's ffmpeg fails on this palette mapping): 2 s a frame,
# one shared palette, looping.
convert -delay 200 -loop 0 "$FRAMES"/[0-9][0-9].png -resize 320x +dither -layers Optimize "$OUT/demo.gif"
frames=$(identify "$OUT/demo.gif" | wc -l)
echo "demo.gif: $frames frames from $i screenshots"
