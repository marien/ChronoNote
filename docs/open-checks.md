# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-10-21 | The first CI run with the flaky-test report: tests that only passed on the retry show up as warnings on the run | Any Test run on GitHub after §411 | §411 |
| 2026-10-21 | The Security Audit runs daily (04:00 UTC), and does not run for a push that changes no dependencies | GitHub Actions, Security Audit | §410 |
| 2026-10-21 | Docked Peek with display switches on the laptop's own 125 % screen (the scaled-size matching is only unit-tested) | Work laptop, beta 0.32.5-6 or later | §407, §408 |
| 2026-10-21 | Docked Peek while plugging the docking station in and out (not just switching display modes) | Work laptop, beta 0.32.5-6 or later; About -> Copy diagnostics if anything looks wrong | §404-§408 |
| 2026-10-21 | Waking the laptop from sleep with the docking station unplugged while Peek was docked | Work laptop | §404 |
