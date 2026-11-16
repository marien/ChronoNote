# Brief S1b: fixes from the review of S1

Run name `s1-fix` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s1-fix` · branch `gemini/s1-fix` · base
`gemini/s1-notes-index` (S1, not merged yet) · browser-test port: automatic · model Google-Sonnet 5.5
(`claude-sonnet-5-5-high`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)

Read `docs/briefs/RULES.md` and `docs/briefs/wave-3/S1-notes-index-core.md` in your worktree first; both apply. Your
branch already has S1 (`src/lib/notesIndex/`). A reviewer from another model family read S1 and found the six points
below; the decision on each is given. Fix them on top of S1, in one commit.

## 1. Tab objects changed in place (certain; must fix)

`renameScratchpad` (`src/lib/tabs.ts:351`, `target.filename = trimmed; tabs.set([...list])`) and `promoteScratchpad`
(`tabs.ts:416`, `todayTab.content = merged; tabs.set(remaining)`) change a `NoteTab` object and then set a new array
holding the same objects. `notesIndex` keeps `lastTabs = $tabs`, so the "previous" tab is the changed object itself and
`patchTabs` sees no change: after a rename the entry keeps the old `filename`; after a promotion today's entry keeps
the old text. (Also `exportImport.ts:174`, `openTab.content = newContent`.)

Fix in `notesIndex/index.ts`: keep a copy of each tab's four fields, `lastTabs = $tabs.map((t) => ({ ...t }))`. Do not
change `tabs.ts` or `exportImport.ts`.

## 2. Notifications without a change (certain; must fix)

`derived` with one argument calls `set(current)` even when it returns the same object, and Svelte notifies every
subscriber for an object value. Use the two-argument form, `derived([tabs, diskVersion], ([$tabs, $version], set) =>
{ ... }, current)`, and call `set` only when `entries` or `loaded` changed.

## 3. A full read overtaken by an invalidation or a folder switch (certain; must fix)

`ensureLoaded` starts `api.readAllNotes()`; if `invalidateDiskLayer()` or `clearDiskLayer()` runs before it resolves,
the old result still lands: `raw` is set (so the new folder is never read), `shown` gets the old folder's notes and
`loaded` turns true. The old code had the same hole for `raw`.

Fix in `diskLayer.ts`: a counter `epoch`, increased by `invalidateDiskLayer()`, `clearDiskLayer()` and
`readAllIntoDiskLayer()`. A read captures `epoch` when it starts; when it resolves and `epoch` has changed since, it
does not call `readAllIntoDiskLayer`. `ensureLoaded` loops: while `raw === null`, join the read in flight or start one
(a read started under an older `epoch` is not joined: start a new one), and await it. A read's `finally` clears
`diskReadInFlight` only if it is still that read. A failed read rejects as now.

## 4. A prefetch overtaken by a folder switch or a full read (certain; fix for the index only)

`prefetchNotesForDates` captures `epoch` before its reads (export a getter `diskEpoch()`), and calls `addPrefetched`
only when `epoch` is unchanged when they resolve. Its `allNotesCache.update` stays exactly as it is (S1 keeps that
map's behaviour; S6 removes it).

## 5. Tabs that share a filename and change order (possible; fix cheaply)

`patchTabs` looks at each tab by id, so two non-scratchpad tabs on one filename that swap places change which text
wins in `rebuildEntries` (the last one) but not in `patchTabs`. Fix: when the sequence of tab ids differs between
`prevTabs` and `tabs` (not only the set), add every tab's key (old and new) to `affected`. Typing does not change the
order, so the fast path stays fast.

## 6. Property test gaps (must fix)

In `notesIndex.property.test.ts`:
- check (a) also compares `filename` and `dateISO` (`null` for scratchpads and undated notes);
- add events that change tab objects in place the way `tabs.ts` does: a scratchpad rename (`renameScratchpad`) and a
  promotion of a scratchpad into today's note while today's note is open (`promoteScratchpad`); call the real
  functions (mock what they need, as `syncNotesCache.test.ts` mocks the API) or, if that pulls in too much, a helper
  in the test that does exactly what those two lines do (mutate, then `tabs.set` a new array with the same objects);
- a multi-file sync event (`updateNotesInCache([f1, f2])`);
- an event that swaps the order of two tabs;
- the "no subscriber" check: after `unsubscribe()`, make one more `tabs` change and one disk change, then
  `get(notesIndex)` must equal a fresh `rebuildEntries(new Map(), shownNotes(), get(tabs))` entry by entry (all fields)
  and have the right `loaded`;
- two race tests in `diskLayer.test.ts` with a deferred `readAllNotes` (a promise you resolve by hand): (i) start
  `ensureLoaded`, call `clearDiskLayer()`, resolve the first read with folder A's notes: `shown` stays empty,
  `ensureLoaded` starts a second read, and after resolving it with folder B's notes `shown` is folder B's;
  (ii) the same with `invalidateDiskLayer()` in place of the switch;
- one prefetch race test: a prefetch whose `readNote` resolves after `clearDiskLayer()` adds nothing to `shown`.

First write the race and in-place tests and run them against S1's code: they must fail (say which, in the report).
Then fix, and they pass.

## Done when

- [ ] All six points are fixed as decided, in `notesIndex/index.ts`, `notesIndex/entries.ts`,
      `notesIndex/diskLayer.ts` and `persistence.ts` (`prefetchNotesForDates` only), plus the tests.
- [ ] `tabs.ts`, `exportImport.ts` and every reader of `allNotesCache` are unchanged (`git diff gemini/s1-notes-index
      --stat`).
- [ ] The property test passes ten times in a row (the loop from the S1 brief); `npm run test:guard`,
      `npm run verify`, `npm run build` pass; the browser specs of the S1 brief pass.

## Report

The standard report from RULES.md, plus: which new tests failed on S1's code before the fix.
