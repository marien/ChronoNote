# Mobile companion through OneDrive (outbox and inbox): design draft

Status: reviewed and decided, 2026-10-29 (Marien's answers in section 13). Nothing built yet. First draft 2026-10-28;
revised 2026-10-29 (the phone reads the notes itself).

## 1. Why

Corporate devices, phones in particular, are often locked down: custom apps can't be installed, third-party web apps
can't reach the organisation's OneDrive, and registering an app in the organisation's Entra ID needs an admin approval
that is often not given (the blocker that ended the M365 calendar import, `m365-calendar-import-roadmap.md`). What such
a device usually does allow is Microsoft's own apps, signed in with the organisation's account: OneDrive, To Do,
Planner, Power Apps and Power Automate.

The goal: **prepare meetings on such a device while away from the computer that runs ChronoNote.** Read a meeting's
notes, including its earlier occurrences; add topics and actions; tick actions and topics off. Back at the computer,
ChronoNote takes those changes over and the files show them.

In this document "the phone" is that restricted device and "the laptop" the computer running ChronoNote; the notes
folder is in the organisation's OneDrive, synced to the laptop.

## 2. Decisions so far (from the conversations of 2026-10-28 and 2026-10-29)

1. **ChronoNote on the desktop stays the only program that edits note files.** The phone never writes a `.txt` file.
2. **The phone proposes, ChronoNote decides.** Proposals go into an inbox file; ChronoNote applies those that still fit
   and holds the rest as conflicts for Marien.
3. **The phone reads the notes themselves** (the `.txt` files and `.agenda.json`, through a flow) and parses them for
   display. Reading is display only: finding the line a request is about, conflicts and writing all stay in
   ChronoNote, so a parsing mistake on the phone can't damage a note.
4. **The outbox only holds what only ChronoNote knows:** where each meeting occurred before (an index), and the results
   of the phone's requests. It is written when ChronoNote starts, after it has processed the inbox, when the day
   changes, and when the set of meetings in the window changes (a new section title, or meetings added or moved in
   `.agenda.json`); never for an ordinary edit (section 4.2).
5. **One writer per file.** The phone side writes the inbox, only ChronoNote writes the outbox. ChronoNote never
   changes or deletes the inbox; it reports results in the outbox, and the phone side cleans its own inbox up.
6. **Power Apps is the phone client; To Do is not part of the design.** A To Do flow that appends straight to the note
   files may be used as a stopgap until the app exists, and is switched off after that.
7. **No Dataverse or SharePoint copy in the first versions.** Standard connectors only (OneDrive for Business, Power
   Automate). A phone-side copy can be added later (section 10).
8. **First version of edits is limited** to adding a line and changing the state of an action or topic.

## 3. Overview

```
 laptop                              OneDrive (notes folder)                          phone
 ┌──────────────┐  writes   ┌───────────────────────────────────────┐   read (flow)   ┌───────────┐
 │ ChronoNote   │ ────────▶ │ 2026-10-28.txt ...        (notes)     │ ──────────────▶ │           │
 │ (desktop)    │           │ .agenda.json  (external calendar feed)│ ──────────────▶ │ Power App │
 │              │ ────────▶ │ .chrononote-mobile/outbox.json        │ ──────────────▶ │           │
 │              │ ◀──────── │ .chrononote-mobile/inbox.json         │ ◀────────────── │           │
 └──────────────┘   reads   └───────────────────────────────────────┘  write (flow)   └───────────┘
```

- The OneDrive client on the laptop syncs the folder as it does today; ChronoNote only sees local files.
- The phone sees a note as soon as OneDrive has uploaded the laptop's last autosave, normally within minutes. It also
  sees changes made outside ChronoNote (the web app, the OneDrive edit button).
- ChronoNote must be running on the laptop for phone changes to take effect. Until then the app shows them as
  pending.

## 4. Files

The two companion files are in a hidden folder `.chrononote-mobile/` at the root of the notes folder. The strict
`YYYY-MM-DD.txt` filename check already keeps it out of every note-scanning path (as with `.chrononote-versions/` and
the others); export, search, trash and the web app's OneDrive sync must be checked to skip it as well.

```
.chrononote-mobile/
  outbox.json    written by ChronoNote only
  inbox.json     written by the phone side only
```

Both start with `"format": 1`, so either side can recognise a file it doesn't understand yet and leave it alone
instead of misreading it.

### 4.1 `outbox.json`

```json
{
  "format": 1,
  "generatedAt": "2026-10-29T08:40:12+01:00",
  "appVersion": "0.35.0",
  "window": { "from": "2026-10-15", "to": "2026-11-12" },
  "meetings": [
    { "key": "m-3f9a1c", "title": "Weekly Sync", "occurrences": [
      { "date": "2026-09-10", "title": "Weekly Sync" },
      { "date": "2026-10-22", "title": "Weekly Sync" },
      { "date": "2026-10-29", "title": "Weekly Sync 2026-10-29" } ] }
  ],
  "results": [ ]
}
```

- **Meetings:** each meeting in the window (14 days back to 14 days ahead), whether it has a section in a note or is
  only on the agenda (`.agenda.json`) so far, with its occurrences: those in the window plus its last 5 earlier ones,
  however far back. So a monthly or quarterly meeting still has its history, also before its note for this time
  exists.
- **Occurrence title:** the section title as written in that note, so the phone can find the section by plain text
  comparison, without ChronoNote's date-insensitive matching rules.
- **Key:** a short hash of the matching title (`titleForMatching(normalizeHeaderTitle(title))`, the rule Section
  History and occurrence stepping use), the same across occurrences.
- **Results:** see section 6.4.

### 4.2 When the outbox is written

- When ChronoNote starts.
- After it has processed inbox requests (with or without changes to notes).
- When the day changes, to move the window.
- **When the set of meetings in the window changes** (section 13.8): a save adds or renames a section title that isn't
  in the index yet, or `.agenda.json` gains or moves a meeting. ChronoNote already reads the agenda on tab switch,
  shortly after edits and on window focus for the sync button's dot (§263); the same moments compare the window's
  meeting titles with the index. An ordinary edit (lines, not titles) leaves the outbox alone.
- Only when its content changed (apart from `generatedAt`), through the same atomic write as notes.

The index may still be briefly behind (until the next of those moments, or when the laptop is off), and that is fine:
a new occurrence of a meeting is always inside the window, which the phone reads directly. The index only adds the
occurrences before the window, and those don't change by being written in.

### 4.3 What the phone reads besides the outbox

- **Notes:** every `YYYY-MM-DD.txt` in the window, and the dates listed in the outbox's occurrences.
- **`.agenda.json`:** for meetings on today and later days that have no section in the note yet, so the phone can add
  lines to a meeting that doesn't exist yet. The app shows the meeting titles, leaving out the ones the agenda file
  guide marks as removed (`Canceled:` and the like, `docs/agenda-file-guide.md`). No Outlook connector is needed.

### 4.4 Parsing on the phone

The app parses a note only to draw it. A reference file for the formats (section 9) spells out the subset, so the app
can be built from it:

- Lines split on line breaks (a `\r` before `\n` is dropped).
- A section title is a non-blank line followed by a line of `=` characters (ChronoNote's rule, §2.2); everything up
  to the next title is that section. Lines before the first title are the day part.
- A line of `-` characters under a line is a sub-heading inside the section, not a new section.
- The line's kind and state come from its first token after the indentation: `# ` open action, `v ` done, `> `
  deferred, `x ` won't do, `o ` open topic, `. ` discussed, `, ` postponed, `- `/`* ` bullet, `=> ` follow-up (with
  `@name` delegated), `! ` emphasis; anything else is text.
- Extras the app may draw if it wants: `(topic)` right after the action symbol, `by:YYYY-MM-DD`, `(>date#Section)`
  forward links. Not drawing them leaves the raw text, which is still readable.

Where the app's parsing and ChronoNote's differ, the app shows a line or section slightly wrong; nothing else happens.

### 4.5 Why the phone reads the notes

The first draft had ChronoNote publish the notes already parsed, as one snapshot or as day and meeting files. That
put the outbox in the save path: every save had to update it. Reading the notes on the phone was chosen because:

- **No outbox work on saves**, and much less ChronoNote code.
- **The phone always sees the real notes**, including changes made outside ChronoNote.
- **The outbox stays small** and changes rarely.

The cost: a small parser in Power Fx, maintained by hand and not tested by CI (section 4.4), and a slower first load
while the app fetches 30 or more files (section 8 keeps later loads short).

## 5. `inbox.json`

```json
{
  "format": 1,
  "writer": "powerapps",
  "requests": [
    { "id": "6f0c…", "made": "2026-10-29T08:02:11+01:00", "type": "addLine",
      "date": "2026-10-30", "section": "Weekly Sync", "text": "o hiring plan" },
    { "id": "a91d…", "made": "2026-10-29T08:03:40+01:00", "type": "setState",
      "date": "2026-10-22", "section": "Weekly Sync", "line": "# send the numbers to Dana", "n": 7,
      "state": "done" }
  ]
}
```

- `id` is a GUID made by the app. Requests are applied in the order listed.
- **`addLine`:** `text` includes its token (`# `, `o `, `! `, `- `, `=> @name `, or none). `section` is a section or
  meeting title, or omitted for the day part above the first section.
- **`setState`:** `line` is the raw text of the line as the app read it, `n` its line number in that copy (1-based).
  `state` is one of `open`, `done`, `wontdo` (actions) or `open`, `discussed`, `postponed` (topics). Deferring to
  another day is not in the first version (section 13.5).
- **Changing a pending request:** until ChronoNote has handled a request, the app may change or remove it (it is the
  only writer). So a line added on the phone and then ticked off before reaching the laptop is one `addLine` with the
  final state, and requests never need to point at each other.

## 6. Applying requests

### 6.1 When

- When the app starts, when its window regains focus (where §6.4 already checks for external changes), and when the
  inbox's content hash differs from the last one handled.
- From the command palette: "Apply phone changes".
- Only when the feature is turned on (section 13.7) and only on the desktop app (section 9).

### 6.2 Finding the target

**`setState`:** in the note for `date`, within the section whose matching title equals that of `section`:

1. Lines whose text equals `line` exactly. One match: that line. Several: the one at `n` if it is one of them,
   otherwise a conflict.
2. No exact match, but one line with the same text apart from its leading symbol: if that line is already in the
   requested state, the result is `applied` (nothing to do: it was ticked off on the laptop too); otherwise a conflict.
3. Otherwise (the line was reworded, moved to another section or deleted): a conflict.

**`addLine`:**

- The line goes after the last non-blank line of the section's body. In the day part it goes before the first section.
- The section doesn't exist yet but the day's `.agenda.json` has the meeting: the section is created in agenda order,
  the way calendar sync places a new meeting, and the line goes under it.
- The section exists neither in the note nor in the agenda: the section is created at the end of the note.
- The note for the date doesn't exist yet: it is created (as opening an empty future day with meetings does now).
- An `addLine` never conflicts.

### 6.3 Writing

- **The note is open in a tab:** the change goes into the editor as one transaction, as an edit from the Action Drawer
  does, so it shows straight away, can be undone and is saved by autosave.
- **The note isn't open:** read, change, write with the expected-hash check. If the file changed in between, start
  again from step 6.2.
- Before the first change to a note in a run, its current text is kept as an earlier version (§6.6), so the whole run
  can be undone from "Earlier versions…".

### 6.4 Results

The outbox's `results` lists one result per request ChronoNote has seen:

```json
"results": [
  { "id": "6f0c…", "result": "applied", "at": "2026-10-29T09:01:03+01:00" },
  { "id": "a91d…", "result": "conflict", "reason": "lineChanged", "at": "2026-10-29T09:01:03+01:00" } ]
```

- Results: `applied`, `conflict` (waits for Marien), `rejected` (Marien chose not to apply it, or the request was
  invalid: unknown type, bad date, newer format).
- The outbox is written after the changed notes, so a result never arrives before its change is on disk. OneDrive may
  still upload the outbox first; the app then shows "applied" next to the old line until its next refresh.
- **The list of handled IDs is kept in ChronoNote's own state** (in the app's data folder, per notes folder), not only
  in the outbox. If the outbox is lost, requests still in the inbox are not applied twice.
