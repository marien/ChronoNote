# Open checks

Things that are built and tested automatically, but still need a person (or a later event) to confirm them. One list
instead of a "Not checked yet" note at the end of each chat (§411). An item leaves this list when it is confirmed (it
then gets a line in its CHANGELOG section) or found broken (it then becomes a fix). Newest first.

`npm run seen-check` keeps this list and the changelog's `**Seen by Marien:**` lines in step (from §479 on).

| Since | What to check | Where / how | Section |
|---|---|---|---|
| 2026-11-15 | New strings of §481-§486 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | none (the entries are seen; only the translations wait) |
| 2026-11-16 | New strings of §493-§498 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | none (the entries are seen; only the translations wait) |
| 2026-11-19 | 0.39.0 in the installed web app on a laptop: it updates (cache `chrononote-webapp-shell-0.39.0`), opens on today's note, search words and saved searches work, OneDrive sync still runs (the phone: confirmed by Marien 2026-11-19) | the installed web app on a laptop | none (after-release check for the stable) |
| 2026-11-19 | Paste a list from Word (with tabs) and plain text with tabs: every tab arrives as two spaces; a list copied inside ChronoNote pastes back unchanged | dev build or next beta | §526 |
| 2026-11-19 | On a line without a number under a list item: Enter starts the next number (or bullet) and the items below renumber; Shift+Enter adds another such line at the same indent | dev build or next beta | §527 |
| 2026-11-20 | The layout fixes of the design pass: search context line and one chip row, phone sheets (short ones shrink, search keeps its height), phone week review title, single-occurrence history, earlier versions side by side, Wrap as the phone's default text width | next beta (phone: the web app after the stable) | §528 |
| 2026-11-20 | The defects, wording and polish of the design pass: Forward's label, the name field in dark themes, person view, rename preview, conflict and close-warning wording, Actions count, empty-search hint, tree line, Settings focus, status-bar message | next beta | §529 |
| 2026-11-20 | New strings of §528-§529 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | none (only the translations wait) |
| 2026-11-20 | The conflict dialog's three buttons each on one line (German too); Settings, Appearance, the Peek shortcut field reads Ctrl+Alt+J | next beta | §530 |
| 2026-11-23 | Copy a Teams message with a plain line and a bulleted list under it: both arrive, the list as `- ` items | dev build or next beta | §532 |
