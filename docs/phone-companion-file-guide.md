# The phone companion files: `outbox.json` and `inbox.json`

A reference for building the phone side of the phone companion (a Power App with a few Power Automate flows, or
anything else that can read and write files in OneDrive). It is meant to be precise enough to build from: every rule
below is what ChronoNote does or expects. The design and its reasons are in
`docs/design/mobile-companion-design.md`; the calendar feed is described in `docs/agenda-file-guide.md`.

Status: draft, on the `feat/phone-companion` branch. Nothing here is built yet; this file is the agreement the code
and the app are built against.

## 1. Who writes what

| File | Written by | Read by |
| :--- | :--- | :--- |
| `YYYY-MM-DD.txt` (the notes) | ChronoNote only | ChronoNote, phone |
| `.agenda.json` | the external calendar feed | ChronoNote, phone |
| `.chrononote-mobile/outbox.json` | ChronoNote only | phone |
| `.chrononote-mobile/inbox.json` | the phone side only | ChronoNote |

All paths are relative to the root of the notes folder. **The phone never writes a note file**; it proposes changes in
the inbox and ChronoNote makes them. ChronoNote never writes, renames or deletes `inbox.json`.

Both companion files are UTF-8 JSON without a byte-order mark. Each starts with `"format": 1`. A reader that finds a
higher `format` than it knows must not use the file (the app shows "update the app"; ChronoNote reports every request
as `rejected` with reason `format`). Fields not described here must be ignored, so either side can add fields later
without a format change.

## 2. `outbox.json`

```json
{
  "format": 1,
  "generatedAt": "2026-10-29T08:40:12+01:00",
  "appVersion": "0.36.0",
  "window": { "from": "2026-10-15", "to": "2026-11-12" },
  "meetings": [
    { "key": "m-3f9a1c", "title": "Weekly Sync", "occurrences": [
      { "date": "2026-09-10", "title": "Weekly Sync" },
      { "date": "2026-10-22", "title": "Weekly Sync" },
      { "date": "2026-10-29", "title": "Weekly Sync 2026-10-29" } ] }
  ],
  "results": [
    { "id": "6f0c8a52-1d7e-4b8e-9a51-0c3f2b7d9e11", "result": "applied", "at": "2026-10-29T09:01:03+01:00" },
    { "id": "a91d3c07-5e2f-4a6b-8c90-7b1e4d2f6a38", "result": "conflict", "reason": "lineChanged",
      "at": "2026-10-29T09:01:03+01:00" }
  ]
}
```

| Field | Meaning |
| :--- | :--- |
| `generatedAt` | When ChronoNote wrote the file, local time with offset. |
| `appVersion` | The ChronoNote version that wrote it (informational). |
| `window` | The days ChronoNote considered: 14 days before today up to 14 days after, both included. |
| `meetings` | Every meeting in the window (section 2.1). Sorted by `title`. |
| `results` | One entry per request ChronoNote has handled that is still in the inbox (section 4). |

### 2.1 Meetings

