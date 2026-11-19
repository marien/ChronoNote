# Brief U5a: extend the screenshot gallery for the design pass

Run name `u5a-extend-gallery` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\u5a-extend-gallery` · branch
`gemini/u5a-extend-gallery` · base `main` · browser specs: `tests/e2e/visual-gallery.spec.ts` (with
`VISUAL_GALLERY=1`) · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. **Tests only: no app code changes.**

## Why

U5 (`docs/design/u5-design-pass-plan.md`) is a design pass over every screen. The gallery
(`tests/e2e/visual-gallery.spec.ts`) has 12 screens in 5 variants and nothing added since 10 October, and none of its
variants matches Marien's setup (dark theme, Dutch UI, 125 %, Windows "Animation effects" off).

## What to build

1. **Two variants**, added to `VARIANTS` (keep the existing five and their names):
   - `marien`: `themeMode: "dark"`, `languageMode: "nl"`, `deviceScaleFactor: 1.25`, `reducedMotion: "reduce"`,
     a 1536x864 viewport (1920x1080 at 125 %).
   - `light-125`: `themeMode: "light"`, `languageMode: "en"`, `deviceScaleFactor: 1.25`, same viewport.
2. **New states** (screen names in kebab-case, stable; each in the `busy-week` scenario or a seeded note that shows
   the feature with realistic content, not an empty state, unless the state is about the empty case):
   `due-dates` (a note with open actions with due dates, one overdue, and the status bar's due item),
   `due-picker` (the compact date picker opened from a due date), `action-groups` (a note with action groups and their
   tree lines), `week-review`, `person-view` (Ctrl+click an `@name`; on a wide window the pane beside the note),
   `rename-preview` (rename everywhere: the dialog with its list of changes), `suggestions-name` (the `@` suggestion
   list open), `suggestions-title` (typing in a section title), `saved-searches` (search with a saved search chip),
   `calendar-review` (the calendar sync review dialog with a removed meeting with text), `peek-on-now` (Peek with the
   on-now chip and its list open), `actions-docked-narrow` (the Actions pane docked at its 180 px minimum),
   `actions-docked-wide`, `copy-minutes` (the confirmation or menu after Copy as minutes, whatever is visible),
   `earlier-versions`, `conflict` (the external-change conflict dialog), `settings-notes-sync` and
   `settings-appearance` (the two largest settings panels). A state that a variant cannot reach (the phone has no
   Peek) is skipped with a log line, as the existing `overlay()` does.
   Use the mock backend's seeds and the existing helpers (`seedApp`, `editor`, `setEditorText`, `parkMouse`); add a
   seeded agenda (`.agenda.json`) where a state needs a meeting. Read `docs/spec.md` for how to reach each screen.
3. Run `VISUAL_GALLERY=1 npx playwright test tests/e2e/visual-gallery.spec.ts --workers=1` and check every new image
   shows what its name says (open a few per variant). Do not commit the images.
4. `scripts/visual-review.mjs`: its `--only` list and any variant list in it gain the two new variants.

## Out of scope

Any file under `src/` (mock seeds may be extended only in `src/lib/testing/` if a state cannot be reached otherwise;
say so). The other e2e specs.

## Done when

- [ ] The gallery captures all old and new states in all 7 variants without failures (skips logged).
- [ ] `git diff --stat` shows only `tests/e2e/visual-gallery.spec.ts`, `scripts/visual-review.mjs` and, if needed,
      `src/lib/testing/*`.
- [ ] `npm run check:e2e`, `npm run type-escapes` and `npm run verify` pass. Commit before the final report.

## Report

The standard report from RULES.md, plus: the list of states and variants with the number of images captured per
variant, every state that was skipped and why, and any screen that looked broken while you checked the images (a lead
for the design pass, not something to fix).
