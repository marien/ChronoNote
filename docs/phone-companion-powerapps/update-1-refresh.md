# Update 1: faster, fresher refresh

For an app that already has phases 1 and 2. Read `reference.md` first (sections 5 and 9 changed). The same changes
are written into `phase-1.md` (sections 1, 3, 3.1, 3.2, 5, 6) and `phase-2.md` (sections 5 and 7), so a fresh build
gets them too; this file lists only what changes, in an order you can paste and check step by step.

**Why:** the user found refreshing slow and the phone often out of date. A refresh used two or more flow runs even
when nothing had changed, the outbox was read every time, and nothing refreshed by itself while the app was open.

**Needs ChronoNote 0.36.0-2 or later** on the computer. It writes the meeting index to a new
`.chrononote-mobile/meetings.json`, keeps only the results in `outbox.json` (now `format` 2), rewrites the outbox at
least every 5 minutes while it runs, and looks at the inbox every 15 seconds instead of every minute. An app without
this update shows "Update the app" on the new outbox (its format is above 1), so do this update together with
installing ChronoNote 0.36.0-2.

## Steps

1. **`CNList` lists `.chrononote-mobile` too** (phase 1, section 1, steps 4 to 8): a second *List files in folder*
   whose names get the `.chrononote-mobile/` prefix, joined to the notes listing with `union`, and a response that
   also runs when the folder is missing. Test the flow on its own: the response lists the notes, `.agenda.json`,
   `.chrononote-mobile/meetings.json`, `.chrononote-mobile/outbox.json` and `.chrononote-mobile/inbox.json`.
2. **The app keeps the two companion files from the listing** (the filter after `CNList`): notes, `.agenda.json`,
   `.chrononote-mobile/meetings.json`, `.chrononote-mobile/outbox.json`. The inbox is the app's own file; it is not
   read.
3. **The refresh reads the companion files only when they changed** (phase 1, section 3, steps 3 and 4): remove the
   "always read the outbox" rule. They are needed files like the notes, read when their `modified` differs from the
   copy's.
4. **Two globals instead of one** (phase 1, section 3, step 7): the index from `meetings.json` (format 1), the
   results from `outbox.json` (format 2); an outbox with format 1 gives both (reference 9.3). Parse a file only when
   it was read or after a start (from the copy). Everything that used the old outbox global's `meetings` now uses the
   index; everything that used its `results` uses the results. Phase 2's format check becomes "above 2".
5. **Timings in the status line** (phase 1, section 3, steps 2, 5 and 8; section 5): "Updated 08:40 · list 0.8 s ·
   read 3 files 2.1 s". These numbers are what the user sends back to the ChronoNote side.
6. **The check timer** (phase 1, section 3.1): a Timer on each screen running the refresh every `gblCheckEvery`
   seconds: 30 while a request waits for its result, 60 after a change or a user action, doubling to at most 600
   while nothing changes. Remove the old "refresh when the Days screen becomes visible and the last refresh is more
   than 5 minutes old" rule; the timer replaces it (a screen becoming visible counts as a user action).
7. **"Computer last seen"** (phase 1, section 3.2): from the outbox's `modified` in the listing, when it is more than
   15 minutes old.

## Done when

1. With nothing changed, a refresh shows "nothing to read" and only one flow run appears in the flow's run history
   (`CNList`; no `CNRead`).
2. After a note changes on the computer, the next refresh reads that file only ("read 1 file").
3. Ticking off an action on the phone: with ChronoNote running and the app left open, the pending dot goes by itself;
   note the time it took (ChronoNote's side is now at most about 15 seconds; the rest is OneDrive).
4. Left open with nothing changing, the checks slow down to every 10 minutes (the flow's run history shows the gaps
   growing); a tap on refresh or a new request makes them frequent again.
5. With ChronoNote closed for 20 minutes, "Computer last seen ‹time›" shows; it goes within a few minutes of starting
   ChronoNote again.
6. Phase 1's and phase 2's earlier acceptance tests still pass.

**Report back:** the timings from the status line for (a) a refresh with nothing changed, (b) one note changed, (c)
the first refresh after opening the app, and the time from ticking off on the phone to the dot going.

## Optional, only when the user asks after measuring: one flow for a refresh

If the timings show that the reads (`CNRead`) take most of the time even when few files changed, the next step is a
flow `CNSync` that does a refresh in one run: the app sends the names it needs with the `modified` of its copies
(JSON text, `[{ "name": …, "modified": … }]`, an empty `modified` for a file it has no copy of); the flow lists both
folders as `CNList` does, keeps the listed files whose name is in the request and whose `modified` differs (*Filter
array*), reads those (*Apply to each*, as `CNRead`), and responds with the listing and the files read. Notes whose
date is new in the window are added by the app on the next run (it learns their names from the listing). Don't build
it before the user asks: it is more flow logic to keep right, and may not be needed.
