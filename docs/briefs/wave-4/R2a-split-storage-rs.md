# Brief R2a: split `storage.rs` into modules (moves only)

Run name `r2a-storage-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\r2a-storage-split` · branch
`gemini/r2a-storage-split` · base `main` · no browser tests · model Google-Sonnet 5.5

Read `docs/briefs/RULES.md` in your worktree first. It applies in full.

## Why

`src-tauri/src/storage.rs` is 4,524 lines: config types, disk safety, notes, versions and trash, phone files, the tab
session, import, the Tauri-facing functions and about 2,400 lines of tests in one file. Finding anything means
scrolling. This brief moves it into a `storage/` folder of modules by topic. Nothing changes in behaviour: every item
keeps its body, its doc comment and its test, character for character.

## What exists now

`src-tauri/src/storage.rs`, top-level layout (line numbers on `main` at 2026-11-18):

| Lines | Content |
| :--- | :--- |
| 1-552 | `use`s; `ColorMode` .. `PeekHeader` enums, `PeekGeometry`, `PeekConfig` + consts + impls, `CONFIG_SCHEMA_VERSION`, `AppConfig`, `ConfigPatch` + impl, `default_*` helpers, `MAX_RECENT_NOTES_DIRS`, `config_path`, scratchpad path, `default_notes_dir` |
| 553-852 | "Path-parameterized cores", "Durable, confined disk writes (§1)": `StorageError` + impls, `resolve_workspace_path`, `WRITE_LOCK`, `NOTE_LOCK`, `is_transient_rename_error`, `atomic_write`, `quarantine_corrupt_file`, `load_config_at`, `save_config_at`, `push_recent_notes_dir`, `is_valid_note_filename`, `list_note_files_at`, `read_note_at` |
| 858-1111 | versions (`VERSIONS_*`, `NoteVersion`, `parse_version_filename`, `should_keep_version_at`, `keep_version_*`, `clean_up_versions_and_trash_at`) and trash (`TRASH_*`, `TrashItem`, `parse_trash_filename`) |
| 1112-1240 | conflicts and metadata: `CONFLICT_ERROR_PREFIX`, `FileMetadata`, `NoteWithMetadata`, `hash_bytes`, `normalize_note_text`, `note_hash`, `file_metadata_at`, `metadata_from_bytes`, `read_note_with_metadata_at`, conflict copy |
| 1241-1318 | phone files and saved searches: `write_phone_meetings_at`, `write_phone_outbox_at`, `read_phone_inbox_at`, ledger, `SAVED_SEARCHES_*`, `read/write_saved_searches_at` |
| 1319-1654 | note writes, delete, trash list/restore, versions list/read/restore, `read_all_notes_at` |
| 1655-1729 | bundle import (`ImportMode`, `ImportResult`, `import_notes_bundle_at`) |
| 1730-1829 | tab session (`TabSession`, read/write) and scratchpad drafts |
| 1830-1983 | the public, Tauri-command-facing functions taking `AppHandle` |
| 1984-2086 | `generate_typescript_bindings` test and `tidy_decl` (kept outside `mod tests` on purpose, see its comment) |
| 2087-4524 | `mod tests` |

57 call sites in other files use `storage::<item>` (`lib.rs`, `peek_dock.rs`, `agenda.rs`, ...).

## What to build

1. Replace `src-tauri/src/storage.rs` with `src-tauri/src/storage/mod.rs` plus these modules (names fixed):
   `config.rs` (1-552 and `load_config_at`, `save_config_at`, `push_recent_notes_dir`), `disk.rs` (`StorageError`,
   workspace path, locks, `atomic_write`, quarantine), `notes.rs` (filename checks, list/read/write/delete notes,
   metadata and hashes, conflicts, `read_all_notes_at`), `versions.rs` (versions and trash, list/restore/clean-up),
   `phone.rs` (phone files, ledger, saved searches), `session.rs` (tab session, scratchpad drafts), `import.rs`
   (bundle import). `mod.rs` keeps the "Public, Tauri-command-facing functions" section and the
   `generate_typescript_bindings` test with `tidy_decl`.
2. `mod.rs` re-exports with `pub use` so every existing `storage::<item>` path in other files keeps working unchanged:
   no file outside `src-tauri/src/storage/` may change. Private items another module needs become `pub(super)` (the
   narrowest visibility that compiles); nothing becomes `pub` that was not.
3. `mod tests` is split the same way: each module gets a `#[cfg(test)] mod tests` with the tests of its items, in
   their original order. A test that uses items from several modules goes with the module of the function it calls
   first. Shared test helpers go into `storage/test_support.rs` (`#[cfg(test)]`). Every test keeps its name.
4. Moves only. No renaming, no reformatting beyond `cargo fmt` of the new files, no rewording of comments, no changed
   logic, no new `allow` attributes. A comment that names `storage.rs` stays as it is.

## Checks that prove it is a move

- `cargo test` test count before and after is the same (run it on `main` first and note the number), all passing.
- `src/lib/generated/tauri-types.ts` (or wherever `generate_typescript_bindings` writes) is unchanged:
  `git diff --exit-code` on it after `cargo test`.
- A script in your report: sort all lines of the old `storage.rs` and of the new files together, then diff; only `use`,
  `mod`, `pub use`, visibility words and blank lines may differ. Paste the diff's line count and every differing line
  that is not one of those.

## Out of scope

Any file outside `src-tauri/src/storage.rs` / `src-tauri/src/storage/`. The mock backend (`mockBackend.ts`) and the
conformance cases: behaviour does not change, so they stay. The other large files (later R2 briefs).

## Done when

- [ ] `src-tauri/src/storage.rs` is gone; `src-tauri/src/storage/` holds `mod.rs`, `config.rs`, `disk.rs`,
      `notes.rs`, `versions.rs`, `phone.rs`, `session.rs`, `import.rs` and (if needed) `test_support.rs`.
- [ ] No file outside that folder changed (`git diff --stat main`).
- [ ] `cd src-tauri && cargo test` passes with the same test count as `main`; `cargo clippy --all-targets -- -D warnings`
      passes.
- [ ] The generated TypeScript bindings file is unchanged.
- [ ] No module over 1,200 lines including its tests (say which, if one must be).
- [ ] `npm run verify` passes.

## Report

The standard report from RULES.md, plus: line count per new file, the test count before and after, and the sorted-line
diff summary.
