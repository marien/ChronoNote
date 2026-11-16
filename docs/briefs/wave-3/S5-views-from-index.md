# Brief S5: date picker, phone companion, export, phone tab bar and Peek read the notes index

Run name `s5-views-index` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s5-views-index` · branch
`gemini/s5-views-index` · base `main` after S1 is merged · browser-test port: automatic · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design: `docs/design/notes-index-design.md`
(sections 4, 5, 8, item 5 on the phone companion). S1 built `src/lib/notesIndex/`; read its four source files first.
S2, S3 and S4 run beside you on other files: touch only the files named here, and nothing in `src/lib/notesIndex/`.

## Why

The last readers of `allNotesCache`: the date picker's dots and heat map, the phone companion's index files, export,
the phone's previous/next-day arrows, Peek's today text and the diagnostics line. After this brief they read
`notesIndex`, and S6 can remove the old map. Nothing a user sees changes.

## What exists now

- `src/lib/components/modals/DatePickerModal.svelte:132-147` `notesHeatmap`: for each dated, non-blank note of
  `$allNotesCache`, `computeDayHeat(content)` (`src/lib/date.ts:308`). Line 168 calls `refreshAllNotesCache()`;
  line 95 `prefetchNotesForDates`.
- `src/lib/phoneCompanion.ts:299-308` `writeIfChanged`: `refreshAllNotesCache()`, then
  `notes = { ...allNotesCache }`, then the fresh disk window (`windowDisk`, read at focus) over it (null = deleted),
  then every non-scratchpad tab over that.
- `src/lib/exportNotes.ts:31-40` `getRangeNotes`: `refreshAllNotesCache()`, then the dated notes of `allNotesCache`
  in the range.
- `src/lib/components/mobile/MobileAppBar.svelte:37-41` `contentDates`: dated, non-blank notes of `$allNotesCache`.
  Line 26 calls `refreshAllNotesCache()`.
- `src/lib/components/PeekBar.svelte:115-119` `getTodayContent()`: today's open tab, else `allNotesCache[today]`.
- `src/lib/peek.ts:23`: imports `allNotesCache` and never uses it.
- `src/lib/appLog.ts:109`: `Object.keys(get(allNotesCache)).length` in the diagnostics text.

From S1: `notesIndex` (`entries`, `loaded`), `noteTexts(index)` (`key → text` of the non-scratchpad entries, equal to
`allNotesCache` right after a refresh), `seedDiskNotesForTest`. A `NoteEntry` has `dateISO` (`YYYY-MM-DD` for a
`YYYY-MM-DD.txt` note, else null).

**Keep every `refreshAllNotesCache()` and `prefetchNotesForDates` call where it is** (S6 replaces them).

## What to build

1. `src/lib/dayHeat.ts` (new): `dayHeatOf(e: NoteEntry): DayHeatState | null`, `computeDayHeat(e.text)` remembered in
   a `WeakMap<NoteEntry, ...>`. The index changes on every keystroke; without this the date picker would recompute
   every note's heat per keystroke while it is shown.
2. `DatePickerModal.svelte`: `notesHeatmap` walks `$notesIndex.entries`, entries with `dateISO` and non-blank text,
   heat from `dayHeatOf(e)`. Same three outputs.
3. `phoneCompanion.ts`: `notes = noteTexts(get(notesIndex))`, then the fresh window over it exactly as now, then the
   open non-scratchpad tabs over that, exactly as now (design 8.5: index, then the fresh window for names without an
   open tab; keep the tab loop even though the index already has the tabs, because the window must not win over a
   tab).
4. `exportNotes.ts`: the index's entries with `dateISO` in the range, `{ date: e.dateISO, text: e.text }`, after the
   same `refreshAllNotesCache()`. Keep the output order the code has now (check whether it sorts).
5. `MobileAppBar.svelte`: `contentDates` from `$notesIndex.entries` (entries with `dateISO` and non-blank text).
6. `PeekBar.svelte`: `getTodayContent()` reads `get(notesIndex).entries.get(todayFilename)?.text ?? ""` (the index
   already prefers the open tab).
7. `peek.ts`: remove the unused import. `appLog.ts`: the count is the number of non-scratchpad entries.
8. Unit-test setup only, where a test of these files sets `allNotesCache` (`src/lib/phoneCompanion.test.ts`,
   `src/lib/phoneCompanion.split.independent.test.ts`; `src/lib/controller.test.ts` only for cases on these
   files): replace with `seedDiskNotesForTest`. No assertion or title changes.

| Before | Action | After |
| :--- | :--- | :--- |
| `2026-11-05.txt` on disk `# a`, `2026-11-06.txt` `v b`, `2026-11-07.txt` blank | open the date picker | dot on 5 and 6, 5 "pending", 6 "done", nothing on 7 (as now) |
| the same, `2026-11-05.txt` open in a tab and typed into `v a` | keystroke | 5 becomes "done"; `computeDayHeat` ran once (for that note only) |
| phone window read at focus has `2026-11-06.txt` = `# fresh`, the index has `v b`, no tab | `writeIfChanged` | the notes passed on have `# fresh` for the 6th |
| the same with `2026-11-06.txt` open in a tab holding `# tab` | `writeIfChanged` | `# tab` |

## Out of scope

Every other reader (S2-S4). The phone companion's window read itself, `computeDayHeat`, export formats.

## Tests to add

- `src/lib/dayHeat.test.ts`: `dayHeatOf` equals `computeDayHeat` on the same text; asked twice for the same entry it
  computes once (spy); a new entry with other text computes again.
- `src/lib/phoneCompanion.index.test.ts`: the last two rows of the table.

Browser specs to run: `tests/e2e/compact-date-picker.spec.ts`, `tests/e2e/compact-date-picker.independent.spec.ts`,
`tests/e2e/mobile-date-picker.spec.ts`, `tests/e2e/export.spec.ts`, `tests/e2e/peek.spec.ts`,
`tests/e2e/phone-changes.spec.ts`, and any spec whose name starts with `date-picker` or `mobile` (`ls tests/e2e`).

## Done when

- [ ] `git grep -n "allNotesCache" -- src ':!*.test.ts'` finds it only in `stores.ts`, `persistence.ts`,
      `directory.ts`, `controller.ts` (a re-export, if there is one) and the files of S2-S4.
- [ ] Every `refreshAllNotesCache()` / `prefetchNotesForDates` call that was in these files is still there.
- [ ] Existing tests changed only in setup lines; `npm run test:guard` reports no removed test.
- [ ] `npm run verify`, `npm run build` and the browser specs above pass.

## Report

The standard report from RULES.md, plus: whether export sorted its output before, and how you kept it.
