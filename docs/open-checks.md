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
| 2026-11-20 | New strings of §528-§529 in German, French, Polish, Spanish and Italian need a native speaker's look | `src/lib/i18n/locales/` | none (only the translations wait) |
| 2026-11-23 | 0.40.0 after the stable: on a phone (keyboard, sheets, long-press, symbols bar on one row) and in the installed web app on a laptop and a phone (cache `chrononote-webapp-shell-0.40.0`) | a phone and the installed web app | none (after-release check for the stable) |
