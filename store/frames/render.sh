#!/usr/bin/env bash
# Renders the store screenshots: every frame in frames.html (caption + raw screenshot from
# store/screenshots/raw) into store/screenshots/<store>/..., at each store's exact pixel size.
# Frames whose raw screenshot is missing are skipped. See store/README.md.
#
#   store/frames/render.sh   # needs the same headless Chromium as store/demo/make-media.sh
set -euo pipefail

store="$(cd "$(dirname "$0")/.." && pwd)"
page="file://$store/frames/frames.html"
out="$store/screenshots"
chromium="${CHROMIUM:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)}"
[[ -x "$chromium" ]] || { echo "No headless Chromium found (see store/demo/make-media.sh)" >&2; exit 1; }
profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

browser() {
  "$chromium" --disable-gpu --hide-scrollbars --user-data-dir="$profile" \
    --allow-file-access-from-files --force-device-scale-factor=1 "$@" </dev/null 2>/dev/null
}

# The page lists its frames as "<hash> <file> <width> <height> <raw screenshot or ->" lines.
browser --dump-dom "$page#list" | sed -e 's/<[^>]*>//g' | grep -E '^ *[a-z-]+(/[0-9]+)? [^ ]+ [0-9]+ [0-9]+ [^ ]+$' |
  while read -r hash file width height raw; do
    if [[ "$raw" != "-" && ! -f "$out/raw/$raw.png" ]]; then
      echo "skip $file (no raw/$raw.png)"
      continue
    fi
    mkdir -p "$(dirname "$out/$file")"
    browser --window-size="$width,$height" --virtual-time-budget=2000 \
      --screenshot="$out/$file" "$page#$hash" >/dev/null
    echo "$file"
  done
