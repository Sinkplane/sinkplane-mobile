#!/usr/bin/env bash
# Serves store/demo/media for demo mode on port 8099 (store/demo/install.ts points the app at
# localhost:8099, or 10.0.2.2:8099 from the Android emulator). Run make-media.sh first.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[[ -d "$here/media" ]] || { echo "No media yet: run store/demo/make-media.sh" >&2; exit 1; }
exec python3 -m http.server 8099 --bind 127.0.0.1 --directory "$here/media"
