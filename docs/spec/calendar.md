# Calendar sync

This file specifies ChronoNote's calendar-sync reconciliation rules (`docs/spec.md` §5 "Sync Calendar for This Day" and `src/lib/calendarReconcile.ts`, plus title-prefix classification in `src/lib/agendaTitles.ts`) as short statements paired with executable examples.

## Notation

- Single-backtick code spans wrap strings where spaces matter. `↵` marks a line break (`\n`) and `·` marks a space where leading, trailing, or blank-line spaces would otherwise be hard to see.
- `—` in an input or output column means an empty list (`[]`), `null`, or no changes (`newTitles`, `reorderedTitles`, `removedEmpty`, `removedWithContent` all empty; or in auto-sync, nothing applied, no review needed, and nothing offered).
- **Title classification** (`| Raw title | Classified |`): runs `classifyTitle(rawTitle)`. Output is `—` for `null`, `removed: <title>` when `removed` is `true`, or `<title>` when `removed` is `false`.
- **Ad-hoc check** (`| Header | Ad-hoc |`): runs `isAdhocSection(header)`. Output is `yes` or `no`.
- **Sync reconciliation** (`| Note | Agenda | Removed | After | Changes |`): runs `computeCalendarSync(note, agendaTitles, removedTitles, agendaStarts)`.
  - `Agenda` and `Removed` are comma-separated titles inside a single-backtick span (or `—` for `[]`). An agenda item ending with ` @<start>` sets `agendaStarts[title] = <start>` (for example `` `Standup @09:00, Review @14:00` ``).
  - `After` is `result.content`.
  - `Changes` is `—` when nothing changed, or `; `-separated clauses in order: `new: <titles>`, `reordered: <titles>`, `dropped: <titles>`, and one `review: <header> :: <body with ↵>` per entry in `removedWithContent`.
- **Auto-sync split** (`| Note | Agenda | Removed | Added before | Auto-sync |`): runs `computeAutoSync(note, agendaTitles, removedTitles, agendaStarts, alreadyAdded)`.
  - `Added before` uses the same comma-separated title list (or `—`).
  - `Auto-sync` is `—` when `apply` is `false`, `needsReview` is `false`, and `offer` is empty; otherwise `; `-separated clauses from `apply`, `review`, `added: <titles>`, `removed: <titles>`, `offer: <titles>`, and `after: <content>` (when `apply` is `true`; when `apply` is `false`, `result.content` must equal `Note`).
- **Leave-flagged and Move to another day** (`| Action | Note | Section | After |`): `flag` runs `flagRemovedSection(note, section)` and `move` runs `appendRemovedSectionTo(note, section)`.
  - `Section` is `<header> :: <body with ↵>`, or `<header>` alone when `lines` is `[]`.

The test suite `src/lib/calendarSpecTables.test.ts` reads every table in this file and runs each row.

### C1. Opt-in setting, `.agenda.json` source, and platform/date gating

Calendar sync is opt-in (Settings → Notes & Sync → Calendar, hidden until enabled), reads `.agenda.json` from the notes folder root (or from the connected OneDrive folder in the web app, converting any declared `timezone` to local time), and is offered only on a dated tab for today or later (grayed out until `.agenda.json` exists).

Not run as a table: setting visibility, filesystem/OneDrive reading, timezone conversion of `.agenda.json`, tab date gating, and toolbar button state live outside the pure section reconciler.

### C2. Agenda title prefixes mark removed meetings or strip status stamps

In `.agenda.json`, a title starting with `Canceled:`, `Cancelled:`, `Declined:`, `Followed:`, or `Following:` (case-sensitive) marks a removed meeting whose trimmed remainder is its real title (ignored as `null` if nothing remains), while `Placeholder` or `Confirmed` followed by `:`, `-`, or `--` is stripped as a status stamp (including after a removed-meeting prefix).

| Raw title | Classified |
| :--- | :--- |
| `Canceled: 1:1 with Sam` | `removed: 1:1 with Sam` |
| `Cancelled: 1:1 with Sam` | `removed: 1:1 with Sam` |
| `Declined: Budget` | `removed: Budget` |
| `Followed: Offsite` | `removed: Offsite` |
| `Following: Sync` | `removed: Sync` |
| `Placeholder: Budget` | `Budget` |
| `Confirmed - Design sync` | `Design sync` |
| `Placeholder -- Offsite` | `Offsite` |
| `Confirmed:Budget` | `Budget` |
| `Canceled: Placeholder - Offsite` | `removed: Offsite` |
| `Declined:   ` | — |
| `Confirmed attendees review` | `Confirmed attendees review` |
| `Placeholder` | `Placeholder` |
| `Confirmed:` | `Confirmed:` |
| `Re: Declined: 1:1` | `Re: Declined: 1:1` |
| `declined: 1:1` | `declined: 1:1` |

