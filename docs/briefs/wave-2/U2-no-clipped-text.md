# Brief U2: no clipped text in any language

Run name `u2-clipped-text` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u2-clipped-text` · branch
`gemini/u2-clipped-text` · base `main` after U1 is merged · browser-test port `1456` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. You change test files only, unless the last section applies.

## Why

`tests/e2e/visual-audit.spec.ts` already opens the dialogs in every language and reports elements whose content is
wider than their box. It still missed three faults in the Dutch Actions pane: a cut-off placeholder, a count wrapped
to two lines, and a switch outside the pane. This brief closes those three holes so the next one is caught by a test.

## What exists now

`tests/e2e/visual-audit.spec.ts`:
- `findOverflows(page, rootSelector, locale, modalName)` (line 17) walks every element under a root and reports
  `scrollWidth > clientWidth + 1`, skipping hidden elements, drawn glyph boxes, deliberate ellipsis and scrollable
  boxes;
- one test per language (line 80), seeded with `scenario("busy-week")` and `languageMode: locale`, at the default
  1100 × 720 window; a second block near line 225.

What it cannot see:
1. an `<input>`'s placeholder that is wider than the input (a placeholder never changes `scrollWidth`);
2. text that wrapped onto a second line where one line is intended;
3. an element that sticks out of its pane without overflowing its own box;
4. the docked panes at their narrow and wide ends, and the phone width.

## What to build

1. In `findOverflows`, three more checks, each reported as an issue with a `details` text naming the check:
   - **placeholder:** for every visible `input[placeholder]` and `textarea[placeholder]`: measure the placeholder
     with a canvas 2D context set to the element's computed `font`; report when it is wider than the element's
     `clientWidth` minus its horizontal padding.
   - **one-line elements:** for elements matching a list of selectors kept at the top of the spec
     (`ONE_LINE = [".modal-counter", ".filter-chip", ".segmented-option", ".modal-group-header", ".band-title",
     "#status-bar button", ".tab-label", "button.icon-btn"]`): report when the element's height is more than 1.6 times
     its computed line height (plus vertical padding and border).
   - **inside its container:** for every visible button, input, label, chip and `.segmented` under the root: report
     when its right edge is more than 1 px right of the root's right edge, or its left edge more than 1 px left of
     the root's left edge, unless an ancestor between it and the root scrolls horizontally.
2. Run the existing per-language walk at more sizes. Keep 1100 × 720 as it is and add, for every language:
   - window 1000 × 720 with `actionsPaneShare: 0.18` and `historyPaneShare: 0.18` (the narrowest docked panes): open
     the Actions pane, then Section History, then the week review, and check each pane's root;
   - window 1600 × 900 with both shares at 0.30;
   - phone: 390 × 844 with the coarse-pointer setup the existing mobile specs use (copy it from
     `tests/e2e/mobile-tabs.spec.ts`): the app bar, the bottom bar, the Actions sheet, the More sheet, Settings.
3. Each issue's message names language, size, surface, selector and text, so a failure reads as a work list.

## If the new checks find faults in the app

They probably will. Do NOT fix app code in this brief and do not weaken the check. For each fault:
- add one entry to a list `KNOWN = [{ locale, size, surface, selector, reason: "found by U2, to fix" }]` at the top
  of the spec; a known entry is reported with `test.info().annotations` and does not fail the test;
- an entry in `KNOWN` that no longer occurs FAILS the test ("fixed: remove it from KNOWN"), so the list can only
  shrink.

Put the full list in your report. The reviewer turns it into fixes.

## Out of scope

The Windows layout job's project list in `playwright.config.ts`. Screenshot comparison. App code.

## Tests to add

The checks are the tests. Prove each new check can fail: in a scratch test that you do not commit, narrow one input
with `page.addStyleTag` so its placeholder is cut, force a `.modal-counter` to wrap, and push a chip outside its
pane; each must be reported. Say in the report that you did this and what was reported.

Run:

```bash
E2E_PORT=1456 npx playwright test tests/e2e/visual-audit.spec.ts --workers=2 --reporter=line
```

## Done when

- [ ] `npm run verify` passes.
- [ ] The command above passes, with every remaining fault listed in `KNOWN`.
- [ ] The spec's run time is in your report (before and after); if it more than triples, say so and stop adding sizes.

## Report

The standard report, plus the `KNOWN` list as a table: language, size, surface, element, what is wrong.
