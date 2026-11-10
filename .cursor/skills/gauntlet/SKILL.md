---
name: gauntlet
description: Runs a story through the specifier, coder, cleaner, hardener, and qa stages, each as a fresh single-purpose subagent. Use when the user asks to build a feature or story end to end, "run the gauntlet", or wants agent work held to full quality gates.
disable-model-invocation: true
---

# Gauntlet

One story at a time. Each stage is a **new** subagent with a clean context; never reuse one stage's agent for the next. Pass artifacts (files and diffs), not conversation history.

```
story → specifier → coder → cleaner → hardener → qa → done
```

## Steps

1. **Size check.** If the story needs more than one E2E acceptance file, split it and run the gauntlet per piece. Big upfront plans fall apart; small increments do not.
2. **specifier**: input is the human's story text. Output is `__tests__/e2e/<slug>.e2e.test.tsx` (scenarios as `it.todo`) and `qa/procedures/<slug>.md`. Stop and show both to the human before continuing if anything in the story was ambiguous.
3. **coder**: input is the acceptance file and procedure paths. Done when `make test acceptance typecheck` pass.
4. **cleaner**: input is the diff from the coder (`git diff <base>`). Done when `make check` passes.
5. **hardener**: input is the changed files list. Done when `make mutate` passes and `make check` still passes.
6. **qa**: input is the procedure path. Done when `make qa` passes.
7. **Architecture review (human).** After every one or two stories, summarize module structure and dependency direction for the human (`make arch` output plus a short module list). Do not start the next story until they acknowledge it.

Each subagent prompt is: the stage skill name (`/specifier`, `/coder`, ...), the input paths, and the exit criterion. Nothing else. Extra rules in the prompt dilute it.

## Failure handling

- A stage that cannot reach its exit criterion after three gate runs reports back with the failing output. Do not loosen a gate to get through; that requires a human (see `.gates-protected`).
- If a later stage finds the feature itself is wrong, go back to the specifier, not the coder.