### C3. Existing sections match agenda titles by normalized key

Section matching trims spaces, ignores case, and strips leading `[HH:MM - HH:MM]`, `[CANCELED]` (any case), and leading or trailing `YYYY-MM-DD` dates; kept non-cancelled sections preserve their original header and underline, partial prefix matches do not match, and duplicate agenda titles claim an existing section once and append a new empty section.

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Weekly Standup↵==============↵notes↵` | `··weekly standup··` | — | `Weekly Standup↵==============↵notes↵` | — |
| `[09:00 - 09:30] Standup↵=======================↵notes↵` | `Standup` | — | `[09:00 - 09:30] Standup↵=======================↵notes↵` | — |
| `Weekly Sync - 2026-08-08↵========================↵notes↵` | `Weekly Sync` | — | `Weekly Sync - 2026-08-08↵========================↵notes↵` | — |
| `2026-08-08 - Weekly Sync↵========================↵notes↵` | `Weekly Sync` | — | `2026-08-08 - Weekly Sync↵========================↵notes↵` | — |
| `Standup↵===↵notes↵` | `Standup` | — | `Standup↵===↵notes↵` | — |
| `Standup↵=======↵daily↵↵↵Standup Prep↵============↵prep↵` | `Standup` | — | `Standup↵=======↵daily↵` | `review: Standup Prep :: prep` |
| `Standup↵=======↵notes↵` | `Standup, Standup` | — | `Standup↵=======↵notes↵↵↵Standup↵=======↵` | `new: Standup` |

### C4. New meetings are inserted in agenda order

New agenda titles (trimmed, skipping blank entries) become Setext sections with `=` underlines at least 3 characters wide, inserted in agenda order (or appended after existing non-matching sections on first sync).

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `` | `Standup` | — | `Standup↵=======↵` | `new: Standup` |
| `` | — | — | `` | — |
| `` | `Hi` | — | `Hi↵===↵` | `new: Hi` |
| `` | `··Standup··, ···, ` | — | `Standup↵=======↵` | `new: Standup` |
| `Alpha↵=====↵notes on alpha↵↵Gamma↵=====↵notes on gamma↵` | `Alpha, Beta, Gamma` | — | `Alpha↵=====↵notes on alpha↵↵↵Beta↵====↵↵↵Gamma↵=====↵notes on gamma↵` | `new: Beta` |
| `Personal Notes↵==============↵some unrelated text` | `Weekly Standup, Design Review` | — | `Personal Notes↵==============↵some unrelated text↵↵↵Weekly Standup↵==============↵↵↵Design Review↵=============↵` | `new: Weekly Standup, Design Review` |

### C5. Preamble and sections before the first match stay untouched

Lines before the first Setext section (including `===` lines preceded by a blank or whitespace-only line) keep their content with trailing whitespace trimmed, unmatched non-removed sections before the first match stay in place, and trailing whitespace-only lines on section bodies are trimmed.

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Line 1↵Line 2··↵↵↵↵Standup↵=======↵notes↵` | `Standup, Review` | — | `Line 1↵Line 2↵↵↵Standup↵=======↵notes↵↵↵Review↵======↵` | `new: Review` |
| `Intro↵↵===↵···↵===↵Standup↵=======↵notes↵` | `Standup` | — | `Intro↵↵===↵···↵===↵↵↵Standup↵=======↵notes↵` | — |
| `Morning journal↵===============↵feeling good↵↵Standup↵=======↵` | `Standup` | — | `Morning journal↵===============↵feeling good↵↵↵Standup↵=======↵` | — |
| `Standup↵=======↵notes↵···↵` | `Standup` | — | `Standup↵=======↵notes↵` | — |

### C6. Out-of-order meetings are reordered in place and reported

