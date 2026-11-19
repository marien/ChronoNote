# Brief T1e: calendar sync as tables that run

Run name `t1e-spec-calendar` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t1e-spec-calendar` · branch
`gemini/t1e-spec-calendar` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. No app code changes.

## Why

Steps 1-4 (§503, §506, §510, §518) turned the list, editing, clipboard and token rules into tables a test runs; the
clipboard tables found four real bugs. Calendar sync rewrites the user's notes and its rules changed twice this week
(§509 merge of a moved meeting, §520 `[canceled]` in any case), so its rules should be examples that run.

## What exists now

- `src/lib/calendarReconcile.ts` (pure): `computeCalendarSync(content, agendaTitles, removedTitles?, agendaStarts?)`,
  `computeAutoSync(content, agendaTitles, removedTitles, agendaStarts, alreadyAdded)`, `flagRemovedSection`,
  `appendRemovedSectionTo`, `isAdhocSection`. Read the result types (`CalendarSyncResult`, `AutoSyncResult`) first.
- Tests to take rows from (they pass today): `src/lib/calendarReconcile*.test.ts` (including the new
  `calendarReconcile.mutation.test.ts`).
- The prose: `docs/spec.md` §5 "Sync Calendar for This Day" (around line 875 to about 930), tenet 4 (line 28), and the
  `.agenda.json` rules it links to.
- The style: `docs/spec/lists.md`, `editing.md`, `clipboard.md`, `tokens.md` (intro with notation, `### X1. ...`
  rules, one statement, a table). The spec-table tests (`src/lib/editor/specTables.test.ts`,
  `src/lib/clipboardSpecTables.test.ts`, `src/lib/tokenSpecTables.test.ts`) each ignore table shapes they do not
  know; check that still holds for yours.

## What to build

1. `docs/spec/calendar.md`: rules `C1...` in the order of the prose. Pick table shapes that read well for a note in,
   an agenda in, a note out; for example `| Note | Agenda | Removed | After |` for `computeCalendarSync` (Note and
   After with `↵` for a line break, a short notation for setext titles if it helps; Agenda and Removed as
   comma-separated titles, with `@HH:MM` for a start time), and a separate shape for `computeAutoSync`
   (what is applied, what needs review, what is offered), and for "move to another day"
   (`flagRemovedSection` / `appendRemovedSectionTo`). Decide once, describe it in the intro, keep it stable.
   At least 50 rows. Cover: matching by title (time prefix, case, spaces), new meetings inserted in agenda order,
   reordering, a removed meeting with and without text, `[CANCELED]` (any case) and un-cancelling, ad-hoc calls with
   and without times and start times, the preamble, the auto-sync split (never loses text), and §509's merge.
   Sentences about the review dialog, the toggle and the file watcher stay prose with `Not run as a table: <why>`.
2. `src/lib/calendarSpecTables.test.ts` (new): runs every row, one Vitest test per row named `<rule id> row <n>`.
3. `docs/spec.md` §5: one line under the calendar bullet linking to the tables ("The sync rules, with examples that
   run as tests, are in [docs/spec/calendar.md](spec/calendar.md)."). Keep the prose.

## When a row fails

A row written from the prose that fails is a finding: do not change app code and do not bend the row. Leave it out and
report the input, the expected output, what the function gave, and the sentence.

## Out of scope

Any file under `src/` other than the new test. The other spec files, `stryker.config.mjs` (another run changes it).

## Done when

- [ ] `docs/spec/calendar.md` exists, at least 50 rows, every row passing; changing one expected value fails exactly
      that test (undo it).
- [ ] The existing spec rows still pass.
- [ ] `npm run type-escapes` passes; `git diff --stat` shows only `docs/spec.md`, `docs/spec/calendar.md`,
      `src/lib/calendarSpecTables.test.ts`.
- [ ] `npm run verify` passes. Commit before the final report.

## Report

The standard report from RULES.md, plus: the notation chosen, a sentence-to-rule mapping, the sentences left as prose
and why, and the rows that failed (or "none").
