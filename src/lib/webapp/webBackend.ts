/** IndexedDB-backed `TauriCommands` implementation — the third backend
 * alongside the real Tauri IPC bridge (`tauriApi.ts`) and the in-memory
 * test/demo mock (`testing/mockBackend.ts`). Installed as
 * `window.__TAURI_INTERNALS__` by `main-webapp.ts`, exactly the way the
 * mock installs itself, so the entire frontend above the command layer
 * (`controller.ts`, every Svelte component) runs completely unmodified.
 * See `docs/design/webapp-roadmap.md` for the full design.
 *
 * Schema — one IndexedDB database (`chrononote-webapp`), three object
 * stores, each addressed by an explicit key (see `idb.ts`):
 *   - `notes`    filename -> `{ content, contentHash, modifiedMs }`
 *                (this shape *is* `FileMetadata` plus `content` — kept
 *                current on every write so reads never recompute a hash)
 *   - `conflicts` a `.txt`-suffixed name -> raw content, written by
 *                `write_conflict_copy` (§94's "keep my version" path).
 *                Deliberately a separate store from `notes` so it can
 *                never be picked up by `list_note_files`/`read_all_notes`
 *                — no filename-shape filtering needed to keep them apart.
 *   - `config`   a single fixed-key row holding the whole `AppConfig`
 *                (minus `notesDir`/`recentNotesDirs`, meaningless here —
 *                see below) plus `session`, the one `TabSession` row.
 *
 * `notesDir`/`recentNotesDirs`/`set_notes_dir`/`path_exists` are the one
 * part of `AppConfig`/`TauriCommands` with no browser-storage analogue —
 * v1 is a single implicit workspace per browser origin (the design doc's
 * "what's deferred" list). `AppConfig.notesDir` is filled with a fixed,
 * user-visible placeholder string since the type requires *something*;
 * nothing reads it as a real path. The Settings UI hides the "Notes
 * Location" section entirely when `backendKind` is `"web"`, so this
 * placeholder is never actually shown.
 */
import { activeTitlesAfterDate, activeTitlesForDate, removedTitlesForDate } from "../agendaTitles";
import type { AppConfig, AppError, ColorMode, FileMetadata, LanguageMode, TabSession, ThemeMode } from "../types";
import type { CommandArgs, CommandReturn, TauriCommand, TauriCommands } from "../tauriCommands";
import { isValidNoteFilename } from "../noteFilename";
import { IDB_META_KEYS, IDB_STORES, idbClear, idbDelete, idbGet, idbGetAllEntries, idbGetAllKeys, idbPut, openDb } from "./idb";
import { WebOneDriveSyncEngine, type SyncCache } from "./webOneDriveSync";
import { merge3 } from "./lineMerge";

const DB_NAME = "chrononote-webapp";
const DB_VERSION = 2;
const STORE_NOTES = IDB_STORES.NOTES;
const STORE_NOTES_BROWSER = IDB_STORES.NOTES_BROWSER;
const STORE_NOTES_CLOUD = IDB_STORES.NOTES_CLOUD;
const STORE_NOTES_ARCHIVE = IDB_STORES.NOTES_ARCHIVE;
const STORE_CONFLICTS = IDB_STORES.CONFLICTS;
const STORE_META = IDB_STORES.META;
const CONFIG_KEY = IDB_META_KEYS.CONFIG;
const SESSION_KEY = IDB_META_KEYS.SESSION;

/** Shown in place of a real path — nothing in the web-app UI reads this
 * as an actual filesystem location (see the module doc above). */
const NOTES_DIR_PLACEHOLDER = "Browser storage";

interface StoredNote {
  content: string;
  contentHash: string;
  modifiedMs: number;
}

interface StoredConfig {
  colorMode: ColorMode;
  themeMode: ThemeMode;
  languageMode: LanguageMode;
  wordWrap: boolean;
  readableLineLength: boolean;
  autoCheckUpdates: boolean;
  lastSeenVersion: string | null;
  calendarSyncEnabled: boolean;
  fontSize?: number;
  lineHeight?: number;
  pureBlack?: boolean;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function metadataOf(note: StoredNote | undefined): FileMetadata {
  if (!note) return { exists: false, contentHash: null, sizeBytes: null, modifiedMs: null };
  return {
    exists: true,
    contentHash: note.contentHash,
    sizeBytes: new TextEncoder().encode(note.content).length,
    modifiedMs: note.modifiedMs,
  };
}

type CommandHandlers = {
  [K in keyof TauriCommands]: (
    args: CommandArgs<K>,
  ) => CommandReturn<K> | Promise<CommandReturn<K>>;
};

export class WebBackend {
  /** `plugin:app|version` / the About drawer — set by `main-webapp.ts` at
   * boot from the same build-time constant the demo uses. */
  appVersion: string;

