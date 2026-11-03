# Phase 1: read-only

Build a read-only phone app that shows the last two weeks and the coming two weeks of notes, day by day and meeting
by meeting, including a meeting's earlier occurrences. Read `reference.md` first; this file assumes it.

**In scope:** flows `CNList` and `CNRead`; the copy on the device and the refresh; screens Days, Day and Meeting.
**Out of scope:** writing any file, editing, search, notifications (phase 2 adds proposing changes).

## 1. Flows

Both use the trigger **When Power Apps calls a flow (V2)** and start with a *Compose* named `NotesPath` holding the
notes folder path as the OneDrive connector shows it (for example `/Documents/Notes`, no trailing slash).

### `CNList`: what is in the folder

1. Trigger without inputs; *Compose* `NotesPath`.
2. **OneDrive for Business → List files in folder**, Folder = `outputs('NotesPath')`.
3. **Data operation → Select** from its `value`, key/value mode: `name` → `item()?['Name']`, `modified` →
   `item()?['LastModified']`, `folder` → `item()?['IsFolder']`.
4. **Respond to a PowerApp or flow**, Text output `files` = `string(body('Select'))`.

The app keeps only entries with `folder` false whose name is a note (`YYYY-MM-DD.txt`) or `.agenda.json`.

### `CNRead`: the text of some files

1. Trigger with one Text input (`names`): file paths relative to the notes folder, separated by commas, for example
   `2026-10-30.txt,.agenda.json,.chrononote-mobile/outbox.json`. *Compose* `NotesPath`.
2. **Initialize variable** `results`, Array, empty.
3. **Apply to each** over `split(triggerBody()?['text'], ',')`; Settings: concurrency on, degree 20. Inside:
    1. **Get file content using path**, File path = `concat(outputs('NotesPath'), '/', items('Apply_to_each'))`.
    2. **Append to array variable** `results`:
       `addProperty(addProperty(json('{}'), 'name', items('Apply_to_each')), 'text', body('Get_file_content_using_path'))`.
    3. A second **Append to array variable** in a parallel branch after step 1, *Configure run after* = "has failed"
       only: `addProperty(addProperty(json('{}'), 'name', items('Apply_to_each')), 'missing', true)`.
4. After the loop, **Respond to a PowerApp or flow**, *Configure run after* = "is successful" and "has failed": Text
   output `files` = `string(variables('results'))`.

