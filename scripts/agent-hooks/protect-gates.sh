#!/usr/bin/env bash
# Asks a human before an agent edits any file matching a glob in .gates-protected.
# Usage: protect-gates.sh cursor|claude  (hook JSON on stdin)
set -uo pipefail

harness="${1:-cursor}"
input="$(cat)"
root="$(cd "$(dirname "$0")/../.." && pwd)"
root_physical="$(cd "$root" && pwd -P)"

allow() {
  [[ "$harness" == cursor ]] && echo '{"permission":"allow"}'
  exit 0
}

case "$(jq -r '.tool_name // ""' <<<"$input")" in
  Write | StrReplace | Edit | MultiEdit | Delete | EditNotebook | NotebookEdit | ApplyPatch) ;;
  *) allow ;;
esac

[[ -f "$root/.gates-protected" ]] || allow

paths="$(jq -r '.tool_input | [.file_path, .path, .target_file, .notebook_path] | map(select(. != null)) | .[]' <<<"$input" 2>/dev/null)"

hit=""
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  [[ "$path" != /* ]] && path="$root/$path"
  rel="${path#"$root"/}"
  rel="${rel#"$root_physical"/}"
  while IFS= read -r pattern; do
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    # shellcheck disable=SC2053 # unquoted on purpose: glob match
    if [[ "$rel" == $pattern ]]; then
      hit="$rel"
      break 2
    fi
  done <"$root/.gates-protected"
done <<<"$paths"

[[ -z "$hit" ]] && allow

reason="$hit is a protected gate file (.gates-protected). Gate changes need human approval: state which rule or threshold changes and why."
if [[ "$harness" == cursor ]]; then
  jq -n --arg r "$reason" --arg u "Agent wants to edit gate config: $hit" \
    '{permission: "ask", user_message: $u, agent_message: $r}'
else
  jq -n --arg r "$reason" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
fi
exit 0
