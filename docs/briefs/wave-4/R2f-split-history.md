# Brief R2f: split `src/lib/components/modals/HistoryModal.svelte` (1,256 lines, moves only)

Run name `r2f-history-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2f-history-split` · branch `gemini/r2f-history-split` · base `main` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

`<script>` (1-670), the content (673-892: title input, results list, groups, preview), the docked card
and the overlay wrappers (893-912), `<style>` (913-1256).

## The split

Folder `src/lib/components/modals/history/`: the pure grouping and formatting helpers from the script
to `historyHelpers.ts`, the results list (rows and groups) to `HistoryResults.svelte`, the preview to
`HistoryPreview.svelte` if it is a separate region. `HistoryModal.svelte` keeps the input, the keyboard handling and
the docked/overlay wrappers.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/history-pane.spec.ts`, `tests/e2e/history-groups.independent.spec.ts`, `tests/e2e/search-and-history.spec.ts`; also with `E2E_WINDOWS_LAYOUT=1`. Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/lib/components/modals/HistoryModal.svelte` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/lib/components/modals/HistoryModal.svelte` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
