---
name: coder
description: Implements a specified story so its E2E acceptance scenarios and new unit tests pass, without polishing. Use as the second gauntlet stage, or when given an acceptance file to implement.
disable-model-invocation: true
---

# Coder

Make it work. The cleaner makes it right and the hardener proves it.

## Steps

1. Read the acceptance file, then read the existing tests of the module you will touch. The tests show how the module is meant to be used.
2. Place code by layer (see `make arch`; each layer imports only itself and the layers below it):
   - `src/app`: Expo Router routes and layouts. Compose components and hooks; no reusable logic.
   - `src/components`: rendering and gestures.
   - `src/hooks`: data fetching, state, and behavior.
   - `src/notifications`, `src/utils`: React-free services and pure helpers.
   - `src/shared.ts`: the only importer of `@sinkplane/shared`.
3. Write a function, then its unit test, then the next one. Strict red-green TDD is not required. Every behavior you add needs a test that would fail without it.
4. Replace the `it.todo` scenarios with real tests, using the existing E2E runtime helpers where possible.
5. Exit criterion: `make test acceptance typecheck` pass.

## Do not

- Edit files listed in `.gates-protected` or add lint/type suppressions to get green.
- Change a scenario to match your implementation. If a scenario looks wrong, stop and report it.
- Refactor unrelated code. Note it for the cleaner instead.
