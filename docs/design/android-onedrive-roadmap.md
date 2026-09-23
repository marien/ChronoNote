# ChronoNote Android app & OneDrive sync — functional & technical design

**Superseded, 2026-09-23 — the Android app was dropped.** The
PWA-installable web app now covers phone use, with its own independent
OneDrive engine (see `webapp-roadmap.md` and `docs/spec.md` §7.3). Kept here
for design history; nothing below describes a currently shipping target.

Origin: Marien's brief (2026-09-17) — *"I want you to start designing an
Android app for ChronoNote using the same frontend. The app needs to be able
to use folders on OneDrive as the Notes folder."*

Status: **design approved, ready for implementation.**

---

## The four-target journey

With Android, ChronoNote extends from three build targets to four, all sharing
the same Svelte 5 + CodeMirror 6 frontend:

| Target | Shell / Runtime | Persistence backend | Typical user environment |
| :--- | :--- | :--- | :--- |
| **Desktop app** | Tauri 2 (Desktop) | Local `.txt` files on disk via Rust IPC | Windows (current) / macOS / Linux PC |
| **Android app** (new) | Tauri 2 (Mobile) | Sandboxed cache + Microsoft Graph OneDrive sync | Android phone / tablet |
| **Web app** | Browser PWA | Browser `IndexedDB` (`webBackend.ts`) | Desktop / mobile browser, zero install |
| **Public demo** | Browser iframe | Ephemeral in-memory mock (`mockBackend.ts`) | Website visitors, zero retention |

### Core architectural premise: One Frontend, Four Targets
The frontend code in `src/` never calls OS or cloud APIs directly. Every note
operation flows through a single typed interface: `TauriCommands`
(`src/lib/tauriCommands.ts`). Over 95% of the codebase—editor, token
highlighting, glyph masking, modals, controllers, and stores—remains identical
and shared across all four targets. A new feature built on desktop translates
into Android, webapp, and demo with near-zero redundant code.

---

# Part 1 — Functional design

## 1.1 Mobile Ergonomics & Touch Editing

ChronoNote desktop is an un-cluttered, keyboard-driven application designed to
replace Notepad. Touchscreens, however, lack physical `Ctrl` keys and introduce
keyboard layout switching friction. The Android app adapts to these realities
without altering the underlying plain-text format.

### 1.1.1 Mobile Quick Action Accessory Bar
On touch keyboards (Gboard, Samsung Keyboard), typing `# `, `- `, or `=> `
requires multiple taps into symbol pages (`?123`). 

A sticky **Mobile Accessory Bar** docks directly above the virtual keyboard:
- `☐` Inserts `# ` (Open action)
- `☑` Inserts `v ` (Completed action)
- `»` Inserts `> ` (Deferred action)
- `•` Inserts `- ` (Bulleted list item)
- `➔` Inserts `=> ` (Follow-up / consequence)
- `!` Inserts `! ` (Emphasis / remember)
- `⇥` / `⇤` Indent / Dedent (inserts or removes 2 spaces)
- `↶` / `↷` Undo / Redo
- `⌘` / `🔍` Opens Command Palette modal (`Ctrl+K` equivalent)

### 1.1.2 Touch Target Sizing & Micro-Interactions
- **40×40px Hit Targets:** Standalone action glyphs (`# `, `v `, `> `, `x `)
  keep their visual monospace `2ch` alignment, but gain an expanded
  transparent `::after` hit area (at least 40×40px) so thumbs can reliably tap
  to toggle tasks without misclicking into text.
- **Direct Cycling on Tap:** Desktop's hover preview (`mouseenter`) is
  bypassed on touchscreens; tapping directly cycles state (`# → v → > → x → #`).
- **Status Bar Popovers:** Tapping status bar indicators (folder name, save dot,
  word count) displays a lightweight transient popover instead of desktop hover tooltips.

## 1.2 Mobile Tab Management

A narrow phone screen (360px–412px portrait) cannot fit a horizontal strip of
6–10 open tabs.
- **Top Bar in Mobile View:** Shows the current note date (e.g. `2026-09-17`),
  a quick `Today` jump pill, New Scratchpad (`+`), Date Picker (`📅`), and a
  **Tab Counter Button** (e.g., `[ 3 ]`).
