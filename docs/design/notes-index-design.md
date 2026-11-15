# One index of all notes (R1)

Status: **started 2026-11-15 by Claude Fable; to be finished by the orchestrating session (Opus 5.5)**, which also
writes the briefs and runs the implementation. Accepted by Marien as R1 of the forward review
(`docs/design/forward-review.html`). Sections 1-6 are decided unless a measurement in section 8 contradicts them.
Section 8 lists what is still open; each item has my lean so the work can go on without me.

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
- **Update:** on a change of either input, build the next `entries` map reusing every entry whose `text`, `source`
  and `tabId` are unchanged (compare the text by `===` first, then by value). Only a changed note gets a new entry.
  Typing in one note therefore replaces one entry and computes nothing else.
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
| S1 | `notesIndex/` with the store, the overlay rule, `ensureLoaded`, the facets `linesOf`, `sectionsOf`, `actionsOf`, `dueOf`. `allNotesCache` becomes a derived view of it (`key → text`, scratchpads left out, exactly today's content), so no reader changes. | New unit tests; the property test of section 7; every existing test untouched and green; perf budgets |
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

## 8. Open, to settle before or during S1

1. **Cost per keystroke.** `tabs` is set on every edit (`updateActiveTabContent`, `persistence.ts:516`), so the index
   updates per keystroke. Building a new map of ~2,600 entries by reference is cheap, but measure it on the perf
   scenario. *Lean:* if it costs more than 0.5 ms, keep the map and replace one entry in place behind a new
   `revision`, or coalesce updates to one per animation frame. Do not debounce by time: the status bar's due item
   must follow typing as it does now.
2. **A worker.** *Lean:* no. Search over 2,000 notes takes 351 ms on the main thread today and only on demand. Revisit
   only if a budget fails.
3. **Memory.** `linesOf` holds a second copy of each read note. *Lean:* acceptable (2,600 notes of a few kB); measure
   heap before and after S4 on the perf scenario and put the numbers in the pull request. If it matters, `linesOf`
   can be left unremembered for notes without an open view.
4. **Should open views follow edits live?** Today the Actions view is a snapshot taken when it opens
   (`actionSnapshot`), the week review is live. With the index, live would be easy. *Lean:* keep each view's present
   behaviour through S6, then ask Marien once, with the Actions pane as the example.
5. **The web app's sync hooks** (`registerSyncHooks` at `persistence.ts:270`) and the phone companion's re-read from
   disk at focus: they must keep feeding the disk layer exactly as now. Check both against S1 by reading
   `webOneDriveSync.ts` and `phoneCompanion.ts:302`.
6. **Scratchpad keys.** The due stores use `scratchpad:<tabId>`; other code uses the tab's display name as
   `filename`. *Lean:* `key` as in section 4, `filename` unchanged, and no reader may use `filename` as a map key.
7. **Folder switch.** `directory.ts:133` empties the map. The index must drop every disk entry and keep nothing from
   the old folder; add that to the property test's events.

## 9. What a brief for S1 must contain

The file list of section 1, the interfaces of sections 4 and 5 verbatim, the reuse column of the facet table, the
rule that `allNotesCache` keeps its exact content (same keys, same texts, same moments of update, checked by a test
that runs the old `refreshAllNotesCache` logic beside the new store on the property test's event sequences), and the
budgets. No reader file may change in S1.
