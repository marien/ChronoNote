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
import type { AppConfig, ColorMode, FileMetadata, TabSession, ThemeMode } from "../types";
import type { CommandArgs, CommandReturn, TauriCommand, TauriCommands } from "../tauriCommands";
import { isValidNoteFilename } from "../noteFilename";
import { idbClear, idbDelete, idbGet, idbGetAllEntries, idbGetAllKeys, idbPut, openDb } from "./idb";

const DB_NAME = "chrononote-webapp";
const DB_VERSION = 1;
const STORE_NOTES = "notes";
const STORE_CONFLICTS = "conflicts";
const STORE_META = "meta";
const CONFIG_KEY = "config";
const SESSION_KEY = "session";

/** Shown in place of a real path — nothing in the web-app UI reads this
 * as an actual filesystem location (see the module doc above). */
const NOTES_DIR_PLACEHOLDER = "(browser storage)";

interface StoredNote {
  content: string;
  contentHash: string;
  modifiedMs: number;
}

interface StoredConfig {
  colorMode: ColorMode;
  themeMode: ThemeMode;
  wordWrap: boolean;
  readableLineLength: boolean;
  autoCheckUpdates: boolean;
  lastSeenVersion: string | null;
  calendarSyncEnabled: boolean;
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

  constructor(appVersion: string) {
    this.appVersion = appVersion;
    this.dbPromise = openDb(DB_NAME, DB_VERSION, [STORE_NOTES, STORE_CONFLICTS, STORE_META]);
  }

  private async db(): Promise<IDBDatabase> {
    return this.dbPromise;
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
        wordWrap: false,
        readableLineLength: false,
        autoCheckUpdates: true,
        lastSeenVersion: null,
        calendarSyncEnabled: false,
      }
    );
  }

  private async saveConfig(cfg: StoredConfig): Promise<void> {
    const db = await this.db();
    await idbPut(db, STORE_META, CONFIG_KEY, cfg);
  }

  private async toAppConfig(cfg: StoredConfig): Promise<AppConfig> {
    return {
      notesDir: NOTES_DIR_PLACEHOLDER,
      colorMode: cfg.colorMode,
      themeMode: cfg.themeMode,
      wordWrap: cfg.wordWrap,
      readableLineLength: cfg.readableLineLength,
      recentNotesDirs: [],
      autoCheckUpdates: cfg.autoCheckUpdates,
      lastSeenVersion: cfg.lastSeenVersion,
      calendarSyncEnabled: cfg.calendarSyncEnabled,
    };
  }

  private async listValidFilenames(): Promise<string[]> {
    const db = await this.db();
    const keys = await idbGetAllKeys(db, STORE_NOTES);
    return (keys as string[]).filter(isValidNoteFilename).sort();
  }

  private readonly core: CommandHandlers = {
    get_config: async () => this.toAppConfig(await this.loadConfig()),

    // No multi-workspace concept in the web app (design doc, "what's
    // deferred") — the Settings UI never surfaces a control that would
    // call either of these, but a no-op keeps the contract total rather
    // than throwing if something ever does.
    set_notes_dir: async () => this.toAppConfig(await this.loadConfig()),
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
      const note = await idbGet<StoredNote>(db, STORE_NOTES, filename);
      return note?.content ?? null;
    },

    write_note: async ({ filename, content, expectedHash }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      // §94: compare-and-swap, same contract as storage.rs's write_note_at.
      if (typeof expectedHash === "string") {
        const current = await idbGet<StoredNote>(db, STORE_NOTES, filename);
        if ((current?.contentHash ?? null) !== expectedHash) {
          throw new Error(`conflict: note changed on disk: ${filename}`);
        }
      }
      const note: StoredNote = { content, contentHash: await sha256Hex(content), modifiedMs: Date.now() };
      await idbPut(db, STORE_NOTES, filename, note);
      return metadataOf(note);
    },

    get_file_metadata: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      return metadataOf(await idbGet<StoredNote>(db, STORE_NOTES, filename));
    },

    read_note_with_metadata: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const db = await this.db();
      const note = await idbGet<StoredNote>(db, STORE_NOTES, filename);
      return { content: note?.content ?? null, metadata: metadataOf(note) };
    },

    write_conflict_copy: async ({ name, content }) => {
      if (!/^[A-Za-z0-9._-]+\.txt$/.test(name) || name.includes("..")) {
        throw new Error(`Invalid conflict-copy filename: ${name}`);
      }
      const db = await this.db();
      await idbPut(db, STORE_CONFLICTS, name, content);
      return `${NOTES_DIR_PLACEHOLDER}/.chrononote-conflicts/${name}`;
    },

    read_all_notes: async () => {
      const db = await this.db();
      const entries = await idbGetAllEntries<StoredNote>(db, STORE_NOTES);
      return entries
        .filter(([key]) => isValidNoteFilename(String(key)))
        .map(([key, note]) => [String(key), note.content] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b));
    },

    read_tab_session: async () => {
      const db = await this.db();
      return (await idbGet<TabSession>(db, STORE_META, SESSION_KEY)) ?? null;
    },

    write_tab_session: async ({ openTabs, activeTab, lastOpenedDate }) => {
      const db = await this.db();
      await idbPut(db, STORE_META, SESSION_KEY, {
        openTabs: openTabs ?? [],
        activeTab: activeTab ?? null,
        lastOpenedDate: lastOpenedDate ?? null,
      });
    },

    import_notes_bundle: async ({ notes, mode }) => {
      const db = await this.db();
      if (mode === "replace") {
        for (const key of await this.listValidFilenames()) {
          await idbDelete(db, STORE_NOTES, key);
        }
      }
      let imported = 0;
      let skipped = 0;
      for (const [filename, content] of Object.entries(notes)) {
        if (!isValidNoteFilename(filename)) {
          skipped++;
          continue;
        }
        if (mode === "merge" && (await idbGet(db, STORE_NOTES, filename)) !== undefined) {
          skipped++;
          continue;
        }
        await idbPut(db, STORE_NOTES, filename, {
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
    read_agenda_for_date: () => [],
    agenda_file_exists: () => false,
  };

  /** Erases everything (`notes`, `conflicts`, `config`, `session`) — the
   * "replace everything" import mode reuses the narrower per-store clear
   * inside `import_notes_bundle` instead; this is exposed separately for
   * a possible future "reset this browser's data" Settings action, not
   * currently wired to any UI. */
  async clearAll(): Promise<void> {
    const db = await this.db();
    await Promise.all([idbClear(db, STORE_NOTES), idbClear(db, STORE_CONFLICTS), idbClear(db, STORE_META)]);
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
