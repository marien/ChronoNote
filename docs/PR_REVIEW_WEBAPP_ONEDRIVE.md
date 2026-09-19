# PR Review: Web App & PWA OneDrive Cloud Sync, Multi-Workspace Isolation, and Offline PWA

**Branch:** `feat/webapp-onedrive` -> `main`  
**Author:** Pair Programming Session  
**Companion Documents:**
- [`docs/design/webapp-onedrive-design.md`](./design/webapp-onedrive-design.md) (Architecture & Technical Specification)
- [`docs/CHANGELOG.md`](./CHANGELOG.md#187-web-app--pwa-onedrive-cloud-sync-workspace-isolation-migration-flow-and-offline-pwa) (Section §187)
- [`docs/design/webapp-roadmap.md`](./design/webapp-roadmap.md) (Web App Roadmap)

---

## 1. Executive Summary

This feature branch delivers the complete Microsoft OneDrive cloud synchronization, multi-workspace isolation, and offline PWA capability for the ChronoNote Web App.

Prior to this work, the Web App (`website/webapp/`) persisted notes solely in the browser's local IndexedDB, with no synchronization mechanism, no isolation when logging in or out, and potential vulnerability to browser storage purges.

With this PR:
1. **OneDrive Cloud Sync**: The browser directly connects to Microsoft Graph via RFC 7636 PKCE OAuth with zero proprietary backend servers, syncing `.txt` notes and `.agenda.json` bi-directionally across devices.
2. **Multi-Workspace Storage Isolation**: "Browser storage" and "OneDrive" exist as completely separate workspaces in IndexedDB, with independent note files, tab sessions, and backup stores.
3. **Seamless Migration & Conflict Handling**: When connecting to OneDrive, users with notes in Browser storage can migrate them into OneDrive with automatic 3-way line merging and visual conflict resolution.
4. **Calendar Sync on Web**: Syncing `.agenda.json` is un-gated on Web when connected to OneDrive.
5. **Instant-Launch Offline PWA**: The Service Worker precaches the shell on install, serves hashed assets Cache-First (0ms load), and provides offline navigation fallback.
6. **CI/CD Guard**: GitHub Actions ensures `website/webapp/` builds cleanly and matches source files on every PR.

---

## 2. Key Architecture Decisions

### 2.1 Pure Client-Side Sync Engine
- **Auth (`src/lib/webapp/webOneDriveAuth.ts`)**: Implements OAuth 2.0 Authorization Code Flow with PKCE (`S256`). Generates code verifier/challenge via Web Crypto (`crypto.subtle`). Exchanges code directly with `https://login.microsoftonline.com/common/oauth2/v2.0/token`. Supports Entra ID tenant/client overrides.
- **Graph Client (`src/lib/webapp/oneDriveClient.ts`)**: Talks directly to `https://graph.microsoft.com/v1.0`. Uses delta queries for efficient change tracking, handles chunked file uploads, and bypasses CORS restrictions with personal/business OneDrive endpoints.
- **Sync Engine (`src/lib/webapp/webOneDriveSync.ts`)**: Coordinates 3-phase synchronization (deletions via tombstones, pull remote delta, push local modifications). Flushes pending editor saves prior to sync, and runs active-tab drift detection when remote changes arrive.

### 2.2 Multi-Workspace Isolation in IndexedDB
The IndexedDB database (`chrononote-webapp`, v2) separates workspace data:
- `notes_browser`: Notes belonging to the local Browser storage workspace.
- `notes_cloud`: Notes synced with the active OneDrive folder.
- `notes_archive`: Safety backup snapshot created before migrating browser notes.
- `meta`: Stores `session_browser` and `session_cloud` independently, preserving the user's open tabs for each workspace.
- `WebBackend` routes all commands (`read_note`, `write_note`, `delete_note`, `list_note_files`, `read_tab_session`, etc.) dynamically based on `ACTIVE_WORKSPACE`.
- Disconnecting from OneDrive runs `performDirectorySwitch("Browser storage")`, flushing saves, resetting cache, and seamlessly restoring the browser workspace tabs.

### 2.3 Migration Flow
- If notes exist in Browser storage when selecting a OneDrive folder, `MigrateNotesModal.svelte` offers:
  1. **Move notes to OneDrive**: Copies notes to `notes_cloud`. Clean notes merge directly; notes with divergent non-empty cloud versions are registered into `cache.conflicts` for visual resolution via `ConflictModal`. Browser notes are backed up into `notes_archive` and then cleared.
  2. **Keep Browser storage separate**: Leaves Browser storage untouched and connects OneDrive cleanly.
  3. **Cancel**: Returns to folder selection.

### 2.4 Offline PWA & Service Worker
- **Pre-caching**: `sw.js` caches the app shell (`./`, `index.html`, `manifest.webmanifest`, icons) on install.
- **Cache-First for Assets**: `/assets/*.js` and `/assets/*.css` have immutable build hashes and load immediately from cache (0ms).
- **Navigation**: Uses a fast 1.5s network timeout with immediate offline fallback to the cached shell.
- **API Bypass**: Completely bypasses caching for Microsoft OAuth and Graph API endpoints.

---

## 3. File Manifest & Changes

| File | Purpose / Changes |
| :--- | :--- |
| `src/lib/webapp/idb.ts` | Added object stores (`notes_browser`, `notes_cloud`, `notes_archive`) and meta keys (`session_browser`, `session_cloud`, `active_workspace`). |
| `src/lib/webapp/webBackend.ts` | Upgraded to DB v2, added workspace routing, migration logic (`migrateBrowserNotesToCloud`), session isolation, and commands `web_check_browser_notes`/`web_migrate_browser_notes`. |
| `src/lib/webapp/webOneDriveSync.ts` | Updated to operate strictly on `notes_cloud`, managing `active_workspace` on set folder and logout. |
| `src/lib/tauriCommands.ts` | Added typed command signatures for `web_check_browser_notes` and `web_migrate_browser_notes`. |
| `src/lib/tauriApi.ts` | Added frontend API wrapper methods for the new web commands. |
| `src/lib/testing/mockBackend.ts` | Added mock handlers for `web_check_browser_notes` and `web_migrate_browser_notes`. |
| `src/lib/directory.ts` | Exported `performDirectorySwitch` for workspace transitions upon connect / disconnect. |
| `src/lib/components/modals/MigrateNotesModal.svelte` | [NEW] Modal prompting users to migrate browser notes or keep them separate. |
| `src/lib/components/modals/OneDriveFolderPickerModal.svelte` | Integrated migration check and dialog before setting OneDrive folder. |
| `src/lib/components/modals/SettingsModal.svelte` | Added sign-out explanatory hints, post-connect migration description, and limited Advanced settings to disconnected state. |
| `src/lib/components/StatusBar.svelte` | Formatted Browser storage button with folder icon and matching `.status-folder-btn` styling. |
| `src/lib/components/TopBar.svelte` | Un-gated Calendar Sync button when connected to OneDrive on Web. |
| `src/lib/components/modals/MoreActionsModal.svelte` | Un-gated Calendar Sync action when connected to OneDrive on Web. |
| `src/lib/commandPalette.ts` | Un-gated Calendar Sync command when connected to OneDrive on Web. |
| `src/lib/copyForward.ts` | Un-gated Calendar search prioritization when connected to OneDrive on Web. |
| `src/lib/boot.ts` | Automatically checks `.agenda.json` on focus and launch when connected to OneDrive on Web. |
| `src/lib/oneDriveSync.ts` | Calls `refreshAgendaFileExists()` immediately after sync pulls remote changes. |
| `webapp-src/index.html` | Expanded CSP for OneDrive endpoints, added Apple and mobile PWA meta tags. |
| `webapp-src/public/manifest.webmanifest` | Added maskable icon specifications and orientation settings. |
| `webapp-src/public/sw.js` | Enhanced PWA caching strategy with shell precaching, Cache-First assets, and offline navigation fallback. |
| `.github/workflows/test.yml` | Added `npm run build:webapp` step and diff assertion to verify webapp bundle integrity in CI. |
| `website/webapp/` | Built production distribution bundle with updated assets, service worker, and manifest. |
| `docs/CHANGELOG.md` | Recorded §187 changelog entry. |

---

## 4. Verification Evidence

### 4.1 Automated Tests
- **Vitest Suite**: `npm test`
  - **414 passed (100%)** across 21 test suites.
  - Added unit tests in `webBackend.test.ts` for workspace isolation (`notes_browser` vs `notes_cloud`), folder switching, and browser note migration with conflict handling.
  - Added unit tests in `OneDriveFolderPickerModal.test.ts` for browser notes count and migration triggers.
- **Type Checking**: `npx svelte-check --tsconfig ./tsconfig.json`
  - **0 errors, 0 warnings**.
- **Production Build**: `npm run build:webapp`
  - Built cleanly in 0.94s, producing `website/webapp/assets/` and assets.

### 4.2 Manual / End-to-End Verification
- Tested on local Vite preview server (`http://localhost:5173/`).
- Verified Browser storage note isolation before connecting.
- Verified Entra ID OAuth sign-in flow and redirect.
- Verified prompt to migrate browser notes to OneDrive.
- Verified 3-way line merge and conflict handling for divergent note edits.
- Verified sign-out seamlessly restores Browser storage notes and tabs.
- Verified Calendar Sync is active when connected to OneDrive with `.agenda.json`.

---

## 5. Reviewer Checklist

When reviewing this PR, please verify:
1. **Command Surface Integrity**: Confirm that `TauriCommands` contract in `tauriCommands.ts` matches `webBackend.ts` and `mockBackend.ts`.
2. **Storage Isolation**: Verify that `notes_browser` and `notes_cloud` are strictly accessed based on active workspace, and that disconnect restores `notes_browser`.
3. **No External Network Leaks**: Ensure no proprietary servers are queried; all cloud traffic is direct between client and Microsoft Graph.
4. **CI/CD Health**: Ensure `.github/workflows/test.yml` passes all checks including `build:webapp`.
5. **PWA Offline**: Verify that `sw.js` correctly precaches the shell and excludes Microsoft OAuth / Graph URLs.
