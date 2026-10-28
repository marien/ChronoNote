# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-10-28 | The new updater plugin (2.14.1): 0.35.0-1 installs through the old updater (from 0.34.0); the next beta, 0.35.0-2, is the first install by the new one | Desktop app on the early channel: About → check for updates, twice | §437 |
| 2026-10-28 | A nested bulleted list copied from a Teams message (and from Outlook or Word) pastes with its bullets and indentation; a ChronoNote list pasted into Teams shows as a list | Desktop app 0.35.0-1; also the web app | §439 |
| 2026-10-28 | Docking follows floating Peek between your two screens: float Peek, move it to the other screen, dock; then leave Peek and open it docked from the full window on the first screen | Desktop app 0.35.0-1 | §438 |
| 2026-10-22 | Desktop: a real conflict ("changed on disk" prompt) resolved with "Keep my version" leaves the other text under Earlier versions, also when you edited a minute before | Desktop app v0.32.5; edit a note on two devices synced by OneDrive | §413 |
| 2026-10-22 | Web app with a real OneDrive account: a note deleted and recreated before the next sync stays on OneDrive; "Keep mine" on a sync conflict leaves the OneDrive text under Earlier versions | app.chrononote.mariendegelder.nl (v0.32.5) | §413 |
| 2026-10-21 | A test that only passes on CI's retry shows up as a warning on the run (the report runs on every push and said "no flaky tests" on its first run; the warning itself was only seen locally) | The next Test run with a flaky test | §411 |
| 2026-10-21 | The Security Audit runs daily (04:00 UTC). (That it does not run for a push without dependency changes was seen on 2026-10-22.) | GitHub Actions, Security Audit | §410 |
