# Phase 2: proposing changes

Let the user propose changes from the phone: add a line to a meeting, and tick off or reopen an action or topic. The
app writes requests to `inbox.json`; ChronoNote on the laptop applies them and reports each outcome in
`outbox.json`. Read `reference.md` first; this file builds on the phase 1 app as the user has it now.

**Start only when the user says ChronoNote processes the inbox.** Before that, nothing would ever answer the
requests.

**In scope:** flow `CNWriteInbox`; requests on the device; the line menu, Add and Pending screens; showing pending
changes in the Day and Meeting screens; reading results. **Out of scope:** moving an action to another day, editing
or deleting existing text.

## 1. `inbox.json` (written by the app)

Path `.chrononote-mobile/inbox.json`. The app writes the whole file each time; nothing else writes it.

```json
{
  "format": 1,
  "writer": "powerapps",
  "requests": [
    { "id": "6f0c8a52-1d7e-4b8e-9a51-0c3f2b7d9e11", "made": "2026-10-29T08:02:11+01:00", "type": "addLine",
      "date": "2026-10-30", "section": "Weekly Sync", "text": "o hiring plan" },
    { "id": "a91d3c07-5e2f-4a6b-8c90-7b1e4d2f6a38", "made": "2026-10-29T08:03:40+01:00", "type": "setState",
      "date": "2026-10-22", "section": "[09:00 - 09:30] Weekly Sync", "line": "# send the numbers to Dana", "n": 7,
      "state": "done" }
  ]
}
```

| Field | Meaning |
| :--- | :--- |
| `id` | `GUID()`, made once per request, never reused. |
| `made` | When the user made it, local time with offset (shown in ChronoNote). |
| `type` | `addLine` or `setState`. |
| `date` | The note's day, `YYYY-MM-DD`. |
| `section` | The section title as written in that day's note, or the agenda title for a meeting with no section yet. Leave the field out for the day part. |
| `text` | `addLine`: the whole new line including its token (section 6, Add). One line, at most 1000 characters. |
| `line` | `setState`: the line's whole text as the app read it, leading spaces included. |
| `n` | `setState`: its line number in that copy of the note, from 1. |
| `state` | `setState`: for an action `open`, `done` or `wontdo`; for a topic `open`, `discussed` or `postponed`. |

Requests are listed in the order made. Keep fields you don't know out of the file.

## 2. What ChronoNote does with them

- `addLine`: adds the line after the last non-blank line of that section (creating the section, or the note, when
  needed). Never a conflict.
- `setState`: finds the line by its text (using `n` to choose between equal lines) and replaces only its state
  symbol. If the line is gone or changed, or several equal lines exist and none is at `n`, it holds the request as a
  **conflict** for the user to look at on the laptop.
- It refuses (`rejected`, reason `invalid`) a `setState` on a deferred action (`> `), on a line that isn't an action
  or topic, or with a state that doesn't fit the kind.
- It reports every handled request in `outbox.json` `results` and never handles the same `id` twice.

## 3. Results in `outbox.json`

| `result` | Meaning | `reason` |
| :--- | :--- | :--- |
| `applied` | Done (or the line already had that state). | none |
| `conflict` | Held on the laptop for the user to decide. | `lineChanged`, `lineAmbiguous` |
| `rejected` | Not applied. | `skipped` (the user skipped it on the laptop), `invalid`, `format` |

A `conflict` can later become `applied` or `rejected`. ChronoNote drops a result once its `id` is no longer in the
inbox.

## 4. Flow `CNWriteInbox`

1. Trigger **When Power Apps calls a flow (V2)** with one Text input `content`; *Compose* `NotesPath`.
2. **OneDrive for Business → Create file**: Folder path `concat(outputs('NotesPath'), '/.chrononote-mobile')`, File
   name `inbox.json`, File content = the trigger's `content`. (Verified: it creates the folder when missing and
   overwrites the file.)
3. **Respond to a PowerApp or flow**, Text output `ok` = `done`.

Concurrency of the flow: 1 (Settings of the trigger), so two writes never overlap.

## 5. Requests on the device

`colRequests`, saved as `cnRequests`: the fields of section 1, plus `status` (`waiting`, `sent`, `conflict`,
`applied`, `rejected`), `reason`, `resultAt`, and for display the line's kind and body.

