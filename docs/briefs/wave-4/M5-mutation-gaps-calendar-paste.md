# Brief M5: tests for the calendar sync and paste-over-marker gaps

Run name `m5-mutation-calendar` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\m5-mutation-calendar` · branch
`gemini/m5-mutation-calendar` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

The 2026-11-18 mutation run (`docs/design/mutation-gaps-2026-11-18.md`) scored `src/lib/calendarReconcile.ts` at
78.8 % (83 survived, 11 untested: title matching edges such as `trim` and case, the `[CANCELED]` regex anchor, ad-hoc
call times) and `src/lib/editor/pasteOverEmptyMarker.ts` at 75.0 % (26 survived, 8 untested: multi-line paste
branches). Calendar sync rewrites the user's notes, so its untested rules matter. Since the run, §509 added
`mergeIntoExistingSection` (a cancelled meeting moved to a day that already has it joins that section).

## What exists now

- `src/lib/calendarReconcile.ts`: `computeCalendarSync`, `computeAutoSync`, `flagRemovedSection`,
  `appendRemovedSectionTo`, `isAdhocSection`, `meetingMatchKey`. Tests: `src/lib/calendarReconcile*.test.ts`.
- `src/lib/editor/pasteOverEmptyMarker.ts`: `rewritePasted`, `mergePasteOverEmptyMarker`. Tests beside it.
- The behaviour: `docs/spec.md` §3.4 (calendar) and the paste bullets in §2.
- Mutation tools (local): `npm run mutation:one -- <file>`, then `npm run mutation:summary`. 10-25 min per file.

## What to build

1. Run the mutation command for both files first and keep both summaries.
2. Add tests that kill survivors where the survivor is a real rule, in the existing test files or in
   `src/lib/calendarReconcile.mutation.test.ts` / `src/lib/editor/pasteOverEmptyMarker.mutation.test.ts`. Each test
   names the rule. At least:
   - Title matching: surrounding spaces, case, a title that only starts like another; `[CANCELED]` only as the
     prefix it is meant to be (not in the middle of a title); a cancelled section is never the merge target.
   - Ad-hoc calls: placed by their time, at the edges (same minute, before the first, after the last).
   - `mergeIntoExistingSection`: blank lines at the edges of the moved body, a target section with and without text,
     a target that is the last section of the file.
   - Paste over an empty marker: one line vs. several, a pasted text that starts with its own marker, trailing
     newline.
3. Run both mutation commands again; report before and after.

## When a survivor cannot be killed

Equivalent survivors: list them with one line each on why; no forced tests. If a test shows the app is **wrong**, do
not fix the app: leave the test out and report the input, what you expected, what happened and the line.

## Out of scope

Any file under `src/` that is not a test file. `docs/spec/*` (other runs are writing there).

## Done when

- [ ] New tests pass; no existing test changed except to add cases.
- [ ] Scores before and after for both files in the report.
- [ ] `git diff --stat` shows only test files.
- [ ] `npm run type-escapes` passes; `npm run verify` passes.

## Report

The standard report from RULES.md, plus: the before/after scores, the equivalent survivors with reasons, and any app
bug found (or "none").
