# Brief R2g: split `src/App.svelte` (1,090 lines, moves only)

Run name `r2g-app-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2g-app-split` · branch `gemini/r2g-app-split` · base `main` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

`<script>` (1-809), markup (811-1090): mobile/peek/zen switches, drag-file overlay, toasts (834-865),
settings page, `.workspace-row` (873-1002), mobile bars and drawers (1003-1017), the modal hosts (1018-1081), boot
loading states (1084-1089).

## The split

Move pure helpers and keyboard-shortcut tables from the script to `.ts` files in a new `src/app/`
folder (keep anything that reads `$state` in the component). Move the modal hosts block (1018-1081) into
`src/app/ModalHosts.svelte` and the toast block (834-865) into `src/app/Toasts.svelte`. The workspace row stays. The
script's `$effect`s stay unless they belong only to a moved block.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/tabs-lifecycle.spec.ts`, `tests/e2e/zen-mode.spec.ts`, `tests/e2e/mobile-bars.spec.ts`, `tests/e2e/compact-date-picker.spec.ts`, `tests/e2e/editor-context-menu.spec.ts`. Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/App.svelte` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/App.svelte` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
