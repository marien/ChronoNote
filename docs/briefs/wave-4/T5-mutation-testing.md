# Brief T5: do the tests notice a broken rule?

Run name `t5-mutation` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t5-mutation` · branch `gemini/t5-mutation` ·
base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No app code changes.

## Why

Vitest has about 3,950 tests; they say how much code runs, not how much is checked. A mutation tester changes the code
one small fault at a time (`<` to `<=`, `&&` to `||`, a statement removed) and runs the tests: a fault no test catches
is a rule nobody checks. Once a month, locally, Marien gets a short report of those gaps. Marien approved StrykerJS as
a dev dependency on 2026-11-18. It never runs in CI or in `npm run verify`.

## What exists now

- Vitest 5 (`package.json` devDependencies `"vitest": "^5.1.0"`), config in `vite.config.ts` / `vitest` section.
- The core modules to mutate (only these):
  - tokenizer: `src/lib/tokens.ts`
  - lists: `src/lib/editor/numberedListKeys.ts`
  - paste: `src/lib/paste.ts`, `src/lib/editor/clipboardPaste.ts`, `src/lib/editor/pasteOverEmptyMarker.ts`,
    `src/lib/richClipboard.ts`
  - phone inbox: `src/lib/phoneInbox.ts`, `src/lib/phoneInboxApply.ts`
  - calendar matching: `src/lib/calendarReconcile.ts`
- Existing script style: `scripts/*.mjs`, run through `npm run <name>`.

## What to build

1. Dev dependencies `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, the newest versions that are at least
   two weeks old, exact versions in `package.json` (`npm install -D --save-exact`). First check that the runner
   supports Vitest 5 (its peerDependencies). If it does not, stop: change nothing and report the versions you found.
2. `stryker.config.mjs` at the repo root: `testRunner: "vitest"`, `mutate` = exactly the nine files above,
   `reporters: ["html", "clear-text", "progress", "json"]`, HTML report to `reports/mutation/index.html`, JSON to
   `reports/mutation/mutation.json`, `coverageAnalysis: "perTest"`, `concurrency: 2` (the machine is often short of
   RAM), `timeoutMS` 20000, `incremental: true` with the incremental file under `reports/mutation/`. Vitest's
   `related` filtering may be used when the runner offers it.
3. `reports/` added to `.gitignore` (check it is not ignored already).
4. `package.json` script `"mutation": "stryker run"` and `"mutation:one": "stryker run --mutate"` (so
   `npm run mutation:one -- src/lib/tokens.ts` runs one file).
5. `scripts/mutation-summary.mjs` (`npm run mutation:summary`): reads `reports/mutation/mutation.json` and prints, per
   file, the mutation score and the surviving mutants grouped by line: `src/lib/tokens.ts:142  ConditionalExpression
   "a < b" -> "a <= b"`, at most 20 per file, sorted by line. Pure parse function exported and unit-tested.
6. `docs/testing-mutation.md`, half a page: what it is, how to run (`npm run mutation`, about how long; `mutation:one`
   for one file), where the report is, how to read a surviving mutant (write a test that fails on it, or note why it is
   equivalent), and that it is local only.
7. Run it once on `src/lib/calendarReconcile.ts` only (`mutation:one`) and put the score and the surviving mutants of
   that file in your report. Do not run all nine files (Claude runs the full set afterwards).

## Out of scope

Any change under `src/` except the new summary test. No CI workflow change, no change to `scripts/verify.mjs`. No new
tests that kill mutants (that is the follow-up work the report produces).

## Tests to add

`src/lib/mutationSummary.test.ts` for the parse function: a small hand-written mutation.json (two files, one killed,
two survived, one timeout, one no-coverage) gives the expected score per file (killed + timeout over all valid,
Stryker's definition) and the survivors sorted by line. Types via `scripts/mutation-summary.d.mts`, as
`scripts/seen-check.d.mts` does.

## Done when

- [ ] Exact-version dev dependencies; `package-lock.json` updated by npm, not by hand.
- [ ] `npm run mutation:one -- src/lib/calendarReconcile.ts` finishes and writes `reports/mutation/index.html`.
- [ ] `npm run mutation:summary` prints the summary for that run.
- [ ] `reports/` is ignored; `git status` after a run shows no report files.
- [ ] `npm audit` has no new high or critical advisories (`node scripts/npm-audit.mjs` passes).
- [ ] No `any`, `@ts-ignore` or `@ts-expect-error` added (`npm run type-escapes` passes).
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the versions installed, the time the one-file run took, its score and its
surviving mutants.
