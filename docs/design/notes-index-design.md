# One index of all notes (R1)

Status: **design complete 2026-11-16** (started 2026-11-15 by Claude Fable, finished by Claude Opus 5.5, which also
wrote the briefs `docs/briefs/wave-3/S1-S6` and runs the implementation). Accepted by Marien as R1 of the forward
review (`docs/design/forward-review.html`). Section 8 records how each open point was settled; two of them changed
section 5 and the S1 row of section 6 (marked "8.1" and "8.5").

## 1. What is there now

Every view that looks across notes gets a map of file name to whole text and reads it itself.

- **The map.** `allNotesCache` (`src/lib/stores.ts:424`) is `Record<filename, text>`. `refreshAllNotesCache()`
  (`src/lib/persistence.ts:276`) fills it: one full read of the folder (`read_all_notes`) kept in a private disk
  layer (`diskNotesCacheRaw`), then every open non-scratchpad tab's live text laid over it. It runs when a view
  opens, 1.5 s after start (`boot.ts:675`), and after a sync (`updateNotesInCache`, §451).
- **The readers**, each splitting and reading the text again:

  | Reader | Where | What it derives |
  | :--- | :--- | :--- |
  | Actions view | `actions.ts:81` `buildActionSnapshotAllFiles` | action tree per note (`actionGroups.ts`), section of each line |
  | Due item in the status bar | `dueOverview.ts:77` and `:191` | due items per note; two separate per-note memos keyed by text |
  | Week review | `WeekReviewModal.svelte:93`, `weekReview.ts:357` | sections and their actions for one week |
  | Search | `search.ts:326` | every line against the query |
  | Command palette `!` and `@` | `commandPalette.ts:618`, `:657` | open actions, delegated lines |
  | Section History, occurrences, copy forward | `history.ts:37`, `occurrences.ts:38`, `copyForward.ts:90` | sections by title |
  | Date picker | `DatePickerModal.svelte:136` | per-day state (has note, open actions) |
  | Phone companion | `phoneCompanion.ts:302` | section titles in a date window |
  | Export, phone tab list, Peek bar | `exportNotes.ts:31`, `MobileAppBar.svelte:38`, `PeekBar.svelte:118` | text |

- **The same rule written several times.** "An open tab's text wins over the file's" is implemented in
  `refreshAllNotesCache`, again in both `dueOverview` stores, again in `WeekReviewModal`, again in `occurrences.ts`
  and `phoneCompanion.ts`. Scratchpads are included by some readers (due) and not by others.
- **Speed is fine today.** With 2,000 notes and a 5,000-line note the budgets hold with room
  (`tests/e2e/perf-budgets.json`, measured: search 351 ms of 800, Actions on all files 140 of 300, Section History
  189 of 400, typing 6 ms of 15). So this change is not a rescue. I wrote on the review page that it keeps typing
  fast as the folder grows; that is a side effect at best and must not be the argument.

## 2. Why do it anyway

1. **One line, one meaning, one level up.** §468 made every reader of a *line* go through the tokenizer. Readers of
   a *note* still each decide what a section is, which text is current and whether scratchpads count. The index is
   the one place that decides.
2. **The next four features are queries.** Suggestions for names, topics and titles (F3), search by section and kind
   (F7), the person view (F5) and rename across notes (F6) each need "every name / topic / title / decision in all
   notes, with where and when". Built on the map, each would add another full scan with its own rules.
3. **Less code that can disagree.** Two memos in `dueOverview.ts` disappear, as do five copies of the overlay rule.

## 3. Goals and non-goals

Goals:
- One module owns "the current text of every note" and what is derived from it.
- Derived data is computed once per note text and shared by every view.
- No behaviour change in any existing view during the migration. Every step is a refactor with the same tests green.
- The performance budgets do not get worse at any step, typing included.

Non-goals:
- Nothing is written to disk. The index is memory only and rebuilt at start. Notes stay the only truth (tenet 1).
- No database, no worker thread, no full-text engine. The measured sizes do not need them (section 8, item 2).
- No change to the three backends or to `TauriCommands`. `read_all_notes` and `read_note` stay as they are.
- Views do not become live where they are snapshots today (the Actions view lists what was there when it opened).
  That is a behaviour question for Marien, kept apart (section 8, item 4).

## 4. The model

