# ChronoNote Hardening & Architecture Roadmap

Origin: an external engineering review delivered as *"ChronoNote v0.4.4:
Hardening & Architectural Upgrade"* (2026-09). This file is the reconciled,
sequenced plan actually being executed — the review was written against
some assumptions that don't hold for this codebase (see "Corrections"
below), so it is treated as **intent**, not a literal spec.

Status legend: ☐ not started · ◐ in progress · ☑ shipped

---

## Corrections to the source review

| Review assumed | Reality |
| --- | --- |
| Svelte 5 **Runes**, **Tailwind** | Legacy Svelte 5 syntax (`export let`, `$:`, `on:click`); plain `app.css` + CSS custom properties. No runes anywhere. |
| Target **v0.4.4** | Work starts from **v0.4.5**. |
| Notes are `.md`; conflict copies `<file>.conflict-<ts>.md` | Notes are `YYYY-MM-DD.txt`, enforced by `is_valid_note_filename`. Conflict copies go in a `.chrononote-conflicts/` subdir instead. |
| Window events in `src-tauri/src/main.rs` | `main.rs` is a 5-line shim; all setup is `lib.rs::run()`. |
| §1.1 path traversal is an open vulnerability | For daily notes it's already closed — `is_valid_note_filename` runs before any join. The confinement guard is defense-in-depth on the workspace root. |
| §5.1 ReDoS in the tokenizer | The glyph/token regexes are line-anchored, single-pass, no nested quantifiers. No ReDoS risk. |
| §5.1 suppress glyphs inside code fences / inline code / links | ChronoNote has no Markdown model (7 tokens + setext `===`). **Dropped** — contrary to the plain-text tenet. |
| §5.2 add `role="dialog"` / `aria-modal` / labelling | Already present on every modal. Only the focus trap + focus restore are missing. |
| §4 three rune stores under `src/lib/stores/` | Superseded by the in-flight `refactor/foundation` (plain stores + `export *` facade). The *goals* of §4 are folded into that refactor. |

---

## Phases

### ☑ Phase 2 — Storage durability (§1) → **v0.4.6**

Branch `harden/atomic-storage` off `main`. No frontend changes.

- `atomic_write(path, bytes)` in `storage.rs`: sibling temp file (`tempfile`
  crate) → `sync_all()` → `persist()` (atomic rename, replaces existing) →
  parent-dir `sync_all()` on Unix. `NamedTempFile` drop = cleanup guard.
- `write_note_at`, `save_config_at`, `write_tab_session_at` routed through it.
- `resolve_workspace_path(workspace, rel)` — lexical `..`/absolute/prefix
  rejection + `dunce::canonicalize` symlink-escape check → new
  `StorageError::PathEscapesWorkspace`. Every note write passes through it.
- Deps: `tempfile` promoted dev→prod; `dunce` added.
- Tests: round-trip, replace-in-place, no-temp-litter, 50 rapid writes land
  the last value, `resolve_workspace_path` rejects parent/absolute/symlink
  escapes and allows children.
- Known gap: `panic = "abort"` in release means a *panic* mid-write (not a
  normal error) skips the temp-file drop guard, leaving one `.chrono-*.tmp`
  in the notes dir. Not data loss (target untouched); `is_valid_note_filename`
  keeps it out of every listing. Acceptable; revisit if it ever bites.

### ◐ Phase 1 — Finish the `controller.ts` refactor (§4) → **v0.5.0** — code done, awaiting review

`refactor/foundation` / draft PR #22. Plain-store + facade shape, **not**
rune stores. `controller.ts` is now a 34-line `export *` facade over twelve
modules: `stores`, `persistence`, `tabSort`, `paste`, `tabs`, `actions`,
`history`, `search`, `sectionImportActions`, `menu`, `boot`, `directory`
(+ `virtualList` from the earlier chunk). Clean DAG, no cycles. Every
commit green on check + Vitest (180) + Playwright (83) + build.

Notes:
- The status-bar + window-title subscriptions moved from module-load side
  effects into `initApp` (`boot.ts`).
- `closeAllModals` moved to `stores.ts` (next to the `modal` store).
- `restoreOrBootstrapTabs` is now exported (from `boot.ts`) so `directory.ts`
  can reuse it for the workspace re-load.

