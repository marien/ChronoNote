# Mutation testing

Mutation testing checks whether the Vitest suite catches small faults injected into production code — one change at a time (such as `<` to `<=`, `&&` to `||`, or a removed branch). A mutant is **killed** when at least one test fails (or times out) and **survived** when all tests still pass.

## Local only

Mutation testing runs **locally only** (for example, once a month to audit test quality). It never runs in CI and is not part of `npm run verify`. Generated files under `reports/` are gitignored.

## How to run

Run all nine configured core modules (`stryker.config.mjs`, `concurrency: 2` to limit RAM):

```bash
npm run mutation
```

Expect a cold run across all nine modules to take roughly 1.5–2+ hours; subsequent runs reuse `reports/mutation/incremental.json` and only re-test changed code or tests.

To test a single file (typically 5–15 minutes; `src/lib/calendarReconcile.ts` took ~13 minutes cold):

```bash
npm run mutation:one -- src/lib/calendarReconcile.ts
```

## Reports and summary

- **HTML report:** `reports/mutation/index.html` (browse source files with killed/survived annotations)
- **JSON report:** `reports/mutation/mutation.json`
- **Terminal summary:**

```bash
npm run mutation:summary
```

This prints each mutated file's mutation score (`(killed + timeout) / valid`) and up to 20 surviving mutants sorted by line, e.g.:

```text
src/lib/tokens.ts:142  ConditionalExpression "a < b" -> "a <= b"
```

## Reading a surviving mutant

Each survivor points to a condition, boundary, or branch that no test currently exercises or asserts:

1. **Missing test:** write a unit test that passes on the real code and fails when that mutation is applied.
2. **Equivalent mutant:** if the mutated code has identical observable behaviour for all valid inputs (for example, `trim()` on a string already matched by a trimmed regex), note why it is equivalent and leave the code alone.