New folder `src/lib/notesIndex/`.

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
```

Derived data are **facets**: pure functions of one entry, computed on first use and remembered per entry in a
`WeakMap<NoteEntry, T>`. An entry that did not change keeps its facets; a replaced entry's facets are collected with
it. Nothing is computed for a note no view asked about.

| Facet | Returns | Built from (existing code to reuse) | First users |
| :--- | :--- | :--- | :--- |
| `linesOf(e)` | `string[]` | `text.split("\n")` | all |
| `sectionsOf(e)` | title, normalised title, title line, body range | `listSections` in `tokens.ts`, `normalizeHeaderTitle` | History, week review, phone, F3, F7 |
| `actionsOf(e)` | the action tree, flattened, with section | `actionTree` / `flattenActionTree` in `actionGroups.ts` | Actions view, week review, palette |
| `dueOf(e)` | due items (date, state, delegated, line) | `tokens.dueItems` | status bar, due view |
| `namesOf(e)` | `@name` → lines | tokenizer `assignee` tokens | F3, F5, F6 |
| `topicsOf(e)` | `(topic)` → lines | tokenizer `topicTag` tokens | F3, F6 |
| `dayStateOf(e)` | has content, open actions | `computeDayHeat` in `date.ts` | date picker |

Facets that depend on today's date (`overdue`, `upcoming`) are not facets: they are computed by the query from
`dueOf(e)` and the date, so a day change does not invalidate anything.

## 5. The store and how it stays current

```ts
export const notesIndex: Readable<NotesIndex>;
export interface NotesIndex {
  entries: ReadonlyMap<string, NoteEntry>; // by key
  loaded: boolean;                          // the disk layer has been read once
  revision: number;                         // goes up when any entry is replaced, added or removed
}
```

- **One overlay rule, here only:** for a file with an open tab the entry's text is the tab's; otherwise the disk
  layer's. Scratchpads are always entries (`source: "tab"`). A reader that must not see scratchpads filters on
  `dateISO` or `key`.
- **Inputs:** (a) the disk layer, which keeps today's loading and invalidation exactly (`diskNotesCacheRaw`, the
  in-flight guard, `updateNotesInCache`, `invalidateDiskNotesCache`, `prefetchNotesForDates`, the write and delete
  hooks at `persistence.ts:338-425`); (b) the `tabs` store.
- **The disk layer moves (8.5).** It goes from `persistence.ts` into `notesIndex/diskLayer.ts` with two maps: `raw`,
  with exactly today's meaning of `diskNotesCacheRaw` (null = must be read again, checked by every hook as now), and
  `shown`, the disk texts the index uses. Every write to `raw` writes `shown` too; setting `raw` to null leaves
  `shown` as it is (today `allNotesCache` also keeps the old texts until the next read); a prefetched note goes into
  `shown` only (today it goes into `allNotesCache` only); a folder switch empties both. Each change of `shown` bumps
  a version the index listens to. `persistence.ts` keeps its exported functions as thin wrappers, so no caller moves.
- **Update (8.1):** two paths. A change of `tabs` alone copies the previous map and replaces only the entries of tabs
  whose text, id or presence changed (a closed tab's entry falls back to `shown`, or disappears). A change of the
  disk layer rebuilds the map, reusing every entry whose `text`, `source` and `tabId` are unchanged. Typing in one
  note therefore replaces one entry and computes nothing else. Measured on 2,600 notes (Node, this laptop): a full
  rebuild costs 0.47 ms per keystroke, the copy-and-patch path 0.16 ms.
- **Loading stays lazy.** `ensureLoaded()` replaces `refreshAllNotesCache()` for callers: it resolves when the disk
  layer has been read. Before that, `entries` holds the open tabs and whatever the date picker prefetched, as the
  map does today.
- **Cross-note queries** (all names with counts and last use, all section titles, the due summary) are derived
  stores that walk `entries` and read facets. They re-run when `revision` changes and cost only the changed entry,
  because every other entry's facet is already there. This is the pattern `dueOverview.ts` has today, made general.

## 6. Migration, in slices

Each slice is one brief and one pull request, with no change in behaviour and the full browser suite green. The
order keeps the app working after every merge.

| Slice | What | Proof |
| :--- | :--- | :--- |
| S1 | `notesIndex/` with the disk layer, the store, the overlay rule, `ensureLoaded`, the facets `linesOf`, `sectionsOf`, `actionsOf`, `dueOf`. `allNotesCache` keeps being written by today's code at today's moments (8.1: it must not start changing per keystroke), so no reader changes; a test proves that right after every `refreshAllNotesCache()` it equals the index's non-scratchpad texts. | New unit tests; the property test of section 7; every existing test untouched and green; perf budgets |
| S2 | `dueOverview.ts` reads `dueOf` through the index. Both memos and both overlay loops go. | `dueOverview*.test.ts`, `due-*.spec.ts` unchanged and green |
| S3 | Actions view (`actions.ts`), week review, palette `!` and `@` read `actionsOf`. `ActionSnapshotItem` ids stay byte-identical. | Actions, week review and palette specs unchanged |
| S4 | Search, Section History, occurrences, copy forward read `linesOf` / `sectionsOf`. | Their specs unchanged; search budget |
| S5 | Date picker, phone companion, export, phone tab list, Peek bar. | Their specs unchanged |
| S6 | Remove `allNotesCache` and `refreshAllNotesCache`; a check fails if either name comes back. | `git grep` clean; all suites |
| then | `namesOf`, `topicsOf` and the cross-note title/name/topic queries arrive with the first feature that needs them (F3), not before. | F3's own tests |

S2 to S5 touch different files and can run side by side once S1 is merged. S1 is the only one that needs the
stronger coder model (it defines the invariants); S2-S5 are mechanical with exact file lists.

## 7. Tests

- **The invariant, as a property test** (`notesIndex.property.test.ts`, fast-check): for random notes and a random
  sequence of events (edit a tab, open a tab, close a tab, a disk change, a delete, a sync of several files), after
  every event each facet of each entry equals the same facet computed from scratch on the entry's text, and the
  entry's text equals what the old rule gives (tab text if open, else disk text).
- **Sharing:** after an edit to one note, every other entry is the same object as before (`toBe`), and a counter in
  the facet functions shows they ran only for the changed note.
- **Budgets:** `PERF=1 npx playwright test --project=perf --workers=1` before and after each slice; numbers in the
  pull request. Typing in the 5,000-line note must stay within its budget and not rise by more than 1 ms.
- **No behaviour change:** the test guard (`npm run test:guard`) must report no removed test in S1-S5.

## 8. Settled (2026-11-16)

Each point was open in the first draft. How it was settled, and where that shows in the briefs:

1. **Cost per keystroke.** Measured in Node on 2,600 notes of 2 kB with five open tabs, one tab changing: rebuilding
   the whole entries map with reuse costs 0.47 ms per keystroke, copying the map and replacing only the changed tab's
   entry costs 0.16 ms. The full rebuild sits at the 0.5 ms limit, so the store takes the two paths of section 5
   (tabs change: copy and patch; disk change: rebuild). No debounce, no frame coalescing. Reading the code found a
   second point: `allNotesCache` changes only when a view refreshes it (open, start, sync), never per keystroke.
   Turning it into a live view of the index would make the date picker, the phone tab list and both due stores
   re-run on every keystroke against texts they do not see today. So `allNotesCache` stays written by today's code
   until S6 removes it, and readers move to the index one slice at a time. S1's perf run must show typing within 1 ms
   of before.
2. **A worker.** No. Nothing measured needs one; revisit only if a budget fails.
3. **Memory.** Settled as planned: S4 (the slice that makes `linesOf` hold a copy for every note searched) measures
   the JS heap on the perf scenario before and after (`performance.memory.usedJSHeapSize` after a search over all
   notes, three runs, median) and puts it in the pull request. More than 25 MB extra: `linesOf` is then computed
   without remembering it for entries with `source: "disk"`.
4. **Open views live or snapshot.** Unchanged through S6: the Actions view stays a snapshot, the week review stays
   live. After S6 merges, ask Marien once, with the Actions pane as the example.
5. **The sync hooks and the phone companion.** Read for this: the web app's OneDrive sync calls the two hooks
   `registerSyncHooks` gives it (`invalidateCache` = `invalidateDiskNotesCache`, `notesChanged` =
   `updateNotesInCache`, `persistence.ts:270`, used in `oneDriveSync.ts:97-100`). Both act on the disk layer only, so
   they keep working once the disk layer has moved (section 5) and feeds the index. The phone companion
   (`phoneCompanion.ts:299-308`) reads a window of dates fresh from disk on focus and lays it over the cache, with
   open tabs over that. S5 keeps that order exactly: index text, then the fresh window for names without an open tab.
   One more finding: `prefetchNotesForDates` writes into `allNotesCache` and not into the disk layer, which is why
   the disk layer gets the `shown` map.
6. **Scratchpad keys.** As leaned: `key` is the filename for a note and `scratchpad:<tabId>` for a scratchpad (the
   due stores' key today), `filename` stays the display name, and no reader may use `filename` as a map key.
7. **Folder switch.** `performDirectorySwitch` (`directory.ts:125-140`) gets one call more, `clearDiskLayer()`, which
   empties `raw` and `shown`; the index then holds only the open tabs. A folder switch is one of the events of the
   property test.

Allowed differences (the only ones; each gets a test in its slice):
- S2: a note closed since the last refresh. Today the due item counts the text `allNotesCache` had at the last
  refresh, which can be older than what was typed before closing; with the index it counts the text the tab closed
  with (`noteClosingWithContent` already puts it in the disk layer). That is a fix, named in the changelog.
- S3-S5: views that read `allNotesCache` reactively (week review, date picker, phone tab list) see disk changes when
  the disk layer changes rather than at the next refresh. They refresh when they open, so a user sees no difference
  in practice.

## 9. What a brief for S1 must contain

The file list of section 1, the interfaces of sections 4 and 5 verbatim, the reuse column of the facet table, the
disk-layer move of section 5, the rule that `allNotesCache` keeps its exact content and moments (today's code keeps
writing it; a test checks that right after every `refreshAllNotesCache()` it equals the index's non-scratchpad
texts, on the property test's event sequences), and the budgets. No reader file may change in S1.
