#!/usr/bin/env node
// Git guard for Claude Code (PreToolUse hook) + the user's approval switch.
//
// Agents may not write git history, change git identity/config, talk to a
// remote, or act on GitHub as the user unless the user has opened an approval
// window. Deny holds in every permission mode, including bypass. Read-only
// git/gh commands are never blocked.
//
// The user (never an agent) opens/closes a window from a terminal:
//   node .claude/hooks/git-guard.mjs --approve [minutes]   (default 15)
//   node .claude/hooks/git-guard.mjs --revoke
//   node .claude/hooks/git-guard.mjs --status
//
// See CLAUDE.md › "Git and GitHub rules".

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPROVAL_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "git-approval.json");
const PROTECTED_PATH = /[\\/]\.claude[\\/](hooks[\\/]|settings(\.local)?\.json$|git-approval\.json$)/i;
const HOW_TO_APPROVE =
  "Stop and ask the user. If they agree, THEY run `node .claude/hooks/git-guard.mjs --approve 15` in a terminal (agents must never run it), then retry.";

// git subcommands that create, rewrite or publish history, change refs or the
// working tree, or reconfigure remotes. `add` (staging) and `fetch`/`pull`
// (only bring changes in) are deliberately allowed, per the user.
const GIT_WRITE = new Set([
  "commit", "push", "merge", "rebase", "reset", "revert", "cherry-pick",
  "tag", "am", "apply", "filter-branch", "filter-repo", "update-ref", "notes",
  "replace", "commit-tree", "clone", "remote", "submodule", "worktree",
  "stash", "init", "gc", "prune", "reflog", "branch", "checkout", "switch",
  "restore", "clean", "rm", "mv",
]);
// Read-only argument forms of otherwise-guarded subcommands.
const GIT_READONLY_FORMS = {
  branch: (args) => args.every((a) => /^(-a|-r|-v|-vv|--list|--all|--remotes|--show-current|--contains|--merged|--no-merged|--sort=.*|--format=.*)$/.test(a)),
  remote: (args) => args.length === 0 || args.every((a) => a === "-v" || a === "--verbose") || args[0] === "show" || args[0] === "get-url",
  stash: (args) => args[0] === "list" || args[0] === "show",
  reflog: (args) => args.length === 0 || args[0] === "show",
  worktree: (args) => args[0] === "list",
  submodule: (args) => args.length === 0 || args[0] === "status",
  tag: (args) => args.length === 0 || args.every((a) => /^(-l|--list|-n\d*|--sort=.*|--contains|--points-at)$/.test(a) || a.includes("*")),
  notes: (args) => args.length === 0 || args[0] === "list" || args[0] === "show",
};
const GH_READONLY_VERBS = new Set(["list", "view", "status", "diff", "checks", "search", "watch", "download"]);
const GH_READONLY_GROUPS = new Set(["--version", "version", "help", "browse", "search", "status"]);

// ---------- approval window ----------

function readApproval() {
  try {
    const { expiresAt } = JSON.parse(readFileSync(APPROVAL_FILE, "utf8"));
    return typeof expiresAt === "number" && expiresAt > Date.now() ? expiresAt : null;
  } catch {
    return null;
  }
}

function cli(args) {
  const [flag, value] = args;
  if (flag === "--approve") {
    const minutes = Math.min(Math.max(Number(value ?? 15) || 15, 1), 120);
    const expiresAt = Date.now() + minutes * 60_000;
    writeFileSync(APPROVAL_FILE, JSON.stringify({ expiresAt, grantedAt: new Date().toISOString() }, null, 2));
    console.log(`Git guard: agents may run git/gh write commands until ${new Date(expiresAt).toLocaleTimeString()} (${minutes} min).`);
  } else if (flag === "--revoke") {
    if (existsSync(APPROVAL_FILE)) rmSync(APPROVAL_FILE);
    console.log("Git guard: approval revoked; git/gh write commands are blocked again.");
  } else {
    const expiresAt = readApproval();
    console.log(expiresAt ? `Git guard: approved until ${new Date(expiresAt).toLocaleTimeString()}.` : "Git guard: no active approval; git/gh write commands are blocked.");
  }
}

