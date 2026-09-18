# ChronoNote — Agent & Contributor Guidelines

This document establishes critical architectural invariants, code patterns, and verification standards for any AI agent or human contributor working on ChronoNote across its four targets: **Desktop**, **Android**, **Web App**, and **Public Demo**.

For the full design specifications, see:
- [`docs/spec.md`](docs/spec.md) — Master Technical & Product Specification
- [`docs/design/android-onedrive-roadmap.md`](docs/design/android-onedrive-roadmap.md) — Android & OneDrive Sync Design
- [`docs/design/webapp-roadmap.md`](docs/design/webapp-roadmap.md) — Web App (IndexedDB) Design
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — Historical Log of Architectural Decisions

---

## 1. Non-Negotiable Core Invariants (The "Golden Rules")

### 1.1 Zero Database / Pure Plain Text
- Notes on OneDrive, device disk, and desktop **must remain 100% human-readable plain text files** named `YYYY-MM-DD.txt`.
- **NEVER** inject YAML front-matter, hidden JSON headers, SQLite databases, or UUID markers into note bodies. External tools (e.g. Notepad, VS Code) and the user must be able to read and edit raw files directly.

### 1.2 Memory Matches Disk (Virtual Presentation Masking)
- Glyphs (`☐`, `☑`, `»`, `☒`, `➔`, `•`) are virtual DOM decorations in CodeMirror 6 (`InlineGlyphWidget`), forced via explicit CSS `ch`-unit widths to maintain exact tabular monospace alignment.
- **NEVER** replace raw token bytes (`# `, `v `, `> `, `x `, `=> `, `- `) with Unicode symbols in the underlying document string. Characters in memory must match file bytes on disk.

### 1.3 The Universal Command Interface (`TauriCommands`)
- The UI layer (`src/`) must **NEVER** call `@tauri-apps/api/core::invoke()` with arbitrary command strings.
- Every storage and platform operation flows through the typed `TauriCommands` contract in [`src/lib/tauriCommands.ts`](src/lib/tauriCommands.ts).
- Any new command must be declared in `TauriCommands` and implemented across all active backends:
  1. **Rust Core:** `src-tauri/src/lib.rs`
  2. **Web App:** `src/lib/webapp/webBackend.ts` (IndexedDB)
  3. **Demo / Test Suite:** `src/lib/testing/mockBackend.ts` (In-memory mock)
  4. **Frontend API Wrapper:** `src/lib/tauriApi.ts`

### 1.4 Safe Scratchpad Invariant
- Scratchpads are intentionally **never** written as `.txt` files to the user's notes folder or synced to OneDrive.
- On Android, scratchpad drafts are cached locally in sandboxed app-private storage (`.scratchpads-drafts.json`) solely to survive OS background process termination, and must never be uploaded to OneDrive.

---

## 2. Frontend & Mobile Ergonomics

### 2.1 Responsive Adaptation over Component Forking
- **DO NOT** fork components into `AppMobile.svelte`, `EditorMobile.svelte`, etc.
- Keep the single shared component tree in `src/`. Adapt UI through responsive CSS media queries (`@media (max-width: 600px)` or `@media (pointer: coarse)`) and the `$backendKind` / `$isMobile` stores.
- Mobile improvements (such as the Mobile Accessory Bar or Tab Drawer) automatically benefit users opening the Web App or Demo on mobile browsers.

### 2.2 CodeMirror 6 State Integrity
- When inserting tokens or indenting from touch accessories, **always dispatch transactions through CodeMirror's `EditorView`** (`view.dispatch(...)`).
- **DO NOT** mutate the Svelte `content` string directly from outside the editor, as this wipes the undo/redo history and resets the cursor.

### 2.3 Viewport & Keyboard Handling
- Virtual soft keyboards shrink the mobile viewport by 45–50%. Never use hardcoded pixel heights or raw `100vh` on editor containers.
- Use flexbox layouts, `100dvh`, and `<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">`.

---

## 3. Rust & Tauri Multi-Platform Guidelines

### 3.1 Target Conditional Compilation (`#[cfg]`)
- Gate Android-specific native code with `#[cfg(target_os = "android")]` or `#[cfg(mobile)]`.
- Gate desktop-only code (e.g. `tauri-plugin-updater` or native window dragging) with `#[cfg(desktop)]`.
- Android changes must **NEVER** break Windows, macOS, or Linux builds.

### 3.2 Compare-and-Swap (CAS) & Non-Blocking Sync
- All cloud sync operations with Microsoft Graph API must be asynchronous (`tokio`) and non-blocking. Local typing and debounced autosaves must never freeze waiting on network I/O.
- Uploads must include `If-Match: "{eTag}"` and verify SHA-256 hashes against `storage.rs` to guarantee no external edits are overwritten.

---

## 4. Verification Protocol (Quality Gate)

Every contributor or agent must run and pass all four quality checks before finishing a task:

```bash
# 1. Type-check Svelte and TypeScript
npm run check

# 2. Run unit tests (tokens, date math, controller logic)
npm test

# 3. Run Rust unit tests (atomic storage, CAS hash checks)
cargo test --manifest-path src-tauri/Cargo.toml

# 4. Verify clean production desktop build
npm run build
```

> **Note on Windows / OneDrive Workspaces:** If this repository resides in a synced OneDrive folder (e.g. `OneDrive\Bureaublad\...`), OneDrive's background sync engine can lock files inside `src-tauri/target/`, causing `autocfg: output path is not a writable directory`. Set `CARGO_TARGET_DIR` to a path outside OneDrive (e.g. `set CARGO_TARGET_DIR=%LOCALAPPDATA%\cargo-target`) when running Cargo commands.