When matched sections appear in a different order than the agenda, they are rearranged into agenda order with their content untouched and reported in `reorderedTitles`.

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Alpha↵=====↵notes on alpha↵↵Beta↵====↵notes on beta↵` | `Beta, Alpha` | — | `Beta↵====↵notes on beta↵↵↵Alpha↵=====↵notes on alpha↵` | `reordered: Beta, Alpha` |
| `Beta↵====↵b↵↵Alpha↵=====↵a↵` | `Alpha, Middle, Beta` | — | `Alpha↵=====↵a↵↵↵Middle↵======↵↵↵Beta↵====↵b↵` | `new: Middle; reordered: Alpha, Beta` |

### C7. Removed meetings are dropped silently if empty and reported if non-empty

Any non-ad-hoc, non-`[CANCELED]` section from the first match onward that is absent from the agenda, as well as any section anywhere matching `Removed` (unless also on the live agenda), is dropped silently when empty (`removedEmpty`) or returned for review when it has non-blank body lines (`removedWithContent`).

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Weekly Standup↵==============↵# ship the migration guide↵↵1:1 with Priya↵==============↵` | `Weekly Standup, Design Review` | — | `Weekly Standup↵==============↵# ship the migration guide↵↵↵Design Review↵=============↵` | `new: Design Review; dropped: 1:1 with Priya` |
| `Standup↵=======↵notes↵↵1:1 with Priya↵==============↵Asked about the roadmap↵` | `Standup` | — | `Standup↵=======↵notes↵` | `review: 1:1 with Priya :: Asked about the roadmap` |
| `Old sync↵========↵some notes↵↵↵Budget review↵=============↵` | `Budget review` | `Old sync` | `Budget review↵=============↵` | `review: Old sync :: some notes` |
| `Old sync↵========↵↵Budget review↵=============↵` | `Budget review` | `Old sync` | `Budget review↵=============↵` | `dropped: Old sync` |
| `Standup↵=======↵notes↵` | `Standup` | `Standup` | `Standup↵=======↵notes↵` | — |
| `Morning thoughts↵↵Old↵===↵` | — | `Old` | `Morning thoughts↵` | `dropped: Old` |
| `··Old sync··↵========↵kept note↵` | — | `Old sync` | `` | `review: Old sync :: kept note` |

### C8. `[CANCELED]` sections stay un-flagged when absent and un-cancel when restored

A section starting with `[CANCELED]` (in any case, with or without a space after `]`) is left alone without re-reporting while absent from the agenda, and has its prefix stripped with a recomputed underline if the meeting returns to the agenda; `[CANCELED]` mid-title is not treated as a prefix.

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `[CANCELED] Old sync↵===================↵kept notes↵↵↵Budget review↵=============↵` | `Budget review` | `Old sync` | `[CANCELED] Old sync↵===================↵kept notes↵↵↵Budget review↵=============↵` | — |
| `Budget review↵=============↵notes↵↵↵[CANCELED] Old sync↵===================↵kept notes↵` | `Budget review` | `Old sync` | `Budget review↵=============↵notes↵↵↵[CANCELED] Old sync↵===================↵kept notes↵` | — |
| `Budget review↵=============↵notes↵↵↵[CANCELED] Old sync↵===================↵kept notes↵` | `Budget review, Old sync` | — | `Budget review↵=============↵notes↵↵↵Old sync↵========↵kept notes↵` | — |
| `[canceled]Standup↵=================↵notes↵` | `Standup` | — | `Standup↵=======↵notes↵` | — |
| `[Canceled] Old sync↵===================↵kept notes↵` | — | `Old sync` | `[Canceled] Old sync↵===================↵kept notes↵` | — |
| `Discuss [CANCELED] meetings↵===========================↵agenda notes↵` | — | `Discuss [CANCELED] meetings` | `` | `review: Discuss [CANCELED] meetings :: agenda notes` |

### C9. Review dialog and amber notification dot

Before manual sync writes to the note, a review dialog presents a checklist for new meetings and a Leave-flagged / Discard / Move-to-another-day choice for each non-empty removed section; an amber dot on the sync button (and More button when collapsed) shows whenever the active dated note differs from `.agenda.json`, checked on tab switch, shortly after edits, and on window focus.

Not run as a table: the review dialog, toolbar notification dot, and UI event triggers belong to the Svelte components and controller rather than the pure reconciler.

### C10. Ad-hoc calls start with a single quote

A section title starting with `'` or `’` (optionally after `[CANCELED]` and whitespace) is recognized as an ad-hoc call (`isAdhocSection`), whereas apostrophes inside a title are not.