  private dbPromise: Promise<IDBDatabase>;
  readonly syncEngine: WebOneDriveSyncEngine;

  constructor(appVersion: string) {
    this.appVersion = appVersion;
    this.dbPromise = openDb(DB_NAME, DB_VERSION, [
      STORE_NOTES,
      STORE_NOTES_BROWSER,
      STORE_NOTES_CLOUD,
      STORE_NOTES_ARCHIVE,
      STORE_CONFLICTS,
      STORE_META,
    ]);
    this.syncEngine = new WebOneDriveSyncEngine(() => this.db());
  }

  private async db(): Promise<IDBDatabase> {
    return this.dbPromise;
  }

  private migrationPromise: Promise<void> | null = null;
  private ensureMigrated(): Promise<void> {
    if (!this.migrationPromise) {
      this.migrationPromise = (async () => {
        const db = await this.db();
        const hasStoreNotes =
          db.objectStoreNames &&
          (typeof db.objectStoreNames.contains === "function"
            ? db.objectStoreNames.contains(STORE_NOTES)
            : Array.from(db.objectStoreNames).includes(STORE_NOTES));
        if (hasStoreNotes) {
          const legacyNotes = await idbGetAllEntries<StoredNote>(db, STORE_NOTES);
          if (legacyNotes.length > 0) {
            const browserKeys = await idbGetAllKeys(db, STORE_NOTES_BROWSER);
            const cloudKeys = await idbGetAllKeys(db, STORE_NOTES_CLOUD);
            if (browserKeys.length === 0 && cloudKeys.length === 0) {
              const auth = await idbGet(db, STORE_META, IDB_META_KEYS.ONEDRIVE_AUTH);
              const folder = await idbGet(db, STORE_META, IDB_META_KEYS.ONEDRIVE_FOLDER);
              const target = auth && folder ? STORE_NOTES_CLOUD : STORE_NOTES_BROWSER;
              for (const [k, v] of legacyNotes) {
                await idbPut(db, target, k, v);
              }
              await idbPut(db, STORE_META, IDB_META_KEYS.ACTIVE_WORKSPACE, auth && folder ? "onedrive" : "browser");
            }
          }
        }
      })();
    }
    return this.migrationPromise;
  }

  async getActiveWorkspace(): Promise<"browser" | "onedrive"> {
    await this.ensureMigrated();
    const db = await this.db();
    const ws = await idbGet<string>(db, STORE_META, IDB_META_KEYS.ACTIVE_WORKSPACE);
    if (ws === "onedrive" || ws === "browser") return ws;
    const auth = await idbGet(db, STORE_META, IDB_META_KEYS.ONEDRIVE_AUTH);
    const folder = await idbGet(db, STORE_META, IDB_META_KEYS.ONEDRIVE_FOLDER);
    return auth && folder ? "onedrive" : "browser";
  }

  async getActiveNotesStore(): Promise<string> {
    const ws = await this.getActiveWorkspace();
    return ws === "onedrive" ? STORE_NOTES_CLOUD : STORE_NOTES_BROWSER;
  }

  async getActiveSessionKey(): Promise<string> {
    const ws = await this.getActiveWorkspace();
    return ws === "onedrive" ? IDB_META_KEYS.SESSION_CLOUD : IDB_META_KEYS.SESSION_BROWSER;
  }