- **Which meetings:** every section title in a note inside the window, and every meeting in `.agenda.json` on a day
  inside the window (after the agenda's own title rules, section 6.2, leaving out removed meetings). Ad-hoc sections
  (titles starting with `'` or `’`) and the day part are not meetings and are not listed.
- **`key`:** a stable identifier, `m-` plus 6 hex characters, the same for all occurrences of one meeting and across
  outbox writes. Use it to tell meetings apart; don't derive anything from it.
- **`title`:** the meeting's title as of its most recent occurrence, for display.
- **`occurrences`:** oldest first. Every occurrence inside the window, plus the 5 most recent ones before the window,
  however far back. An occurrence is a day whose note has a section for this meeting. A meeting that is only on the
  agenda so far has no occurrence for that day yet.
- **Occurrence `title`:** the section title exactly as written in that day's note (trimmed). The phone finds the
  section by comparing this with the titles it parses (section 5.2), so it needs none of ChronoNote's matching rules.

Two titles are the same meeting when they are equal after ChronoNote removes a leading time range
(`[09:00 - 09:30] `), a leading `[CANCELED] `, and a date (`YYYY-MM-DD`) at the start or end of the title together
with a `-` or `:` next to it. So `Weekly Sync`, `Weekly Sync 2026-10-29` and `2026-10-29: Weekly Sync` are one meeting.

### 2.2 When it is written

When ChronoNote starts, after it has processed the inbox, when the day changes, and when the set of meetings in the
window changes (a section title added or renamed in a note, or a meeting added or moved in `.agenda.json`). Not for
ordinary edits. Only when its content (apart from `generatedAt`) changed. Written atomically: a reader sees the old
file or the new one, never half of one.

The outbox can be behind the notes. That is expected: a new occurrence is always inside the window, and the phone
reads the window's notes directly.

## 3. `inbox.json`

```json
{
  "format": 1,
  "writer": "powerapps",
  "requests": [
    { "id": "6f0c8a52-1d7e-4b8e-9a51-0c3f2b7d9e11", "made": "2026-10-29T08:02:11+01:00", "type": "addLine",
      "date": "2026-10-30", "section": "Weekly Sync", "text": "o hiring plan" },
    { "id": "a91d3c07-5e2f-4a6b-8c90-7b1e4d2f6a38", "made": "2026-10-29T08:03:40+01:00", "type": "setState",
      "date": "2026-10-22", "section": "Weekly Sync", "line": "# send the numbers to Dana", "n": 7,
      "state": "done" }
  ]
}
```

Common fields:

| Field | Meaning |
| :--- | :--- |
| `writer` | A name for the program writing the inbox (informational). |
| `id` | A GUID made by the phone, unique for all time. ChronoNote never handles the same `id` twice. |
| `made` | When the request was made, local time with offset (informational, shown in ChronoNote's dialogs). |
| `type` | `addLine` or `setState`. |
| `date` | The note's day, `YYYY-MM-DD`. |
| `section` | The section's title, as written in the note or as on the agenda. Leave it out for the day part (the lines above the first section). |

Requests are handled in the order listed.

### 3.1 `addLine`

| Field | Meaning |
| :--- | :--- |
| `text` | The new line, including its token: `# ` action, `o ` topic, `! ` emphasis, `- ` bullet, `=> @name ` delegated, or none for plain text. One line: no line breaks. At most 1000 characters. |

ChronoNote adds the line after the last non-blank line of the section. If the note has no such section but that day's
agenda has the meeting, the section is created where calendar sync would put it; otherwise at the end of the note. If
the note doesn't exist, it is created. An `addLine` never conflicts.

### 3.2 `setState`

| Field | Meaning |
| :--- | :--- |
| `line` | The line's whole text as the phone read it, indentation included. |
| `n` | Its line number in that copy of the note, counting from 1. |
| `state` | For an action: `open` (`# `), `done` (`v `), `wontdo` (`x `). For a topic: `open` (`o `), `discussed` (`. `), `postponed` (`, `). |

The state belongs to the line's first symbol after the indentation (section 5.3); a line starting with `=> ` and an
action symbol counts as an action. ChronoNote replaces only that symbol and leaves the rest of the line as it is.

Refused (`rejected`, reason `invalid`): a state that doesn't fit the line's kind, a line that isn't an action or
topic, and a deferred action (`> `): it was forwarded to another day and changes there.

### 3.3 Changing a request before it is handled

The phone may change or remove a request until the outbox lists a result for its `id`. A line added on the phone and
ticked off before it reached ChronoNote is one `addLine` with its final text; requests never refer to each other.

## 4. Results and cleaning up

| `result` | Meaning | `reason` |
| :--- | :--- | :--- |
| `applied` | Done, or already so (the line had the requested state). | none |
| `conflict` | ChronoNote couldn't place it safely and holds it for the user. | `lineChanged` (no line with that text), `lineAmbiguous` (several, none at `n`) |
| `rejected` | Not applied: the user skipped it, or the request was invalid. | `skipped`, `invalid`, `format` |

The phone side, on each refresh:

1. Reads `outbox.json`.
2. Removes requests whose result is `applied` or `rejected` from the inbox (keeping its own history to show them).
3. Keeps `conflict` requests, without letting them be changed, until their result becomes `applied` or `rejected`.
4. Writes `inbox.json` back only if it changed. If more than one device runs the app, it first reads the inbox again
   and merges by `id`.

ChronoNote drops a result from the outbox once its `id` is no longer in the inbox.

## 5. Reading a note

The phone parses notes only to show them. Where it differs from ChronoNote, a line looks slightly wrong on the phone;
nothing else happens, because ChronoNote checks every request against the real file.

### 5.1 Files and lines

- Notes are the files named exactly `YYYY-MM-DD.txt` at the root of the notes folder; every other file is ignored.
- UTF-8. Drop a byte-order mark at the start if there is one.
- Split on `\n`; drop a `\r` at the end of a line. Line numbers (`n` in requests) count from 1 on this split.

### 5.2 Sections

- A line whose trimmed text is three or more `=` (and nothing else) is a **section underline**. The line above it, if
  not blank, is the section's **title** (trimmed). The section runs from the line after the underline to the line
  before the next title.
- Lines before the first title are the **day part**.
- A title starting with `'` or `’` is an **ad-hoc section**: shown like any other, never a meeting.
- A line whose trimmed text is three or more `-` under a non-blank line is a **sub-heading** inside the section, not a
  new section.

### 5.3 Line kinds

Look at the line after its leading spaces (indentation is two spaces per level):

| Starts with | Kind | State |
| :--- | :--- | :--- |
| `# ` | action | open |
| `v ` | action | done |
| `x ` | action | won't do |
| `> ` | action | deferred (forwarded to another day) |
| `o ` | topic | open |
| `. ` | topic | discussed |
| `, ` | topic | postponed |
| `=> ` + `#`, `v`, `x` or `>` + space | action (a follow-up action) | as that symbol |
| `=> ` | follow-up; delegated if an `@name` follows | none |
| `- ` or `* ` | bullet | none |
| `! ` | emphasis (shown bold) | none |
| anything else | text | none |

Optional extras the app may draw, all inside an action or topic line:

- `(topic)` right after the action symbol: a topic tag.
- `by:YYYY-MM-DD`: a due date.
- `(>YYYY-MM-DD#Section)` and `(<YYYY-MM-DD#Section)`: forward links (where the line went to, or came from).
- `@name`: a person.

Left as text they are still readable.

## 6. Reading `.agenda.json`

### 6.1 The file

Its format is in `docs/agenda-file-guide.md`: a list of meetings with `date`, `start`, `end` and `title`, optionally
wrapped as `{ "timezone": …, "meetings": [...] }`. When a `timezone` is given, convert as that guide says before using
`date` and `start`.

### 6.2 Titles

- A title starting with `Canceled:`, `Cancelled:`, `Declined:`, `Followed:` or `Following:` is a **removed** meeting:
  don't offer it.
- `Placeholder` or `Confirmed` followed by `:`, `-` or `--` at the start is a status word: drop it and the separator,
  then trim.
- Both rules are case-sensitive and only at the very start.

To tell whether a meeting already has a section in that day's note, compare the cleaned title with each section title
after removing a leading time range (`[09:00 - 09:30] `) and a leading `[CANCELED] ` from the section title. A meeting
with no section yet can still get an `addLine` with its title as `section`.