- **Mobile Tab Drawer:** Tapping the counter opens a touch-friendly bottom sheet
  listing all open tabs with clean close buttons, unsaved indicators, and swipe-to-close.
- **Swipe Gestures:** Horizontal swipes across the editor switch smoothly
  between adjacent open date tabs.

## 1.3 Scratchpad Draft Protection (Android Lifecycle)
On desktop, scratchpads remain strictly in memory and are protected by the
window-close safety gate (`beforeunload` / `Alt+F4`). On Android, the OS can kill
background app processes abruptly to reclaim RAM without confirmation.

- **Solution:** On Android, scratchpad contents are debounced-persisted to an
  internal draft store (`.scratchpads-drafts.json` in private app storage).
- When the app is resumed or relaunched, scratchpads restore seamlessly.
- **Non-negotiable invariant:** Scratchpads are never saved as `.txt` files in the
  user's OneDrive notes folder.

## 1.4 OneDrive Storage Experience in Settings

On desktop, the Settings modal offers a filesystem path picker (`set_notes_dir`).
On Android, arbitrary filesystem paths do not exist. Settings provides:
- **Microsoft Account Card:** Connect / Disconnect button, signed-in account name/email.
- **OneDrive Notes Folder Picker:** Interactive cloud tree browser allowing the
  user to select or create a folder (e.g., `OneDrive > Documents > Notes`).
- **Sync Status & Controls:** Shows "Up to date", "Syncing…", or "Offline", with a
  "Sync Now" manual trigger.
- **Local Device Folder (Alternative Mode):** An optional toggle for users who
  sync using external Android utilities (OneSync, FolderSync, Syncthing) to a
  local directory.

---

# Part 2 — Technical design & architecture

## 2.1 Why Direct Microsoft Graph API?

Unlike Windows desktop, the official OneDrive Android app **does not mount a local
POSIX filesystem directory**. Android 11+ Scoped Storage strictly sandboxes apps.
Android Storage Access Framework (SAF) against OneDrive's `DocumentsProvider` is
notoriously slow, lacks reliable offline caching, and fails on hidden metadata files.

Therefore, ChronoNote Android communicates directly with **Microsoft Graph REST API**
using an **offline-first local replica**:

```
[ User edits note in CodeMirror 6 ]
                |
                v
[ Local Atomic Write to App Storage ]  <--- (Instant, 0ms lag, works 100% offline)
  - /data/user/0/com.chrononote.app/files/notes/YYYY-MM-DD.txt
  - .chrononote-session.json
  - .agenda.json
                |
                v  (Background async sync)
[ Rust OneDrive Sync Engine ]
  - Delta queries (/delta) for remote changes
  - Compare SHA-256 content hashes
  - CAS uploads: PUT /content with If-Match: "{eTag}"
                |
                v  (HTTPS)
[ Microsoft OneDrive Cloud Folder ]  <====> Synced to Windows PC Desktop
```

## 2.2 Authentication: OAuth 2.0 PKCE Flow
- **Public Client Flow:** Standard OAuth 2.0 Authorization Code + PKCE (RFC 7636).
- **Interactive Login:** Uses Android Chrome Custom Tabs for secure system-browser
  authentication without webview credential hijacking risks.
- **Deep Link Return:** Captures `chrononote://auth?code=...` via Android Intent
  filter registered in `AndroidManifest.xml`.
- **Token Storage:** Access and refresh tokens stored securely in Android Keystore /
  `EncryptedSharedPreferences`.
- **Scopes:** `Files.ReadWrite`, `offline_access`, `User.Read`.
- **Tenant Flexibility:** Uses `/common` endpoint. Personal accounts require zero
  admin consent. Work/school accounts support an optional custom Azure Client ID
  override in Settings for locked-down corporate tenants.

## 2.3 Bi-directional Synchronization & Conflict Resolution

1. **Pull (Remote → Local):**
   - On app launch, resume, or pull-to-refresh, queries `/me/drive/items/{folder_id}/delta`.
   - Compares remote `eTag` and SHA-256 (`file.hashes.sha256Hash`) against local cache.
   - If changed remotely and clean locally: updates local file.
   - If changed remotely and dirty locally: triggers ChronoNote's existing `ConflictModal`
     (§94) and writes `.chrononote-conflicts/<name>` copy to OneDrive.
   - Downloads `.agenda.json`, automatically updating the daily calendar meeting sections.
