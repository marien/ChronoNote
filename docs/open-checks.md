# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-11-15 | Calendar sync adds a new meeting by itself to a note with text (caret stays, status message jumps to it); a reorder or a section with text still goes to the review; a deleted auto-added meeting does not come back that day. Also: does the blank-line tidy-up around sections (same as the review's) feel right? | dev build (`npm run dev:app`), add a meeting to today's calendar file | §485 |
| 2026-11-15 | Copy as minutes: paste into Outlook and Teams (rich) and into Notepad (plain); your name from Settings as owner | dev build, command palette or right-click in a meeting | §483 |
| 2026-11-15 | Copy list in the Actions pane and the week review: paste into Outlook/Teams and Notepad; the narrow docked panes (180 px Actions header, week review header that wraps its buttons) | dev build, docked panes at the smallest width | §486 |
| 2026-11-15 | Actions pane header in two rows with hints behind `?`; the docked pane can now be as narrow as 180 px (was 300) | dev build | §482 |
| 2026-11-15 | Shorter date-picker placeholder ("Go to: today, -2, 2026-09-05"), week review title with ellipsis, German "Bei Hover", settings choices on the phone | dev build and the phone | §484 |
| 2026-11-15 | New strings of §481-§486 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | §481-§486 |
| 2026-11-16 | Search words `section:`, `is:decision`, `is:topic`, `is:emphasis`, and saved searches (star, chips, palette; the file follows the folder to the other laptop and the web app) | dev build, Ctrl+Shift+F | §493, §495 |
| 2026-11-16 | Suggestions while typing `@` + a letter, `(` after a symbol, and a section title: Tab takes, Enter only after an arrow; invited people first in a meeting with `attendees` | dev build, notes with names and topics | §494, §497 |
| 2026-11-16 | Person view: Ctrl+click an `@name`, line menu "Show @name", palette `@da`; pane beside the note, rows jump and keep the pane | dev build | §496 |
| 2026-11-16 | Rename everywhere: a meeting title, a name and a topic; untick a note; Ctrl+Z in the open note; the toast's undo; Earlier versions hold the old text | dev build, on a copy of real notes first | §498 |
| 2026-11-16 | No suggestion when the caret is in a title that already reads exactly like today's meeting (#252) | dev build or next beta, `.agenda.json` with a meeting today | §499 |
| 2026-11-18 | Two invited people with the same first name are offered as `@DanaS` / `@DanaB` (no hyphen) (#254) | dev build or next beta, `.agenda.json` with `attendees` | §500 |
| 2026-11-16 | New strings of §493-§498 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | §493-§498 |
