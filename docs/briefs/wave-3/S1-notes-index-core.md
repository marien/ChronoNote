# Brief S1: one index of all notes, the core (no reader changes)

Run name `s1-notes-index` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\s1-notes-index` · branch
`gemini/s1-notes-index` · base `main` · browser-test port: automatic (each checkout derives its own) · model
Google-Sonnet 5.5 (`claude-sonnet-5-5-high`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. The design is
`docs/design/notes-index-design.md`: read sections 4, 5, 7 and 8 fully before you start. Where this brief and the
design differ, this brief wins.

## Why

A dozen views each take the map of all note texts (`allNotesCache`) and read it again by their own rules: which text
is current (open tab or file), whether scratchpads count, what a section is. This brief builds the one module that
decides that, and remembers what it derived per note text. No view uses it yet: S2-S5 move them over one at a time.
When this is done, the index exists, is proven equal to today's rule after every event, and nothing a user sees has
changed.

## What exists now

`src/lib/persistence.ts` holds the disk layer and fills `allNotesCache` (`src/lib/stores.ts:430`,
`writable<Record<string, string>>`):

- line 227: `let diskNotesCacheRaw: Record<string, string> | null = null;` (null = must be read again).
- line 239 `invalidateDiskNotesCache()`: sets it to null.
- line 247 `updateNotesInCache(filenames)`: re-reads the named files into it (null content = deleted), then calls
  `refreshAllNotesCache()` when the cache is in use, then bumps `notesChangedBySync`.
- line 270 `registerSyncHooks({ flushPendingSaves, invalidateCache: invalidateDiskNotesCache, notesChanged:
  updateNotesInCache })`: the web app's OneDrive sync uses these two hooks.
- line 276 `refreshAllNotesCache()`:

  ```ts
  export async function refreshAllNotesCache() {
    if (diskNotesCacheRaw === null) {
      if (!diskReadInFlight) {
        diskReadInFlight = (async () => {
          const entries = await api.readAllNotes();
          diskNotesCacheRaw = {};
          for (const [fn, content] of entries) diskNotesCacheRaw[fn] = content;
        })().finally(() => {
          diskReadInFlight = null;
        });
      }
      await diskReadInFlight;
    }
    const map: Record<string, string> = { ...diskNotesCacheRaw };
    for (const t of get(tabs)) if (!t.isScratchpad) map[t.filename] = t.content;
    allNotesCache.set(map);
  }
  ```

- `prefetchNotesForDates(filenames)` (just below): reads single notes and merges them, plus every open tab's text,
  into `allNotesCache` directly. It does NOT write `diskNotesCacheRaw`.
- `writeNoteAndInvalidateCache` (around line 343): sets `diskNotesCacheRaw = null` when the file has no open tab.
- `deleteNoteAndInvalidateCache` (around line 384): on success deletes the file from `diskNotesCacheRaw` and from
  `allNotesCache`; on a conflict sets `diskNotesCacheRaw = null`.
- `noteClosingWithContent(filename, content)` (line 424): `if (diskNotesCacheRaw !== null) diskNotesCacheRaw[filename]
  = content;` (called by `tabs.ts:222` when a tab closes).
- `src/lib/directory.ts:133-134`, in `performDirectorySwitch`: `invalidateDiskNotesCache(); allNotesCache.set({});`.

`tabs` is `writable<NoteTab[]>` (`stores.ts:63`); `NoteTab` is `{ id, filename, isScratchpad, content }`
(`types.ts:37`). It is set on every keystroke (`updateActiveTabContent`, `persistence.ts:516`).

Code to reuse for the facets (call it, do not copy it):

| Facet | Reuse |
| :--- | :--- |
| `linesOf(e)` | `e.text.split("\n")` |
| `sectionsOf(e)` | `listSections(text)` in `src/lib/tokens.ts:910` (title, title line, open count); `normalizeHeaderTitle` (`tokens.ts:878`) for the normalised title |
| `actionsOf(e)` | `actionTree(lines)` (`src/lib/actionGroups.ts:42`) and `flattenActionTree(roots)` (`:191`) |
| `dueOf(e)` | `dueItems(text)` (`tokens.ts:957`) |

The test pattern for `persistence.ts` with a fake disk: `src/lib/syncNotesCache.test.ts` (a `vi.hoisted` map as the
disk, `vi.mock("./tauriApi", ...)`). Property tests use `fast-check` (already a dev dependency); see
`src/lib/numberedLists.property.test.ts` for the style and its `{ timeout: 30_000 }`.

## What to build

1. **`src/lib/notesIndex/diskLayer.ts`.** Move the disk layer here. It keeps two maps:
   - `raw: Record<string, string> | null`, with exactly today's meaning of `diskNotesCacheRaw`;
   - `shown: Record<string, string>`, the disk texts the index uses.

   Functions (the only way to change either map):

   | Function | `raw` | `shown` |
   | :--- | :--- | :--- |
   | `isDiskLoaded()` | returns `raw !== null` | - |
   | `readAllIntoDiskLayer(entries)` | `= {}` then every entry | `= {}` then every entry (a file gone from disk leaves `shown` too) |
   | `setDiskNote(fn, content)` | set if `raw !== null` | set (always) |
   | `removeDiskNote(fn)` | delete if `raw !== null` | delete |
   | `addPrefetched(fn, content)` | untouched | set only if `fn` is not in `shown` yet |
   | `invalidateDiskLayer()` | `= null` | untouched (the old texts stay until the next read, as `allNotesCache` keeps them today) |
   | `clearDiskLayer()` | `= null` | `= {}` |
   | `diskSnapshot()` | returns a copy of `raw` (or null) | - |

   Also `seedDiskNotesForTest(notes: Record<string, string>)`, for tests only: `readAllIntoDiskLayer` with those
   notes, so a test sets up "these files are on disk and have been read" in one line. S2-S5 change unit-test setup
   from `allNotesCache.set(x)` to this helper.

   Every change of `shown` bumps `diskVersion`, a `writable<number>` exported from this file. Keep the in-flight
   guard (`diskReadInFlight`) in `persistence.ts` or move it here; either way only one `readAllNotes` runs at a time,
   exactly as now. `setDiskNote` replaces `noteClosingWithContent`'s body and the patches in `updateNotesInCache`;
   it must also set `shown` when `raw` is null (a note closed before the first read is then already known).

2. **`src/lib/persistence.ts`.** Replace every use of `diskNotesCacheRaw` with the functions above, keeping each
   function's behaviour and signature. `refreshAllNotesCache()` becomes `await ensureLoaded()` followed by the same
   two lines that build and set `allNotesCache` (from `diskSnapshot()` and the open tabs). `prefetchNotesForDates`
   also calls `addPrefetched` for each note it read. `directory.ts:133` calls `clearDiskLayer()` in place of
   `invalidateDiskNotesCache()` (that file's only change). **`allNotesCache` keeps its exact content and is written
   at exactly today's moments**: it must not start following the index (design 8.1).

3. **`src/lib/notesIndex/index.ts`**, the store. The interfaces, verbatim:

   ```ts
   /** One note as the index knows it. Immutable: a changed text gives a new entry. */
   export interface NoteEntry {
     key: string;            // filename for a dated or named note; "scratchpad:<tabId>" for a scratchpad
     filename: string;       // as shown to the user
     dateISO: string | null; // from YYYY-MM-DD.txt, else null
     text: string;
     source: "disk" | "tab"; // where the current text comes from
     tabId?: string;
   }
   export const notesIndex: Readable<NotesIndex>;
   export interface NotesIndex {
     entries: ReadonlyMap<string, NoteEntry>; // by key
     loaded: boolean;                          // the disk layer has been read once
     revision: number;                         // goes up when any entry is replaced, added or removed
   }
   export function ensureLoaded(): Promise<void>; // resolves when the disk layer has been read (today's in-flight read)
   ```

   `loaded` turns true when `readAllIntoDiskLayer` runs the first time, stays true through `invalidateDiskLayer()`
   (the old texts are still shown), and turns false only on `clearDiskLayer()` (a folder switch), until the next full
   read. S4 and S6 rely on exactly this.

   The rule, here only: a note with an open non-scratchpad tab has the tab's text (`source: "tab"`, `tabId`);
   otherwise `shown`'s text (`source: "disk"`). Every scratchpad tab is an entry with key `scratchpad:<tabId>`,
   `filename` the tab's `filename`, `dateISO` null. `dateISO` is the `YYYY-MM-DD` of a `YYYY-MM-DD.txt` filename, else
   null. Build it from `tabs` and `diskVersion` (a Svelte `derived`, so it only runs while something subscribes).
   Two update paths (design 8.1), both pure functions in `src/lib/notesIndex/entries.ts` so they can be tested
   without stores:
   - `rebuildEntries(prev, shown, tabs)`: from scratch, reusing every entry of `prev` whose `text`, `source`, `tabId`,
     `filename` are equal (`===`).
   - `patchTabs(prev, prevTabs, tabs, shown)`: only `tabs` changed. Copy `prev`; for each tab added, removed or whose
     `content`, `filename` or `isScratchpad` differs from `prevTabs`, replace that one key (a removed tab's note falls
     back to `shown[filename]`, or is dropped when not in `shown`). All other entries stay the same objects.
   `revision` goes up by one when the resulting map differs from `prev` in any key or entry object, else stays.
   Also export `noteTexts(index: NotesIndex): Record<string, string>`: `key → text` of every non-scratchpad entry,
   which is what `allNotesCache` holds right after a refresh. Test (c) below uses it, and S3-S5 use it where a reader
   needs a plain map. S2-S5 run side by side and must not edit `notesIndex/`, so anything they share belongs here.

4. **`src/lib/notesIndex/facets.ts`.** `linesOf`, `sectionsOf`, `actionsOf`, `dueOf`, each `(e: NoteEntry) => T`,
   remembered per entry in a `WeakMap<NoteEntry, T>`. Export `_facetRuns` (a counter object per facet, for tests
   only) that each facet increments when it computes, not when it returns a remembered value. `actionsOf` returns
   `{ roots, flat }` from `actionTree(linesOf(e))` and `flattenActionTree`. `sectionsOf` returns `listSections(text)`
   with a `normalized` field added from `normalizeHeaderTitle`. Return types are readonly; nothing mutates a result.

5. **Nothing else.** No file that reads `allNotesCache` changes (`actions.ts`, `dueOverview.ts`, `search.ts`,
   `history.ts`, `occurrences.ts`, `copyForward.ts`, `commandPalette.ts`, `exportNotes.ts`, `phoneCompanion.ts`,
   `peek.ts`, `appLog.ts`, `WeekReviewModal.svelte`, `DatePickerModal.svelte`, `MobileAppBar.svelte`,
   `PeekBar.svelte`). They move in S2-S5.

## Out of scope

Moving any reader. `namesOf`, `topicsOf` and cross-note queries (they come with F3); the date picker's day heat
(S5 keeps its own per-entry memo). A worker,
anything written to disk, any change to the backends or `TauriCommands`. Making a view live.

## Tests to add

1. `src/lib/notesIndex/entries.test.ts`:
   - two disk notes, no tabs: two entries, `source: "disk"`, `dateISO` `"2026-11-09"` for `2026-11-09.txt` and null
     for `ideas.txt`;
   - a tab open on `2026-11-09.txt` with other text: that entry is the tab's text, `source: "tab"`, its `tabId`;
   - a scratchpad tab `{ id: "s1", filename: "Scratchpad", isScratchpad: true }`: key `scratchpad:s1`;
   - typing in the tab (`patchTabs` with one tab's content changed): every other entry is the same object (`toBe`),
     `revision` up by one; the same tabs again: same map, same `revision`;
   - closing the tab: the entry falls back to the disk text; closing a tab whose note is not in `shown`: no entry.
2. `src/lib/notesIndex/facets.test.ts`: each facet on a small note gives what the reused function gives on the same
   text; asked twice for the same entry, `_facetRuns` counts one run; a new entry with equal text counts a second run.
3. `src/lib/notesIndex/diskLayer.test.ts`: the table of step 1, one case per row, including "invalidate keeps
   `shown`" and "a prefetched note does not overwrite a shown one".
4. `src/lib/notesIndex/notesIndex.property.test.ts` (fast-check, `{ timeout: 30_000 }`), with the fake disk of
   `syncNotesCache.test.ts` and the real `persistence.ts`. Random initial disk (0-12 notes, short texts with `#`,
   `v`, setext titles and `by:` dates) and a random sequence of 1-25 events: edit an open tab; open a tab on a disk
   note or a scratchpad; close a tab (through the same calls `tabs.ts` makes: `noteClosingWithContent` then removing
   it from `tabs`); a file changed on disk then `updateNotesInCache([fn])`; a delete through
   `deleteNoteAndInvalidateCache`; `invalidateDiskNotesCache()`; `refreshAllNotesCache()`; `prefetchNotesForDates`;
   a folder switch (`clearDiskLayer()` plus `allNotesCache.set({})`, as `performDirectorySwitch` does). After every
   event check:
   - **(a)** each entry's text is the old rule's: an open non-scratchpad tab's content, else the last disk text the
     layer has shown for that name;
   - **(b)** every facet of every entry equals the same function run from scratch on `entry.text`;
   - **(c)** right after a `refreshAllNotesCache()` event, `get(allNotesCache)` equals the index's non-scratchpad
     `key → text` map exactly (same keys, same texts);
   - **(d)** after an edit event, every entry other than the edited one is the same object as before.

   Do not weaken a property to make it pass: if one fails, the code is wrong or this brief is; stop and report which
   (RULES: "a truthful could not").

