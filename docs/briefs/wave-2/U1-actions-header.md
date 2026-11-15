# Brief U1: the Actions pane header in two calm rows

Run name `u1-actions-header` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u1-actions-header` · branch
`gemini/u1-actions-header` · base `main` · browser-test port `1454` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. Design and decisions: `docs/design/wave2-designs.html`,
section U1 (the mockups there are the target; U1.1 as proposed, U1.2 hints behind `?`, U1.3 shorter labels).

## Why

In Dutch the Actions pane's filter placeholder is cut off, the count wraps to two lines and at a narrow pane the "Op
deadline" switch runs off the edge. Four rows of controls and a two-line footer surround the list the pane is for.
After this brief the header is two rows that fit from 180 px to 800 px in every language, and the key hints live
behind a `?` button.

## What exists now

`src/lib/components/modals/ActionDrawerModal.svelte`:
- lines 524-545: row 1, `.modal-input-wrap` with an icon, the filter `<input class="modal-input">`
  (placeholder `actionDrawer.filterPlaceholder`), `<span class="modal-counter">` (`actionDrawer.counter`), the close
  button;
- lines 546-562: the filter chips row (`.search-chips-row`), only when the filter holds operators. Keep as is;
- lines 563-590: row 2, a second `.modal-input-wrap` holding `.settings-toggle-row`: the `Segmented` scope control
  (three options), a spinner, and two `label.toggle-switch` (only open, by due date; the first is disabled while the
  filter holds `is:`);
- lines 728-731: `.modal-footer` with `.modal-footer-hints` (three key hints).

`src/lib/components/modals/WeekReviewModal.svelte`: the same footer at lines 596-599 (five hints); its header is near
line 381.

`src/lib/components/Segmented.svelte` (40 lines): the scope control. Styles: `.modal-input-wrap`, `.modal-counter`,
`.modal-footer*` in `src/styles/06-modals.css`; `.settings-toggle-row`, `.toggle-switch*` in
`src/styles/08-toast-settings.css`. Phone rules for the drawer are in `src/styles/09-mobile.css`.

The pane is docked on windows 1000 px or wider, at 18 % to 60 % of the window width, so 180 px to about 800 px. On
narrower windows and on the phone the same component is a dialog or a sheet.

Strings: `actionDrawer.*` in `src/lib/i18n/locales/*.ts` (English lines 296-326).

## What to build

**Row 1:** the filter input (takes all free width), then three icon buttons: Copy (a placeholder slot for brief F8:
render nothing yet, but leave a comment `<!-- F8: copy button goes here -->` at that spot), `?` (help), close.
The leading icon is removed. The placeholder becomes short:

| Key | English | Dutch |
| :--- | :--- | :--- |
| `actionDrawer.filterPlaceholder` | Filter actions… | Filter acties… |

**Row 2:** scope, then the two switches as chips, then the count pushed to the right (`margin-left: auto`). The row
may wrap; when it wraps, the count stays on the first line's right if it fits, else moves to the second line.
- Chips: a `<button type="button" class="filter-chip" aria-pressed="true|false">`; filled with the accent when
  pressed (use the tokens the selected `.segmented-option` uses). They replace the two `label.toggle-switch` and keep
  their behaviour, titles and the disabled state of "only open" (`disabled` + the existing tooltip).
- Scope labels become shorter in every language; the long label stays as the tooltip (`title`), which already exists:

| Key | English | Dutch |
| :--- | :--- | :--- |
| `actionDrawer.scope.openTabs.label` | Open tabs | Open tabs |
| `actionDrawer.scope.otherNotes.label` | Other | Overig |
| `actionDrawer.scope.allFiles.label` | All | Alles |
| `actionDrawer.onlyOpen.label` | Only open | Alleen open |
| `actionDrawer.dueView.label` | By due date | Op deadline |

  For German, French, Polish, Spanish and Italian choose the equivalent one-word forms of "Other" and "All" and list
  them in the report as "needs a native check".
- When the pane's own width is under 300 px (a container query on the pane, or a `ResizeObserver` that sets a class;
  not a media query on the window), the three-part scope control is replaced by ONE chip showing the current scope
  with a `▾`, which opens a small menu of the three options (Up/Down, Enter, Escape; reuse the menu pattern of the
  top bar's `+` split button in `TopBar.svelte`).
- Count: `<open> open · <listed>`. New key `actionDrawer.counterShort` (`({ open, listed }) => \`${open} open · ${listed}\``;
  Dutch the same). Under 300 px: `<open> · <listed>`. The old sentence (`actionDrawer.counter`) becomes its
  `title` and its `aria-label`.

**The `?` button** (in the Actions pane and in the week review): opens a small anchored popover, closed by Escape, a
click outside, or the button again; focus returns to the filter (Actions) or the list (week review). Content:
- the key hints that were in the footer, one per line, same keys and words;
- Actions pane only, under a rule: what the filter understands, one line each, as `code` + three or four words:
  `@`, `is:open`, `is:done`, `tag:`, `has:@name`, `since:`, `before:`, `due:`. New keys
  `actionDrawer.help.*`; English and Dutch from you, the rest marked for a native check.

**The footers** (`.modal-footer` at ActionDrawerModal 728-731 and WeekReviewModal 596-599) are removed. If a
`.modal-footer` rule in the CSS is then used by no other component (check with a search), leave the CSS alone anyway:
other dialogs use it.

Nothing else changes: the list, the keys, the filter's behaviour, the chips row for operators, the phone sheet's
content. On the phone (`$isMobile`) the header uses the same two rows; chips are at least 32 px high there.

## Out of scope

The list rows. The Search dialog. Section History. Any change to what the filter matches. The Copy button itself (F8).

## Tests to add

`tests/e2e/actions-header.spec.ts`, seed `scenario("busy-week")`:

1. For each language of `nl`, `de`, `en` and each pane width of 180, 240, 330, 500 px (set the window to 1100 px wide
   and `actionsPaneShare` in the seed to width / 1100; for 180 use a 1000 px window and share 0.18): open the pane
   and assert for the filter input, every chip, every scope option or the scope chip, the count and the three
   buttons: the element's right edge is inside the pane's right edge, `scrollWidth <= clientWidth + 1`, and the count
   is one line high (its height is under 1.6 times its line height). For the input: the placeholder's rendered width
   (measure the placeholder text with a canvas in the input's font) is at most the input's inner width.
2. Chips: clicking "Only open" toggles `aria-pressed` and the list changes as before; with `is:open` in the filter
   the chip is disabled.
3. Under 300 px the scope is one chip; its menu switches the scope by keyboard.
4. `?` opens the popover, lists the three hints, Escape closes it and focus is back in the filter. Same in the week
   review with its five hints.
5. No `.modal-footer` inside the Actions pane or the week review.

Existing specs that mention the old labels or the footer will fail. Update each to the new labels (the assertion's
meaning stays) and list every changed assertion in the report:
`action-drawer-filters`, `action-groups-drawer.independent`, `drawer-filters.independent`, `due-dates-overview`,
`due-dates-overview.independent`, `due-upcoming.independent`, `list-style-dates.independent`, `mobile-tabs`,
`actions-pane`, `pane-resize`, `visual-audit`, and any week review spec that reads the footer.

Run:

```bash
E2E_PORT=1454 npx playwright test tests/e2e/actions-header.spec.ts tests/e2e/action-drawer-filters.spec.ts tests/e2e/action-groups-drawer.independent.spec.ts tests/e2e/drawer-filters.independent.spec.ts tests/e2e/due-dates-overview.spec.ts tests/e2e/due-dates-overview.independent.spec.ts tests/e2e/due-upcoming.independent.spec.ts tests/e2e/list-style-dates.independent.spec.ts tests/e2e/mobile-tabs.spec.ts tests/e2e/actions-pane.spec.ts tests/e2e/pane-resize.spec.ts tests/e2e/visual-audit.spec.ts --workers=2 --reporter=line
```

and every spec file whose name contains `week-review`.

## Done when

- [ ] `npm run verify` and `npm run build` pass.
- [ ] The command above passes.
- [ ] Screenshots of the pane in Dutch at 180, 330 and 500 px, light and dark, saved under
      `test-results/u1/` (not committed) and their paths in your report.

## Report

The standard report, plus the list of changed assertions in existing specs (file, old text, new text) and the
one-word scope labels you chose for the five other languages.
