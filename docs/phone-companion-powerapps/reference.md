# Reference

You are building the phone side of a notes app: a Power Apps canvas app (phone layout) plus a few Power Automate
flows that read a folder of plain-text notes in OneDrive for Business and, in phase 2, propose changes to them. This
file is the shared reference for every phase; the phase file says what to build now. Where this reference and a
phase file seem to disagree, ask the user before building.

## 1. The system you are part of

- **ChronoNote** is a desktop app on the user's laptop. It keeps one note per day as a text file `YYYY-MM-DD.txt` in
  a notes folder that OneDrive syncs. It is the **only program that edits notes**.
- **The phone app (yours)** reads the notes through flows, shows them, and in phase 2 writes *requests* (add a line,
  change an action's state) to one file, `inbox.json`. ChronoNote applies them and reports the outcome in
  `outbox.json`.
- The user's organisation allows only Microsoft apps on the phone, so everything goes through Power Apps, Power
  Automate and the OneDrive for Business connector.

## 2. Ground rules

1. **Never write, rename or delete** a note (`*.txt`), `.agenda.json` or `.chrononote-mobile/outbox.json`. The only
   file the app ever writes is `.chrononote-mobile/inbox.json`, and only from phase 2 on.
2. **Standard connectors only:** OneDrive for Business, plus the Power Apps trigger and response actions. No premium
   connectors, no Dataverse, no custom connectors, no HTTP actions, no SharePoint lists.
3. **Offline first:** the app shows the copy on the device at once and keeps working without a connection
   (`SaveData`/`LoadData`).
4. **No delegation:** all data is in local collections; no data source is queried with delegable functions.
5. **The notes folder path lives only in the flows**, as the first action of each flow (a *Compose* or variable named
   `NotesPath`), so the user changes it in one place per flow.
6. Behaviour comes from these files. If something is unclear or seems wrong, ask the user; don't invent behaviour.

## 3. What is already verified in the user's environment

The user ran a feasibility check with throwaway flows and a test app on the real folder and phone:

| Check | Result |
| :--- | :--- |
| Data policy (DLP) | No error with OneDrive for Business in flows called from Power Apps. |
| *List files in folder* | Returned all 198 notes; about 0.8 s from the phone. |
| Reading 30 notes in one flow run | About 10 s from the phone (*Apply to each*, concurrency 20, *Append to array variable* inside it: accepted). |
| *Get file content using path* | Returns readable text (no base64 decoding needed). |
| `ParseJSON` of the flow's text response, a gallery over the result | Works. |
| `SaveData`/`LoadData` | Work on the phone, also in flight mode. |
| *Create file* into `.chrononote-mobile/` | Creates the folder when missing, and overwrites an existing file. |
| Pasting YAML into Studio | Works: select a screen in the Tree view, Ctrl+V; edited YAML text also pastes. |

The user's feedback: "felt a bit slow". Reading files is the slow part, so read as few as possible (each phase says
how).

## 4. How to deliver

- **Before writing app code,** ask the user for a sample: a blank screen with a vertical gallery, a text input, a
  button and a label, then "View code" on the screen and "Copy code". Match that YAML schema exactly.
- **Screens and controls:** one YAML block per screen (or component), ready to paste. Name controls meaningfully
  (`galDays`, `lblUpdated`).
- **App-level formulas** (`App.Formulas` named formulas, user-defined functions if the user's Studio supports them,
  `App.OnStart`): as text to paste into that property, with a note on where.
- **Flows:** click-by-click steps with every expression written out exactly. Don't produce flow packages to import.
- Work in small steps the user can paste and check one at a time: flows first, then app formulas, then one screen at
  a time.
- All labels in the app are in English unless the user asks otherwise.

## 5. Files in the notes folder

All paths are relative to the notes folder (`NotesPath`).

| File | Written by | The app |
| :--- | :--- | :--- |
| `YYYY-MM-DD.txt` | ChronoNote | reads |
| `.agenda.json` | an external calendar feed | reads |
| `.chrononote-mobile/outbox.json` | ChronoNote | reads |
| `.chrononote-mobile/inbox.json` | the app (phase 2) | writes |

Other files and folders in the notes folder (for example `.chrononote-versions/`, `.chrononote-trash/`,
`.chrononote-conflicts/`, a `README`) are ignored. A note is a file whose name is exactly `YYYY-MM-DD.txt`; nothing
else counts.

