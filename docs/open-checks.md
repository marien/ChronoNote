# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-10-23 | Due dates in daily use: typing `by:vr` / `by:morgen` with the Dutch UI and leaving the line; the pill's size and colours at 125 % (dark and light, Color and Grayscale); the "N overdue" count after the app stayed open overnight | Desktop app, the next beta | §419 |
| 2026-10-23 | The new icon on the real taskbar (dark and light) and desktop: as large as the other apps' icons and sharp at 125 % (Windows caches icons: if the old one lingers after the update, sign out and in) | Desktop app after the next release | §416 |
| 2026-10-22 | After the installed web app updates (to v0.32.6 or later) with an expired OneDrive sign-in: sign in, and the "Updated to" notice still appears afterwards (the new version's own start decides, so the update to v0.32.6 already shows it) | Phone, installed web app | §415 |
| 2026-10-22 | Desktop: a real conflict ("changed on disk" prompt) resolved with "Keep my version" leaves the other text under Earlier versions, also when you edited a minute before | Desktop app v0.32.5; edit a note on two devices synced by OneDrive | §413 |
| 2026-10-22 | Web app with a real OneDrive account: a note deleted and recreated before the next sync stays on OneDrive; "Keep mine" on a sync conflict leaves the OneDrive text under Earlier versions | app.chrononote.mariendegelder.nl (v0.32.5) | §413 |
| 2026-10-21 | A test that only passes on CI's retry shows up as a warning on the run (the report runs on every push and said "no flaky tests" on its first run; the warning itself was only seen locally) | The next Test run with a flaky test | §411 |
| 2026-10-21 | The Security Audit runs daily (04:00 UTC). (That it does not run for a push without dependency changes was seen on 2026-10-22.) | GitHub Actions, Security Audit | §410 |
| 2026-10-21 | Docked Peek with display switches on the laptop's own 125 % screen (the scaled-size matching is only unit-tested) | Work laptop, v0.32.5 | §407, §408 |
| 2026-10-21 | Docked Peek while plugging the docking station in and out (not just switching display modes) | Work laptop, v0.32.5; About -> Copy diagnostics if anything looks wrong | §404-§408 |
| 2026-10-21 | Waking the laptop from sleep with the docking station unplugged while Peek was docked | Work laptop | §404 |