  async migrateBrowserNotesToCloud(): Promise<{ migratedCount: number; conflictCount: number }> {
    await this.ensureMigrated();
    const db = await this.db();
    const browserEntries = await idbGetAllEntries<StoredNote>(db, STORE_NOTES_BROWSER);
    const validEntries = browserEntries.filter(([k]) => isValidNoteFilename(String(k)));
    if (validEntries.length === 0) return { migratedCount: 0, conflictCount: 0 };

    for (const [k, note] of validEntries) {
      await idbPut(db, STORE_NOTES_ARCHIVE, k, note);
    }

    const cache = (await idbGet<SyncCache>(db, STORE_META, IDB_META_KEYS.ONEDRIVE_CACHE)) ?? { files: {}, conflicts: {} };
    let migratedCount = 0;
    let conflictCount = 0;

    for (const [k, note] of validEntries) {
      const filename = String(k);
      const existingCloud = await idbGet<StoredNote>(db, STORE_NOTES_CLOUD, filename);

      if (!existingCloud || existingCloud.content.trim() === "") {
        await idbPut(db, STORE_NOTES_CLOUD, filename, note);
        migratedCount++;
      } else if (existingCloud.contentHash === note.contentHash || note.content.trim() === "") {
        migratedCount++;
      } else {
        // Both exist with different non-empty content: flag as conflict
        await idbPut(db, STORE_NOTES_CLOUD, filename, note);
        const cloudCached = cache.files[filename];
        cache.conflicts[filename] = {
          remoteContent: existingCloud.content,
          remoteId: cloudCached?.id ?? "",
          remoteEtag: cloudCached?.etag ?? "",
        };
        conflictCount++;
        migratedCount++;
      }
    }

    await idbPut(db, STORE_META, IDB_META_KEYS.ONEDRIVE_CACHE, cache);
    const browserSession = await idbGet(db, STORE_META, IDB_META_KEYS.SESSION_BROWSER);
    const cloudSession = await idbGet(db, STORE_META, IDB_META_KEYS.SESSION_CLOUD);
    if (browserSession && !cloudSession) {
      await idbPut(db, STORE_META, IDB_META_KEYS.SESSION_CLOUD, browserSession);
    }
    await idbClear(db, STORE_NOTES_BROWSER);
    await idbDelete(db, STORE_META, IDB_META_KEYS.SESSION_BROWSER);

    return { migratedCount, conflictCount };
  }

  /** Requests the browser not evict this origin's storage under
   * pressure. Best-effort and silent — unsupported browsers, and denied
   * requests, both just mean the ordinary eviction rules apply. Doesn't
   * help against Safari's time-based ITP purge (see the design doc); the
   * in-app messaging is what actually addresses that. */
  async requestPersistentStorage(): Promise<void> {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* not supported / denied — nothing to do */
    }
  }

  private async loadConfig(): Promise<StoredConfig> {
    const db = await this.db();
    const stored = await idbGet<StoredConfig>(db, STORE_META, CONFIG_KEY);
    return (
      stored ?? {
        colorMode: "color", // mirrors storage.rs's ColorMode::default() (§140)
        themeMode: "system",
        languageMode: "system",
        wordWrap: false,
        readableLineLength: false,
        autoCheckUpdates: true,
        lastSeenVersion: null,
        calendarSyncEnabled: false,
        fontSize: 13,
        lineHeight: 1.6,
        pureBlack: false,
      }
    );
  }

  private async saveConfig(cfg: StoredConfig): Promise<void> {
    const db = await this.db();
    await idbPut(db, STORE_META, CONFIG_KEY, cfg);
  }

  private async toAppConfig(cfg: StoredConfig): Promise<AppConfig> {
    const ws = await this.getActiveWorkspace();
    let dir = "Browser storage";
    if (ws === "onedrive") {
      const db = await this.db();
      const folder = await idbGet<{ folderPath?: string }>(db, STORE_META, IDB_META_KEYS.ONEDRIVE_FOLDER);
      dir = folder?.folderPath || "OneDrive";
    }
    return {
      notesDir: dir,
      colorMode: cfg.colorMode,
      themeMode: cfg.themeMode,
      languageMode: cfg.languageMode,
      wordWrap: cfg.wordWrap,
      readableLineLength: cfg.readableLineLength,
      recentNotesDirs: [],
      autoCheckUpdates: cfg.autoCheckUpdates,
      lastSeenVersion: cfg.lastSeenVersion,
      calendarSyncEnabled: cfg.calendarSyncEnabled,
      fontSize: cfg.fontSize ?? 13,
      lineHeight: cfg.lineHeight ?? 1.6,
      pureBlack: cfg.pureBlack ?? false,
    };
  }

  private async listValidFilenames(): Promise<string[]> {
    const db = await this.db();
    const store = await this.getActiveNotesStore();
    const keys = await idbGetAllKeys(db, store);
    return (keys as string[]).filter(isValidNoteFilename).sort();
  }

