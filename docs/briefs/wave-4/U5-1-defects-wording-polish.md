# Brief U5-1: design pass fixes, batches A, C and D (defects, wording, polish)

Run name `u5-1-fixes` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u5-1-fixes` · branch `gemini/u5-1-fixes` ·
base `main` · browser-test port `1441` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

The design pass (`docs/design/u5-design-review.html`, screenshots in `docs/design/u5-review/`) found 21 problems;
Marien approved every proposal on 2026-11-20. This run does the defects (F1-F7), the wording (F15-F18) and the polish
(F19-F21). Another run (U5-2) does F8-F14 at the same time: it edits `SearchModal.svelte` (context lines, chips),
`HistoryModal.svelte`, `VersionsModal.svelte` layout, `WeekReviewModal.svelte` header, the phone sheet sizing and the
phone text-width default. Stay out of those parts; where you must touch the same file (F3 in `VersionsModal`, F18 and
F4 in `SearchModal`), keep the change to the lines named here.

Open each finding's screenshot crop before you start it (`docs/design/u5-review/fNN-*.png`; the file names are listed
per finding).

## What to build

Locale rule for every string change: all 7 locales (`src/lib/i18n/locales/{en,nl,de,fr,it,pl,es}.ts`); put new keys
next to the existing keys of the same component, never at the end of the file (the other run adds keys too). Dutch and
English must read naturally; for de/fr/it/pl/es write your best translation and list them in the report (a native
speaker checks them later).

1. **F1, shortcut label** (`f01-shortcut-label.png`). `src/lib/shortcuts.ts` `KEY_LABELS` (around line 367) has
   `ArrowLeft: "Left"` but no `ArrowRight`, so Forward shows `Ctrl+Alt+ArrowRight`. Add `ArrowRight: "Right"` and
   `BracketRight: "]"`. Add a test in `src/lib/shortcuts.test.ts`: for every combo in the registry, `formatCombo`
   returns no label that starts with `Arrow`, `Key`, `Digit`, `Bracket`, `Comma`, `Period` or `Slash`.
2. **F2, white field** (`f02-white-input.png`). Settings, Notes & sync, "Your name in minutes": the text input has the
   browser's white background in dark themes. Style it like the other inputs in Settings (find the component that
   renders Settings, `src/lib/components/modals/SettingsModal.svelte` and what it includes): theme tokens for fill,
   border, text, the accent on focus. Check light and dark.
3. **F3, untranslated words** (`f03-ago.png`).
   - `VersionsModal.svelte` lines ~103-105 build `"${n}m ago"` / `"${n}h ago"` by hand. Use i18n keys
     (nl: "45 min geleden", "1 uur geleden"; en: "45 min ago", "1 h ago"; check `AboutModal`'s `agoLabel` and the
     existing `*.ago*` keys first and reuse one if it fits).
   - `src/lib/shortcuts.ts` line ~94 `extra: "middle-click"`: make it translatable (nl "middelklik", de "Mittelklick").
   - `WeekReviewModal.svelte` line ~549 `{row.openCount} open`: an i18n key (de "offen").
   - Add a test that fails when one of these three comes back in English for nl and de.
4. **F4, pills in the selected search row** (`f04-search-selected-light.png`). In `SearchModal.svelte`'s result list,
   a selected row (blue) makes `@name` pills and the `=>` arrow blue on blue. Inside a selected row, pills and glyphs
   use the selection's text colour, the pill keeps a faint outline (a translucent border of that colour). Apply the
   same rule in the command palette and the Actions list if they use the same selection colour and the same pills
   (check; say in the report). Only the CSS for selected rows changes.
5. **F5, person view** (`f05-person-desktop.png`, `f05-person-phone.png`). `PersonModal.svelte` (the pane and the phone
   sheet). Each row's action text gets the ellipsis; the date stays whole in its own right-aligned column; the section
   name after it may be ellipsised. The "Last mentions · by meeting" rows get an ellipsis on the section title, never
   cut the "1 line" count. Phone (narrow, under 600 px): date and section go on a second muted line under the text.
6. **F6, rename preview** (`f06-rename-phone.png`). `RenameModal.svelte`: leave setext underline lines out of the
   preview rows; one line above the list says the underline is renamed with the title (en "Underlines are updated
   with their titles.", nl "Onderstrepingen worden met hun titel aangepast."). The rename itself still changes the
   underline as it does now (check the existing tests still pass).
7. **F7, conflict dialog** (`f07-conflict.png`). `ConflictModal.svelte` + keys `conflictModal.*`: the explanation
   quotes the exact button names (`conflictModal.explanation.keepDiskRef` = the `keepDiskVersion` text,
   `keepMineRef` = the `keepMyVersion` text; derive them from the same key so they can't drift). Shorter middle
   button: en "Save mine as a copy", nl "Mijn versie als kopie". Check it fits on one line at 1536 px in nl and de.
8. **F15, close warning** (`f15-safety.png`). `SafetyModal.svelte` + `safetyModal.*`: sentence case.
   en title "Close with open actions?", text "2026-09-07 has 1 open action." / "... has 3 open actions." (a real
   plural, the tab's name without `.txt`), buttons "Cancel" / "Close anyway". nl "Sluiten met open acties?",
   "2026-09-07 heeft 1 open actie." / "... 3 open acties.", "Annuleren" / "Toch sluiten". Others to match.
9. **F16, About** (`f16-about-version.png`). `AboutModal.svelte` / `AboutPanel.svelte`: "Versie 0.39.0", no `v`
   after the word.
10. **F17, Actions count** (`f20-actions-count.png`). `ActionDrawerModal.svelte` line ~830 and
    `actionDrawer.counterShort`: when open equals listed, show only "13 open" (narrow: "13"); otherwise
    "13 open · 20 listed" (narrow "13 · 20"). nl "13 open · 20 getoond".
11. **F18, empty search** (`f21-search-empty.png`). `SearchModal.svelte`: no match count while the query is empty.
    Instead, under the scope buttons, one muted hint line: en "Search words, @name, is:open, due:"; nl
    "Zoek op woorden, @naam, is:open, due:". Only that line and the count; the chips are U5-2's.
12. **F19, tree line tick** (`f19-tree-tick.png`). `src/lib/editor/actionTreeLines.ts` (`treeConnectors`): when every
    child of a parent is an arrow line at the parent's own indent (no indented child), draw no connector for that
    group. Groups with an indented child keep the line exactly as now, including their same-indent arrow children.
    Update `docs/spec.md` line ~170 (the tree line sentence) with this exception. Add cases to the existing tree line
    tests.
13. **F20, settings focus box** (`f17-settings-tab-focus.png`). Opening Settings puts focus on the first tab and draws
    the focus rectangle over its underline. Keep the focus there, but show focus on the tabs as the underline plus a
    brighter label; the rectangle only appears with `:focus-visible` after a Tab-key move (if `:focus-visible` already
    matches on open because focus came from the keyboard shortcut, suppress the ring for the programmatic focus only,
    e.g. a flag set when the modal focuses the tab itself).
14. **F21, status bar** (`f18-status-toast.png`). `StatusBar.svelte`: a transient message (e.g. "Notulen gekopieerd.")
    no longer shrinks the counts to bare numbers or hides the folder name when there is room. The message takes the
    free space in the middle; only when the window is too narrow for both does the compact form apply (keep whatever
    threshold logic exists, but measure with the message present). Test at 1536 and 800 px wide.

## Out of scope

F8-F14 (run U5-2). Any change to the editor's text rendering other than step 12. The token glyphs and their widths.

## Tests to add

Unit tests named in steps 1, 3, 12, plus a unit or component test for step 10's counter text and step 8's plural.
Run `tests/e2e/*safety*`, `*conflict*`, `*rename*`, `*person*`, `*search*`, `*settings*`, `*status*`, `*action*` specs
that exist and `tests/e2e/visual-gallery.spec.ts` with `VISUAL_GALLERY=1` for the `marien` and `light` variants;
look at the images of every screen you changed.

## Done when

- [ ] Each of the 14 steps done; the report lists each with the file(s) changed.
- [ ] `npm run check:e2e`, `npm run type-escapes` and `npm run verify` pass. The dictionary test passes.
- [ ] Commit before the final report.

## Report

The standard report from RULES.md, plus: the translations you wrote for de/fr/it/pl/es (per key), step 4's answer
about the palette and Actions, and anything in a screenshot after your change that still looks off.
