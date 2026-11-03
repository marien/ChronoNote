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

## 10. Look: like ChronoNote

The app should read as ChronoNote at a glance: the same symbols, colours and themes. For a visual reference, open the
live demo on the website `chrononote.mariendegelder.nl` ("Try it") in a browser at phone width.

### 10.1 Themes and colours

Two themes, **dark by default**, with a Dark/Light switch on the Days screen remembered on the device (canvas apps
can't reliably follow the phone's own setting). Define every colour once as a named formula (for example a record
`Theme` chosen by the switch) and use only those in controls.

| Token | Dark | Light | Used for |
| :--- | :--- | :--- | :--- |
| canvas | `#1E1E1E` | `#FFFFFF` | screen background, note area |
| chrome | `#252526` | `#F3F3F3` | top bar, status line, bottom bars |
| raised | `#37373B` | `#E7E7E7` | pressed rows, buttons, chips |
| edge | white at 7% | black at 9% | dividers between rows |
| text | `#D4D4D4` | `#1B1B1B` | note text, titles |
| muted | `#A6A6A6` | `#5F5F5F` | secondary text, agenda-only meetings |
| tertiary | `#949494` | `#757575` | the rules under titles, captions |
| accent | `#0A74C2` | `#0A6FC2` | selected items, primary buttons (white text) |
| open | `#FF6B6B` | `#D9383A` | open action box, open topic ring |
| done | `#51CF66` | `#2B8A3E` | done action box and check, discussed topic |
| progress | `#E5A50A` | `#B25E00` | deferred action box and chevron, postponed topic |
| cancelled | `#868E96` | `#5C636A` | won't-do box and cross |
| follow-up | `#0098FF` | `#0066B8` | the ➔ arrow |
| person | `#29A8FF` on `#007ACC` at 15% | `#0066B8` on `#0066B8` at 12% | `@name` badge |
| emphasis | `#FFD43B` | `#F08C00` | emphasis line text |
| error | `#D66B63` | `#C4463E` | "Couldn't refresh" |

### 10.2 Fonts and sizes

- **Note text** (lines, titles, bodies): monospace, as in ChronoNote: `Font.'Courier New'`, 14 to 15 pt. Check it on
  the phone; if it renders poorly there, use `Font.'Segoe UI'` and say so.
- **App text** (bars, buttons, dates, status): `Font.'Segoe UI'`. Screen titles 20 pt semibold, body 14 pt,
  captions 12 pt in muted.
- Line height about 1.6 × the font size. Touch targets at least 44 px high.

### 10.3 Symbols

Each line's symbol sits in a fixed-width column (two monospace characters wide; three for the ➔ arrow) before the
body, so text aligns as in ChronoNote. Indent each level by two monospace characters.

Actions and topics are **drawn shapes, not font characters**. The seven SVGs below are complete: copy each one as it
is and only replace every `C` (there are one or two) with the colour's hex value from 10.2, `#` included, in the
current theme. They use single quotes, so they fit inside a Power Fx string as they are.

Two ways to show them, both fine:

- **Inline in an HtmlText control** (the line drawn as HTML): put the SVG in the HTML and give the `<svg>` element a
  size and baseline, for example insert `width='0.7em' height='0.7em' style='vertical-align:-0.05em'` after `<svg`
  for a box, and `0.66em` for a ring (ChronoNote draws rings a little smaller, because a circle of the same size reads
  larger). Follow it with a gap so the body starts two monospace characters after the symbol's start.
- **As an Image control:** `Image = "data:image/svg+xml;utf8," & EncodeUrl(svg)`, about 0.7 × the font size square
  (0.66 × for rings), its bottom on the text's baseline.

Where they come from: ChronoNote draws the box and ring with a CSS border and the mark with an SVG mask
(`src/styles/03-editor.css`, the `.glyph-*` rules, see section 12). These SVGs put the same shapes in one picture:
a 16 × 16 box with a 1.6 stroke and corner radius 1.5, the mark scaled to 0.7 inside it, and a ring of radius 6.3.

**action open** (colour: open), `# `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='1.2' y='1.2' width='13.6' height='13.6' rx='1.5' fill='none' stroke='C' stroke-width='1.6'/></svg>
```

**action done** (colour: done), `v `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='1.2' y='1.2' width='13.6' height='13.6' rx='1.5' fill='none' stroke='C' stroke-width='1.6'/><g transform='translate(2.4 2.4) scale(0.7)' fill='none' stroke='C' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 8.6l3.4 3.4 6.6-8'/></g></svg>
```

**action won't do** (colour: cancelled), `x `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='1.2' y='1.2' width='13.6' height='13.6' rx='1.5' fill='none' stroke='C' stroke-width='1.6'/><g transform='translate(2.4 2.4) scale(0.7)' fill='none' stroke='C' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'><path d='M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8'/></g></svg>
```

**action deferred** (colour: progress), `> `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='1.2' y='1.2' width='13.6' height='13.6' rx='1.5' fill='none' stroke='C' stroke-width='1.6'/><g transform='translate(2.4 2.4) scale(0.7)' fill='none' stroke='C' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'><path d='M5.6 2.8l5.2 5.2-5.2 5.2'/></g></svg>
```

