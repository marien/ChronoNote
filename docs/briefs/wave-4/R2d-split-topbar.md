# Brief R2d: split `src/lib/components/TopBar.svelte` (1,764 lines, moves only)

Run name `r2d-topbar-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2d-topbar-split` · branch `gemini/r2d-topbar-split` · base `main` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

`<script module>` (1-36), `<script>` (38-753), markup (754-1278): merged-titlebar block (761), dev
marker (764), the horizontal tab strip `{#if !showHorizontalTabs}` (768-945), `.titlebar-commands` (946-1015), merged
window buttons (1016-1033), the off-screen measurement clone of the commands (1034-1068), the `+` menu
`{#if newMenuOpen}` (1069-1115), the tab context menu `{#if contextMenuVisible && contextTab}` (1116-1278); `<style>`
(1279-1764).

## The split

Folder `src/lib/components/topbar/`: `TabStrip.svelte` (the tab strip with its scroll arrows and
their state and handlers), `NewMenu.svelte` (the `+` menu), `TabContextMenu.svelte` (the tab context menu), and pure
helpers from the script to `topbar/topbarHelpers.ts`. The commands row and its measurement clone stay in
`TopBar.svelte` (the #61 collapse logic measures both together). Each moved region takes its CSS rules along.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/titlebar.spec.ts`, `tests/e2e/merged-titlebar.spec.ts`, `tests/e2e/topbar-collapse.spec.ts`, `tests/e2e/tab-scroll-arrows.spec.ts`, `tests/e2e/tab-switch-width.spec.ts`, `tests/e2e/tab-archetypes.spec.ts`, `tests/e2e/tabs-lifecycle.spec.ts`; also run these with `E2E_WINDOWS_LAYOUT=1`. Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/lib/components/TopBar.svelte` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/lib/components/TopBar.svelte` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
