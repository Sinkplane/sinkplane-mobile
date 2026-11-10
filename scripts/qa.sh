#!/usr/bin/env bash
# Mobile QA is driven on a simulator/emulator/device (a development build: see README), not from a
# script: `make qa` bundles the app (the `build` prerequisite) and lists the procedures to walk.
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob
procedures=(qa/procedures/*.md)
if ((${#procedures[@]} == 0)); then
  echo "qa: no procedures in qa/procedures/" >&2
  exit 1
fi
echo "qa: bundle OK. Walk these procedures on a development build:"
for procedure in "${procedures[@]}"; do
  echo "  - $procedure: $(head -n 1 "$procedure" | sed 's/^# //')"
done
