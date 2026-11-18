# Brief R2c: split `src/lib/testing/mockBackend.ts` (1,661 lines, moves only)

Run name `r2c-mockbackend-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2c-mockbackend-split` · branch `gemini/r2c-mockbackend-split` · base `main` ·
model Google-Sonnet 5.5

Read `docs/briefs/RULES.md`, then `docs/briefs/wave-4/R2-common.md`. Both apply in full: moves only, re-exports, the
proof in the report.

## The file now

Seed types and helpers (1-279), `export class MockBackend` (280-1603) with sections "reload persistence"
(504), "test-facing helpers (via window.__CHRONO_MOCK__)" (745) and "the invoke dispatcher" (898-1603, one large
`switch` over command names), then `pushRecentNotesDir` (1604) and `installMockTauri` (1626). It mirrors
`src-tauri/src/storage/` (§511) and is checked by `src/lib/conformance/storage-cases.json`.

## The split

This one is a restructure, not only moves: the class stays one class (tests and the demo construct
it and call its methods). Folder `src/lib/testing/mock/`: `seed.ts` (seed types, `toTabSession`, constants, the agenda
title helpers, `MOCK_SPELL_SUGGESTIONS`), and the dispatcher's cases grouped by topic into functions
`(backend: MockBackend, args) => result` in `commands/notes.ts`, `commands/config.ts`, `commands/versions.ts` (versions
and trash), `commands/phone.ts` (phone files, ledger, saved searches), `commands/session.ts`, `commands/misc.ts` (the
rest), grouped the way `src-tauri/src/storage/` is. The `switch` stays in `mockBackend.ts` and calls them; each case
body moves unchanged except `this` becoming `backend`. Fields the commands touch become non-private (or get
accessors) only as far as needed; say which. `mockBackend.ts` keeps the class, `pushRecentNotesDir`,
`installMockTauri`, and re-exports the seed types.

## Out of scope

Every other file except the new folder and the re-exports; in particular the other R2 files (`TopBar.svelte`,
`SettingsModal.svelte`, `HistoryModal.svelte`, `App.svelte`, `boot.ts`, `mockBackend.ts`), which other runs are
splitting at the same time.

## Checks

`npm run check`, `npm run check:e2e`, `npm test`, `npm run type-escapes`, `npm run css-literals`, and these browser
specs: `tests/e2e/tabs-lifecycle.spec.ts`, `tests/e2e/search-and-history.spec.ts`, `tests/e2e/history-pane.spec.ts` (and `npm test` covers the conformance cases). Then `npm run verify`.

## Done when

- [ ] The split above exists; `src/lib/testing/mockBackend.ts` is under 600 lines, no new file over 600 (or the report says why).
- [ ] Every existing import of `src/lib/testing/mockBackend.ts` from other files still works unchanged.
- [ ] The sorted-line comparison in the report shows only allowed differences.
- [ ] All checks above pass.

## Report

The standard report from RULES.md, plus: line count per file, which module-level state moved where, the sorted-line
comparison summary, and anything that could not move cleanly (left in place, with the reason).
