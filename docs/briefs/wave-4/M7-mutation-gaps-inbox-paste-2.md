# Brief M7: the remaining phone inbox and paste gaps

Run name `m7-mutation-inbox-paste` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m7-mutation-inbox-paste` ·
branch `gemini/m7-mutation-inbox-paste` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

After M1-M6 every module in the mutation set is at 85 % or more except two: `src/lib/phoneInbox.ts` at 72.0 % and
`src/lib/paste.ts` at 83.4 % (M1, §516, covered the ledger reader, `phoneConflictNote` and link paste). The phone
inbox applies what was typed on the phone to the notes, so its rules are about data safety.

## What exists now

- `src/lib/phoneInbox.ts`; tests `src/lib/phoneInbox.test.ts`, `src/lib/phoneInbox.mutation.test.ts` (M1),
  `src/lib/phoneInboxApply*.test.ts`. `src/lib/paste.ts`; tests `src/lib/paste*.test.ts`.
- Mutation tools (local): `npm run mutation:one -- <file>`, then `npm run mutation:summary`. 10-25 min per file.

## What to build

1. Run the mutation command for both files and keep both summaries.
2. Add tests that kill survivors where the survivor is a real rule, in the existing test files (the `.mutation.test.ts`
   ones from M1 are fine to extend). Each test names the rule. Start with what decides whether an inbox item is
   applied, skipped or kept for later, and anything that could write to the wrong note or lose an item.
3. **Commit**, then run both mutation commands again and report before and after.

## When a survivor cannot be killed

Equivalent survivors: list them grouped, one line each on why; no forced tests. If a test shows the app is **wrong**,
do not fix the app: leave the test out and report the input, what you expected, what happened and the line.

## Out of scope

Any file under `src/` that is not a test file. `docs/spec/*`, `stryker.config.mjs` (another run changes it).

## Done when

- [ ] New tests pass; no existing test changed except to add cases.
- [ ] Scores before and after for both files in the report.
- [ ] `git diff --stat` shows only test files.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after scores, the equivalent survivors with reasons, and any app
bug found (or "none").
