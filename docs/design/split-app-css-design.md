# Splitting app.css into component styles

Status: proposal, 2026-10-07. Waiting for Marien's approval.

## Problem

`src/app.css` is 4,581 lines of global CSS. Only 3 of about 37 components have their own `<style>` block. Every
rule is global, so:

- A selector written for one component can match another (the `#top-bar .icon-btn` specificity problem found
  reviewing PR #122 in v0.22.0, and the `.more-actions-item span` rule that stretched a pip in §263).
- Finding the rules for a component means searching the whole file; deleting a component never deletes its CSS.
- The file mixes three kinds of rules that should be treated differently: design tokens (colours, theme,
  palettes), genuinely global rules (the editor's `.cm-*` and `.glyph-*` classes, which CodeMirror renders
  outside any Svelte component), and component rules.

## Proposal

Keep three things global, move the rest into the components that own them:

| Stays global | Why |
|---|---|
| `src/styles/tokens.css`: `:root` variables, theme blocks (light/dark/pure black), the color/grayscale/legacy palettes | Shared by everything, including the web app and demo builds |
| `src/styles/editor.css`: `.cm-*`, `.glyph-*`, wrap indent, setext rule, overview ruler, find highlight | CodeMirror creates these elements, so Svelte scoping can't reach them |
| `src/styles/base.css`: resets, scrollbars, shared building blocks used by many components (`.modal-card`, `.overlay`, `.icon-btn`, `.settings-btn`, segmented control) | Real shared UI vocabulary |

Everything else moves into a `<style>` block in its component (`TopBar.svelte`, `StatusBar.svelte`,
`DatePickerModal.svelte`, `HistoryModal.svelte`, …). Svelte scopes those rules to the component.

## Migration plan

Mechanical, one area per branch, each verified by screenshots:

1. Split the file into the three global files with no rule changes (pure moves). Gate: the
   `visual.spec.ts` gallery and `visual-audit.spec.ts` produce the same screenshots (compare them by eye or
   with a pixel diff for this one step only).
2. Per component (top bar, status bar, date picker, each modal): move its rules into the component. Rules that
   target children rendered by other components need `:global(...)`; that list is the review checklist.
3. Delete rules that no longer match anything (Svelte warns about unused scoped selectors, which finds dead
   CSS for free).

## Risks

- Scoped styles get a hash class, which raises specificity slightly. A few overrides in the global files may
  start losing to component rules. The visual audit catches it.
- This is the largest diff of the four refactors with the least user-visible gain. If time is short, it is the
  one to drop.

## Recommendation

Do it last, after the tokenizer and overlay work, so those changes don't conflict with large CSS moves.