- An ID is removed from that list and from `results` once it no longer appears in the inbox.

### 6.5 What Marien sees

- Clean results: a toast, "3 changes from your phone applied", with a button that lists them.
- Conflicts: a toast that stays, "1 change from your phone needs a look", which opens a dialog. Per request it shows
  what the phone asked, the line as it was on the phone, and the section as it is now. Choices: **Apply to this line**
  (pick the line), **Add as a new line** (for an action), **Skip** (`rejected`). A conflict that is left alone stays in
  the dialog and in `results` as `conflict`.

## 7. The phone side's protocol

1. On refresh, read `outbox.json` and look at its `results`.
2. Remove `applied` and `rejected` requests from `inbox.json`, keeping a short local history so the app can show
   "applied" or "skipped" for a while.
3. Keep `conflict` requests, marked as such, without letting them be edited. They stay until ChronoNote reports
   `applied` or `rejected`.
4. Write `inbox.json` back only when it changed.

The app is the only writer. Using it on two devices at the same time would make two writers; the app guards against
that by reading `inbox.json` back before each write and merging by `id`.

## 8. The Power App (outside the repo)

Built in Power Apps Studio. Its export (`.msapp`) and the flows' exports are kept in `tools/mobile-companion/` so they
are versioned, even though CI can't test them.