2. **Push (Local → Remote):**
   - Local autosave writes to device disk immediately (debounced at 400ms).
   - Sync engine queues upload: `PUT /me/drive/items/{folder_id}:/{filename}:/content`
     with `If-Match: "{cached_eTag}"`.
   - If HTTP 412 (Precondition Failed) is returned, another device edited the file;
     conflict resolution triggers without data loss.

---

# Part 3 — Parity & synchronization strategy

To keep Desktop, Android, WebApp, and Demo in sync without maintenance drift:

1. **The Universal Command Interface (`TauriCommands`):**
   Every storage call flows through `src/lib/tauriCommands.ts`. All four targets
   implement this exact contract.
2. **Shared Rust Backend:**
   `src-tauri/` compiles for both Windows/macOS/Linux and Android NDK. Atomic
   temp-file writes, SHA-256 CAS logic, and calendar reconciliation are shared.
3. **Form-Factor Detection Over Platform Forking:**
   UI adaptations (Mobile Accessory Bar, Tab Drawer) activate on viewport width
   (`< 600px`) and touch input (`pointer: coarse`). This automatically upgrades the
   mobile browser experience for the WebApp and Demo as well.

---

# Part 4 — Implementation invariants & agent guidelines

When multiple agents or human contributors work on this codebase, these rules
are **non-negotiable**:

### The Golden Rules
1. **Zero Database / Pure Plain Text:** Notes on OneDrive and disk must remain 100%
   human-readable `.txt` files (`YYYY-MM-DD.txt`). Never inject JSON frontmatter,
   internal UUIDs, or SQLite databases into note files.
2. **Memory Matches Disk:** Glyphs (`☐`, `➔`, `•`) are CodeMirror 6 DOM presentation
   widgets (`InlineGlyphWidget`), sized in exact `ch` monospace units. The underlying
   document string is always `# `, `=> `, `- `. Never replace text bytes with Unicode
   symbols in the document buffer.
3. **The Strict 4-Target Command Surface:** Never call `@tauri-apps/api/core::invoke()`
   directly from UI components. Any new command must be declared in
   `src/lib/tauriCommands.ts` and implemented across:
   - Rust (`src-tauri/src/`)
   - WebApp IndexedDB (`src/lib/webapp/webBackend.ts`)
   - Test/Demo Mock (`src/lib/testing/mockBackend.ts`)
   - IPC wrapper (`src/lib/tauriApi.ts`)
4. **Scratchpad Invariant:** Scratchpads are never `.txt` notes on OneDrive. Local draft
   caching on Android stays inside sandboxed private app storage.
5. **CodeMirror 6 State Integrity:** When mobile accessory buttons insert tokens or
   indent, they must dispatch transactions via `view.dispatch(...)` to preserve the
   undo/redo history and cursor selection.
6. **Rust Target Isolation:** Android-specific native code must use
   `#[cfg(target_os = "android")]`. Desktop auto-updater must remain `#[cfg(desktop)]`.
   Android changes must never break the Windows cargo build.

### Workstream Separation
- **Stream A (Mobile UI & Ergonomics):** `src/lib/components/mobile/`, `src/app.css`,
  `src/lib/editor/glyphs.ts`. Boundary: `controller.ts` and CodeMirror `view`.
- **Stream B (Rust OneDrive Sync Engine):** `src-tauri/src/onedrive/`, `src-tauri/Cargo.toml`.
  Boundary: `tauriCommands.ts` and Rust IPC handlers in `lib.rs`.
- **Stream C (Android Native Harness):** `src-tauri/gen/android/`, `AndroidManifest.xml`,
  deep-link filters, Gradle configuration.

---

# Part 5 — Quality gates & verification

Before any agent marks work complete, all four checks must pass:
1. `npm run check` — TypeScript & Svelte typechecking (`svelte-check`) passes with 0 errors.
2. `npm test` — Vitest unit test suite passes 100%.
3. `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests pass.
4. `npm run build` — Production desktop build compiles and tree-shakes cleanly.
