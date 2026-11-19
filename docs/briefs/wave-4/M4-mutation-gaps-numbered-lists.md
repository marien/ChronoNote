# Brief M4: tests for the numbered-list key gaps

Run name `m4-mutation-numbered` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m4-mutation-numbered` · branch
`gemini/m4-mutation-numbered` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

The 2026-11-18 mutation run (`docs/design/mutation-gaps-2026-11-18.md`) scored `src/lib/editor/numberedListKeys.ts`
at 70.5 %: 394 faults survived (the largest number of any module) and 18 sit in code no test runs, despite the 163
numbered-list rows in `docs/spec/lists.md`. Many conditions in Enter, Tab, Shift+Tab and Backspace on numbered lists
can flip without a test failing. M1-M3 (§516, §517) did the same for other modules; M2's rows found four real bugs.

## What exists now

- `src/lib/editor/numberedListKeys.ts` and tests beside it; the list helpers in `src/lib/tokens.ts`
  (`parseNumberedItem`, `renumberAfterInsert`, `numberedListEnter`, ...).
- `docs/spec/lists.md`: rules with `| Before | Keys | After |` tables (the notation is in its intro), run by
  `src/lib/editor/specTables.test.ts`.
- Mutation tools (local): `npm run mutation:one -- src/lib/editor/numberedListKeys.ts`, then
  `npm run mutation:summary` for survivors per line. One file takes 15-40 min.

## What to build

1. Run the mutation command first and keep the summary.
2. Kill survivors that are real rules, preferring **new rows in `docs/spec/lists.md`** under the right rule (they
   document the rule too); a unit test in `src/lib/editor/numberedListKeys.mutation.test.ts` only for what a row
   cannot express. Start with the Enter and Backspace paths, then Tab/Shift+Tab, then renumbering of the items that
   follow. Each test or row states the rule, not the mutant.
3. Run the mutation command again; report before and after.

## When a survivor cannot be killed

Equivalent survivors (the change cannot alter behaviour): list them grouped, one line each on why; no forced tests. If
a row shows the app is **wrong**, do not fix the app and do not bend the row: leave it out and report the input, the
expected output, what the app gave, and the rule.

## Out of scope

Any file under `src/` that is not a test file; `docs/spec/lists.md` only gains rows (no rule text rewritten, except a
statement that must name a newly covered case). Other spec files. `docs/spec/tokens.md` (another run is writing it).

## Done when

- [ ] New rows and tests pass; every existing spec row still passes.
- [ ] Score before and after in the report; the Enter and Backspace survivors are killed or listed as equivalent.
- [ ] `git diff --stat` shows only test files and `docs/spec/lists.md`.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after score, the equivalent survivors with reasons, and any app
bug found (or "none").