Deferred to when Phase 4 needs them (no behaviour need yet): per-tab
`cleanHash` + `rev`, the modal focus-restore hook, the un-`.catch`-ed
promise sweep.

Also for v0.5.0: ship app icon concept A (`docs/design/icon-A-master.svg`
via `npx tauri icon`).

### ☑ Phase 3 — Zero-loss exit barrier (§3) — code done, folded into v0.5.0

Turned out to be **frontend-only**: Tauri v2 auto-`prevent_close()`s when a
JS `tauri://close-requested` listener exists (`tauri` crate
`manager/window.rs`), so no Rust `on_window_event` / `force_window_exit`
command. `boot.ts` `wireCloseBarrier()` (from `initApp`):
`onCloseRequested` → `preventDefault` → `flushAllPendingSaves()` (new in
`persistence.ts`; fires debounced writes + awaits in-flight, never
rejects) → `getCurrentWindow().destroy()`.

Non-empty scratchpad on quit: routes through the existing
unsaved-scratchpads gate (Marien's call), now context-aware via a
`scratchpadGateContext` store (`"switch" | "close"`) — modal shows
**Discard & Quit** / **Cancel**.

One capability grant: `core:window:allow-destroy` (default set has only
read-only window APIs — without it the barrier hung the window
un-closable; caught only by a real-app close test).

Mock backend gained real event plumbing (`emitEvent`) — also groundwork
for Phase 4's window-focus trigger. `tests/e2e/exit-barrier.spec.ts` +
3 `controller.test.ts` cases.

### ☑ Phase 4 — External-modification / conflict detection (§2) — code done, folded into v0.5.0

§94. `sha2` crate; `FileMetadata` (`exists`/`contentHash`/`sizeBytes`/
`modifiedMs`); `get_file_metadata` + `read_note_with_metadata` +
`write_conflict_copy` commands; `write_note` gained an optional
`expectedHash` compare-and-swap guard + returns `FileMetadata`.

Frontend `drift.ts` — `checkActiveTabForDrift` (Case A no-op / Case B
silent reload + toast / Case C `ConflictModal` / deleted → drop baseline)
+ the three resolvers + `sha256Hex` (same digest as Rust). Per-tab
clean-hash baselines in `stores.ts` (`markTabClean`, a `Map` keyed by tab
id). `boot.ts` `wireDriftDetection()` binds the `activeTabId` subscription
+ `onFocusChanged`. Autosave frozen (`cancelScheduledSave`) while the
prompt is open.

Marien's UX calls: three conflict buttons (keep disk / keep mine / save a
copy to `.chrononote-conflicts/`); the no-local-edits case is a silent
reload + toast, not a prompt.

`concurrency.spec.ts` + 5 `controller.test.ts` cases. Mock computes real
SHA-256 so hashes line up across Rust / `drift.ts` / mock.

### ☑ Phase 5 — Modal focus trap (§5.2) — code done, folded into v0.5.0

§95. `src/lib/actions/focusTrap.ts` + `use:focusTrap` on all 12 modal
cards. `document`-level capture keydown listener (a card-only one never
fires while focus is on the editor): Tab / Shift+Tab cycle within the
modal, pull focus in if it starts outside, swallow Tab if the modal has
no focusables. `destroy()` restores focus to the pre-open element (the
editor), fallback `.cm-content`. `aria-*` were already present.
7 unit + 2 e2e (`modal-a11y.spec.ts`).

**All five hardening phases are code-complete on `refactor/foundation`.**
Remaining before v0.5.0: Marien's review + the app icon (`npx tauri icon
docs/design/icon-A-master.svg`) + version bump + release.

---

## Release ordering

Marien's call (2026-09-09): **no interim point releases** — all of
Phases 1, 3, 4, 5 accumulate on `refactor/foundation` and cut together as
**v0.5.0** once everything's tested and he's reviewed it.

```
main ──v0.4.5── v0.4.6 (Phase 2, shipped)
                  │
                  └── refactor/foundation ── v0.5.0  =  Phase 1 (refactor) + 3 (exit barrier)
                                                       + 4 (conflict detection) + 5 (focus trap)
                                                       + app icon concept A
```

Rebase `refactor/foundation` onto `main` after every interim release
(`git rebase main` + `git push --force-with-lease`).
