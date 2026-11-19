# U5: design pass on the screenshot gallery (plan, 2026-11-19)

Review item U5 (`docs/design/forward-review.html`): look at every screen myself, at Marien's real settings and the
others, and come back with a findings page like the editor review (decisions per finding, then fix batches). Parked
2026-11-15; Marien asked to plan it on 2026-11-19.

## What exists

- `tests/e2e/visual-gallery.spec.ts` captures 12 screens (about, actions, command palette, date picker, editor note,
  editor tokens, history, Peek, safety, search, settings, shortcuts) in 5 variants (dark, light, german, dark-150,
  phone): 60 images. `npm run visual:review` sends them to a Gemini model that lists layout problems.
- The gallery predates 10 October: none of due dates, action groups, the week review, person view, rename everywhere,
  suggestions, saved searches, the calendar review / auto-add, Copy as minutes, the on-now chip in Peek, the docked
  Actions pane at 180 px, the compact date picker, the conflict and earlier-versions dialogs.
- It also misses Marien's own setup: Dutch UI, 125 %, Windows "Animation effects" off.

## Steps

1. **Extend the gallery (Gemini, tests only).** Add the missing screens above (about 15 states, each in a seeded,
   realistic note from `src/lib/testing/scenarios`), and two variants: `marien` (Dutch, 125 %, reduced motion, his
   theme) and `light-125`. Keep state names stable. About 27 states x 7 variants = 190 images; the capture stays a
   local, opt-in run. One PR.
2. **Model first pass (Gemini, `npm run visual:review`).** Cheap, flags clipped, overlapping, misaligned or unreadable
   UI per image. Its list is leads, not findings.
3. **My pass (Claude).** I look at every screen in the `marien` variant myself (about 27 images), at the phone variant
   (about 27), and at the other variants only for the screens where theme, language or scale matter or where step 2
   flagged something (about 40). About 95 images. I judge layout, hierarchy, spacing, consistency between dialogs,
   wording (Dutch and English), and whether each screen still fits the design rules (`docs/design/`, the token page).
4. **Findings page.** An HTML page like the editor review: each finding with its screenshot, severity, a
   recommendation, and a choice for Marien. Grouped into fix batches.
5. **Fixes.** Batches as briefs on Gemini, PRs, a beta, as before.

## Cost and timing

- Steps 1-2: Gemini only (about 0.5-1M tokens).
- Step 3 is the expensive one for the Claude budget (about 95 images plus reading the code behind what I find), so it
  starts after the weekly reset (2026-11-20, 01:00) and after X1/X2 are merged, so the screens show them.
- Step 1 can start as soon as X1/X2 are done (it captures the app as it then is).

## Decisions

- 2026-11-19: Marien uses the dark theme: the `marien` variant is dark, Dutch, 125 %, reduced motion.
- Phone: not answered yet; default, the model pass covers all phone screens and I look at the ones it flags plus the
  editor and the main dialogs (about 8).
- Step 1 brief: `docs/briefs/wave-4/U5a-extend-gallery.md`. Done 2026-11-19: 30 states x 7 variants, 203 images.

## Leads noted while capturing (U5a, to check in my pass)

- Dark themes: the "Your name in minutes" input in Settings, Notes & Sync, has a white background.
- The Actions shortcut (`Ctrl+Shift+A` as Playwright sends it) left the whole note selected behind the Actions pane
  in several variants: check whether that happens in the app or only in the test's key event.
- Phone, person view: a long "last mentions" row is clipped at the right edge without an ellipsis.
- Phone, rename preview: a setext underline in the diff wraps its last `=` onto a line of its own.
- Phone, calendar review: a tall empty area between the removed-meeting controls and the footer.

## Model pass (U5b, 2026-11-19)

`npm run visual:review -- --task U5b` (gemini-3.8-flash-high) over 203 images: 16 findings (0 high, 14 medium,
2 low), 428,720 tokens. Report in `test-results/visual/review.md` (local, not committed). Grouped, as leads:

- **Person view, "Last mentions · by meeting":** the last row is clipped mid-word at the right edge, no ellipsis
  (dark, dark-150, german, light, phone). In `marien` the date and section metadata of task rows is clipped too.
- **Dark themes, Settings > Notes & Sync:** the "Your name in minutes" input has a white background (dark, phone).
  Confirms the U5a lead.
- **Untranslated strings:** "45m ago" / "1h ago" in Earlier versions (german, marien); "6 open" in the week review's
  day headers (german).
- **Light themes, search:** pills and glyphs in the selected result row vanish against the blue selection (light,
  light-125).
- **Phone, rename preview:** the setext underline wraps a lone `=` onto its own line. Confirms the U5a lead.
- Low: "middle-click" untranslated in the Shortcuts dialog's close-tab row (german, marien).

Not flagged by the model, still to check: the select-all behind the Actions pane, the phone calendar review gap.