**Flows** (Power Automate, standard connectors):

- `ChronoNote – list`: *List files in folder* for the notes folder; responds with name and modified time of the
  `YYYY-MM-DD.txt` files, `.agenda.json` and `outbox.json`.
- `ChronoNote – read`: takes a list of file paths; *Get file content using path* for each (in an *Apply to each* with
  parallel runs on), responds with `[{ "name", "text" }]`.
- `ChronoNote – write inbox`: takes the full inbox text; *Create file* or *Update file*. Concurrency 1.

**Refresh:** list, then read only the files that are needed (the window, the outbox's occurrence dates, the agenda,
the outbox) and changed since the app's last refresh. Everything else comes from the copy on the device. The first
refresh reads them all.

**Screens:**

1. **Days:** today and the coming days in the window, each with its meetings (from the notes and the agenda) and open
   counts, and earlier days further down.
2. **Day:** the note drawn with glyphs by kind and state. Tap a meeting for its history.
3. **Meeting:** one occurrence at a time, with previous/next through its occurrences and a "Show done" switch.
4. **Line menu** (tap an action or topic): the states it can move to.
5. **Add:** type (action, topic, note, emphasis, delegated with `@name`), text, day and meeting, defaulting to the
   meeting being viewed.
6. **Pending:** the inbox with each request's state.

