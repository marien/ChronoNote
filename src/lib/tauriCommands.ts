import type {
  AppConfig,
  ColorMode,
  ConfigPatch,
  FileMetadata,
  ImportMode,
  ImportResult,
  LanguageMode,
  NoteWithMetadata,
  OneDriveAccount,
  OneDriveAdvancedConfig,
  FolderSwitchResult,
  OneDriveFolderConfig,
  OneDriveFolderItem,
  OneDriveLoginResult,
  OneDriveSyncResult,
  SyncConflict,
  SyncHealth,
  SyncStatus,
  TabSession,
  ThemeMode,
  StartupTabMode,
  PeekConfig,
} from "./types";
import type { TrashItem, NoteVersion } from "./generated/tauri-types";
import type { Channel } from "@tauri-apps/api/core";

export type { OneDriveAdvancedConfig, OneDriveLoginResult, SyncConflict, NoteVersion };

type NoArgs = Record<string, never>;

export type SyncConflictResolution = "mine" | "theirs" | "both";


/** The full Tauri command surface — one entry per `#[tauri::command]` in
 * `src-tauri/src/lib.rs`'s `generate_handler!`. Both the real IPC wrapper
 * (`tauriApi.ts`) and the in-memory mock (`testing/mockBackend.ts`) are
 * type-checked against this map, so adding or reshaping a Rust command is
 * a `svelte-check` error on both sides until they're updated. The payload
 * types themselves come from the Rust-generated `./types`. */
