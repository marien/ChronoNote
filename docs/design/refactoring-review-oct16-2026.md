# Refactoring review — October 2026

Status: **approved 2026-10-16** (Marien: "continue as you suggested").

Review of an external agent's `REFactoring_TASKS.md` (8 tasks), checked
against the code on `main` at `197426a`. Verdict: 3 tasks worth doing in a
smaller form, 1 decided against for now (release in CI), 4 dropped. Some premises in the source
document did not match the code: the editor is
`src/lib/components/EditorPane.svelte` (not `src/components/Editor.svelte`),
and OneDrive is not a Rust concern since the desktop engine was removed
(CHANGELOG §300).

## Phase A — small cleanups (one branch)

### A1. Remove dead OneDrive error codes (replaces source Task 2)

Source proposal: split the `OneDrive*` variants of `AppError` into a nested
`SyncProviderError`. Rejected: it changes the JSON shape the frontend
receives, so `apiError.ts` and the i18n keys must follow, for no gain.

Finding: several variants are never produced anywhere (e.g.
`oneDriveLoopbackBindFailed`, `oneDriveKeychainSaveFailed`,
`oneDriveBrowserOpenFailed`); they are leftovers of the removed Rust OAuth
flow and only appear in `apiError.ts`'s translation switch. The doc comments
in `src-tauri/src/error.rs` still describe a loopback port and the keychain.

Plan: delete the unproduced variants, their `apiError.ts` cases and i18n keys
(all locales), fix the stale comments, regenerate `tauri-types.ts`.

### A2. One derived sync-status store (replaces source Task 5)

Source proposal: a formal sync state machine. Rejected: the status is already
a 4-state union (`idle | syncing | offline | error`), and conflicts are held
per file, not a sync phase.

Finding: `CloudStatusButton.svelte` and `SyncHealthPopover.svelte` each OR
together three sources themselves (`oneDriveSyncing`, `oneDriveSyncStatus`,
`syncHealth.status`) and can drift apart.

Plan: one derived store both components read, with unit tests for how the
sources combine.

### A3. Vite configs (replaces source Task 8)

Source proposal: a `vite.base.config.ts` all three configs extend. Rejected:
the three configs total ~140 lines and share only `svelte()` and reading the
version from `package.json`.

Plan: at most a tiny shared `appVersion()` helper.

## Phase B — backend conformance suite (source Task 6, reshaped; own branch)

The three backends (`storage.rs`, `mockBackend.ts`, `webBackend.ts`) must
agree on storage semantics; today that is enforced by convention only.

Source proposal: one TypeScript suite run against the compiled Rust binary.
Too heavy (needs a running Tauri app).

Plan: a shared case table (JSON fixtures) covering filename validation and
path traversal, missing file → `null`, session file invisible to
`list_note_files`, `push_recent_notes_dir`, the expected-hash check on
writes, CRLF/BOM normalisation, trash and versions. Run it three ways:
Vitest against `mockBackend`, Vitest against `webBackend` (with
`fake-indexeddb` as a dev dependency), and `cargo test` against `storage.rs`.
Expect the first run to find real drift.

## Decided 2026-10-16 — source Task 3 (release workflow in GitHub Actions): stay local

Marien's decision: releases keep running locally with `scripts/release.sh`.

- Signing in CI means putting the updater signing key into GitHub Secrets.
  Fork PRs can't read secrets and only Marien pushes tags, so the risk is
  moderate, but today the key never leaves his machine. With the key plus
  repo write access (e.g. through a compromised third-party action) someone
  could ship an update every install trusts.
- A secret can't be read back, so it would not be a backup of the key.
- `release.sh` does things a workflow would have to rebuild and re-test: the
  early-updates manifest, the red-Test-run preflight, `--checklist-done`,
  `website-live` promotion. The one environment problem a clean build would
  have caught (§207, stale `node_modules`) is already guarded.
- A half step (CI builds unsigned artifacts on a tag as a check) is not
  worth it: what ships is still built locally.

**Revisit when:** releases must be cut from another machine, this PC becomes
unreliable for builds, or local build problems recur despite the script's
checks. Then move signing and publishing to CI in one go.

## Dropped

- **Task 1 (split command registration):** Tauri accepts only one
  `generate_handler!`; commands can be moved, not registered per module.
  `lib.rs` is 444 lines with 48 commands, agenda and spell already
  module-scoped. Cosmetic.
- **Task 4 (async theme load at startup):** `load_config` reads one small
  JSON file, and the window must know its background colour before it shows;
  async would bring back the white flash. Startup was measured in §266
  (WebView2 dominates).
- **Task 7 (CodeMirror adapter class + `use:editor`):** the cyclic-update bugs
  (§55/§56/§61) came from legacy `$:` blocks; the app is in runes mode since
  v0.28.1. A rewrite of the 1,261-line `EditorPane.svelte` is high churn for
  a solved problem. Possible later step, only if wanted: move the extensions
  list and keymap into `editor/setup.ts` with no behaviour change.

## Gates

Per phase: svelte-check, Vitest, `cargo test`, the full Playwright suite. No
version bump until asked.
