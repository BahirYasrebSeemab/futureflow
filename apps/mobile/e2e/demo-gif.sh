#!/usr/bin/env bash
# CI only: turns a fixed set of the emulator run's screenshots into the README's demo GIF
# (2 s a frame). Usage: demo-gif.sh <e2e-out dir>. Needs ffmpeg.
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
# Two passes: one palette for all frames, then the frames with it. Whole-number rates only (ffmpeg
# fails on fractional ones here): 1 frame a second in, each frame held for two.
ffmpeg -loglevel error -y -framerate 1 -i "$FRAMES/%02d.png" \
  -vf "scale=320:-1:flags=lanczos,palettegen" -frames:v 1 -update 1 "$FRAMES/palette.png"
ffmpeg -loglevel error -y -framerate 0.5 -i "$FRAMES/%02d.png" -i "$FRAMES/palette.png" \
  -lavfi "scale=320:-1:flags=lanczos[x];[x][1:v]paletteuse" -loop 0 "$OUT/demo.gif"
frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$OUT/demo.gif")
echo "demo.gif: $frames frames from $i screenshots"
