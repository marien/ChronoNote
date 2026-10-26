# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-10-26 | The new list style in your own notes at 125 % (dark and light): the week review and the Action Drawer (day bands, one line per item, the grey selection, muted all-done meetings, the two earlier-weeks links), and the date setting "Dates in tabs and lists" on tabs, Section History, the drawer, Search and the week review | Desktop app, next beta | §433 |
| 2026-10-25 | Week review in your own notes at 125 %: on a Monday and on a Friday, the open actions and topics per meeting, the counts, Show done, Ctrl+Space and Shift+Enter from the list, the earlier-weeks line; and the Action Drawer's new filters (`tag:`, `since:`, `is:done`) | Desktop app, next beta | §431, §432 |
| 2026-10-25 | 0.33.1 on the phone and in the installed web app on a PC (title bar hidden): "Last note" keeps the tabs after a reload (§430); due dates and the compact date picker, the Action Drawer's groups (fold, Ctrl+Space or long-press), topic and forward-link pills, the new icon | Phone and PC, installed web app after it updates to 0.33.1 | §416-§430 |
| 2026-10-22 | Desktop: a real conflict ("changed on disk" prompt) resolved with "Keep my version" leaves the other text under Earlier versions, also when you edited a minute before | Desktop app v0.32.5; edit a note on two devices synced by OneDrive | §413 |
| 2026-10-22 | Web app with a real OneDrive account: a note deleted and recreated before the next sync stays on OneDrive; "Keep mine" on a sync conflict leaves the OneDrive text under Earlier versions | app.chrononote.mariendegelder.nl (v0.32.5) | §413 |
| 2026-10-21 | A test that only passes on CI's retry shows up as a warning on the run (the report runs on every push and said "no flaky tests" on its first run; the warning itself was only seen locally) | The next Test run with a flaky test | §411 |
| 2026-10-21 | The Security Audit runs daily (04:00 UTC). (That it does not run for a push without dependency changes was seen on 2026-10-22.) | GitHub Actions, Security Audit | §410 |
| 2026-10-21 | Docked Peek with display switches on the laptop's own 125 % screen (the scaled-size matching is only unit-tested) | Work laptop, v0.32.5 | §407, §408 |
| 2026-10-21 | Docked Peek while plugging the docking station in and out (not just switching display modes) | Work laptop, v0.32.5; About -> Copy diagnostics if anything looks wrong | §404-§408 |
| 2026-10-21 | Waking the laptop from sleep with the docking station unplugged while Peek was docked | Work laptop | §404 |