**Offline:** the files read last are kept on the device with `SaveData`/`LoadData`, so the app can show everything
without a connection; requests made offline wait there and are sent once there's a connection.

## 9. ChronoNote side: build notes

- **A new module** above the `TauriCommands` contract (for example `src/lib/mobileCompanion/`): the index (pure: notes
  in, meetings and occurrences out, reusing the occurrence matching), request matching (pure), applying (through the
  editor or the backend), and results/ledger. The pure parts carry most of the tests.
- **Backend commands:** read and write a file under `.chrononote-mobile/`, with the same validation and atomic write
  as conflict copies. Rust in `storage.rs`, the mock in `mockBackend.ts`, cases in `storage-cases.json`.
- **Desktop only.** The web app never processes the inbox (section 13.6). The demo can show a scripted inbox for the
  website.
- **Settings:** "Phone companion", an opt-in switch under Notes & Sync, off by default (section 13.7). The window and
  the number of earlier occurrences are fixed (section 13.1).
- **Spec and guide:** a reference file for the two formats and the phone's parsing subset (section 4.4), in the style
  of `docs/agenda-file-guide.md`, precise enough to build the app from. A spec section and a short guide entry.
- **Tests:** unit tests for the index (meetings across the window edge, date-in-title occurrences, ad-hoc `'`
  sections) and for matching (duplicates, rewording, an already-done line, a missing section or note), Playwright for
  the toast and conflict dialog against the mock, and an independent test writer from this brief.

