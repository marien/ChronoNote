# Brief S6: remove the old map of all notes

Run name `s6-remove-cache` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s6-remove-cache` · branch
`gemini/s6-remove-cache` · base `main` after S2, S3, S4 and S5 are all merged · browser-test port: automatic · model
Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design: `docs/design/notes-index-design.md`
(sections 5, 6 and 8). S1-S5 are merged: every view reads `notesIndex` (`src/lib/notesIndex/`).

## Why

`allNotesCache` and `refreshAllNotesCache()` only survive so that views not yet moved kept working during the
migration. All have moved. This brief removes both, so there is one way to get at the notes, and adds a check so
neither comes back. Nothing a user sees changes.

## What exists now

Find every remaining use first and list it in your plan:

```bash
git grep -n "allNotesCache\|refreshAllNotesCache" -- src tests
```

Expected: `stores.ts:430` (the store), `persistence.ts` (`refreshAllNotesCache`, `prefetchNotesForDates`,
`deleteNoteAndInvalidateCache`, `updateNotesInCache`), `directory.ts` (`allNotesCache.set({})` after
`clearDiskLayer()`), `controller.ts` (a re-export, if any), the `refreshAllNotesCache()` calls S3-S5 kept on purpose
(actions, command palette, week review, search modal, history, occurrences, copy forward, date picker, phone
companion, export, phone tab bar, boot, drift, export/import, trash, versions), and unit tests.
`ensureLoaded()` (S1, `notesIndex/index.ts`) is the replacement: it starts the disk read when needed and resolves when
it is done, which is the half of `refreshAllNotesCache()` that still matters.

## What to build

1. Every `await refreshAllNotesCache()` becomes `await ensureLoaded()`; every `void refreshAllNotesCache()` becomes
   `void ensureLoaded()`. Same places, same order relative to the code around them.
2. `persistence.ts`: delete `refreshAllNotesCache`. `prefetchNotesForDates` keeps reading and calling
   `addPrefetched`; it no longer writes a map, and its "skip what is known" test becomes "skip what the index already
   has an entry for, or an open tab has". `deleteNoteAndInvalidateCache` keeps `removeDiskNote` only.
   `updateNotesInCache`: today it calls `refreshAllNotesCache()` when the disk layer is loaded (that only rebuilt
   the old map: no longer needed) or when the old map was in use while the disk layer had been invalidated (that
   started a full read). Keep only the second: `if (!isDiskLoaded() && get(notesIndex).loaded) await ensureLoaded();`
   (`loaded` stays true once the disk layer has been read). The rest of the function stays.
3. `directory.ts`: drop `allNotesCache.set({})` (`clearDiskLayer()` already empties it for the index).
4. `stores.ts`: delete `allNotesCache` (and a re-export in `controller.ts`, if any).
5. Unit tests: every test that set `allNotesCache` uses `seedDiskNotesForTest`; every test that read it reads
   `noteTexts(get(notesIndex))`. In `src/lib/notesIndex/notesIndex.property.test.ts` check (c) compared the index
   with `allNotesCache`, which no longer exists: delete that check (and its test, if it is its own `it`). The PR body
   must then carry `Tests removed: S6 removes allNotesCache, which check (c) compared against`; the reviewer adds
   it, you name every removed title in the report.
6. A guard, `src/lib/notesIndex/noOldCache.test.ts`: reads every `.ts` and `.svelte` file under `src/` (Node `fs`,
   recursive) except itself and fails, naming the file, if one contains `allNotesCache` or `refreshAllNotesCache`.

## Out of scope

The index itself, any view's behaviour, making views live (design 8.4: asked of Marien after this merges).

## Tests to add

The guard of step 6. Make it fail once on purpose (add the word to a file, run it, remove it) and say so in the
report.

## Done when

- [ ] `git grep -n "allNotesCache\|refreshAllNotesCache" -- src tests` finds only the guard test.
- [ ] `npm run test:guard -- --allow "S6 removes allNotesCache"` passes, and without `--allow` it lists exactly the
      titles you name in the report (none other).
- [ ] `npm run verify` and `npm run build` pass.
- [ ] Browser specs: `npx playwright test tests/e2e/due-dates-overview.spec.ts tests/e2e/actions-pane.spec.ts
      tests/e2e/search-and-history.spec.ts tests/e2e/week-review.spec.ts tests/e2e/compact-date-picker.spec.ts
      tests/e2e/export.spec.ts tests/e2e/peek.spec.ts --workers=2 --reporter=line` pass.

## Report

The standard report from RULES.md, plus: every removed test title, and every place where `ensureLoaded()` replaced a
call (file:line).