// ---------- hook ----------

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Blocked by git guard: ${reason}. ${HOW_TO_APPROVE}`,
      },
    }),
  );
  process.exit(0);
}

/** Splits a shell line into commands on && || ; | and newlines, then into words. */
function commands(line) {
  return line
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^['"]|['"]$/g, "")))
    .filter((words) => words.length > 0);
}

/** Program name without path, quotes, call operator or .exe. */
function program(word) {
  return word.replace(/^&/, "").split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase();
}

/** Returns a reason if this git invocation is guarded, else null. */
function gitReason(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) i += args[i] === "-C" || args[i] === "-c" ? 2 : 1;
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return null;
  if (sub === "config") {
    const readOnly =
      rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l)$/.test(a)) &&
      !rest.some((a) => /^(--unset|--unset-all|--add|--replace-all|--rename-section|--remove-section|-e|--edit)$/.test(a));
    return readOnly ? null : "`git config` changes git configuration (possibly your commit identity)";
  }
  if (!GIT_WRITE.has(sub)) return null;
  if (GIT_READONLY_FORMS[sub]?.(rest)) return null;
  return `\`git ${sub}\` writes history, changes refs or the working tree, or talks to a remote`;
}

/** Returns a reason if this gh invocation is guarded, else null. */
function ghReason(args) {
  const [group, verb] = args;
  if (!group || GH_READONLY_GROUPS.has(group)) return null;
  if (group === "auth" && verb === "status") return null;
  if (group === "api") {
    const mutating = args.some(
      (a, idx) =>
        ((a === "-X" || a === "--method") && !/^get$/i.test(args[idx + 1] ?? "")) ||
        /^--method=(?!get$)/i.test(a) ||
        /^-X(?!get$)\w+/i.test(a) ||
        /^(-f|-F|--field|--raw-field|--input)$/.test(a) ||
        /^(--field|--raw-field|--input)=/.test(a),
    );
    return mutating ? "`gh api` with a write method or fields acts on GitHub as you" : null;
  }
  if (verb && GH_READONLY_VERBS.has(verb)) return null;
  return `\`gh ${args.slice(0, 2).join(" ")}\` acts on GitHub as you`;
}

/** Returns the reason the command is guarded (null if not); denies outright when not approved. */
function checkShell(command, approved) {
  // Only the user may open an approval window or touch the approval file.
  if (/git-approval/i.test(command) || /git-guard(\.mjs)?["']?\s[^|;&\n]*--approve/i.test(command)) {
    deny("only the user may grant git approval");
  }
  // Running the guard itself (e.g. a pipe-test) is fine; touching guard files otherwise is guarded.
  const withoutGuardRuns = command.replace(/node\s+["']?[^"'\s]*git-guard\.mjs["']?/gi, "");
  let reason = /\.claude[\\/](hooks|settings)/i.test(withoutGuardRuns) ? "this command touches the git guard's own files" : null;
  for (const words of commands(command)) {
    for (let w = 0; w < words.length && !reason; w++) {
      const name = program(words[w]);
      reason = name === "git" ? gitReason(words.slice(w + 1)) : name === "gh" ? ghReason(words.slice(w + 1)) : null;
    }
  }
  if (reason && !approved) deny(reason);
  return reason;
}

/** Returns the reason the edit is guarded (null if not); denies outright when not approved. */
function checkFileEdit(input, approved) {
  const path = String(input?.file_path ?? input?.notebook_path ?? "");
  if (/[\\/]\.claude[\\/]git-approval\.json$/i.test(path)) deny("only the user may grant git approval");
  const reason = PROTECTED_PATH.test(path) ? "editing the git guard's own files" : null;
  if (reason && !approved) deny(reason);
  return reason;
}

function hook() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
    const { tool_name: tool, tool_input: input } = JSON.parse(raw);
    const approved = readApproval() !== null;
    const reason =
      tool === "Bash" || tool === "PowerShell"
        ? typeof input?.command === "string"
          ? checkShell(input.command, approved)
          : null
        : checkFileEdit(input, approved);
    if (reason) {
      // Only reachable with an active approval window: make the use visible to the user.
      process.stdout.write(JSON.stringify({ systemMessage: `Git guard: allowed under your approval window (${reason}).` }));
    }
    process.exit(0);
  } catch {
    // Fail closed for anything that looks like git/gh or guard files; otherwise stay out of the way.
    if (/\b(git|gh)(\.exe)?\b|\.claude[\\/]/i.test(raw)) deny("could not parse the tool call");
    process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args.length > 0) cli(args);
else hook();