## 10. Later, not in the first versions

- Defer to another day (`>` with its forward link, through the existing forward code) and set a due date.
- Edit a line's text (a `setText` request using the same matching as `setState`).
- A SharePoint list (standard licence) or Dataverse (premium) as a phone-side copy, filled by a flow from the notes,
  for faster browsing and search across all history. ChronoNote doesn't change.
- Today's meetings straight from Outlook in the app, for meetings `.agenda.json` doesn't have yet.

## 11. Phases

0. **Stopgap (no ChronoNote change):** the To Do flow that appends to note files directly. Switched off once phase 2
   works.
1. **Read only:** the outbox's index, the list and read flows, and the app's Days, Day and Meeting screens. Useful on
   its own for preparing meetings. The window's days work even before ChronoNote writes the index.
2. **Proposals:** `addLine` and `setState`, results, the toast and the conflict dialog, the app's Add, Line menu and
   Pending screens.
3. **Section 10**, as needed.

## 12. Risks

- **Two laptops processing the same inbox.** If the notes folder were ever synced to a second machine running
  ChronoNote with the feature on, both could apply a request before either one's state has synced. Only one laptop
  has it on (section 13.6).
- **OneDrive delay.** A request reaches the laptop only after the OneDrive client has synced the inbox; notes and the
  outbox reach the phone only after the laptop has uploaded them. Minutes, normally.
- **A large notes folder.** *List files in folder* returns a limited number of files per call. With years of daily
  notes the list flow may need paging, or a search on the file names of the dates it needs. To check in phase 1.
- **The phone's parser drifts from ChronoNote's rules.** Display only (section 4.4); the reference file is the
  agreement, and a ChronoNote syntax change means checking the app.
- **Organisation policies.** A data policy (DLP) can block a connector, and an organisation can limit Power Apps. Checked in phase 1
  with the list and read flows before anything else is built.
- **The Power App is maintained by hand.** Format changes need a matching change in the app; the `format` number makes
  a mismatch visible instead of silent.

## 13. Decisions on the open questions (Marien, 2026-10-29)

1. **History:** a window of 14 days back and 14 ahead; the last 5 earlier occurrences per meeting.
2. **Clean changes** are applied without asking; only conflicts need a look.
3. **What can be added:** action, topic, note, emphasis and delegated `=> @name`.
4. **An added line goes** at the end of its section.
5. **Deferring** an action to another day from the phone comes later (section 10), not in phase 2.
6. **One machine:** only one laptop processes the inbox. The web app never does: the whole reason for this design is
   that the web app can't reach the organisation's OneDrive.
7. **Name and switch:** "Phone companion" in Settings → Notes & Sync, off by default.
8. **A new meeting's history:** the index is refreshed when the window's meetings change, both through a new section
   title in a note and through meetings added or moved in `.agenda.json` during the day (section 4.2).
