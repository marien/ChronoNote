# Brief F9: Join link and attendees from the calendar file

Run name `f9-agenda-details` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\f9-agenda-details` · branch
`gemini/f9-agenda-details` · base `main` after F3 is merged · browser-test port `1465` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full; rule 4 (all three backends) matters here.

## Why

Marien's work-side exporter writes `.agenda.json` and can also supply each meeting's join link, its attendees and a
series id (his answer to 9.1, 2026-11-16).
- With the join link, Peek's "on now" list gets a Join button.
- With the attendees, the people invited to the meeting the caret is in come first in the `@` suggestions (F3), even
  before he has ever written their name.
- The series id stays unread for now (9.3).

Design: `docs/design/wave3-designs.html`, section F9 (lines 181-198).

## What exists now

- **Rust, `src-tauri/src/agenda.rs`.**
  - `struct AgendaMeeting { date, start, end, title }` (line 43), `serde::Deserialize`, strict.
  - `parse_agenda_in` (line 70) accepts a plain array or `{ timezone, meetings }`.
  - `to_local` (line 101) rebuilds a meeting after the time-zone shift. It must carry the new fields along.
  - The commands `read_agenda_for_date` (line 214) and `read_agenda_entries_for_date` (line 226), with
    `entries_for_date`.
- **Contract:** `src/lib/tauriCommands.ts` lines 93-115. Wrapper: `readAgendaEntriesForDate` in `src/lib/tauriApi.ts`
  line 323.
- **Web:** `src/lib/webapp/webBackend.ts` lines 788-880 parse `.agenda.json` in TypeScript (tests in
  `webBackendConfigAndAgenda.test.ts`).
- **Mock:** `src/lib/testing/mockBackend.ts` (find `read_agenda_entries_for_date`).
- **Today's entries:** `todayAgendaEntries()` in `src/lib/callNote.ts` (line 180) maps to
  `AgendaEntry { start, end, title }` (line 28).
  - `src/lib/components/PeekBar.svelte` reads it (line 122) and lists the meetings on now (`onNowItems`, line 112).
- **Opening a link:** `openExternalUrl` (used in `src/lib/editor/clickableLinks.ts` line 99).
- **Matching a section to a meeting:** `meetingMatchKey` in `src/lib/calendarReconcile.ts`.
- **The user's own name:** the setting `minutesName` ("Your name in minutes", F2) in the app config.
- **F3's** `buildSuggestions(kind, prefix, ctx)` in `src/lib/suggestions.ts`, and its `source` in `EditorPane.svelte`.
- **Docs:** `docs/agenda-file-guide.md` section 3 (lines 75-107) says every field beyond the four is ignored.

## What to build

1. **The file format.** Two optional fields per meeting:
   - `joinUrl`: a string;
   - `attendees`: an array of strings, each a display name as the calendar gives it (`"Dana Smith"`,
     `"Smith, Dana"`, `"dana.smith@example.org"`).
   - `seriesId` and anything else stay ignored.
   - A wrong type (`"attendees": "Dana"`, `"joinUrl": 5`) is treated as absent and never fails the file. The four
     required fields keep their strict rules.
   - In Rust, deserialize both as `Option<serde_json::Value>` and convert:
     - `joinUrl` is kept only when it is a string starting with `https://`;
     - `attendees` keeps only the string items, trimmed and non-empty.
   - `to_local` carries both.

2. **A new command in all three backends:** `read_agenda_details_for_date { date }` returns
   `AgendaDetails[] = { start, end, title, joinUrl: string | null, attendees: string[] }`.
   - It covers the same meetings in the same order as `read_agenda_entries_for_date` (live meetings only).
   - It has the same errors.
   - Add a ts-rs type, as the other agenda types do.
   - Add the wrapper in `tauriApi.ts` and the contract entry.
   - `todayAgendaEntries()` switches to it. `AgendaEntry` gains `joinUrl?: string` and `attendees?: string[]`.

