# Brief F1: calendar sync adds new meetings by itself

Run name `f1-calendar-auto` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f1-calendar-auto` · branch
`gemini/f1-calendar-auto` · base `main` after W2-0 is merged · browser-test port `1452` · model Google-Sonnet 5.5
(`claude-sonnet-5-5-high`; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design and decisions: `docs/design/wave2-designs.html`,
section F1 (decisions 1.1-1.5, all as recommended).

## Why

When the calendar file gains a meeting for the open day, the note only shows a dot; the user must press
`Ctrl+Shift+C`, read a dialog and confirm, several times a day, for a change that cannot lose anything. After this
brief such changes happen on their own. Anything that would move or remove text the user wrote still goes through the
dialog, exactly as now.

## What exists now

`src/lib/calendarSyncActions.ts`:
- `checkCalendarSyncDiff()` (lines 63-90) reads the agenda for the active tab's date, calls
  `computeCalendarSync(tab.content, agendaTitles, removedTitles, starts)` and sets the dot (`calendarSyncHasDiff`)
  when any of `newTitles`, `removedEmpty`, `removedWithContent`, `reorderedTitles` is non-empty. It runs on a tab
  switch, 400 ms after the active note's text changes (`initCalendarSyncDiffTracking`, lines 102-120), and when the
  window gets focus (`src/lib/boot.ts`, the focus handlers near lines 224-230).
- `maybeSilentSyncEmptyNote(tab)` (lines 163-215) fills an EMPTY note without the dialog.
- `syncCalendarFromFile()` and `openCalendarSyncReview()` (lines 241-287) open the review dialog;
  `confirmCalendarSync()` applies it.

`src/lib/calendarReconcile.ts`: `computeCalendarSync` returns `{ content, newTitles, reorderedTitles, removedEmpty,
removedWithContent }`. Titles are compared through the private `matchKey()` (line 33).

`src/lib/persistence.ts`: `writeTabContent` (line 532) replaces a tab's text as an UNDOABLE edit. The private
`setTabText` (line 556) replaces it as an outside change (`editorApi.setContent(content, { outside: true })`): not
an undo step, the caret stays on its text.

From W2-0: the stores `calendarAutoAdd` and `autoAddedMeetings`, and `recordAutoAddedMeetings(date, titles)`.

## What to build

1. `calendarReconcile.ts`: export `matchKey` as `meetingMatchKey`. Add a pure function

   ```ts
   export function computeAutoSync(
     content: string, agendaTitles: string[], removedTitles: string[],
     agendaStarts: Record<string, string>, alreadyAdded: string[],
   ): { apply: boolean; content: string; added: string[]; removed: string[]; needsReview: boolean; offer: string[] }
   ```

   - `offer`: agenda titles whose key is in `alreadyAdded` and that have no section in the note (the user deleted a
     section that was added automatically). They are taken out of the agenda before the next step.
   - Run `computeCalendarSync` with the remaining agenda.
   - `needsReview` is true when `reorderedTitles` or `removedWithContent` is non-empty.
   - `apply` is true when `needsReview` is false and (`newTitles` or `removedEmpty` is non-empty). Then `content` is
     the result's content, `added` its `newTitles`, `removed` its `removedEmpty`. Otherwise `content` is the input.

2. `persistence.ts`: export `applyOutsideTabContent(tabId, newContent, options?)`: what `writeTabContent` does
   (cancel the scheduled save, set the tab's text, write the note, toast on a failed write) but through `setTabText`,
   so it is not an undo step. Returns nothing; it sets the `tabs` store itself.

3. `calendarSyncActions.ts`: new `maybeAutoSync(): Promise<void>`, called at the end of `checkCalendarSyncDiff`
   after the dot is computed. It does nothing unless ALL hold:
   - `calendarSyncEnabled`, `calendarAutoAdd` and `agendaFileExists` are true;
   - the active tab is a dated note of today or later, and its text is not empty (the empty case stays with
     `maybeSilentSyncEmptyNote`);
   - no dialog or drawer is open (`modal` store is `"none"`) and the review is not open;
   - the editor's caret is not on a blank line (`editorApi` gives the selection; a blank caret line means the user
     may be about to type there, and the reconciler trims blank lines at the end of sections). When it is, do
     nothing now; the next check tries again.

   Then: read the agenda as `checkCalendarSyncDiff` does, call `computeAutoSync` with
   `autoAddedMeetings[date] ?? []`. When `apply`:
   - re-read the tab from the store; if its text changed since the function started, stop (the next check runs);
   - `applyOutsideTabContent(tab.id, result.content)`;
   - `recordAutoAddedMeetings(date, result.added)`;
   - show a status message through `showToast`: one added: `Added from calendar: <title>`; several:
     `Added from calendar: <first title> and N more`; only removals: `Removed from the note: <title>` (same pattern).
     With an action that jumps to the first added section (use the function Go to section uses; find it from the
     `#` branch in `src/lib/commandPalette.ts` near line 566).
   - set the dot from `needsReview` (false here).

   The dot: in `checkCalendarSyncDiff`, take the titles in `offer` out of the agenda before computing the dot, so a
   meeting the user removed does not light it.