## Done when

- [ ] `src/lib/notesIndex/` has `diskLayer.ts`, `entries.ts`, `index.ts`, `facets.ts` and the four test files above.
- [ ] `git diff main --stat` touches no reader file of step 5; `persistence.ts` and `directory.ts` (one line) are the
      only existing source files changed.
- [ ] `grep -n "diskNotesCacheRaw" src/lib/persistence.ts` finds nothing.
- [ ] `npm run test:guard` reports no removed test.
- [ ] `npm run verify` and `npm run build` pass.
- [ ] Browser specs: `npx playwright test tests/e2e/compact-date-picker.spec.ts tests/e2e/due-dates-overview.spec.ts
      tests/e2e/actions-pane.spec.ts tests/e2e/search-and-history.spec.ts tests/e2e/week-review.spec.ts
      --workers=2 --reporter=line` pass.
- [ ] The property test passes ten times in a row:
      `for i in 1 2 3 4 5 6 7 8 9 10; do npx vitest run src/lib/notesIndex || break; done`.

## Report

The standard report from RULES.md, plus: the property test's run count and time; anything in the old code whose
behaviour you could not keep exactly (name the function and the case). The reviewer runs the full browser suite and
`PERF=1 npx playwright test --project=perf --workers=1` before and after; you do not need to.
