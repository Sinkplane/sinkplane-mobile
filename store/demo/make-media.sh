#!/usr/bin/env bash
# Renders the demo-mode media into store/demo/media (gitignored): the artwork in art/art.html
# (thumbnails, icons, avatars, live cards) via a headless Chromium browser, and two HLS streams
# (hls/video, hls/live; fMP4 segments, since .ts files would look like TypeScript to the tooling)
# made from its scene frames with ffmpeg. See store/README.md.
#
#   store/demo/make-media.sh   # needs ffmpeg and a headless Chromium: Playwright's
#                              # chrome-headless-shell (pnpm dlx playwright install
#                              # chromium-headless-shell), or set CHROMIUM=/path/to/it
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/media"
art="file://$here/art/art.html"
chromium="${CHROMIUM:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)}"
[[ -x "$chromium" ]] || { echo "No headless Chromium found (see the header of this script)" >&2; exit 1; }
profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

browser() {
  "$chromium" --disable-gpu --hide-scrollbars --user-data-dir="$profile" \
    --force-device-scale-factor=1 "$@" </dev/null 2>/dev/null
}

render() { # hash, file under media/, width, height
  local png="$out/${2%.*}.png"
  mkdir -p "$(dirname "$png")"
  browser --window-size="$3,$4" --virtual-time-budget=500 --screenshot="$png" "$art#$1" >/dev/null
  if [[ "$2" == *.jpg ]]; then
    sips -s format jpeg -s formatOptions 88 "$png" --out "$out/$2" >/dev/null
    rm "$png"
  fi
}

stream() { # scene png, output dir
  mkdir -p "$2"
  ffmpeg -loglevel error -y -loop 1 -i "$1" \
    -vf "zoompan=z='1+0.0004*on':d=1:s=1280x720:fps=30,format=yuv420p" -t 24 \
    -c:v libx264 -preset veryfast -g 60 -sc_threshold 0 \
    -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_type fmp4 \
    -hls_fmp4_init_filename init.mp4 -hls_segment_filename "$2/seg%02d.m4s" "$2/clip.m3u8"
  loop_playlist "$2/clip.m3u8" > "$2/index.m3u8"
}

# The 24s clip repeated to 40 minutes, so resuming a demo video halfway through doesn't land past
# its end. Same segments, one playlist entry per repeat.
loop_playlist() {
  local repeats=100
  sed -n '1,/^#EXT-X-MAP/p' "$1" | grep -v '^#EXT-X-PLAYLIST-TYPE'
  echo '#EXT-X-PLAYLIST-TYPE:VOD'
  for ((i = 0; i < repeats; i++)); do
    ((i > 0)) && echo '#EXT-X-DISCONTINUITY'
    sed -n '/^#EXTINF/,$p' "$1" | grep -v '^#EXT-X-ENDLIST'
  done
  echo '#EXT-X-ENDLIST'
}

rm -rf "$out"
mkdir -p "$out"
# The page lists its assets as "<hash> <file> <width> <height>" lines.
browser --dump-dom "$art#list" | sed -e 's/<[^>]*>//g' | grep -E '^ *[a-z]+/[^ ]+ [^ ]+ [0-9]+ [0-9]+$' |
  while read -r hash file width height; do
    if [[ -n "$hash" ]]; then render "$hash" "$file" "$width" "$height"; fi
  done
stream "$out/scenes/video.png" "$out/hls/video"
stream "$out/scenes/live.png" "$out/hls/live"
echo "Rendered $(find "$out" -type f | wc -l | tr -d ' ') files into $out"