- **Making a request** sets `waiting`, saves, and sends when connected.
- **Sending** writes the inbox with every request whose status is `waiting`, `sent` or `conflict`, in order made; on
  success `waiting` becomes `sent`. Offline, requests stay `waiting` and go with the next refresh.
- **On every refresh** (after reading the outbox): for each result whose `id` is in `colRequests`, set `status`,
  `reason`, `resultAt`. Then, if any request in the inbox is now `applied` or `rejected`, write the inbox again
  without them.
- **Changing a request** is allowed while it is `waiting` or `sent`: change its fields in place (same `id`) and send
  again; deleting it removes it and sends again. A `conflict` can't be changed from the phone.
- Keep `applied` and `rejected` requests on the device for 14 days for the Pending screen, then drop them.
- A line added on the phone and then ticked off before ChronoNote handled it is one `addLine` whose text changes (for
  example `# call Sam` to `v call Sam`); requests never refer to each other.
- If the outbox's `format` is above 1: send nothing, show "Update the app".

## 6. Screens

### Line menu (from the Day and Meeting screens)

Tapping an action or topic line opens a small menu with the states it can move to: for an action **Open**, **Done**,
**Won't do**; for a topic **To discuss**, **Discussed**, **Postponed** (the current state disabled). Deferred actions
(`> `) and other kinds open no menu. Choosing a state:

- makes a `setState` with that day's `date`, the line's `section` title as written, `line` = the raw line, `n` = its
  number;
- or, if a `waiting` or `sent` `setState` already exists for the same `date`, `n` and `line`, changes its `state`
  (and deletes it when the new state equals the line's own state).

### Add

Opened from a "+" button on the Day screen (default: that day, no section) and on the Meeting screen (default: that
day and meeting).

- **Type:** Action (`# `), Topic (`o `), Note (no token), Emphasis (`! `), Delegated (`=> @name `, with a separate
  field for the name, no spaces in it).
- **Text:** one line; line breaks typed or pasted become spaces; at most 1000 characters including the token.
- **Day** and **Meeting:** the day's sections (as written), its agenda meetings without a section (agenda title), and
  "No meeting (top of the day)".
- Save makes an `addLine` with `text` = token + text.

### Pending

Reached from the Days screen (a button showing the count of `waiting` + `sent` + `conflict`, hidden when zero).

- **Waiting for the laptop** (`waiting`, `sent`): each request with its day, meeting and what it does ("☑ send the
  numbers to Dana", "+ ○ hiring plan"); tap to change (Add form or line menu) or delete. `waiting` ones also show
  "Not sent yet".
- **Look at this on the laptop** (`conflict`): with the reason in words (`lineChanged`: "The line changed on the
  laptop"; `lineAmbiguous`: "The line appears more than once").
- **Done** (`applied`, last 14 days) and **Not applied** (`rejected`, with the reason in words: `skipped` "Skipped on
  the laptop", `invalid` "Not possible for this line", `format` "Update ChronoNote").

### Pending changes in the Day and Meeting screens

Until a request is `applied` or `rejected`, show its effect with a small "pending" marker (a dot) in front of the
line:

- a `setState` shows the line with the requested state's glyph and style;
- an `addLine` shows the new line at the end of its section (or at the end of the day part), in italics.

After `applied`, the note itself shows the change once it has synced and been read. After `rejected`, the marker goes
and the line shows as in the note.

## 7. Done when

With ChronoNote running on the laptop and the phone companion on:

1. Ticking off an open action on the phone shows it as done with a pending dot; within a few minutes (OneDrive delay)
   the laptop's note has `v ` on that line, and after a refresh the dot is gone.
2. Adding an action, a topic, a note, an emphasis line and a delegated line to a meeting puts each at the end of that
   section on the laptop, with the right token.
3. Adding to an agenda meeting that has no section yet creates the section on the laptop.
4. A request made in flight mode is sent on the next refresh with a connection.
5. Changing a pending request (another state, other text) before the laptop handled it ends with only the final
   version applied.
6. Editing the line on the laptop before the request arrives gives a conflict, shown under "Look at this on the
   laptop"; resolving it on the laptop moves it to Done or Not applied.
7. A deferred action opens no line menu.
8. Handled requests disappear from `inbox.json` after the next refresh; the file never holds `applied` or `rejected`
   requests for long.
9. The app still never writes any other file (check the folder's modified times).
