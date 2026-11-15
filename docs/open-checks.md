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