export interface TauriCommands {
  get_config: { args: NoArgs; returns: AppConfig };
  clean_up_versions_and_trash: { args: NoArgs; returns: void };
  check_update: { args: { early: boolean }; returns: { version: string; body: string | null } | null };
  set_notes_dir: { args: { path: string }; returns: AppConfig };
  /** Partial settings update: only the fields present in `patch` change. */
  update_config: { args: { patch: ConfigPatch }; returns: AppConfig };
  list_note_files: { args: NoArgs; returns: string[] };
  read_note: { args: { filename: string }; returns: string | null };
  write_note: {
    args: { filename: string; content: string; expectedHash: string | null };
    returns: FileMetadata;
  };
  /** #63: removes a note file from disk. A missing file is not an error —
   * see `storage.rs::delete_note_at`'s own doc comment for why. */
  delete_note: { args: { filename: string; expectedHash: string | null }; returns: void };
  list_trash: { args: NoArgs; returns: TrashItem[] };
  restore_from_trash: { args: { name: string }; returns: string };
  list_versions: { args: { filename: string }; returns: NoteVersion[] };
  read_version: { args: { filename: string; name: string }; returns: string };
  restore_version: { args: { filename: string; name: string }; returns: FileMetadata };
  get_file_metadata: { args: { filename: string }; returns: FileMetadata };
  read_note_with_metadata: { args: { filename: string }; returns: NoteWithMetadata };
  write_conflict_copy: { args: { name: string; content: string }; returns: string };
  read_all_notes: { args: NoArgs; returns: [string, string][] };
  read_tab_session: { args: NoArgs; returns: TabSession | null };
  write_tab_session: {
    args: { openTabs: string[]; activeTab: string | null; lastOpenedDate: string | null };
    returns: void;
  };
  path_exists: { args: { path: string }; returns: boolean };
  /** Shared by the desktop app's "Import notes from a file" Settings
   * entry and the web app's importer — see `docs/design/webapp-roadmap.md`. */
  import_notes_bundle: {
    args: { notes: Record<string, string>; mode: ImportMode };
    returns: ImportResult;
  };
  /** Calendar sync: reads `.agenda.json` from the
   * root of the notes folder, already scoped to `date`, sorted, and
   * de-duplicated — see `src-tauri/src/agenda.rs` and
   * `docs/agenda-file-guide.md` for the full file format. Always available
   * on desktop; the web app has no local notes folder of its own, so it
   * only works there once a OneDrive account/folder is connected and this
   * file has synced down into the browser's own storage (`webBackend.ts`
   * implements the same contract by reading it from IndexedDB instead). */
  read_agenda_for_date: { args: { date: string }; returns: string[] };
  /** #78: the real titles of that day's cancelled/declined/forwarded meetings. */
  read_agenda_removed_for_date: { args: { date: string }; returns: string[] };
  /** `[start, end, title]` of the day's live meetings (HH:mm local times), sorted: which meeting is on now. */
  read_agenda_entries_for_date: { args: { date: string }; returns: [string, string, string][] };
  /** #66: every `(date, title)` pair after `afterDate` — used to find the
   * next occurrence of a recurring meeting when "copy to next occurrence"
   * has calendar sync leading the search. See
   * `src-tauri/src/agenda.rs::read_agenda_after`. */
  read_agenda_after: { args: { afterDate: string }; returns: [string, string][] };
  /** Distinct dates with at least one active agenda meeting — used by the date picker. */
  read_agenda_dates: { args: NoArgs; returns: string[] };
  /** Cheap existence check for the "gray out the sync button" UI state —
   * see `src-tauri/src/agenda.rs::agenda_file_exists`. */
  agenda_file_exists: { args: NoArgs; returns: boolean };
  /** OneDrive cloud sync commands (RFC 7636 PKCE auth + Graph API). */
  onedrive_login: {
    args: NoArgs;
    returns: OneDriveLoginResult;
  };
  onedrive_logout: { args: { removeLocalData?: boolean }; returns: void };
  onedrive_get_account: {
    args: NoArgs;
    returns: OneDriveAccount | null;
  };
  onedrive_list_folders: {
    args: { parentId?: string | null };
    returns: OneDriveFolderItem[];
  };
  onedrive_create_folder: {
    args: { parentId?: string | null; name: string };
    returns: OneDriveFolderItem;
  };
  onedrive_set_folder: {
    args: { folderId: string; folderPath: string };
    returns: void;
  };
  onedrive_prepare_folder_switch: {
    args: { newFolderId: string };
    returns: FolderSwitchResult;
  };
  onedrive_get_folder: {
    args: NoArgs;
    returns: OneDriveFolderConfig | null;
  };
  onedrive_exchange_code: {
    args: { code: string; state?: string };
    returns: OneDriveLoginResult;
  };
  onedrive_sync_now: {
    args: NoArgs;
    returns: OneDriveSyncResult;
  };
  onedrive_get_conflicts: {
    args: NoArgs;
    returns: SyncConflict[];
  };
  onedrive_resolve_conflict: {
    args: { name: string; resolution: SyncConflictResolution };
    returns: void;
  };
  onedrive_get_sync_status: {
    args: NoArgs;
    returns: SyncStatus;
  };
  /** Settings' Advanced overrides for work/school Entra tenants that
   * can't use the default multi-tenant client ID and/or the generic
   * `/common` endpoint. Both blank means "use the built-in defaults." */
  onedrive_get_advanced_config: {
    args: NoArgs;
    returns: OneDriveAdvancedConfig;
  };
  onedrive_set_advanced_config: {
    args: { config: OneDriveAdvancedConfig };
    returns: void;
  };
  /** Mobile process-death scratchpad draft preservation. */
  save_scratchpad_drafts: {
    args: { drafts: Record<string, string> };
    returns: void;
  };
  load_scratchpad_drafts: {
    args: NoArgs;
    returns: Record<string, string>;
  };
  web_check_browser_notes: {
    args: NoArgs;
    returns: { count: number; filenames: string[] };
  };
  web_migrate_browser_notes: {
    args: NoArgs;
    returns: { migratedCount: number; conflictCount: number };
  };
  get_sync_health: {
    args: NoArgs;
    returns: SyncHealth;
  };
  append_log: {
    args: { level: string; message: string };
    returns: void;
  };
  read_log_tail: {
    args: { lines: number };
    returns: string;
  };
  open_log_folder: {
    args: NoArgs;
    returns: void;
  };
  write_export_file: {
    args: { path: string; contents: string };
    returns: void;
  };
  spell_languages: { args: NoArgs; returns: string[] };
  spell_available_languages: { args: NoArgs; returns: string[] };
  spell_windows_languages: { args: NoArgs; returns: string[] };
  spell_set_languages: { args: { tags: string[] }; returns: string[] };
  spell_check_lines: { args: { lines: string[] }; returns: [number, number][][] };
  spell_suggest: { args: { word: string }; returns: string[] };
  spell_add: { args: { word: string }; returns: null };
  spell_ignore: { args: { word: string }; returns: null };
  /** Native window handling for Peek mode. */
  peek_set_bounds: {
    args: { x: number; y: number; width: number; height: number };
    returns: void;
  };
  peek_set_transparent: {
    args: { transparent: boolean; r: number; g: number; b: number };
    returns: void;
  };
  /** §393: Peek docked to the bottom of its screen (a reserved AppBar strip, physical pixels). */
  peek_dock_bottom: {
    args: { height: number };
    returns: { x: number; y: number; width: number; height: number };
  };
  peek_undock: { args: NoArgs; returns: void };
  /** §404: the native side's docked-Peek state, and docked-Peek logging (incl. the flight recorder). */
  peek_dock_state: { args: NoArgs; returns: import("./peekWindow").DockState };
  peek_log: { args: { kind: "event" | "detail" | "warn" | "dump"; message: string }; returns: void };
  /** Native child window for Windows 11 Snap Layouts (§B1). */
  snap_overlay_set_rect: {
    args: { x: number; y: number; width: number; height: number };
    returns: void;
  };
  /** Zen mode monitor coverage and leave preparation. */
  zen_cover_monitor: { args: NoArgs; returns: void };
  zen_prepare_leave: { args: NoArgs; returns: void };
  /** Downloads and launches the Windows installer for self-updating (§update-check). */
  install_update: {
    args: { early: boolean; onEvent: Channel<unknown> };
    returns: void;
  };
}

export type TauriCommand = keyof TauriCommands;
export type CommandArgs<K extends TauriCommand> = TauriCommands[K]["args"];
export type CommandReturn<K extends TauriCommand> = TauriCommands[K]["returns"];
