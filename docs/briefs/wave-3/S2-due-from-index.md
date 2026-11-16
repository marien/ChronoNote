# Brief S2: the due item reads the notes index

Run name `s2-due-index` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s2-due-index` · branch
`gemini/s2-due-index` · base `main` after S1 is merged · browser-test port: automatic · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design: `docs/design/notes-index-design.md`
(sections 4, 5 and 8, "Allowed differences"). S1 built `src/lib/notesIndex/`; read its four source files first.

## Why

The status bar's due item (`N overdue · N upcoming`) and the due view are built by two stores in
`src/lib/dueOverview.ts`. Each lays the open tabs over `allNotesCache` itself and keeps its own memo keyed by file
name. The notes index now owns both of those jobs. After this brief the two stores read `notesIndex` and remember
their results per index entry, and the copied overlay code and both key-based memos are gone. Every number and item
stays the same.

## What exists now

`src/lib/dueOverview.ts`:
- `overdueCountMemo` (line 9) and `dueSummaryMemo` (line 50): `Map<key, { text, today, ... }>`; `_resetMemoForTest()`
  (line 63) clears both.
- `dueSummary` (line 71): `derived([allNotesCache, tabs, currentDateISO], ...)`. Steps 1-2 (lines 82-98) build
  `activeTexts` from `allNotesCache` plus every tab (scratchpads keyed `scratchpad:<tab.id>`, with `filename` the
  tab's filename). Then for each text it reuses the memo or runs the body at lines 119-170 (one pass over
  `tokens.dueItems(text)`, building `DueSoonItem`s), and finally sorts with `compareDueSoonItems`.
- `overdueCount` (line 190): the same overlay, then `tokens.countOverdue(text, $currentDateISO)` per text.

From S1: `notesIndex` (`entries` by key, each `NoteEntry` with `key`, `filename`, `text`; scratchpads keyed
`scratchpad:<tabId>` with `filename` the tab's filename, exactly the keys and filenames used above), `dueOf(e)` (=
`tokens.dueItems(e.text)`, remembered per entry), `linesOf(e)`, and `seedDiskNotesForTest`.

## What to build

1. `src/lib/dueOverview.ts`:
   - `overdueCount = derived([notesIndex, currentDateISO], ...)`: the sum over `entries` of a per-entry count,
     remembered in a `WeakMap<NoteEntry, { today: string; count: number }>` and recomputed only when `today` differs.
     The count is `tokens.countOverdue(e.text, today)`, exactly as now.
   - `dueSummary = derived([notesIndex, currentDateISO], ...)`: the same, with a
     `WeakMap<NoteEntry, { today; overdue; upcoming; dueToday; items }>`. Move the body of lines 119-170 into a
     function `summarizeEntry(e, today)` that uses `dueOf(e)` in place of `tokens.dueItems(text)` and `linesOf(e)` in
     place of `text.split("\n")`; `filename` in each item is `e.filename`. The sort stays.
   - Remove `overdueCountMemo`, `dueSummaryMemo`, both overlay loops, and the `allNotesCache` / `tabs` imports.
     `_resetMemoForTest` stays as an empty function only if a test still calls it (a `WeakMap` needs no clearing);
     otherwise remove it and its calls.
   - Iteration order: walk `entries` in the map's order. The final sort makes the item order independent of it;
     the counts are sums.
2. Unit-test setup only: in `src/lib/dueOverview.test.ts`, `src/lib/dueOverview.independent.test.ts` and
   `src/lib/editor/dueDates.test.ts`, replace each `allNotesCache.set(x)` with `seedDiskNotesForTest(x)`. Do not
   change any assertion or test title. If a test cannot pass after only that change, stop and report it.

| Before | Action | After |
| :--- | :--- | :--- |
| `2026-11-05.txt` on disk: `# send draft by:2026-11-06`; today `2026-11-08` | (none) | `overdueCount` 1, `dueSummary.overdue` 1 |
| the same note open in a tab, typed into `v send draft by:2026-11-06` | keystroke | both 0; every other note's per-entry result is reused (no recount) |
| a scratchpad tab with `# x by:2026-11-07` | (none) | counted, item `filename` is the scratchpad's display name |
| `2026-11-05.txt` open, `# a by:2026-11-06` typed, then the tab closed without a refresh | close | still 1 overdue, from the text the tab closed with (the allowed difference: today it counts the text of the last refresh) |

## Out of scope

Every other reader of `allNotesCache` (S3-S5). The due view's UI. `countOverdue`, `dueItems` and the tokenizer.

## Tests to add

`src/lib/dueOverview.index.test.ts`:
- the four rows above, the closed-tab row with its name saying "allowed difference (design 8)";
- reuse: with three disk notes and one tab, type in the tab twice; the other entries' summaries are not recomputed
  (spy on `tokens.countOverdue` or count `summarizeEntry` calls through an exported test counter: one call per
  keystroke);
- a day change (`currentDateISO` set to the next day) recomputes every entry once.

Browser specs to run: `tests/e2e/due-dates-overview.spec.ts`, `tests/e2e/due-dates-overview.independent.spec.ts`,
`tests/e2e/due-flag.spec.ts`, `tests/e2e/due-upcoming.independent.spec.ts`, `tests/e2e/due-dates-editor.spec.ts`.

## Done when

- [ ] `grep -n "allNotesCache\|overdueCountMemo\|dueSummaryMemo" src/lib/dueOverview.ts` finds nothing.
- [ ] The three existing test files changed only in setup lines (`git diff main -- <file>` shows only
      `allNotesCache.set` → `seedDiskNotesForTest` and import lines).
- [ ] `npm run test:guard` reports no removed test.
- [ ] `npm run verify`, `npm run build` and the browser specs above pass.

## Report

The standard report from RULES.md, plus: whether any existing test needed more than a setup change. The perf project
is the reviewer's to run, not yours.
