# Brief R2b: split `src/lib/boot.ts` (1,093 lines, moves only)

Run name `r2b-boot-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2b-boot-split` · branch `gemini/r2b-boot-split` · base `main` ·
model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

Top-level sections (line numbers on `main`, 2026-11-18): standing subscriptions `wireStatusBarSync`,
`syncActiveStatus`, `folderNameFromPath`, `wireWindowTitleSync`, `bringToFrontAfterUpdate` (95-171); §93 close
barrier `wireCloseBarrier`, `flushThenDestroy` (172-212); §94 drift detection `wireDriftDetection` (213-260); #72 date
rollover (261-293); `cancelAppClose`, `confirmDiscardAndClose` (294-308); DOM appliers `applyColorModeToDom`,
`applyThemeModeToDom`, `applyPureBlackToDom`, `applyLocaleToDom` (311-372); tab session `readWithRetry`,
`restoreOrBootstrapTabs`, `scheduleTabSessionSave`, `currentTabSessionSnapshot`, `writeTabSessionNow`,
`persistTabSession` (373-573); `initApp` (574-749); OneDrive `initOneDriveSync`, `refreshSyncHealth` (750-859);
`initWindowChromeWatcher` (860-875); the `set*` setting writers (876-1093).

## The split

Folder `src/lib/boot/`: `subscriptions.ts` (95-308: wiring, close barrier, drift, rollover,
close/discard), `dom.ts` (the four appliers and `THEME_CHROME_COLORS`), `tabSession.ts` (373-573), `oneDrive.ts`
(750-875), `settings.ts` (the `set*` writers). `src/lib/boot.ts` keeps `initApp` and re-exports everything that was
exported, so every existing import of `boot` keeps working. Watch the module-level `let`s the sections share (timers,
flags, the session save debounce): one owner each.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/tabs-lifecycle.spec.ts`, `tests/e2e/settings.spec.ts`, `tests/e2e/updated-notice.spec.ts`, `tests/e2e/onedrive-first-connect.spec.ts`. Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/lib/boot.ts` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/lib/boot.ts` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
