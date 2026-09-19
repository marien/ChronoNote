# ChronoNote Web App & PWA OneDrive Cloud Sync — Functional & Technical Design

**Origin:** Marien's brief (2026-09-19) — *"I want to use the design of the OneDrive integration that is used for Android to extend the webapp implementation, so I can allow web users to persist their data on their OneDrive account. This should work in a browser and when the webapp is pinned/installed on a mobile phone. Can you come up with a functional and technical design that can be peer reviewed?"*

**Status:** Proposed — Submitted for Peer Review.  
**Companion Documents:**
- [`docs/design/android-onedrive-roadmap.md`](file:///c:/Users/marie/OneDrive/Bureaublad/ChronoNote-Gemini/docs/design/android-onedrive-roadmap.md) (Android OneDrive design & implementation reference)
- [`docs/design/webapp-roadmap.md`](file:///c:/Users/marie/OneDrive/Bureaublad/ChronoNote-Gemini/docs/design/webapp-roadmap.md) (Foundational Web App design & `WebBackend` architecture)
- [`src-tauri/src/onedrive/`](file:///c:/Users/marie/OneDrive/Bureaublad/ChronoNote-Gemini/src-tauri/src/onedrive/) (Rust reference implementation of client, auth, 3-way merge, and sync engine)

---

## Executive Summary

ChronoNote currently operates across four targets sharing a single Svelte 5 + CodeMirror 6 codebase:
1. **Desktop App** (Tauri 2 on Windows/macOS/Linux): Stores plain `.txt` files directly on the local filesystem.
2. **Android App** (Tauri 2 on Android): Sandboxed local cache synchronized with Microsoft OneDrive via Microsoft Graph REST API, RFC 7636 PKCE OAuth, and 3-way line merging.
3. **Web App** (Browser / PWA): Pure browser-local persistence in IndexedDB (`WebBackend`), lacking cross-device synchronization and vulnerable to browser storage eviction policies (e.g., Apple Safari's 7-day Intelligent Tracking Prevention purge).
4. **Public Demo** (Browser iframe): Ephemeral in-memory mock (`mockBackend`), zero retention.

This design extends the Microsoft OneDrive synchronization engine to the **Web App and installed Progressive Web App (PWA)** on desktop and mobile browsers. By running the synchronization engine directly inside the browser using standard web APIs (`fetch`, Web Crypto, IndexedDB, Service Workers), web users gain full, seamless, bi-directional synchronization with their personal or enterprise OneDrive accounts without requiring any intermediary backend server.

```
+-----------------------------------------------------------------------------------+
|                            ChronoNote Unified Ecosystem                           |
+-----------------------------------------------------------------------------------+
|  Desktop App (Windows/Mac)  <--+                                                  |
|  (Direct Filesystem .txt)      |                                                  |
|                                |                                                  |
|  Android App (Mobile Tauri) <--+==> [ Microsoft OneDrive Cloud: /Documents/Notes ] |
|  (Sandboxed + Rust Graph API)  |     - YYYY-MM-DD.txt (Human-readable plain text) |
|                                |     - .agenda.json (Calendar meetings)           |
|  Web App / PWA (Browser)    <--+                                                  |
|  (IndexedDB + TS Graph API)                                                       |
+-----------------------------------------------------------------------------------+
```

---

## Non-Negotiable Core Invariants

Any implementation adhering to this design must satisfy the following architectural invariants:

1. **Zero Proprietary Server / Zero Central Database:** ChronoNote does not operate a sync server, proxy, relay, or central database. All network traffic flows directly and encrypted over HTTPS between the user's browser client and Microsoft Graph API (`https://graph.microsoft.com/v1.0/*`).
2. **100% Plain-Text Human Readability:** Notes on OneDrive remain pure, unadorned UTF-8 plain-text files named `YYYY-MM-DD.txt`. No proprietary JSON envelopes, UUID headers, or binary blobs are injected into note files. A user opening OneDrive on any device or web portal must be able to read and edit their notes with standard Notepad.
3. **Offline-First Resilience:** Typing, editing, searching, and tab navigation operate against local IndexedDB storage with zero network latency (0ms). All edits are instantly durable locally. Background synchronization occurs asynchronously when network connectivity is present.
4. **Strict Command Surface Conformance:** All frontend components interact exclusively with the typed `TauriCommands` interface (`src/lib/tauriCommands.ts`). The frontend does not branch on runtime environment for data operations; `WebBackend` implements the exact same 14 OneDrive commands (`onedrive_login`, `onedrive_sync_now`, etc.) that Rust implements on native platforms.
5. **Device-Local Tab Session Invariant:** Tab sessions (open tabs, active tab, scroll positions) remain strictly local to the specific browser instance in IndexedDB (`meta.session`). Devices do not overwrite each other's open workspaces.
6. **Lossless Conflict Prevention:** Divergent edits across devices on the same note file never overwrite data silently. Disjoint line modifications merge cleanly via a three-way line merge algorithm (`merge3`). Overlapping line collisions pause remote overwriting and trigger the side-by-side visual diff resolution modal (`ConflictModal`).

---

# Part 1 — Functional Design

## 1.1 The User Journey Across Devices

### Scenario A: Starting on Web, Continuing on Desktop/Phone
1. A user accesses `https://app.chrononote.mariendegelder.nl` on a work laptop where they cannot install native desktop software.
2. In **Settings**, they click **Connect Microsoft Account**.
3. After authenticating with their Microsoft account, they choose an existing OneDrive folder (e.g., `Documents/Notes`) or create a new one.
4. All existing notes from that folder immediately sync into the browser's IndexedDB.
5. Later that evening, the user opens ChronoNote on their Windows desktop PC (or Android phone); all notes edited in the browser are present, identical down to the last character.

### Scenario B: Pinned PWA on Mobile (iOS / Android)
1. A mobile user visits the web app on iOS Safari or Android Chrome.
2. They tap **Add to Home Screen** / **Install App**. ChronoNote installs as a standalone PWA with its own application icon, running without browser address bar chrome.
3. The user connects OneDrive once. The authentication tokens persist securely in IndexedDB.
4. The user takes quick notes on the subway while completely offline.
5. Upon emerging from the subway, network connectivity returns; ChronoNote detects the `online` event and flushes pending edits to OneDrive in the background.

---

## 1.2 User Experience & UI Specifications

### 1.2.1 Status Bar Integration
The bottom status bar (`StatusBar.svelte`) provides immediate ambient awareness of sync health without distracting popups:

| State | Left Status Bar Presentation | Tooltip / Accessibility Label |
| :--- | :--- | :--- |
| **Disconnected** | `[ Cloud Icon ] OneDrive` | "Connect OneDrive in Settings" |
| **Syncing** | `[ ⟳ Spinning ] Syncing…` | "Syncing with OneDrive folder: Documents/Notes" |
| **Up to Date** | `[ Cloud Icon ] Notes` | "OneDrive: Documents/Notes (idle)" |
| **Offline** | `[ Cloud Icon ] Offline` | "Offline — local edits saved; will sync when reconnected" |
| **Sync Error** | `[ Cloud Icon (Warn) ] Sync error` | "Sync error — click to inspect in Settings" |
| **Held Conflicts** | `[ ⚠ 1 sync conflict ]` (amber badge) | "Some notes changed on this device and in OneDrive — tap to choose" |

Clicking the status bar cloud chip opens the Settings modal directly focused on the OneDrive section. Clicking the conflict badge opens the visual `ConflictModal`.

### 1.2.2 Settings Modal: OneDrive Section
On the Web App, the Settings modal replaces the inactive desktop "Notes folder on disk" picker with the full **OneDrive Cloud Sync** card (identical to the Android app):

```
+--------------------------------------------------------------------------+
| OneDrive Cloud Sync                                                      |
|                                                                          |
| Connected as Marien de Gelder (marien@example.com)                       |
| [ Documents/Notes                                        ] [ Browse... ] |
|                                                                          |
| [ Sync now ]  [ Sign out ]                                               |
|                                                                          |
| Status: Up to date (last synced 2 minutes ago)                           |
+--------------------------------------------------------------------------+
```

When disconnected:
```
+--------------------------------------------------------------------------+
| OneDrive Cloud Sync                                                      |
|                                                                          |
| Connect your Microsoft account to use a OneDrive folder as your Notes    |
| folder. Notes stay synchronized across all your devices.                 |
|                                                                          |
| [ ☁ Connect Microsoft Account ]                                          |
|                                                                          |
| > Advanced (Custom Entra Client ID / Tenant)                             |
+--------------------------------------------------------------------------+
```

### 1.2.3 Interactive Cloud Folder Picker (`OneDriveFolderPickerModal.svelte`)
When the user connects their account or clicks **Browse…**, an interactive modal opens:
- Navigates the user's OneDrive hierarchy starting at root (`/me/drive/root/children`).
- Shows folder items with folder icons and child counts.
- Provides a breadcrumb trail (`Root > Documents > Notes`).
- Provides a **New Folder** button with inline name input to create target directories on the fly.
- Selecting a folder persists `{ folderId, folderPath }` into IndexedDB and immediately triggers an initial sync.

### 1.2.4 Visual Conflict Resolution (`ConflictModal.svelte`)
When a file is modified both locally and on OneDrive, and the changes overlap on the same lines:
1. The sync engine holds back the remote overwrite to prevent data loss.
2. A prominent indicator appears in the status bar: `⚠ 1 sync conflict`.
3. Clicking it opens the side-by-side visual diff modal:
   - **Left Panel:** "This device" (local text, highlighting modified lines).
   - **Right Panel:** "OneDrive" (remote cloud text, highlighting divergent lines).
   - **Actions:**
     - `Keep mine`: Overwrites OneDrive with the local version.
     - `Keep theirs`: Overwrites local IndexedDB with the cloud version.
     - `Keep both`: Retains local version and saves the cloud version as `YYYY-MM-DD.conflict-theirs.txt`.

### 1.2.5 Calendar Sync via `.agenda.json`
On desktop, ChronoNote reads `.agenda.json` from the notes folder to populate daily meeting agendas. In the Web App:
- When connected to a OneDrive folder containing `.agenda.json`, the sync engine downloads and caches it in IndexedDB.
- The web app automatically activates the **Sync calendar for this day** feature, matching desktop functionality without requiring native calendar integrations.

---

# Part 2 — Technical Architecture

## 2.1 Component Architecture & Layering

```
+-------------------------------------------------------------------------------+
|                     ChronoNote Frontend (Svelte 5 / CM6)                      |
|            controller.ts | persistence.ts | stores.ts | StatusBar             |
+-------------------------------------------------------------------------------+
                                      |
                         Calls TauriCommands interface
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                    WebBackend (src/lib/webapp/webBackend.ts)                  |
|  - Routes onedrive_* commands to WebOneDriveSyncEngine                       |
|  - Intercepts note read/write/delete to track clean baselines & tombstones    |
+-------------------------------------------------------------------------------+
                   |                                            |
                   v                                            v
+------------------------------------+     +------------------------------------+
|  WebOneDriveSyncEngine             |     |  IndexedDB Storage (idb.ts)        |
|  - webOneDriveSync.ts              |     |  - 'notes': local note content     |
|  - webOneDriveAuth.ts (PKCE SPA)   |     |  - 'conflicts': held conflicts     |
|  - oneDriveClient.ts (Graph CORS)  |     |  - 'meta': auth, cache, tombstones |
|  - lineMerge.ts (3-Way Merge)      |     +------------------------------------+
+------------------------------------+
                   |
     Direct HTTPS Calls (Fetch API + CORS)
                   |
                   v
+-------------------------------------------------------------------------------+
|                      Microsoft Identity & Graph Services                      |
|  - Auth:  https://login.microsoftonline.com/common/oauth2/v2.0/token         |
|  - Graph: https://graph.microsoft.com/v1.0/me/drive/items/...                |
+-------------------------------------------------------------------------------+
```

---

## 2.2 Storage Model & IndexedDB Schema

The IndexedDB database `chrononote-webapp` manages local persistence across dedicated object stores:

| Store Name | Key | Value Schema | Purpose |
| :--- | :--- | :--- | :--- |
| `notes` | `filename` (string) | `{ content: string, contentHash: string, modifiedMs: number }` | Active note documents |
| `conflicts` | `filename` (string) | `{ content: string, contentHash: string, modifiedMs: number }` | Saved conflict copies |
| `meta` | `config` | `StoredConfig` | User preferences (theme, word wrap) |
| `meta` | `session` | `TabSession` | Open tab IDs, active tab (device-local) |
| `meta` | `scratchpad_drafts` | `Record<string, string>` | Mobile draft preservation |
| `meta` | `onedrive_auth` | `StoredWebAuth` | OAuth tokens, account profile |
| `meta` | `onedrive_folder`| `OneDriveFolderConfig` | Selected cloud `{ folderId, folderPath }` |
| `meta` | `onedrive_cache` | `WebSyncCache` | Delta link, file eTags, baseline hashes |
| `meta` | `onedrive_tombstones`| `string[]` | Queue of files deleted locally offline |
| `meta` | `onedrive_advanced` | `OneDriveAdvancedConfig` | Custom tenant / client ID overrides |
| `meta` | `agenda` | `AgendaRecord` | Cached `.agenda.json` calendar contents |

### Type Definitions
```typescript
export interface StoredWebAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix epoch ms
  account: OneDriveAccount | null;
}

export interface WebFileCacheEntry {
  id: string;
  etag: string;
  localHash: string;
  baseContent?: string; // Stored to allow clean 3-way line merge
}

export interface WebPendingConflict {
  remoteContent: string;
  remoteId: string;
  remoteEtag: string;
}

export interface WebSyncCache {
  deltaLink: string | null;
  files: Record<string, WebFileCacheEntry>;
  conflicts: Record<string, WebPendingConflict>;
}
```

---

## 2.3 Authentication: OAuth 2.0 PKCE for Single-Page Applications

### 2.3.1 Architectural Constraint: Browser SPAs vs. Native Apps
- **Desktop/Android:** Can run a loopback HTTP listener (`http://localhost:8765/auth`) or handle OS custom URL schemes (`chrononote://auth`).
- **Web App / PWA:** Browsers cannot bind raw TCP sockets and cannot register custom URL schemes.
- **Solution:** Standard OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636) registered on the Microsoft Identity Platform under the **Single-Page Application (SPA)** platform.

### 2.3.2 Why Azure SPA Platform Registration is Mandatory
Microsoft Identity Platform enforces strict Cross-Origin Resource Sharing (CORS) rules. If an Azure App Registration is configured solely as "Mobile and desktop applications", Microsoft's token endpoint (`/oauth2/v2.0/token`) will reject browser `fetch()` requests with CORS errors. When configured as a **Single-Page Application (SPA)** platform:
1. Microsoft enables `Access-Control-Allow-Origin: *` on the `/token` endpoint.
2. Tokens can be exchanged and refreshed directly by browser `fetch()` calls without requiring a client secret.

### 2.3.3 Redirect Flow vs. Popup Flow in PWA Mode
While desktop browsers support `window.open` popup windows, **standalone installed PWAs on iOS (Safari) and Android (Chrome) isolate or break popup contexts**:
- On iOS Safari standalone PWA, calling `window.open` often kicks the user out of the installed standalone shell into full Mobile Safari, losing PWA session state.
- **Adopted Strategy: Full-Page Redirect with Resilient State Recovery**:
  1. The user taps **Connect Microsoft Account**.
  2. The app generates a 64-byte random `code_verifier` and computes its SHA-256 `code_challenge` (base64url encoded).
  3. The app generates a cryptographic `state` token.
  4. The app persists `{ codeVerifier, state, returnUrl: window.location.href }` into `sessionStorage` **and** IndexedDB (safeguarding against PWA process restarts).
  5. The browser navigates to Microsoft's authorize endpoint:
     ```
     https://login.microsoftonline.com/common/oauth2/v2.0/authorize?
       client_id=9b008168-6c13-4f0f-9531-2313e7613ccb
       &response_type=code
       &redirect_uri=https://app.chrononote.mariendegelder.nl/
       &response_mode=query
       &scope=Files.ReadWrite%20offline_access%20User.Read
       &code_challenge=<challenge>
       &code_challenge_method=S256
       &state=<state>
     ```
  6. The user signs in and grants consent.
  7. Microsoft redirects back to the Web App URL: `https://app.chrononote.mariendegelder.nl/?code=...&state=...`.
  8. During startup (`boot.ts`), the webapp detects the `code` and `state` parameters in `window.location.search`.
  9. The app verifies `state`, retrieves `codeVerifier`, and posts to `/token`:
     ```http
     POST https://login.microsoftonline.com/common/oauth2/v2.0/token HTTP/1.1
     Content-Type: application/x-www-form-urlencoded

     client_id=9b008168-6c13-4f0f-9531-2313e7613ccb
     &grant_type=authorization_code
     &code=<code>
     &redirect_uri=https://app.chrononote.mariendegelder.nl/
     &code_verifier=<verifier>
     ```
  10. The returned tokens (`access_token`, `refresh_token`, `expires_in`) are saved into IndexedDB.
  11. The URL is scrubbed immediately via `window.history.replaceState({}, document.title, window.location.pathname)` to prevent replay or accidental bookmarking of authorization codes.
  12. The app fetches `/me` to populate the user profile and triggers an immediate sync.

### 2.3.4 Silent Token Refresh
Before initiating any sync or Graph API request:
- The engine checks `storedAuth.expiresAt`.
- If `expiresAt < Date.now() + 5 * 60 * 1000` (within 5 minutes of expiration), it calls `/token` with `grant_type=refresh_token`.
- Upon receiving fresh tokens, `storedAuth` is updated in IndexedDB.
- If refresh fails due to revoked consent or expired grant, status shifts to `offline` and the UI invites the user to re-authenticate.

---

## 2.4 Microsoft Graph API Client in TypeScript (`oneDriveClient.ts`)

Microsoft Graph API fully supports CORS from any web origin when authorized with a Bearer token. The TypeScript client implements the core operations:

```typescript
export class WebOneDriveClient {
  private async fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getValidAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  }

  // 1. List child folders for folder picker
  async listChildren(folderId: string): Promise<DriveItem[]>;

  // 2. Create subfolder
  async createFolder(parentId: string, name: string): Promise<DriveItem>;

  // 3. Download note content
  async downloadContent(itemId: string): Promise<string>;

  // 4. Upload note content with Optimistic Concurrency Control (OCC)
  async uploadContent(folderId: string, filename: string, content: string, etag?: string): Promise<UploadResult>;

  // 5. Delete note file (replay tombstone)
  async deleteItem(folderId: string, filename: string): Promise<DeleteResult>;

  // 6. Query delta changes
  async getDelta(folderId: string, deltaLink?: string | null): Promise<DeltaResult>;
}
```

### Optimistic Concurrency Control (OCC) Headers:
- **Updating existing file:** `PUT https://graph.microsoft.com/v1.0/me/drive/items/{folderId}:/{filename}:/content`  
  Header: `If-Match: "{etag}"`  
  - If the cloud file has been touched by another device, Microsoft Graph rejects the write with **HTTP 412 Precondition Failed**. The engine catches this and triggers conflict handling rather than clobbering the remote change.
- **Creating new file:**  
  Header: `If-None-Match: "*"`  
  - If the file was created concurrently on another device, HTTP 412 prevents silent overwrites.

---

## 2.5 Bi-Directional Synchronization Loop (`webOneDriveSync.ts`)

### 2.5.1 Cross-Tab Concurrency Control (Web Locks)
Unlike native apps where a single background process manages sync, web users may have ChronoNote open in multiple browser tabs simultaneously. If multiple tabs regain connectivity or trigger autosave pushes simultaneously, they could race to read and write the same IndexedDB entries or issue duplicated Graph API calls.

**Solution:** The entire sync algorithm is wrapped in the **Web Locks API**:
```typescript
await navigator.locks.request("onedrive-sync-lock", { mode: "exclusive", ifAvailable: true }, async (lock) => {
  if (!lock) return; // Another tab is currently syncing; safely abort and let them handle it
  await executeSyncLoop();
});
```
This guarantees that only one tab synchronizes at a time, protecting `syncCache` and Graph API quotas.

### 2.5.2 Sync Phases

The synchronization algorithm executes in four distinct, deterministic phases inside the Web Lock:

```
[ Trigger: Save / Resume / Timer / Manual ]
                   |
                   v
      +-------------------------+
      |  Phase 1: Replay        | ---> Delete items on OneDrive corresponding to
      |  Local Tombstones       |      local notes deleted while offline.
      +-------------------------+
                   |
                   v
      +-------------------------+
      |  Phase 2: Pull Remote   | ---> Fetch delta changes (/delta) from OneDrive.
      |  Delta Changes          |      Compare remote eTags and SHA-256 hashes.
      +-------------------------+
                   |
          [ Divergence Detected? ]
          /                      \
        No                       Yes
        /                          \
       |                   +-------------------------+
       |                   |  Three-Way Line Merge   |
       |                   |  (Clean -> Apply locally|
       |                   |   Conflict -> Hold back)|
       |                   +-------------------------+
        \                          /
         +------------+-----------+
                      |
                      v
      +-------------------------+
      |  Phase 3: Push Local    | ---> Scan local IndexedDB for dirty notes.
      |  Modifications          |      CAS Upload (PUT with If-Match: etag).
      +-------------------------+
                      |
                      v
      +-------------------------+
      |  Phase 4: Agenda Sync   | ---> Download updated .agenda.json if present;
      |  & Cache Finalization   |      persist deltaLink & update UI status.
      +-------------------------+
```

### Detailed Phase Execution:

#### Phase 1: Replay Local Tombstones
- When a user deletes a note locally while offline (or an empty dated tab closes), the filename is recorded in `meta.onedrive_tombstones`.
- During sync, the engine issues `DELETE /me/drive/items/{folderId}:/{filename}:` for each tombstone.
- On HTTP 204 (Success) or HTTP 404 (Already Gone), the filename is pruned from tombstones and from `syncCache.files`.

#### Phase 2: Pull Remote Delta Changes
- The engine calls `/me/drive/items/{folderId}/delta` (or passes the stored `deltaLink`).
- For each item reported:
  - **Remote Deletion (`deleted` facet):**
    - If local note is unmodified from baseline: delete local note from IndexedDB `notes` and `syncCache`.
    - If local note was modified locally while offline: keep local note and clear cached baseline (will re-upload as new note in Phase 3).
  - **Remote Modification / Creation:**
    - Calculate local SHA-256 hash.
    - If remote SHA-256 matches local SHA-256: no content change; update cached `etag`.
    - If remote SHA-256 differs:
      - Download remote text.
      - **Case 2A (No local file):** Write remote text to IndexedDB `notes`. Record `etag`, `localHash`, and `baseContent`.
      - **Case 2B (Local unchanged from last sync):** Fast-forward update local IndexedDB `notes` with remote text.
      - **Case 2C (Both local and remote modified):**
        - Execute `merge3(baseContent, localContent, remoteContent)`.
        - If `Clean(mergedContent)`: Update local note with merged text; stage for Phase 3 upload.
        - If `Conflict`: Save remote version in `syncCache.conflicts[filename]`. Hold back local overwrite. Post toast and alert status bar.

#### Phase 3: Push Local Modifications
- Iterate through all notes in IndexedDB `notes`.
- Skip any note currently held in `syncCache.conflicts`.
- Compare current local hash with `syncCache.files[filename].localHash`.
- If hash has changed:
  - Upload content via `PUT` with `If-Match: "{cachedEtag}"`.
  - On HTTP 200/201: Store new `etag`, `localHash`, and update `baseContent` to match what was uploaded.
  - On HTTP 412 (Precondition Failed): Remote changed concurrently; download new remote content and trigger 3-way merge.

#### Phase 4: Agenda Sync & Cache Finalization
- If `.agenda.json` was touched remotely: Download and store into IndexedDB `meta.agenda`.
- Commit updated `WebSyncCache` to IndexedDB.
- Set `oneDriveSyncStatus` to `idle`.

---

## 2.6 Three-Way Line Merge in TypeScript (`lineMerge.ts`)

To ensure exact behavioral parity with the Rust engine (`src-tauri/src/onedrive/merge.rs`), the merge algorithm is ported directly to TypeScript.

### Rules of Engagement:
1. **Trailing Newlines Guaranteed:** Documents are normalized with a trailing newline before hunk analysis so that appending lines does not register as an edit of the final line.
2. **LCS Hunk Detection:** Computes Longest Common Subsequence between `(base, local)` and `(base, remote)`.
3. **Disjoint Edits:** Modifications occurring on non-overlapping line ranges are applied simultaneously.
4. **Append Reconciliation:** If both devices appended lines at the same position, both additions are kept (remote hunks placed first, followed by local hunks).
5. **Identical Edits:** If both sides made the exact same line change, it is accepted cleanly.
6. **Collisions:** Any overlapping line replacements, deletions of modified lines, or modifications within insertions produce `MergeResult.Conflict`.

```typescript
export type MergeOutcome =
  | { kind: "clean"; content: string }
  | { kind: "conflict" };

export function merge3(base: string, local: string, remote: string): MergeOutcome {
  // Direct port of Rust src-tauri/src/onedrive/merge.rs
  // Returns clean merged string or flags conflict.
}
```

---

## 2.7 Service Worker & PWA Hardening

### 2.7.1 Cross-Origin Isolation in `sw.js`
The existing service worker (`webapp-src/public/sw.js`) caches GET requests using a network-first strategy. When Microsoft Graph and OAuth calls are introduced, the Service Worker must **strictly isolate application shell requests from third-party API traffic**:

```javascript
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: Bypass service worker for Microsoft OAuth and Graph API calls
  if (
    url.hostname === "login.microsoftonline.com" ||
    url.hostname === "graph.microsoft.com" ||
    url.origin !== self.location.origin
  ) {
    return; // Allow standard network fetch without cache interception
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
```

### 2.7.2 Content Security Policy (CSP) Requirements
For the Web App to function securely while communicating with Microsoft endpoints, the deployment `Content-Security-Policy` must explicitly whitelist the necessary domains for API and authentication traffic.
The `connect-src` directive must be updated to include:
`connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com;`
This guarantees the browser allows outbound `fetch()` requests and token negotiations without raising CSP violations.

### 2.7.3 Safari ITP Storage Eviction Mitigation
Apple Safari enforces Intelligent Tracking Prevention (ITP), which purges all script-writable storage (including IndexedDB) after 7 days if the user does not interact with the website in Safari.
- **Mitigation 1 (PWA Installation):** When a user adds ChronoNote to their Home Screen (`display: standalone`), WebKit exempts the standalone web application origin from the 7-day ITP eviction rule.
- **Mitigation 2 (UI Warning for Uninstalled Safari):** The UI will detect if the user is running Safari in browser mode (`!window.navigator.standalone`). If so, the Settings screen displays a specific warning urging them to use "Add to Home Screen", preventing scenarios where local offline edits are silently evicted before the user reconnects.
- **Mitigation 3 (Persistent Storage Request):** `WebBackend` calls `navigator.storage.persist()`, signaling the browser to classify the database as persistent.
- **Mitigation 4 (OneDrive Cloud Sync):** Even if a browser completely evicts local storage (or the user clears browser history), all notes, history, and folders reside safely on OneDrive and re-sync automatically upon signing back in.

---

## 2.8 Command Surface Implementation in `WebBackend`

All 14 `onedrive_*` commands in `src/lib/tauriCommands.ts` are mapped directly to the `WebOneDriveSyncEngine`:

| Command | `WebBackend` Implementation |
| :--- | :--- |
| `onedrive_login` | Generates PKCE parameters, persists state in IDB, navigates to Microsoft authorize URL. |
| `onedrive_exchange_code` | Exchanges authorization code at `/token`, retrieves `/me` profile, stores tokens in IDB. |
| `onedrive_logout` | Clears `meta.onedrive_auth` and resets memory state. Leaves note files intact. |
| `onedrive_get_account` | Reads cached account profile from `meta.onedrive_auth`. |
| `onedrive_list_folders` | Calls `client.listChildren(parentId ?? "root")`. |
| `onedrive_create_folder` | Calls `client.createFolder(parentId ?? "root", name)`. |
| `onedrive_set_folder` | Persists `{ folderId, folderPath }` to `meta.onedrive_folder` and resets sync cache. |
| `onedrive_get_folder` | Reads `{ folderId, folderPath }` from `meta.onedrive_folder`. |
| `onedrive_sync_now` | Executes the 4-phase synchronization loop; returns `{ success, message }`. |
| `onedrive_get_conflicts` | Returns array of pending held conflicts from `syncCache.conflicts`. |
| `onedrive_resolve_conflict` | Applies user resolution (`mine`, `theirs`, `both`), updates cache, stages upload. |
| `onedrive_get_sync_status` | Returns current reactive status: `"idle" \| "syncing" \| "offline" \| "error"`. |
| `onedrive_get_advanced_config`| Reads custom client ID / tenant override from `meta.onedrive_advanced`. |
| `onedrive_set_advanced_config`| Persists custom client ID / tenant override. |

---

# Part 3 — Security, Privacy & Data Governance

1. **Client-Side Token Security:**
   - Access tokens and refresh tokens are stored in the origin-sandboxed IndexedDB `meta` store.
   - Access tokens are short-lived (~60 minutes).
   - In modern browsers, IndexedDB is encrypted at rest by the operating system user profile sandbox.
2. **Minimal OAuth Scopes:**
   - Requested scopes: `Files.ReadWrite`, `offline_access`, `User.Read`.
   - The app has no access to user emails, calendars (unless `.agenda.json` is placed in the folder), contacts, or OneDrive root files outside the selected directory.
3. **No Third-Party Analytics or CDNs:**
   - Zero telemetry, zero tracker scripts, zero third-party font or icon CDNs.
   - All assets are bundled locally in the PWA.

---

# Part 4 — Peer Review Discussion & Trade-Offs

### Trade-Off 1: Full-Page Redirect vs. Popup Window for OAuth in PWA
- *Option A (Popup):* Keeps the current page loaded; opens a small popup window. Supported well on desktop browsers. Fails or switches out of standalone shell on iOS Safari PWA.
- *Option B (Full-Page Redirect - Recommended):* Works universally across desktop browsers, mobile Safari, Chrome, and standalone installed PWAs. State is preserved in IndexedDB.
- *Decision for Peer Review:* Adopt Option B as the default, with automated code exchange on return. Settings modal retains the manual auth code paste input as a secondary failsafe.

### Trade-Off 2: Delta Queries vs. Full Folder Traversal
- Microsoft Graph `/delta` provides efficient tracking of remote changes. However, delta tokens can expire (HTTP 410 ResyncRequired) after long periods of inactivity.
- *Decision:* The sync engine uses `/delta` by default, but implements an automatic fallback to full folder traversal if HTTP 410 or invalid delta token is returned.

### Trade-Off 3: Base Content Storage for Three-Way Merge
- The 3-way merge requires knowing the common ancestor (`baseContent`).
- If `baseContent` is not stored, a divergence can only be handled as a binary conflict.
- *Decision:* Store `baseContent` inside `WebFileCacheEntry` in IndexedDB. Because notes are lightweight plain text, storing baseline strings for a typical collection of daily notes consumes negligible storage (< 5 MB for several years of notes).

---

# Part 5 — Test & Verification Strategy

### 5.1 Unit Testing (Vitest)
1. **OAuth PKCE Utility Suite (`webOneDriveAuth.test.ts`):**
   - Verify `code_verifier` entropy and RFC 7636 URL-safe alphabet compliance.
   - Verify SHA-256 `code_challenge` computation against known RFC test vectors.
2. **3-Way Line Merge Suite (`lineMerge.test.ts`):**
   - Run the exact 12 test cases currently in Rust `src-tauri/src/onedrive/merge.rs` (identical disjoint merges, both-sides-append, overlapping collisions, trailing newline handling).
3. **Microsoft Graph Client Suite (`oneDriveClient.test.ts`):**
   - Mock fetch responses for folder listing, delta paging, CAS upload with `If-Match`, and HTTP 412 handling.

### 5.2 Integration Testing (`webBackend.test.ts`)
1. Test full lifecycle: Login -> Folder selection -> Write note locally -> Sync push -> Mock remote change -> Sync pull -> Merge.
2. Test offline resilience: Delete note while offline -> Check tombstone recording -> Sync when online -> Verify DELETE request issued.

### 5.3 End-to-End & Cross-Device Parity Testing (Playwright)
1. Launch WebApp in Playwright with mocked Microsoft Graph endpoints.
2. Verify Settings modal OneDrive card display, folder picker navigation, and status bar indicator transitions.
3. Test conflict modal triggering and resolution options (`mine`, `theirs`, `both`).

### 5.4 Quality Gates
Before any pull request is merged:
- `npm run check` (0 TypeScript / Svelte compiler errors or warnings)
- `npm test` (100% pass across all unit and backend tests)
- `cargo test --manifest-path src-tauri/Cargo.toml` (Verify native targets untouched)
- `npm run build:webapp` (Clean build of webapp distribution bundle)

---

# Part 6 — Implementation Workstreams

```
+---------------------------------------------------------------------------------+
|                               Implementation Plan                                |
+---------------------------------------------------------------------------------+
| Stream 1: Core Math & Client                                                    |
| - src/lib/webapp/lineMerge.ts (3-way line merge algorithm)                      |
| - src/lib/webapp/oneDriveClient.ts (Graph REST API fetch wrapper + CORS)        |
| - src/lib/webapp/webOneDriveAuth.ts (PKCE generator, token exchange, refresh)   |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Stream 2: Web Sync Engine & Storage                                             |
| - src/lib/webapp/webOneDriveSync.ts (4-phase sync loop, cache, tombstones)      |
| - src/lib/webapp/idb.ts (V2 schema migration for sync cache & tombstones)       |
| - src/lib/webapp/webBackend.ts (Wire all 14 onedrive_* commands)                |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Stream 3: UI & Lifecycle Integration                                            |
| - src/lib/boot.ts & src/main-webapp.ts (Handle OAuth redirect on boot)          |
| - src/lib/persistence.ts (Enable cloud push for web backend)                    |
| - src/lib/components/StatusBar.svelte & SettingsModal.svelte (Enable OneDrive UI)|
| - webapp-src/public/sw.js (Ensure cross-origin API bypass in Service Worker)    |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Stream 4: Verification & Automated Tests                                        |
| - Unit tests for lineMerge, oneDriveClient, webOneDriveAuth, webBackend         |
| - Production webapp build and validation                                        |
+---------------------------------------------------------------------------------+
```
