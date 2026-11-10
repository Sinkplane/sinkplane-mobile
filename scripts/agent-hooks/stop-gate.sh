#!/usr/bin/env bash
# Blocks an agent from finishing while `make check` is red.
# Usage: stop-gate.sh cursor|claude  (hook JSON on stdin)
set -uo pipefail

harness="${1:-cursor}"
input="$(cat)"
cd "$(dirname "$0")/../.." || exit 0

allow() {
  [[ "$harness" == cursor ]] && echo '{}'
  exit 0
}

if [[ "$harness" == cursor ]]; then
  [[ "$(jq -r '.status // "completed"' <<<"$input")" == completed ]] || allow
else
  session="$(jq -r '.session_id // "default"' <<<"$input")"
  counter="${TMPDIR:-/tmp}/stop-gate-${session}"
  attempts="$(cat "$counter" 2>/dev/null || echo 0)"
  ((attempts >= 5)) && { rm -f "$counter"; allow; }
fi

[[ -z "$(git status --porcelain -- . 2>/dev/null)" ]] && allow

log="$(mktemp)"
if make check >"$log" 2>&1; then
  rm -f "$log" "${counter:-}"
  allow
fi

msg="$(printf 'make check failed. Fix the failures below and run make check again. Do not loosen gates or add suppressions.\n\n%s' "$(tail -n 80 "$log")")"
rm -f "$log"

if [[ "$harness" == cursor ]]; then
  jq -n --arg m "$msg" '{followup_message: $m}'
  exit 0
fi
echo $((attempts + 1)) >"$counter"
echo "$msg" >&2
exit 2