A missing file (the outbox when ChronoNote's setting is off, a note deleted since the listing) comes back as
`{ "name": …, "missing": true }` instead of failing the whole call.

## 2. The copy on the device

| Name | Holds | Saved as |
| :--- | :--- | :--- |
| `colFiles` | last listing: `name`, `modified` | `cnFiles` |
| `colNotes` | files read: `name`, `modified` (from the listing when read), `text` | `cnNotes` |
| `colMeta` | one row: `lastRefresh`, `showDone` | `cnMeta` |

On start: `LoadData` all three (ignore missing), show the Days screen from them at once, then refresh if connected.

## 3. Refresh

Runs on start, from a refresh button on the Days screen, and when the Days screen becomes visible and the last
refresh is more than 5 minutes old. One at a time (ignore a second request while one runs).

1. Not connected (`!Connection.Connected`): show "Offline · copy from ‹time›" and stop.
2. Call `CNList`; parse into `colFiles`.
3. **Needed files:** the notes in `colFiles` dated from 14 days before today to 14 days after, `.agenda.json` if
   listed, and every note already in `colNotes` that is still listed (older occurrences read earlier).
4. **To read:** needed files whose `colFiles.modified` differs from the copy's `modified` or that have no copy; plus
   always `.chrononote-mobile/outbox.json` (it is not in the listing and is small).
5. Read them with `CNRead` in batches of 10 names, showing "Reading 10 of 23…" on the Days screen.
6. Merge: replace copies by name; remove copies that came back `missing` and copies of notes no longer in
   `colFiles`.
7. Parse the outbox (`ParseJSON`) into a global; if it is missing, unreadable or has `format` above 1, use none (for a
   higher format also show "Update the app").
8. `SaveData` the collections; set `lastRefresh` = `Now()`.

On a flow error keep the copy and show "Couldn't refresh · copy from ‹time›" with a retry. First start without a copy
and without a connection: "Connect once to load your notes."

## 4. Parsing

Parse a note only when it is on screen (and for the Days screen's summaries of the window's days). For one note's
text, produce a table of lines with:

| Field | Meaning |
| :--- | :--- |
| `n` | line number from 1 (reference 6.1) |
| `indent` | leading spaces ÷ 2, rounded down |
| `kind` | `title`, `underline`, `subheading`, `subunderline`, `action`, `topic`, `followup`, `delegated`, `bullet`, `emphasis`, `text`, `blank` (reference 6.2 and 6.3) |
| `state` | `open`, `done`, `wontdo`, `deferred`, `discussed`, `postponed`, or blank |
| `body` | the text after the token(s) |
| `section` | the trimmed title of the section the line is in (blank in the day part; a title line belongs to its own section) |

Helpers the screens need: a note's sections (title, line number, matching title, ad-hoc yes/no), its open-action and
open-topic counts, and the matching title of any title (reference 7). Write them as user-defined functions if the
user's Studio has them, otherwise as formulas with `With`.

## 5. Screens

### Days (start screen)

- Top: "ChronoNote", a refresh button, the Dark/Light switch (reference 10.1), and one status line ("Updated 08:40", "Reading 10 of 23…", "Offline · copy
  from 08:40", "Couldn't refresh · copy from 08:40").
- A list in three groups: **Today**, **Coming days** (tomorrow to +14, nearest first), **Earlier** (yesterday to -14,
  nearest first). Today is always shown; other days only when they have a note or agenda meetings.
- Each day: its date ("Thu 30 Oct"), "3 open · 2 to discuss" (open actions, open topics; omitted when zero), then its
  meetings in note order: section titles (time range and `[CANCELED]` removed for display; ad-hoc sections in
  italic), followed by agenda meetings that have no section yet, in muted with "agenda", ordered by start time.
- Tap a day → Day screen. Tap a meeting → Meeting screen at that day's occurrence (an agenda-only meeting opens at
  that day with "No notes yet").

### Day

- Top: back, the date, previous/next day buttons (to the nearest day with a note or agenda meetings), the "Show done"
  switch.
- The note drawn line by line (reference 10): symbols, colours, the rules under titles and sub-headings. Section
  titles are tappable → Meeting screen.
- After the note: agenda meetings without a section, each as a muted title with "On the agenda, no notes yet".
- No note and no agenda: "No note for this day." A day outside the copy (beyond the window): a "Load this day"
  button that reads that one note with `CNRead`, keeps it in the copy, and shows it.

### Meeting

- Top: back, the meeting's display title, "3 of 7 · Thu 30 Oct", older/newer buttons, the "Show done" switch, and
  "Open day" (Day screen at the shown date).
- Body: the lines of that section on that date (the title and underline left out), drawn like the Day screen.
- **Occurrences** of a meeting, by date, oldest first, no date twice: the outbox meeting whose matching title equals
  this one (all its `occurrences`), plus every day in the window whose note has a section with this matching title,
  plus (today and later only) agenda days in the window without a section, shown as "On the agenda, no notes yet".
- **Start at** the occurrence that was tapped; otherwise the latest on or before today, otherwise the first upcoming.
- **An occurrence not in the copy** (before the window): read that note with `CNRead` when it is shown, with
  "Loading…", and keep it in the copy. Also read the next older one in the background, so stepping back feels
  instant.
- Find the section in the note by comparing matching titles (reference 7). Without an outbox, history is the window
  only; then show under the counter: "Earlier meetings appear when the phone companion is on in ChronoNote."

## 6. Done when

The user checks these on the phone:

1. Opening the app shows the Days screen from the copy within about 2 seconds, then refreshes by itself.
2. Today, the coming days and the earlier days show the right meetings and counts, compared with ChronoNote on the
   laptop.
3. Agenda meetings without notes yet appear muted; canceled and declined ones don't appear.
4. A day's note looks like it does in ChronoNote (dark theme, colour symbols): the same boxes, circles and arrows in
   the same colours, `@name` badges, yellow emphasis lines, the indentation, a double rule under each section title
   and a single one under sub-headings, no `=` or `-` characters. The Light switch gives ChronoNote's light theme.
5. "Show done" hides and shows done and won't-do actions and discussed topics, also after closing and reopening the
   app.
6. Tapping a meeting opens it; older/newer walks through its occurrences, including ones from before the 4-week
   window (with the phone companion on in ChronoNote).
7. A meeting with a date or a time in its title ("Weekly Sync 2026-10-29", "[09:00 - 09:30] Weekly Sync") is one
   meeting with the plain one.
8. An ad-hoc section (title starting with `'`) is shown in its day but is never a meeting.
9. After editing one note on the laptop and waiting for OneDrive, a refresh reads only that note (the status line
   counts 1, plus the outbox) and shows the change.
10. In flight mode the app opens and shows everything it showed before, with the offline status line.
11. A refresh with nothing changed takes under 5 seconds.
12. Nothing in the notes folder changes because of the app (check the folder's modified times).