4. `maybeSilentSyncEmptyNote`: after it fills a note, call `recordAutoAddedMeetings(date, result.newTitles)`.

5. The review dialog: `openCalendarSyncReview` receives the `offer` titles and lists them among the new meetings
   UNCHECKED (the existing `newItems` have `checked: true`; these get `checked: false`), so "Sync calendar for this
   day" by hand can bring a removed meeting back. Confirming with one checked adds it as today.

6. A check once a minute: in `initCalendarSyncDiffTracking`, a 60-second interval that calls
   `checkCalendarSyncDiff()` while `document.visibilityState === "visible"`.

7. `docs/spec.md`: in §5 "Sync Calendar for This Day", after the sentence about the empty note, add the rules of the
   table below in three or four sentences. `docs/agenda-file-guide.md` §1, bullet "An empty note fills itself": add
   one sentence that new meetings are also added to a note with content when the setting is on.

## Behaviour, as examples

`computeAutoSync`, agenda for the day `[Standup 09:00, Design review 14:00, 1:1 Dana 15:00]` unless stated:

| Note has sections | Agenda change | alreadyAdded | Result |
| :--- | :--- | :--- | :--- |
| Standup (text), 1:1 Dana (empty) | Design review is new | none | apply; added `[Design review]`; order Standup, Design review, 1:1 Dana; Standup's text unchanged |
| Standup, Design review, 1:1 Dana (empty) | 1:1 Dana no longer in agenda | none | apply; removed `[1:1 Dana]` |
| Standup, Design review, 1:1 Dana (text) | 1:1 Dana no longer in agenda | none | no apply; needsReview |
| 1:1 Dana, Standup (both text) | order differs from agenda | none | no apply; needsReview |
| 1:1 Dana, Standup (both text) | order differs AND Design review is new | none | no apply; needsReview (the dialog handles both) |
| Standup, 1:1 Dana | Design review in agenda, no section | `[Design review]` | no apply; offer `[Design review]`; needsReview false |
| Standup, `'Call 13:50`, 1:1 Dana | Design review is new | none | apply; the ad-hoc call stays; order Standup, 'Call 13:50, Design review, 1:1 Dana |
| Standup, Design review, 1:1 Dana | nothing | none | no apply; nothing added |

In the app (browser tests, mock backend; the mock's `agendaJson` can be changed from the test through
`window.__CHRONO_MOCK__`):

| Start | Do | Expect |
| :--- | :--- | :--- |
| Note with `Standup` + a line of text, caret at the end of that line; agenda has Standup | add `Design review 14:00` to the agenda, type one character, wait | the section appears; the caret is still at the end of the typed text; the status message names it |
| same | then press `Ctrl+Z` once | the typed character is undone; the section stays |
| same, section added | delete the `Design review` title and underline, wait 2 s | it does not come back; the sync button has no dot |
| same, after deleting | reload the page | it still does not come back |
| same, after deleting | press `Ctrl+Shift+C` | the dialog lists `Design review` unchecked |
| setting "Add new meetings automatically" off | add a meeting to the agenda, edit | no section added; the dot shows (today's behaviour) |
| caret on an empty line at the end of a section | add a meeting, wait 2 s | nothing added yet; after typing a character on that line and waiting, it is added |
| note dated yesterday | add a meeting for yesterday | nothing happens |

## Out of scope

The review dialog's layout. The reconciler's spacing rules. Peek's on-now list (it reads the agenda itself). The web
app needs no separate work: the same code runs there.

## Tests to add

- `src/lib/calendarAutoSync.test.ts`: every row of the first table.
- `tests/e2e/calendar-auto-add.spec.ts`: every row of the second table. Run it ten times
  (`--repeat-each=10`); it must pass all ten.
- Existing: `E2E_PORT=1452 npx playwright test tests/e2e/calendar --workers=2 --reporter=line` (every spec whose name
  starts with `calendar`) must still pass. If an existing test fails because a meeting is now added automatically,
  the test's seed gets `calendarAutoAdd: false` and you list it in the report; do not change what it asserts.

## Done when

- [ ] `npm run verify` and `npm run build` pass.
- [ ] The new spec passes ten times out of ten; the existing calendar specs pass.
- [ ] `git diff main --stat` touches only: `calendarReconcile.ts`, `calendarSyncActions.ts`, `persistence.ts`, the
      i18n files, the two docs, the review modal if step 5 needs it, and tests.

## Report

The standard report, plus: any case where the reconciler changed blank lines in a way a user could notice while
typing.
