# Brief S3: the Actions view, the week review and the palette read the notes index

Run name `s3-actions-index` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s3-actions-index` · branch
`gemini/s3-actions-index` · base `main` after S1 is merged · browser-test port: automatic · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design: `docs/design/notes-index-design.md`
(sections 4, 5, 8). S1 built `src/lib/notesIndex/`; read its four source files first. S2, S4 and S5 run beside you
on other files: touch only the files named here.

## Why

The Actions view on "Other notes" / "All", the week review and the command palette's `!` (open actions) and `@`
(dates) each take `allNotesCache` and split and parse every note again. After this brief they read their notes from
`notesIndex` and their action trees from `actionsOf`, which is computed once per note text and shared. Nothing a
user sees changes; the ids of the Actions view's items stay byte-identical.

## What exists now

- `src/lib/actions.ts:37` `snapshotItemsForNote(base, tabId, filename, lines: string[])`: line 43
  `const nodes = flattenActionTree(actionTree(lines));`, then items with ids `${base}-${lineIdx}` (or `-s<step>`).
- `src/lib/actions.ts:81` `buildActionSnapshotAllFiles()`:

  ```ts
  await refreshAllNotesCache();
  const allSources = get(allNotesCache);
  const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
  const snapshot: ActionSnapshotItem[] = [];
  for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
    snapshot.push(
      ...snapshotItemsForNote(filename, openTabIdByFilename.get(filename), filename, allSources[filename].split("\n")),
    );
  }
  return snapshot;
  ```

- `src/lib/components/modals/WeekReviewModal.svelte:134-150`, `noteList`: every `allNotesCache` note with an open
  tab's text over it, then every tab (scratchpads too) whose filename is not in the cache; passed to
  `buildWeekReview(noteList, year, week, today)` (`src/lib/weekReview.ts:357`). `openWeekReview` (`weekReview.ts:488`)
  and the modal's mount (`WeekReviewModal.svelte:64`) call `refreshAllNotesCache()`.
- `src/lib/commandPalette.ts:625-645` (`!`): `refreshAllNotesCache()`, then for each filename of `allNotesCache` by
  recency, `openActionLineIndices(text)` and the lines. `:666-680` (`@`): the dated filenames of `allNotesCache`.

From S1: `notesIndex`, `ensureLoaded`, `linesOf(e)`, `actionsOf(e)` (`{ roots, flat }`, where `flat` is
`flattenActionTree(actionTree(linesOf(e)))`), `seedDiskNotesForTest`. Scratchpad entries have keys
`scratchpad:<tabId>`; a note's key is its filename.

**Keep every `refreshAllNotesCache()` call where it is.** It starts the disk read and keeps `allNotesCache` fresh for
views that have not moved yet (design 8.1); S6 replaces the calls. After it, read the notes from
`get(notesIndex).entries`.

## What to build

1. `actions.ts`: `snapshotItemsForNote` takes `lines: readonly string[]` and `nodes: readonly ActionNode[]` (the
   caller passes them) instead of computing the tree. `buildActionSnapshotOpenTabs` passes
   `tab.content.split("\n")` and `flattenActionTree(actionTree(...))` as now (open tabs are not read from the index
   in this slice). `buildActionSnapshotAllFiles` walks the index's non-scratchpad entries: keys sorted with
   `sortFilenamesByRecency`, `tabId` from the entry (`e.source === "tab" ? e.tabId : undefined`, which must equal
   `openTabIdByFilename.get(filename)`), lines `linesOf(e)`, nodes `actionsOf(e).flat`.
2. `WeekReviewModal.svelte`: `noteList` becomes every index entry as `{ filename: e.filename, content: e.text }`, with
   `$notesIndex` in place of `$allNotesCache` and `$tabs`. If `buildWeekReview` depends on the order of `notes`, keep
   the old order (disk notes in key order, then tabs) and say so in the report.
3. `commandPalette.ts`: `!` and `@` read the index's non-scratchpad entries (keys by recency, `e.text`,
   `linesOf(e)`), after the same `refreshAllNotesCache()`.
4. Unit-test setup only, where a test of these readers sets `allNotesCache`: replace with `seedDiskNotesForTest`
   (`src/lib/commandPalette.test.ts`; `src/lib/controller.test.ts` only for cases that test the Actions view or the
   palette). No assertion or title changes.

## Out of scope

`dueOverview.ts` (S2), search/history/occurrences/copy forward (S4), date picker, phone, export, Peek (S5). Making the
Actions view live (it stays a snapshot taken when it opens; design 8.4). `actionTree` itself.

## Tests to add

- `src/lib/actions.index.test.ts`: three disk notes and one open tab on one of them; the "All" snapshot built the new
  way equals, item by item with `toEqual` (ids included), a snapshot built by the old code inlined in the test (copy
  the old `buildActionSnapshotAllFiles` body into the test as the reference); the "Other notes" snapshot leaves out
  the open one. Then type in the tab and build again: `actionsOf` ran only for the typed note (`_facetRuns`).
- `src/lib/weekReview.index.test.ts`: a week with two notes and a scratchpad tab; `buildWeekReview` on the new
  `noteList` deep-equals it on the old construction (inline the old `noteList` code as the reference).

Browser specs to run: `tests/e2e/actions-pane.spec.ts`, `tests/e2e/actions-header.spec.ts`,
`tests/e2e/week-review.spec.ts`, `tests/e2e/week-review.independent.spec.ts`, `tests/e2e/command-palette.spec.ts`,
`tests/e2e/action-drawer-sticky-date.spec.ts`, `tests/e2e/list-copy.spec.ts`.

## Done when

- [ ] `grep -n "allNotesCache" src/lib/actions.ts src/lib/commandPalette.ts src/lib/components/modals/WeekReviewModal.svelte`
      finds nothing.
- [ ] Every `refreshAllNotesCache()` call that was in these files is still there.
- [ ] Existing tests changed only in setup lines; `npm run test:guard` reports no removed test.
- [ ] `npm run verify`, `npm run build` and the browser specs above pass.

## Report

The standard report from RULES.md, plus: whether `buildWeekReview` depends on the order of its input.
