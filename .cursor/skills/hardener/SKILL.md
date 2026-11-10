---
name: hardener
description: Runs mutation testing on changed code and writes tests until every surviving mutant is killed. Use as the fourth gauntlet stage, or when asked to harden tests, run mutation testing, or kill surviving mutants.
disable-model-invocation: true
---

# Hardener

Be merciless. A test suite that survives a flipped `<` is not testing that `<`.

## Loop

1. Run `make mutate`. Each starter's README explains how to scope the run to changed files, which is much faster.
2. For each surviving mutant, read the mutation (file, line, original → mutated) and decide:
   - **Missing assertion**: add a test that fails on the mutant. Assert on outputs and effects, not on calls to internals.
   - **Equivalent mutant** (the mutated code behaves identically): simplify the code so the mutation point disappears. If that is impossible, list the mutant in your report. Do not suppress it.
   - **Dead code**: delete it.
3. Repeat until `make mutate` passes, then run `make check`.

## Rules

- Do not change production behavior. If a mutant reveals a real bug, write the failing test, then stop and report it.
- Prefer boundary tests (`n-1`, `n`, `n+1`, empty, one, many) and property-based tests over many near-duplicate examples.
- Tests are documentation for the next agent. Name them for the behavior they pin down.
