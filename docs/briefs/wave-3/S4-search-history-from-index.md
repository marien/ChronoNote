# Brief S4: search, Section History, occurrences and copy forward read the notes index

Run name `s4-search-index` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s4-search-index` · branch
`gemini/s4-search-index` · base `main` after S1 is merged · browser-test port: automatic · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design: `docs/design/notes-index-design.md`
(sections 4, 5, 8, item 3 on memory). S1 built `src/lib/notesIndex/`; read its four source files first. S2, S3 and S5
run beside you on other files: touch only the files named here, and nothing in `src/lib/notesIndex/`.

## Why

Search over all files, Section History, the occurrence strip and Alt+Left / Alt+Right between occurrences, and
"copy to the next occurrence" each take `allNotesCache` (and some lay the open tabs over it again) and split every
note into lines again. After this brief they read their notes from `notesIndex` and their lines from `linesOf`,
remembered per note text. Results, their order and every id stay the same.

## What exists now

- `src/lib/search.ts:325-341` (all files): `get(allNotesCache)`, `openTabIdByFilename` from the tabs, filenames by
  `sortFilenamesByRecency`, `allSources[filename].split("\n")`, each matching line pushed with
  `tabId: openTabIdByFilename.get(filename)`. `SearchModal.svelte:68` calls `refreshAllNotesCache()` before.
- `src/lib/history.ts:37-48` `buildOccurrences(targetHeader)`: `refreshAllNotesCache()`, keys of `allNotesCache`
  sorted, `extractSectionBody(text.split("\n"), targetHeader)`.
  `history.ts:243` `findNextSectionOccurrenceOnDisk(allSources: Record<string, string>, ...)` (pure; keep its
  signature).
- `src/lib/occurrences.ts`: `sources()` (line 37) copies `allNotesCache` and lays the non-scratchpad tabs over it
  (the same rule the index has); `occurrenceFiles` (line 50) calls `refreshAllNotesCache()` then
  `filesWithSection(sources(), target)`; `stepToOccurrence` (line 79) reads one note's lines from the open tab or
  `allNotesCache`; `occurrenceKeyApplies` (line 94) treats an empty `allNotesCache` as "not loaded yet".
- `src/lib/copyForward.ts:90-91`: `refreshAllNotesCache()` then
  `findNextSectionOccurrenceOnDisk(get(allNotesCache), targetHeader, anchorFilename)`.

From S1: `notesIndex` (`entries`, `loaded`), `noteTexts(index)` (`key → text` of the non-scratchpad entries, equal to
`allNotesCache` right after a refresh), `linesOf(e)`, `seedDiskNotesForTest`.

**Keep every `refreshAllNotesCache()` call where it is** (it starts the disk read and keeps `allNotesCache` fresh for
views not moved yet; S6 replaces the calls). After it, read from `get(notesIndex)`.

## What to build

1. `search.ts`: the all-files branch walks the non-scratchpad entries (keys by `sortFilenamesByRecency`), lines from
   `linesOf(e)`, `tabId` from the entry (`e.source === "tab" ? e.tabId : undefined`).
2. `history.ts`: `buildOccurrences` reads the non-scratchpad entries (keys sorted as now), lines from `linesOf(e)`.
3. `occurrences.ts`: `sources()` becomes `noteTexts(get(notesIndex))` (the overlay loop goes: the index already has
   it). `stepToOccurrence` takes the note's lines from its entry (`linesOf`), or `[""]` when there is none, as now.
   `occurrenceKeyApplies`: "not loaded yet" is `!get(notesIndex).loaded`.
4. `copyForward.ts`: pass `noteTexts(get(notesIndex))` to `findNextSectionOccurrenceOnDisk`.
5. Unit-test setup only, where a test of these files sets `allNotesCache` (`src/lib/search.test.ts`;
   `src/lib/controller.test.ts` only for cases on search, history, occurrences or copy forward): replace with
   `seedDiskNotesForTest`. No assertion or title changes.

## Memory (design 8.3)

`linesOf` now holds the lines of every note searched. Measure the JS heap on the perf scenario twice: first, before
you change any source file, and again when your change is done:

1. Temporarily add one test to `tests/e2e/perf.spec.ts` (the perf project only runs that file) that does what its
   search test does (search all files), waits for the results, then reads
   `await page.evaluate(() => (performance as any).memory.usedJSHeapSize)`.
2. Run it three times: `PERF=1 npx playwright test tests/e2e/perf.spec.ts --project=perf --workers=1 -g "<its title>"`.
3. Remove the test again before you commit (`git diff main -- tests/e2e/perf.spec.ts` must be empty).

Report the median of each set of three in MB. More than 25 MB extra: report it and stop there; the reviewer decides
on the design's fallback.

## Out of scope

`dueOverview.ts` (S2), the Actions view, week review and palette (S3), date picker, phone, export, Peek (S5).
`extractSectionBody`, `findNextSectionOccurrenceOnDisk`'s logic, the search matching itself.

## Tests to add

- `src/lib/search.index.test.ts`: three disk notes and an open tab on one of them; all-files results built the new
  way deep-equal those of the old code inlined in the test as the reference (same order, same `tabId`s); a
  scratchpad tab's text is not searched (as now).
- `src/lib/occurrences.index.test.ts`: `occurrenceFiles("Standup")` over disk notes with an open tab that has just
  added a "Standup" section: the tab's note is included (overlay through the index); `occurrenceKeyApplies` is true
  before the first load.

Browser specs to run: `tests/e2e/search-and-history.spec.ts`, `tests/e2e/history-pane.spec.ts`,
`tests/e2e/history-groups.independent.spec.ts`, `tests/e2e/occurrence-nav.spec.ts`,
`tests/e2e/copy-to-next-occurrence.spec.ts`.

## Done when

- [ ] `grep -n "allNotesCache" src/lib/search.ts src/lib/history.ts src/lib/occurrences.ts src/lib/copyForward.ts`
      finds nothing.
- [ ] Every `refreshAllNotesCache()` call that was in these files is still there.
- [ ] Existing tests changed only in setup lines; `npm run test:guard` reports no removed test.
- [ ] `npm run verify`, `npm run build` and the browser specs above pass.

## Report

The standard report from RULES.md, plus: the two heap medians (before, after) in MB and how you measured them.