## 6. Reading a note

### 6.1 Text and lines

- UTF-8. Remove a byte-order mark (`Char(65279)`) at the start if present.
- Split on line feed (`Char(10)`); remove a carriage return (`Char(13)`) at the end of each line. Line numbers count
  from 1 on this split; phase 2 refers to lines by these numbers.
- Indentation is spaces, two per level.

### 6.2 Sections

- A line whose text, trimmed of spaces at both ends, is three or more `=` and nothing else is a **section
  underline**. The line above it, if not blank and not itself an underline, is the **section title** (trimmed). The
  section runs from the line after the underline to the line before the next section title.
- Lines before the first section title are the **day part** (no title).
- A title starting with `'` or `’` is an **ad-hoc section** (an unplanned call): shown like any other section, never
  treated as a meeting.
- A line whose trimmed text is three or more `-` under a non-blank line makes that line a **sub-heading** inside the
  current section, not a new section.
- The same meeting can appear twice in one day; treat the first as that day's occurrence.

### 6.3 Line kinds

Look at the line after its leading spaces. Every token is followed by one space.

| Starts with | Kind | State |
| :--- | :--- | :--- |
| `#` | action | open |
| `v` | action | done |
| `x` | action | won't do |
| `>` | action | deferred (moved to another day) |
| `o` | topic (to discuss) | open |
| `.` | topic | discussed |
| `,` | topic | postponed |
| `=>` followed by `#`, `v`, `x` or `>` | action (a follow-up action) | as that symbol |
| `=>` followed by `@name` | delegated (to that person) | none |
| `=>` otherwise | follow-up | none |
| `-` or `*` | bullet | none |
| `!` | emphasis (draw bold) | none |
| a blank line | blank | none |
| anything else | text | none |

The line's **body** is what follows its token(s). Optional extras inside an action or topic body, which the app may
draw specially or leave as text:

- `(topic)` right after the action symbol: a topic tag (for example `# (budget) send numbers`).
- `by:YYYY-MM-DD`: a due date.
- `(>YYYY-MM-DD#Section)` and `(<YYYY-MM-DD#Section)`: links to where the line moved to or came from.
- `@name`: a person.

### 6.4 Example note

```
Check mail before 10

[09:00 - 09:30] Weekly Sync
===========================
o hiring plan
. budget for Q1
# (budget) send the numbers to Dana by:2026-11-03
v book the room
=> @Sam prepare the slides
  - two options
> ask legal (>2026-11-05#Weekly Sync)

Architecture review
===================
Decisions
---------
! keep the old API until March
x rewrite the importer

'Call with Dana 14:10
=====================
- she agrees
```

Line 1 is the day part. Line 3 is the title of meeting `Weekly Sync`; line 4 its underline. Line 9 is a delegated
line with a nested bullet (line 10). Line 15 (`Decisions`) is a sub-heading. The last section is ad-hoc.

## 7. Matching meetings across days

A recurring meeting has the same title every time, apart from decorations. Two titles are **the same meeting** when
they are equal, ignoring case, after removing, in this order:

1. a leading time range: regex `^\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\]\s*`;
2. a leading `[CANCELED]`: regex `^\[CANCELED\]\s*`; then trim;
3. a date at the start with an optional `-` or `:` after it: regex `^\d{4}-\d{2}-\d{2}\s*[-:]?\s*`;
4. a date at the end with an optional `-` or `:` before it: regex `\s*[-:]?\s*\d{4}-\d{2}-\d{2}$`; then trim.

The result is the **matching title**. An empty matching title, and an ad-hoc title, is never a meeting. Example:
`[09:00 - 09:30] Weekly Sync`, `weekly sync 2026-10-29` and `2026-10-29: Weekly Sync` are one meeting.

## 8. `.agenda.json` (the calendar)

Written by an external feed. Either a plain array, or an object `{ "timezone": "…", "meetings": [ … ] }`. Each
meeting has four strings:

```json
[
  { "date": "2026-10-30", "start": "09:00", "end": "09:30", "title": "Weekly Sync" },
  { "date": "2026-10-30", "start": "11:00", "end": "12:00", "title": "Canceled: Design review" }
]
```

- Use `date` as the meeting's day and `start` for ordering. Ignore `timezone` (the app may show a meeting near
  midnight on the neighbouring day; acceptable).
