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

### ☐ Phase 1 — Finish the `controller.ts` refactor (§4) → **v0.5.0**

Continues `refactor/foundation` (draft PR #22). Plain-store + facade shape,
**not** rune stores. Remaining cut: `tabs.ts` (lifecycle/sort/close/reopen/
safety), `boot.ts` (initApp + session restore + chrome watcher), `actions.ts`
(drawer + history + snapshots), `search.ts`, `sectionImport.ts`,
`directory.ts`, `paste.ts` (copy/paste defer + §86 undo link). `tabs.ts` +
`boot.ts` are the entangled ones (module-level subscriptions, `restoringTabs`
guard, `latestTabs` cache).

Fold in from review §4 while here:
- per-tab `cleanHash` + monotonic `rev` on the tab model (cheap now, and
  Phase 4 needs it) — replaces string-equality dirty checks.
- modal focus-restore hook in whatever owns `ModalKind` (pairs with Phase 5).
- a sweep for un-`.catch`-ed promise paths (review's "zero unhandled
  rejections" gate) — e.g. the tab-session subscription writes.

Also for v0.5.0: ship app icon concept A (`docs/design/icon-A-master.svg`
via `npx tauri icon`).

### ☐ Phase 3 — Zero-loss exit barrier (§3) → **v0.5.1**

- `lib.rs`: `on_window_event` → `WindowEvent::CloseRequested { api, .. }` →
  `api.prevent_close()` + `window.emit("chrono:app-close-requested", ())`.
- `force_window_exit` command → `window.destroy()`.
- Frontend (in `boot.ts` from Phase 1): cancel debounce timers → parallel
  atomic writes for every dirty doc (incl. scratchpads) → await all →
  `force_window_exit()`.
- e2e: type 500 words, close immediately, assert all flushed.

### ☐ Phase 4 — External-modification / conflict detection (§2) → **v0.5.2 / v0.6.0**

The large one. Only after 1–3 are solid.

- IPC: `get_file_metadata`, `read_note_with_metadata`,
  `atomic_write_note(path, content, expectedHash?)`. Adds `sha2` crate for
  the SHA-256 content hash; `FileMetadata { path, exists, modifiedMs,
  contentHash, sizeBytes }`.
- Per-buffer state machine in `tabs.ts` / a new `buffers.ts`:
  `{ cleanHash, lastKnownMtime, memoryContent, isDirty, rev }`.
- Trigger **only** on tab→active transition or window `focus`; active tab only.
- Case A (hash matches): nothing. Case B (differs, not dirty): silent
  auto-reload. Case C (differs, dirty): `ConflictModal` — Keep External /
  Keep In-Memory (`expectedHash` bypass on next save) / Save Local as Copy
  (`.chrononote-conflicts/<date>-<ts>.txt`, then reload).
- `tests/e2e/concurrency.spec.ts` — external write + focus → dialog → resolve.

### ☐ Phase 5 — Modal focus trap (§5.2) → any time after Phase 1

Shared Svelte action: record `document.activeElement` on open, cycle Tab /
Shift+Tab within the modal's tabbables, restore focus to the editor on close.
Applied to every `modals/*.svelte` wrapper. `aria-*` attributes already done.

---

## Release ordering

```
main ──v0.4.5──┬──v0.4.6 (Phase 2, harden/atomic-storage)
               │
               └── refactor/foundation ──v0.5.0 (Phase 1) ── v0.5.1 (Phase 3) ── v0.5.2/v0.6.0 (Phase 4)
                                                                    Phase 5 folds in wherever it lands
```

Rebase `refactor/foundation` onto `main` after every interim release
(`git rebase main` + `git push --force-with-lease`).
