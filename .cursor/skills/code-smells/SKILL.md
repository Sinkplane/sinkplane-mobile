---
name: code-smells
description: Reviews code for Clean Code and refactoring smells (naming, function size, arguments, side effects, duplication, coupling, error handling, test smells) and reports or fixes them. Use when reviewing a diff or PR, during the cleaner stage, or when asked about code smells, best practices, or Uncle Bob's rules.
---

# Code smells

Review the **changed code** against this list. Smells marked *gated* are already enforced by `make check`. Do not hand-review those; run the gate. Spend review effort on what tools cannot catch.

Report each finding as `file:line: smell: one-sentence fix`. Severity is **must-fix** (blocks merge) or **consider**.

## Must-fix

| Smell | Signal | Fix |
|---|---|---|
| Lying name | Name says one thing, body does another or more | Rename to what it does, or split it |
| Vague name | `data`, `info`, `manager`, `handle`, `process`, `util`, `helper`, `temp`, `obj` | Name it for the domain concept |
| Does more than one thing | "and" in the description; sections separated by blank lines or comments | Extract each section |
| Mixed abstraction levels | Business rule next to string parsing or SQL | Push the detail down a level |
| Hidden side effect | `check*`/`get*`/`is*` that writes, mutates an argument, or does I/O | Separate query from command |
| Flag argument | Boolean parameter that selects behavior | Two functions |
| Output argument | Function writes into a parameter | Return the value |
| Duplicated knowledge | Same rule or constant in two places (not just similar-looking code) | One owner, everyone else calls it |
| Swallowed error | Empty catch, catch-and-log-and-continue, `except: pass`, `.ok()` dropping an error | Handle it, or let it propagate |
| Null or sentinel return | `null`/`-1`/`""` meaning "not found" or "failed" | Option/Result type, or throw a domain error |
| Feature envy | Method mostly uses another object's data | Move it there |
| Primitive obsession at a boundary | Raw `string` IDs, emails, and money passed through layers | Value object or branded/new type, validated once |
| Layer leak | Framework, ORM, or HTTP types in `domain`/`application` | Port interface plus an adapter (*gated* by `make arch` once rules exist) |
| Commented-out code | Any | Delete it; git remembers |
| Comment explaining *what* | Comment restates the next line | Delete it, or rename until the code says it |
| Test with no meaningful assertion | Asserts only "no throw" or a mock was called | Assert on outputs and effects |
| Test coupled to internals | Breaks on refactor without a behavior change | Test through the public interface |

## Consider

| Smell | Signal | Fix |
|---|---|---|
| Shallow module | Interface nearly as big as the implementation; pass-through methods | Merge it into the caller, or deepen it so it hides a real decision |
| Speculative generality | Interface with one implementation and no port role; unused parameters or hooks | Inline it until a second use appears |
| Data clump | Same 3+ parameters travel together | Introduce a parameter object |
| Long conditional chain on type | `switch`/`if` on a kind field in several places | Polymorphism or a lookup table |
| Temporal coupling | Must call `a()` before `b()` with nothing enforcing it | Make `b` take `a`'s result |
| Train wreck | `a.b().c().d()` across object boundaries | Tell, don't ask |
| Magic number or string | Unnamed literal carrying meaning | Named constant (*gated* in TS and Python) |
| Test duplication | Many near-identical tests | Table-driven or property-based test |

## Gated (run the tool, do not hand-review)

Function complexity (`lint`, `crap`), file and function length, parameter count, nesting depth, unused code, `any` and unsafe casts, floating promises and unawaited futures, unwrap and panic in non-test code, missing return types on exports, import cycles, layer direction, formatting, and untested branches (`coverage`, `mutate`).

For the reasoning behind each rule, see [smells-reference.md](smells-reference.md).