- A title starting with `Canceled:`, `Cancelled:`, `Declined:`, `Followed:` or `Following:` is a **removed** meeting:
  never show it.
- A title starting with `Placeholder` or `Confirmed` followed by `:`, `-` or `--` has a status word: remove the word
  and the separator, then trim.
- Both rules are case-sensitive and only at the very start of the title.
- A missing or unreadable file means "no agenda"; never an error the user must act on.
- An agenda meeting already has a section in that day's note when its cleaned title equals a section's title after
  removing the time range and `[CANCELED]` from the section title (steps 1 and 2 of section 7), ignoring case.

## 9. `outbox.json` (written by ChronoNote)

Path `.chrononote-mobile/outbox.json`. Rewritten whenever its content changes; may be missing (ChronoNote's phone
companion setting is off).

```json
{
  "format": 1,
  "generatedAt": "2026-10-29T08:40:12+01:00",
  "appVersion": "0.36.0",
  "window": { "from": "2026-10-15", "to": "2026-11-12" },
  "meetings": [
    { "key": "m-3f9a1c", "title": "Weekly Sync", "occurrences": [
      { "date": "2026-09-10", "title": "Weekly Sync" },
      { "date": "2026-10-22", "title": "[09:00 - 09:30] Weekly Sync" },
      { "date": "2026-10-29", "title": "Weekly Sync 2026-10-29" } ] }
  ],
  "results": [
    { "id": "6f0c8a52-1d7e-4b8e-9a51-0c3f2b7d9e11", "result": "applied", "at": "2026-10-29T09:01:03+01:00" }
  ]
}
```

| Field | Meaning |
| :--- | :--- |
| `format` | 1. A higher number: the app must not use the file and shows "Update the app". |
| `window` | 14 days before ChronoNote's today up to 14 days after, inclusive. |
| `meetings` | Every meeting with a section in a note inside the window, or on the agenda inside the window. Sorted by title, ignoring case. |
| `key` | A stable id per meeting. Don't derive anything from it. |
| `title` | Display title (the latest occurrence's matching title, or the agenda title). |
| `occurrences` | Oldest first: every day in the window with a section for this meeting, plus the 5 most recent days before the window, however far back. `title` is the section title exactly as written that day (trimmed), so the app finds the section by plain comparison. |
| `results` | Phase 2: outcomes of inbox requests (`phase-2.md`). |

Unknown fields must be ignored. The outbox can be behind the notes (a meeting added today may not be in it yet): the
app also looks at the window's notes itself.

## 10. Visual language

One glyph per line kind and state, in a fixed-width column before the body, so lines align:

| Kind / state | Glyph | Body style |
| :--- | :--- | :--- |
| action open | ☐ | normal |
| action done | ☑ | grey, strikethrough |
| action won't do | ☒ | grey, strikethrough |
| action deferred | ➜ | grey |
| topic open | ○ | normal |
| topic discussed | ● | grey |
| topic postponed | ◐ | grey |
| follow-up | ⇒ | normal |
| delegated | ⇒ | normal, `@name` bold |
| bullet | • | normal |
| emphasis | (none) | bold |
| text | (none) | normal |
| section title | (none) | bold, larger, with space above |
| sub-heading | (none) | bold |

Indent each line by its level (about 16 px per level). Underline lines (`===`, `---`) are never shown. Use the app's
default light theme, body text at least 14 pt, touch targets at least 44 px high. A "Show done" switch (one,
app-wide, remembered on the device) hides done and won't-do actions and discussed topics, and the lines nested under
them.

## 11. Power Fx hints

- Don't use `Trim` on note lines: it also collapses spaces inside the text. Use `TrimEnds`, or `Match` with a regex.
- Indent and rest of a line: `Match(line, "^( *)(.*)$")`.
- Build line records with `ForAll(Sequence(CountRows(lines)), …)` and `Index(lines, Value).Value`, giving each record
  its 1-based line number `n`.
- A line's section: compute the titles first (line numbers where the next line is an underline), then each line's
  section is the last title whose number is lower. Parse only the notes on screen, not the whole folder.
- Dates: `Text(d, "yyyy-mm-dd")` for file names; `DateValue` with the ISO string to go back.
- `GUID()` makes request ids in phase 2.