  private readonly core: CommandHandlers = {
    get_config: async () => this.toAppConfig(await this.loadConfig()),

    set_notes_dir: async ({ path }) => {
      const db = await this.db();
      const ws = path === "Browser storage" || path === "browser" ? "browser" : "onedrive";
      await idbPut(db, STORE_META, IDB_META_KEYS.ACTIVE_WORKSPACE, ws);
      const cfg = await this.loadConfig();
      return this.toAppConfig(cfg);
    },
    path_exists: () => false,

    set_color_mode: async ({ mode }) => {
      const cfg = await this.loadConfig();
      cfg.colorMode = mode;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_theme_mode: async ({ mode }) => {
      const cfg = await this.loadConfig();
      cfg.themeMode = mode;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_language_mode: async ({ mode }) => {
      const cfg = await this.loadConfig();
      cfg.languageMode = mode;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    // Calendar sync is desktop/demo-only (no local filesystem to read
    // `.agenda.json` from in the browser) — the Settings Calendar section
    // is already hidden on web, so this is never actually called, but
    // kept fully functional rather than a no-op/throw for consistency.
    set_calendar_sync_enabled: async ({ enabled }) => {
      const cfg = await this.loadConfig();
      cfg.calendarSyncEnabled = enabled;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_word_wrap: async ({ enabled }) => {
      const cfg = await this.loadConfig();
      cfg.wordWrap = enabled;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_readable_line_length: async ({ enabled }) => {
      const cfg = await this.loadConfig();
      cfg.readableLineLength = enabled;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_auto_check_updates: async ({ enabled }) => {
      const cfg = await this.loadConfig();
      cfg.autoCheckUpdates = enabled;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_font_size: async ({ fontSize }) => {
      const cfg = await this.loadConfig();
      cfg.fontSize = Math.min(18, Math.max(12, fontSize));
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_line_height: async ({ lineHeight }) => {
      const cfg = await this.loadConfig();
      cfg.lineHeight = Math.min(1.8, Math.max(1.3, lineHeight));
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_pure_black: async ({ pureBlack }) => {
      const cfg = await this.loadConfig();
      cfg.pureBlack = pureBlack;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    set_last_seen_version: async ({ version }) => {
      const cfg = await this.loadConfig();
      cfg.lastSeenVersion = version;
      await this.saveConfig(cfg);
      return this.toAppConfig(cfg);
    },

    list_note_files: () => this.listValidFilenames(),

    read_note: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, filename);
      return note?.content ?? null;
    },

    write_note: async ({ filename, content, expectedHash }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      // §94: compare-and-swap, same contract as storage.rs's write_note_at.
      if (typeof expectedHash === "string") {
        const current = await idbGet<StoredNote>(db, store, filename);
        if ((current?.contentHash ?? null) !== expectedHash) {
          throw new Error(`conflict: note changed on disk: ${filename}`);
        }
      }
      const note: StoredNote = { content, contentHash: await sha256Hex(content), modifiedMs: Date.now() };
      await idbPut(db, store, filename, note);
      return metadataOf(note);
    },

    // #63: a missing entry is not an error — mirrors storage.rs's own
    // idempotent `delete_note_at`.
    delete_note: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      await idbDelete(db, store, filename);
      if (store === STORE_NOTES_CLOUD) {
        await this.syncEngine.recordLocalDelete(filename);
      }
    },

    get_file_metadata: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      return metadataOf(await idbGet<StoredNote>(db, store, filename));
    },

    read_note_with_metadata: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, filename);
      return { content: note?.content ?? null, metadata: metadataOf(note) };
    },

    write_conflict_copy: async ({ name, content }) => {
      if (!/^[A-Za-z0-9._-]+\.txt$/.test(name) || name.includes("..")) {
        throw new Error(`Invalid conflict-copy filename: ${name}`);
      }
      const db = await this.db();
      await idbPut(db, STORE_CONFLICTS, name, content);
      const ws = await this.getActiveWorkspace();
      const prefix = ws === "onedrive" ? "OneDrive" : NOTES_DIR_PLACEHOLDER;
      return `${prefix}/.chrononote-conflicts/${name}`;
    },

    read_all_notes: async () => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const entries = await idbGetAllEntries<StoredNote>(db, store);
      return entries
        .filter(([key]) => isValidNoteFilename(String(key)))
        .map(([key, note]) => [String(key), note.content] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b));
    },

    read_tab_session: async () => {
      const db = await this.db();
      const key = await this.getActiveSessionKey();
      return (await idbGet<TabSession>(db, STORE_META, key)) ?? null;
    },

    write_tab_session: async ({ openTabs, activeTab, lastOpenedDate }) => {
      const db = await this.db();
      const key = await this.getActiveSessionKey();
      await idbPut(db, STORE_META, key, {
        openTabs: openTabs ?? [],
        activeTab: activeTab ?? null,
        lastOpenedDate: lastOpenedDate ?? null,
      });
    },

    import_notes_bundle: async ({ notes, mode }) => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      if (mode === "replace") {
        for (const key of await this.listValidFilenames()) {
          await idbDelete(db, store, key);
        }
      }
      let imported = 0;
      let skipped = 0;
      for (const [filename, content] of Object.entries(notes)) {
        if (!isValidNoteFilename(filename)) {
          skipped++;
          continue;
        }
        if (mode === "merge" && (await idbGet(db, store, filename)) !== undefined) {
          skipped++;
          continue;
        }
        await idbPut(db, store, filename, {
          content,
          contentHash: await sha256Hex(content),
          modifiedMs: Date.now(),
        });
        imported++;
      }
      return { imported, skipped };
    },

    // `.agenda.json` is a file in the desktop app's notes folder — the web
    // app has no such folder (IndexedDB-backed, no filesystem), so the
    // "Sync calendar for this day" action is hidden there entirely
    // (`TopBar.svelte`/`MoreActionsModal.svelte` gate on `backendKind !==
    // "web"`). This is never actually called from the UI as a result;
    // an empty calendar rather than a thrown error just in case, matching
    // how a desktop install with no `.agenda.json` file yet behaves.
    read_agenda_for_date: async ({ date }) => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, ".agenda.json");
      if (!note || !note.content.trim()) {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
      try {
        const meetings: Array<{ date: string; start: string; end: string; title: string }> = JSON.parse(note.content.trim());
        if (!Array.isArray(meetings) || meetings.length === 0) {
          throw new Error("Invalid");
        }
        return activeTitlesForDate(meetings, date);
      } catch {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
    },

    // #78: the real titles of the day's cancelled/declined/forwarded meetings.
    read_agenda_removed_for_date: async ({ date }) => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, ".agenda.json");
      if (!note || !note.content.trim()) {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
      try {
        const meetings: Array<{ date: string; start: string; end: string; title: string }> = JSON.parse(note.content.trim());
        if (!Array.isArray(meetings) || meetings.length === 0) {
          throw new Error("Invalid");
        }
        return removedTitlesForDate(meetings, date);
      } catch {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
    },

    read_agenda_after: async ({ afterDate }) => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, ".agenda.json");
      if (!note || !note.content.trim()) {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
      try {
        const meetings: Array<{ date: string; start: string; end: string; title: string }> = JSON.parse(note.content.trim());
        if (!Array.isArray(meetings) || meetings.length === 0) {
          throw new Error("Invalid");
        }
        return activeTitlesAfterDate(meetings, afterDate);
      } catch {
        throw { code: "agendaInvalid" } satisfies AppError;
      }
    },

    agenda_file_exists: async () => {
      const db = await this.db();
      const store = await this.getActiveNotesStore();
      const note = await idbGet<StoredNote>(db, store, ".agenda.json");
      return note !== undefined;
    },

    onedrive_login: () => this.syncEngine.login(),
    onedrive_logout: ({ removeLocalData }) => this.syncEngine.logout(removeLocalData === true),
    onedrive_get_account: () => this.syncEngine.getAccount(),
    onedrive_list_folders: ({ parentId }) => this.syncEngine.listFolders(parentId),
    onedrive_create_folder: ({ parentId, name }) => this.syncEngine.createFolder(parentId, name),
    onedrive_set_folder: ({ folderId, folderPath }) => this.syncEngine.setFolder({ folderId, folderPath }),
    onedrive_get_folder: () => this.syncEngine.getFolder(),
    onedrive_exchange_code: ({ code, state }) => this.syncEngine.exchangeCodeDirect(code, state),
    onedrive_sync_now: () => this.syncEngine.syncNow(),
    onedrive_get_conflicts: () => this.syncEngine.listConflicts(),
    onedrive_resolve_conflict: ({ name, resolution }) => this.syncEngine.resolveConflict(name, resolution),
    onedrive_get_sync_status: () => this.syncEngine.getStatus(),
    onedrive_get_advanced_config: () => this.syncEngine.getAdvancedConfig(),
    onedrive_set_advanced_config: ({ config }) => this.syncEngine.setAdvancedConfig(config),
    save_scratchpad_drafts: async ({ drafts }) => {
      const db = await this.db();
      await idbPut(db, STORE_META, "scratchpad_drafts", drafts);
    },
    load_scratchpad_drafts: async () => {
      const db = await this.db();
      return (await idbGet<Record<string, string>>(db, STORE_META, "scratchpad_drafts")) ?? {};
    },
    web_check_browser_notes: async () => {
      await this.ensureMigrated();
      const db = await this.db();
      const keys = await idbGetAllKeys(db, STORE_NOTES_BROWSER);
      const filenames = (keys as string[]).filter(isValidNoteFilename);
      return { count: filenames.length, filenames };
    },
    onedrive_prepare_folder_switch: ({ newFolderId }) => this.syncEngine.prepareFolderSwitch(newFolderId),
    web_migrate_browser_notes: async () => {
      return this.migrateBrowserNotesToCloud();
    },
    get_sync_health: () => this.syncEngine.getSyncHealth(),
  };

