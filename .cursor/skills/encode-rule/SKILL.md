---
name: encode-rule
description: Turns a recurring review comment or agent mistake into a deterministic gate (lint rule, type, test, or architecture rule) instead of another line of prose instructions. Use when the user says "agents keep doing X", wants to add a rule to AGENTS.md, or asks how to enforce a convention.
disable-model-invocation: true
---

# Encode a rule

Prose rules decay as context grows. Gates do not. Before adding a sentence to `AGENTS.md`, find the strongest mechanism that can enforce it.

## Pick the mechanism (strongest first)

1. **Make it unrepresentable with types.** Branded or new types, enums or discriminated unions, constructor validation, `readonly`, non-optional fields.
2. **Built-in lint rule.** Check the linter's rule list: typescript-eslint plus core ESLint, ruff (`ruff rule --all`), or clippy (`cargo clippy --explain` and the lint list).
3. **Restricted-pattern rule.** ESLint `no-restricted-syntax`/`no-restricted-imports`; ruff `flake8-tidy-imports.banned-api`; clippy `disallowed-methods`/`disallowed-types` in `clippy.toml`.
4. **Architecture rule.** dependency-cruiser, import-linter contracts, or `arch.toml` for anything about who may import what.
5. **Test.** An architecture or convention test that scans the source (for example "every controller has an e2e test", or "no `TODO` without a ticket").
6. **Prose in `AGENTS.md`.** Only if 1–5 are impossible. Keep it to one line.

## Steps

1. State the rule in one sentence, with one violating example and one passing example.
2. Implement it with the strongest mechanism that fits.
3. Prove it works: add the violating example, run the gate and confirm it fails with a clear message, then remove the example.
4. Run the gate on the whole codebase and fix existing violations, or list them for the human.
5. The gate config is protected, so the human approves the edit. Include the before and after proof in your reply.
