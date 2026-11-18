# Brief R2e: split `src/lib/components/modals/SettingsModal.svelte` (1,486 lines, moves only)

Run name `r2e-settings-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2e-settings-split` · branch `gemini/r2e-settings-split` · base `main` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

`<script>` (1-448), the tab list `.settings-tabs` (450) and one panel per tab up to line 1043, the page
and overlay wrappers (1044-1094), the OneDrive folder picker (1095), `<style>` (1099-1486).

## The split

Folder `src/lib/components/modals/settings/`: one component per settings tab panel (named after the
tab, for example `GeneralPanel.svelte`), each with the state, handlers and CSS only that panel uses.
`SettingsModal.svelte` keeps the tab list, keyboard handling, the page/overlay wrappers and shared state. A CSS rule
used by several panels stays in the parent as `:global` only if it already reaches into `SettingRow`/`SettingToggle`;
otherwise it moves to the one panel that uses it.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/settings.spec.ts`, `tests/e2e/settings-wide-fonts.spec.ts`, `tests/e2e/onedrive-first-connect.spec.ts`; also run the first two with `E2E_WINDOWS_LAYOUT=1`. Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/lib/components/modals/SettingsModal.svelte` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/lib/components/modals/SettingsModal.svelte` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
