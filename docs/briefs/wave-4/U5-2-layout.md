# Brief U5-2: design pass fixes, batch B (layout)

Run name `u5-2-layout` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u5-2-layout` · branch `gemini/u5-2-layout` ·
base `main` · browser-test port `1442` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

The design pass (`docs/design/u5-design-review.html`, screenshots in `docs/design/u5-review/`) found 21 problems;
Marien approved every proposal on 2026-11-20. This run does the layout batch, F8-F14. Another run (U5-1) does the
rest at the same time and touches: `shortcuts.ts`, Settings inputs and tabs, `VersionsModal`'s "ago" text only,
`WeekReviewModal`'s "open" count text only, the selected-row CSS and the empty-state hint/count in `SearchModal`,
`PersonModal`, `RenameModal`, `ConflictModal`, `SafetyModal`, About, the Actions counter, `actionTreeLines.ts`,
`StatusBar`. Stay out of those parts.

Open each finding's screenshot crop before you start it (`docs/design/u5-review/fNN-*.png`).

Locale rule: all 7 locales (`src/lib/i18n/locales/{en,nl,de,fr,it,pl,es}.ts`); new keys next to the existing keys of
the same component, never at the end of the file. List your de/fr/it/pl/es strings in the report.

## What to build

1. **F8, search context line** (`f08-search-context.png`). `src/lib/components/modals/SearchModal.svelte` (and
   wherever it picks the grey context line above a hit): when the line above the hit is a setext underline
   (`===` / `---` under a title), show the section title instead. A hit with no title above keeps today's behaviour.
   Unit test for the picker: hit right under `Title`/`=====` -> context `Title`; hit under prose -> that prose.
2. **F9, saved search chips** (`f09-search-chips.png`). Today there are two chip rows: the saved searches, and the
   active query again with a ×. Make it one row: the saved chip whose query equals the current query is shown as
   selected (accent fill), and its × (shown on the selected chip, and on hover/focus of any chip) removes that saved
   search. No second row. Clicking a chip still runs it. Keyboard: the chips stay reachable with Tab, Delete on a
   focused chip removes it. Update the existing saved-search specs to the one-row layout (list each changed assertion
   in the report: that is this change, not a regression).
3. **F10, phone sheets** (`f10-phone-sheet.png`). On the phone, modals shown as bottom sheets are nearly full height
   whatever they hold, so the calendar review has ~450 px of empty space above its buttons. Sheets size to their
   content up to today's maximum height, with the footer buttons right under the content. Find the shared sheet
   styling (the phone variant of the modal shell); change it once, not per modal. Check the calendar review, rename,
   settings, week review, person view and Actions sheets on the phone variant: short ones shrink, long ones keep
   today's height and scroll inside.
4. **F11, phone week review title** (`f11-phone-week-title.png`). `WeekReviewModal.svelte` header: under 600 px wide
   the title is "Wk 36 · 31 Aug – 6 Sep" (nl "Wk 36 · 31 aug – 6 sep", locale date format; the year only when the
   week is not in the current year), and the Copy and Help buttons move from the header into the sheet's footer.
   Desktop unchanged.
5. **F12, section history with one date** (`f12-history-one-date.png`). `HistoryModal.svelte` /
   `history/HistoryPreview.svelte`: the preview box sizes to its content (min about 3 lines) instead of filling the
   panel. Key `history.takeover.none` becomes en "This is the only time this section appears." and nl "Deze sectie
   komt alleen hier voor." (others to match).
6. **F13, earlier versions** (`f13-earlier-versions.png`). `VersionsModal.svelte`: the dialog may grow to 1100 px wide
   (still fits the window with its margin); the preview no longer wraps typical note lines at 1536 px. Only lines that
   differ between the chosen version and the current one are highlighted (today the whole current text is). With room
   (dialog >= 900 px), show the chosen version and the current one side by side; narrower, keep them stacked. Leave
   the "ago" strings alone (U5-1 translates them). Use an existing line diff in the codebase if there is one
   (search for `diff` in `src/lib`); otherwise a simple LCS on lines is fine. Unit test the diff marking.
7. **F14, phone text width** (`f14-phone-long-lines.png`). The editor's text-width setting (Full / Wrap / Reading
   column, see Settings, Appearance, "Tekstbreedte") defaults to "Wrap" on the phone (the mobile / web-app phone
   layout) when the user has never chosen a value; an explicit choice is kept everywhere. Desktop default unchanged.
   Say in the report how "phone" is detected and where the default lives. Update `website/guide.html` if it states the
   default.

## Out of scope

Everything U5-1 does (listed above). The editor's text rendering. Peek.

## Tests to add

Unit tests named in steps 1 and 6; a test for step 7's default (phone without a stored value -> wrap; with a stored
"full" -> full). Run the existing `tests/e2e/*search*`, `*saved*`, `*history*`, `*version*`, `*week*`, `*mobile*`,
`*sheet*`, `*calendar*` specs that exist, and `tests/e2e/visual-gallery.spec.ts` with `VISUAL_GALLERY=1` for the
`phone` and `marien` variants; look at every changed screen's image.

## Done when

- [ ] Steps 1-7 done; the report lists each with the file(s) changed.
- [ ] `npm run check:e2e`, `npm run type-escapes` and `npm run verify` pass.
- [ ] Commit before the final report.

## Report

The standard report from RULES.md, plus: the translations you wrote, the spec assertions changed on purpose in step 2,
step 7's answers, and anything in a screenshot after your change that still looks off.
