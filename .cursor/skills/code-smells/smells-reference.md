# Smells reference

Background for the rules in `SKILL.md`. Read this only when a finding is disputed or a fix is unclear.

## Functions (Clean Code ch. 3)

- **Small, one thing, one level of abstraction.** A function does one thing if you cannot extract another function from it with a name that is not a restatement. The stepdown rule says each function is followed by the ones it calls, one level lower.
- **Arguments.** Zero is ideal, then one, then two. Three needs justification. Boolean flags announce that the function does two things. Output arguments read backwards.
- **Command-query separation.** A function either changes state or answers a question, never both.
- **Prefer exceptions or result types to error codes.** Error codes force the caller to handle them immediately and nest. `try`/`catch` blocks are a function's whole body; extract the body.

## Names (ch. 2)

- Intention-revealing, pronounceable, searchable. Class names are nouns; method names are verbs.
- One word per concept across the codebase (`fetch` vs `get` vs `retrieve`: pick one).
- The longer the scope, the longer the name. Loop indices can be `i`; module-level values cannot.

## Comments (ch. 4)

- A comment is a failure to express yourself in code. Good comments state intent, a constraint, or a warning the code cannot show (for example "the API returns dates in local time"). Everything else rots.

## Error handling (ch. 7)

- Do not return null; do not pass null. Define the normal flow first and push special cases into a Special Case object or `Option`.
- Wrap third-party APIs at the boundary so their exceptions do not leak into the domain.

## Classes and modules (ch. 10; Ousterhout)

- **Single Responsibility:** one reason to change. **Cohesion:** methods use most of the instance variables.
- **Deep modules:** a small interface over a large implementation. A module's value is the complexity it hides, minus the complexity of its interface. Shallow modules (pass-throughs, one-line wrappers, classes whose interface mirrors the implementation) cost more than they give.
- **Information hiding:** each design decision lives in exactly one module. Leakage means two modules must change together.
- **Dependency Inversion:** policy (domain/application) does not depend on detail (frameworks, DB). Both depend on an abstraction owned by the policy side. This is how `make arch` violations are fixed.

## Tests (ch. 9)

- F.I.R.S.T.: fast, independent, repeatable, self-validating, timely.
- One concept per test. Arrange/act/assert. Test names describe behavior (`rejects_expired_token`), not methods (`test_validate`).
- Test code is held to the same standards as production code, because agents read tests to learn what the system does.

## General heuristics (ch. 17, abridged)

- G5 duplication; G6 code at the wrong level of abstraction; G8 too much information in the interface; G9 dead code; G14 feature envy; G15 selector arguments; G23 prefer polymorphism to if/else or switch/case; G25 replace magic numbers with named constants; G28 encapsulate conditionals (`if (shouldBeDeleted(timer))`); G29 avoid negative conditionals; G30 functions should do one thing; G31 hidden temporal couplings; G34 functions should descend only one level of abstraction; G36 avoid transitive navigation.