  /** Erases everything (`notes`, `conflicts`, `config`, `session`) — the
   * "replace everything" import mode reuses the narrower per-store clear
   * inside `import_notes_bundle` instead; this is exposed separately for
   * a possible future "reset this browser's data" Settings action, not
   * currently wired to any UI. */
  async clearAll(): Promise<void> {
    const db = await this.db();
    await Promise.all([
      idbClear(db, STORE_NOTES),
      idbClear(db, STORE_NOTES_BROWSER),
      idbClear(db, STORE_NOTES_CLOUD),
      idbClear(db, STORE_NOTES_ARCHIVE),
      idbClear(db, STORE_CONFLICTS),
      idbClear(db, STORE_META),
    ]);
  }

  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (Object.prototype.hasOwnProperty.call(this.core, cmd)) {
      const handler = this.core[cmd as TauriCommand] as (a: unknown) => unknown;
      return handler(args);
    }
    switch (cmd) {
      case "plugin:app|version":
        return this.appVersion;
      case "plugin:opener|open_url":
        // A real link-out still makes sense in the browser — just a
        // normal new-tab navigation instead of the OS's default browser.
        window.open(String(args.url ?? (args as Record<string, unknown>).path), "_blank", "noopener");
        return null;
      case "plugin:event|listen":
        return 0; // no Tauri events ever fire in the web app; nothing to wire up
      case "plugin:event|unlisten":
        return null;
      default:
        if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) {
          // No OS window to introspect — same benign stand-ins the mock
          // returns, so window-chrome/title-sync code paths don't throw.
          if (cmd.endsWith("|is_fullscreen") || cmd.endsWith("|is_maximized")) return false;
          if (cmd.endsWith("|scale_factor")) return 1;
          return null;
        }
        // §update-check: `plugin:updater|*` is intentionally NOT handled
        // here — the web app's Settings/About hide the whole Updates
        // section (there's no installer to update; refreshing the page
        // always serves the latest deployed build), so nothing should
        // ever call these. Falling through to the warning below makes a
        // future gating mistake loud instead of silently returning a
        // fake "no update" answer.
        console.warn(`[WebBackend] unhandled invoke: ${cmd}`, args);
        return null;
    }
  }
}

declare global {
  interface Window {
    __CHRONO_WEBAPP__?: WebBackend;
  }
}

/** Installs `WebBackend` as `window.__TAURI_INTERNALS__`, the same shape
 * `installMockTauri` uses — see that function's doc comment for why the
 * frontend never needs to know which of the three it's talking to. */
export function installWebBackend(appVersion: string): WebBackend {
  const backend = new WebBackend(appVersion);
  void backend.requestPersistentStorage();

  let nextCallbackId = 1;
  const callbacks = new Map<number, (payload: unknown) => void>();

  window.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args?: Record<string, unknown>) => backend.invoke(cmd, args ?? {}),
    transformCallback: (cb: (payload: unknown) => void, _once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, cb);
      return id;
    },
    unregisterCallback: (id: number) => callbacks.delete(id),
    convertFileSrc: (path: string) => path,
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };
  (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  window.__CHRONO_WEBAPP__ = backend;
  return backend;
}