**topic open** (colour: open), `o `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6.3' fill='none' stroke='C' stroke-width='1.6'/></svg>
```

**topic discussed** (colour: done), `. `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6.3' fill='none' stroke='C' stroke-width='1.6'/><circle cx='8' cy='8' r='3.4' fill='C'/></svg>
```

**topic postponed** (colour: progress), `, `

```
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6.3' fill='none' stroke='C' stroke-width='1.6' stroke-dasharray='2.6 1.8'/></svg>
```

The same symbols appear wherever a line's state is shown: the meeting screen, the Add screen's preview, the Pending
list and the line menu (phase 2).

The rest are characters in the note font:

| Line | Symbol | Style |
| :--- | :--- | :--- |
| follow-up, delegated (`=>`) | ➔ | follow-up colour, bold |
| bullet (`-`, `*`) | • | text colour |
| `@name` in any line | the name with its `@` | person colour, semibold, on its badge background, small rounded corners |
| emphasis (`!`) | (no symbol, the `!` is hidden) | emphasis colour, bold |
| text, follow-up body | as written | text colour |

The **body text keeps the text colour in every state**: ChronoNote shows a done or won't-do line's state by its box,
not by greying or striking through the text.

### 10.4 Titles

- A **section title** is drawn as its text in the note font, text colour, with a **double rule** under it in
  tertiary: two 1 px lines about 2 px apart, the width of the note area (this is how ChronoNote draws the `===`
  line). Some space above each title except the first.
- A **sub-heading** is its text with a **single** 1 px tertiary rule under it (the `---` line).
- The underline characters themselves are never shown.

### 10.5 Layout

- **Top bar** in chrome: back button where there is one, the screen's title (a date like "Thu 30 Oct", or a meeting
  title) in 20 pt semibold, and the screen's buttons on the right as icons.
- **Status line** under the top bar in chrome, 12 pt muted ("Updated 08:40").
- **Content** on canvas, with 16 px side margins. Lists (Days screen) have rows separated by edge-coloured dividers;
  a pressed row shows raised.
- **Show done:** one switch, app-wide, remembered on the device, hides done and won't-do actions and discussed
  topics, and the lines nested under them.

## 11. Power Fx hints

- Don't use `Trim` on note lines: it also collapses spaces inside the text. Use `TrimEnds`, or `Match` with a regex.
- Indent and rest of a line: `Match(line, "^( *)(.*)$")`.
- Build line records with `ForAll(Sequence(CountRows(lines)), …)` and `Index(lines, Value).Value`, giving each record
  its 1-based line number `n`.
- A line's section: compute the titles first (line numbers where the next line is an underline), then each line's
  section is the last title whose number is lower. Parse only the notes on screen, not the whole folder.
- Dates: `Text(d, "yyyy-mm-dd")` for file names; `DateValue` with the ISO string to go back.
- `GUID()` makes request ids in phase 2.

## 12. Sources in the repository

ChronoNote is open source. When a detail here is unclear, these files are the ground truth (this reference wins
where they seem to differ; then ask). The links point at the `feat/phone-companion` branch; once it is merged, the
same paths are on `main`.

| What | File |
| :--- | :--- |
| These instructions | [docs/phone-companion-powerapps/](https://github.com/marien/ChronoNote/tree/feat/phone-companion/docs/phone-companion-powerapps) |
| The design and its reasons (outbox, inbox, phases, risks) | [docs/design/mobile-companion-design.md](https://github.com/marien/ChronoNote/blob/feat/phone-companion/docs/design/mobile-companion-design.md) |
| The file formats (the agreement both sides build against) | [docs/phone-companion-file-guide.md](https://github.com/marien/ChronoNote/blob/feat/phone-companion/docs/phone-companion-file-guide.md) |
| The calendar file in full (timezone rules, validation) | [docs/agenda-file-guide.md](https://github.com/marien/ChronoNote/blob/feat/phone-companion/docs/agenda-file-guide.md) |
| The note syntax and every behaviour (section 2.2: tokens) | [docs/spec.md](https://github.com/marien/ChronoNote/blob/feat/phone-companion/docs/spec.md) |
| The user guide, with the syntax as users learn it | [website/guide.html](https://github.com/marien/ChronoNote/blob/feat/phone-companion/website/guide.html) |
| How ChronoNote builds the outbox | [src/lib/phoneCompanion.ts](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/lib/phoneCompanion.ts) |
| Sections and title matching (`isSetextUnderline`, `normalizeHeaderTitle`, `titleForMatching`) | [src/lib/tokens.ts](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/lib/tokens.ts) |
| Line kinds | [src/lib/lineKind.ts](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/lib/lineKind.ts) |
| Agenda title rules (removed meetings, status words) | [src/lib/agendaTitles.ts](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/lib/agendaTitles.ts) |
| Symbols per token | [src/lib/grammar/glyphs.ts](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/lib/grammar/glyphs.ts) |
| Colours (dark, light, colour and grayscale modes) | [src/styles/01-tokens.css](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/styles/01-tokens.css) |
| How the symbols and title rules are drawn | [src/styles/03-editor.css](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/styles/03-editor.css) |
| How the phone web app lays things out | [src/styles/09-mobile.css](https://github.com/marien/ChronoNote/blob/feat/phone-companion/src/styles/09-mobile.css) |

The live demo (`chrononote.mariendegelder.nl`, "Try it") shows all of it running, also at phone width.
