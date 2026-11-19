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

## Open questions for Marien

- Which theme do you use day to day (light, dark, or following Windows)? That becomes the `marien` variant.
- Phone: include it in my own pass (about 27 more images), or leave the phone to the model pass?