3. **Join in Peek, `PeekBar.svelte`.** In the "on now" list and on the switch chip's shown meeting:
   - When the meeting has a `joinUrl`, show a small "Join" button that calls `openExternalUrl(joinUrl)`.
   - Its `aria-label` is "Join {title}".
   - Rule 2 does not apply (this is Peek's chrome, not note text). It must not change the bar's height: check it
     at 100 % and 125 %.

4. **Attendees to @names, new `src/lib/attendeeNames.ts`.**
   - `attendeeNames(displayNames: string[], ownName: string): string[]` returns names in input order, without
     duplicates.

   | Input | Name |
   | :--- | :--- |
   | `Dana Smith` | `Dana` |
   | `Smith, Dana` | `Dana` (a comma means "Last, First") |
   | `Dana` | `Dana` |
   | `dana.smith@example.org` | `Dana` (the part before `@`, split on `.` `_` `-`, the first piece with a capital first letter) |
   | `Dana Smith (External)` | `Dana` (a trailing `( … )` or `[ … ]` is dropped first) |
   | `Dana Smith`, `Dana Brown` | `Dana-S`, `Dana-B` (same first name: add `-` and the last word's first letter, upper case) |
   | `José Álvarez` | `José` |
   | `Marien de Gelder` with ownName `Marien` | left out (case-insensitive match on the first name) |
   | `!!!` | left out (nothing left after keeping `NAME_CHAR`s, `src/lib/grammar/symbols.ts`) |

   - Keep only `NAME_CHAR` characters in a name.

5. **Attendees in the suggestions (F3).**
   - The meeting the caret is in is the agenda meeting of the note's date whose `meetingMatchKey(title)` equals that
     of the section title the caret line belongs to (`getSectionHeaderForLine`).
   - When there is one, `ctx.attendees` is `attendeeNames(meeting.attendees, minutesName)`.
   - In `buildSuggestions` for kind `"name"`:
     - attendees whose name starts with the prefix come first, in attendee order, marked `invited: true`;
     - then the usual rows, without names already listed (case-insensitive);
     - the cap of 8 stays.
   - The row's muted text for an invited name is "invited", or its last-used date when it has one.
   - Fetch the details as F3 fetches meetings: once per date, cached, `[]` on error, never awaited inside the editor.
   - New key `suggestions.invited` "invited" in all seven languages (Dutch "uitgenodigd").

6. **Docs.**
   - `docs/agenda-file-guide.md` section 3: add `joinUrl` and `attendees` as optional fields, with what ChronoNote
     does with each and the rule that a wrong type is ignored. Add a sentence that `seriesId` may be written and is
     not read yet. Extend the worked example in section 8 with both fields on one meeting.
   - `docs/spec.md`: Peek's Join button and the invited names in the suggestions.
   - `website/guide.html`: one sentence each.

## Out of scope

- `seriesId` (9.3).
- Writing attendees into notes. Nothing is written; attendees only rank suggestions.
- Any change to calendar sync's sections, matching or dialog.

## Tests to add

- Rust (`agenda.rs` tests): a file with both fields parses; a wrong `attendees` type parses with the field absent;
  `joinUrl: "http://x"` (not https) is absent; the time-zone shape carries both fields.
- `webBackendConfigAndAgenda.test.ts` and the mock: the same cases through `read_agenda_details_for_date`.
- `src/lib/attendeeNames.test.ts`: every row of step 4.
- `src/lib/suggestions.test.ts`:
  - With attendees `["Dana Smith", "Ben Jones"]` and prefix `D`, `@Dana` comes first (`invited`), then the usual
    rows.
  - An attendee already used in notes is listed once.
- Browser: extend `tests/e2e/peek.spec.ts` or the Peek on-now spec (find it with `ls tests/e2e | grep -i peek`).
  With an agenda meeting on now that has a `joinUrl`, a Join button shows. Stub `openExternalUrl` or check the
  request the way existing link tests do.

## Done when

- [ ] Both fields parsed leniently in Rust, web and mock; the old guarantee (extra or wrong optional fields never
      fail the file) holds.
- [ ] `read_agenda_details_for_date` in all backends; `todayAgendaEntries` uses it.
- [ ] Join button in Peek; attendees first in name suggestions.
- [ ] Guide, spec and the agenda file guide updated; the new key in all seven languages.
- [ ] `npm run verify` (with cargo test and clippy) and `npm run build` pass; the named specs pass.

## Report

The standard report from RULES.md.