| Header | Ad-hoc |
| :--- | :--- |
| `'Quick sync with Dave` | yes |
| `' Quick sync with Dave` | yes |
| `··'Quick sync with Dave` | yes |
| `’Quick sync with Dave` | yes |
| `··’·Quick sync with Dave` | yes |
| `[CANCELED] 'Quick sync` | yes |
| `Team's Standup` | no |
| `Dana’s 1:1` | no |
| `Standup` | no |

### C11. Untimed ad-hoc calls (or calls without start times) stay with the section above

Without valid `HH:MM` start times in `.agenda.json`, or when an ad-hoc call has no `HH:MM` in its title, it stays attached after the section above it (following that section on reorder, surviving its removal, and sitting above new meetings when alone in a note).

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Standup↵=======↵notes from standup↵↵↵'Quick sync with Dave↵=====================↵notes with dave↵↵↵Retro↵=====↵retro notes↵` | `Standup, Retro` | — | `Standup↵=======↵notes from standup↵↵↵'Quick sync with Dave↵=====================↵notes with dave↵↵↵Retro↵=====↵retro notes↵` | — |
| `Standup↵=======↵standup notes↵↵↵Planning↵========↵planning notes↵↵↵'Call with Dave↵===============↵call notes↵` | `Standup` | — | `Standup↵=======↵standup notes↵↵↵'Call with Dave↵===============↵call notes↵` | `review: Planning :: planning notes` |
| `Alpha↵=====↵notes alpha↵↵↵'Adhoc Alpha↵============↵alpha adhoc↵↵↵Beta↵====↵notes beta↵↵↵'Adhoc Beta↵===========↵beta adhoc↵` | `Beta, Alpha` | — | `Beta↵====↵notes beta↵↵↵'Adhoc Beta↵===========↵beta adhoc↵↵↵Alpha↵=====↵notes alpha↵↵↵'Adhoc Alpha↵============↵alpha adhoc↵` | `reordered: Beta, Alpha` |
| `'Quick chat↵===========↵notes↵` | `Standup` | — | `'Quick chat↵===========↵notes↵↵↵Standup↵=======↵` | `new: Standup` |
| `Review↵======↵r↵↵↵'Quick chat↵===========↵q↵↵↵Standup↵=======↵s↵` | `Standup @09:00, Review @14:00` | — | `Standup↵=======↵s↵↵↵Review↵======↵r↵↵↵'Quick chat↵===========↵q↵` | `reordered: Standup, Review` |
| `Standup↵=======↵s↵↵↵'Call 11:00↵===========↵c↵↵↵Review↵======↵r↵` | `Standup @about 14:00, Review` | — | `Standup↵=======↵s↵↵↵'Call 11:00↵===========↵c↵↵↵Review↵======↵r↵` | — |

### C12. Timed ad-hoc calls are placed between meetings by start time

When valid `HH:MM` start times exist, each ad-hoc call with a `HH:MM` time in its title (using the last `HH:MM` match) is placed in time order before the first section with a strictly later start time (so same-minute calls follow the meeting, and calls move ahead of `[CANCELED]` sections; non-ad-hoc meetings with times in their titles still follow agenda order).

| Note | Agenda | Removed | After | Changes |
| :--- | :--- | :--- | :--- | :--- |
| `Standup↵=======↵s↵↵↵Planning↵========↵p↵↵↵'Call 13:52↵===========↵c↵↵↵Review↵======↵r↵` | `Standup @09:00, Review @14:00, Retro @16:00` | — | `Standup↵=======↵s↵↵↵'Call 13:52↵===========↵c↵↵↵Review↵======↵r↵↵↵Retro↵=====↵` | `new: Retro; review: Planning :: p` |
| `'Call 13:52↵===========↵c↵` | `Standup @09:00, Review @14:00` | — | `Standup↵=======↵↵↵'Call 13:52↵===========↵c↵↵↵Review↵======↵` | `new: Standup, Review` |
| `'Call 14:00↵===========↵c↵↵↵Review↵======↵r↵` | `Review @14:00` | — | `Review↵======↵r↵↵↵'Call 14:00↵===========↵c↵` | — |
| `Standup↵=======↵s↵↵↵'Call 13:45↵===========↵after design↵↵↵'Call 08:30↵===========↵before first↵↵↵'Call 13:15↵===========↵before design↵↵↵'Call 09:00↵===========↵same as standup↵↵↵'Call 17:30↵===========↵after last↵↵↵Design↵======↵d↵↵↵Retro↵=====↵r↵` | `Standup @09:00, Design @13:30, Retro @16:00` | — | `'Call 08:30↵===========↵before first↵↵↵Standup↵=======↵s↵↵↵'Call 09:00↵===========↵same as standup↵↵↵'Call 13:15↵===========↵before design↵↵↵Design↵======↵d↵↵↵'Call 13:45↵===========↵after design↵↵↵Retro↵=====↵r↵↵↵'Call 17:30↵===========↵after last↵` | — |
| `Standup↵=======↵s↵↵↵[CANCELED] Old sync↵===================↵o↵↵↵'Call 10:30↵===========↵c↵↵↵Review↵======↵r↵` | `Standup @09:00, Review @14:00` | — | `Standup↵=======↵s↵↵↵'Call 10:30↵===========↵c↵↵↵Review↵======↵r↵↵↵[CANCELED] Old sync↵===================↵o↵` | — |
| `Sync 10:00↵==========↵notes↵↵↵Standup↵=======↵s↵` | `Standup @09:00, Sync 10:00 @10:00` | — | `Standup↵=======↵s↵↵↵Sync 10:00↵==========↵notes↵` | `reordered: Standup, Sync 10:00` |
| `'Call 10:00 - 11:30↵===================↵c↵↵↵Morning↵=======↵m↵↵↵Noon↵====↵n↵` | `Morning @10:30, Noon @12:00` | — | `Morning↵=======↵m↵↵↵'Call 10:00 - 11:30↵===================↵c↵↵↵Noon↵====↵n↵` | — |

### C13. Empty notes for today or later fill silently on open

Opening an empty note dated today or later while meetings exist for that day writes the meeting sections at once without review (creating future notes on disk) and places the caret on line 3.

Not run as a table: opening a tab, writing the file immediately, and positioning the editor caret on line 3 are controller and editor actions (the empty-note section output itself is specified in C4).

### C14. Automatic sync applies only changes that cannot lose or reorder text

`computeAutoSync` applies changes (`apply: true`) only when new meetings are added or empty removed sections are dropped without reordering or removing any section that has content; any reorder or non-empty removal sets `needsReview: true` and leaves the note unchanged.

| Note | Agenda | Removed | Added before | Auto-sync |
| :--- | :--- | :--- | :--- | :--- |
| `Standup↵=======↵notes on standup↵↵↵1:1 Dana↵========↵` | `Standup @09:00, Design review @14:00, 1:1 Dana @15:00` | — | — | `apply; added: Design review; after: Standup↵=======↵notes on standup↵↵↵Design review↵=============↵↵↵1:1 Dana↵========↵` |
| `Standup↵=======↵notes↵↵↵Design review↵=============↵↵↵1:1 Dana↵========↵` | `Standup @09:00, Design review @14:00` | — | — | `apply; removed: 1:1 Dana; after: Standup↵=======↵notes↵↵↵Design review↵=============↵` |
| `Old sync↵========↵↵↵Standup↵=======↵notes↵` | `Standup @09:00` | `Old sync` | — | `apply; removed: Old sync; after: Standup↵=======↵notes↵` |
| `Old sync↵========↵kept↵↵↵Standup↵=======↵notes↵` | `Standup @09:00` | `Old sync` | — | `review` |
| `Standup↵=======↵↵↵Design review↵=============↵↵↵1:1 Dana↵========↵agreed on the plan↵` | `Standup @09:00, Design review @14:00` | — | — | `review` |
| `1:1 Dana↵========↵text a↵↵↵Standup↵=======↵text b↵` | `Standup @09:00, 1:1 Dana @15:00` | — | — | `review` |
| `1:1 Dana↵========↵text a↵↵↵Standup↵=======↵text b↵` | `Standup @09:00, Design review @14:00, 1:1 Dana @15:00` | — | — | `review` |
| `Standup↵=======↵↵↵'Call 13:50↵===========↵↵↵1:1 Dana↵========↵` | `Standup @09:00, Design review @14:00, 1:1 Dana @15:00` | — | — | `apply; added: Design review; after: Standup↵=======↵↵↵'Call 13:50↵===========↵↵↵Design review↵=============↵↵↵1:1 Dana↵========↵` |
| `Standup↵=======↵↵↵Design review↵=============↵↵↵1:1 Dana↵========↵` | `Standup @09:00, Design review @14:00, 1:1 Dana @15:00` | — | — | — |

### C15. Automatic sync UI guards, outside-change undo handling, and triggers

Auto-sync runs only when **Add new meetings automatically** is enabled, on a note dated today or later, while no dialog is open and the caret is not on a blank line; it applies as an outside change (no undo step, caret stays on its text) with a status jump message, and checks on tab switch, shortly after edits, on window focus, and once a minute.

Not run as a table: setting checks, date/dialog/caret guards, CodeMirror undo suppression, status bar jump link, and timers belong to the controller and editor.

### C16. Leave-flagged appends `[CANCELED]` and Move to another day merges by title (§509)

"Leave it, flagged" (`flag`) appends the removed section at the end prefixed with `[CANCELED] `, while "Move to another day" (`move`) merges the trimmed body into the end of the target day's matching non-`[CANCELED]` section (after a blank line if that section has text, or directly under its underline if empty) and otherwise appends the section unprefixed at the end.

| Action | Note | Section | After |
| :--- | :--- | :--- | :--- |
| flag | `Standup↵=======↵notes↵` | `1:1 with Priya :: Asked about the roadmap` | `Standup↵=======↵notes↵↵↵[CANCELED] 1:1 with Priya↵=========================↵Asked about the roadmap↵` |
| flag | `Standup↵=======↵notes↵↵↵` | `Old :: x` | `Standup↵=======↵notes↵↵↵[CANCELED] Old↵==============↵x↵` |
| move | `Tomorrow's notes↵================↵` | `1:1 with Priya :: Asked about the roadmap` | `Tomorrow's notes↵================↵↵↵1:1 with Priya↵==============↵Asked about the roadmap↵` |
| move | `` | `1:1 with Priya` | `1:1 with Priya↵==============↵` |
| move | `Standup↵=======↵- ok↵↵↵Weekly sync↵===========↵- tomorrow's point↵↵↵Lunch↵=====↵` | `Weekly sync :: ↵- carried point↵` | `Standup↵=======↵- ok↵↵↵Weekly sync↵===========↵- tomorrow's point↵↵- carried point↵↵↵Lunch↵=====↵` |
| move | `Weekly Sync↵===========↵` | `weekly sync :: - carried point` | `Weekly Sync↵===========↵- carried point↵` |
| move | `··[CANCELED] Weekly sync↵======================↵old↵↵↵Weekly sync↵===========↵- live↵` | `Weekly sync :: - moved` | `··[CANCELED] Weekly sync↵======================↵old↵↵↵Weekly sync↵===========↵- live↵↵- moved↵` |
| move | `[CANCELED] Weekly sync↵======================↵` | `Weekly sync :: - carried point` | `[CANCELED] Weekly sync↵======================↵↵↵Weekly sync↵===========↵- carried point↵` |
| move | `Weekly sync↵===========↵- existing↵` | `Weekly sync :: ↵···↵- first↵↵- second↵···↵` | `Weekly sync↵===========↵- existing↵↵- first↵↵- second↵` |
| move | `Weekly sync↵===========↵- existing↵` | `Weekly sync :: ↵···` | `Weekly sync↵===========↵- existing↵` |
| move | `Weekly sync↵===========` | `Weekly sync :: - moved` | `Weekly sync↵===========↵- moved↵` |
| move | `Weekly sync↵===========↵↵↵Lunch↵=====` | `Weekly sync :: - moved` | `Weekly sync↵===========↵- moved↵↵↵Lunch↵=====` |

### C17. Meetings auto-added earlier and deleted by the user are offered, not re-added

An agenda meeting listed in `alreadyAdded` (matched by normalized title key against non-ad-hoc sections) whose section is missing from the note is returned in `offer` and withheld from automatic addition (while the session file remembers auto-added titles per day and the review dialog lists offered items unchecked).

| Note | Agenda | Removed | Added before | Auto-sync |
| :--- | :--- | :--- | :--- | :--- |
| `Standup↵=======↵↵↵1:1 Dana↵========↵` | `Standup @09:00, Design review @14:00, 1:1 Dana @15:00` | — | `Design review` | `offer: Design review` |
| `Standup↵=======↵s↵` | `Standup @09:00, ··Design review·· @14:00` | — | `··DESIGN REVIEW·` | `offer: Design review` |
| `'Call 08:30↵===========↵c↵↵↵Standup↵=======↵s↵↵↵Design review↵=============↵d↵` | `Standup @09:00, Design review @14:00` | — | `Design review` | — |
| `'Roundtable↵===========↵adhoc notes↵` | `'Roundtable` | — | `'Roundtable` | `offer: 'Roundtable` |
