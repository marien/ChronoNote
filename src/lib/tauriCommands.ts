import type {
  AppConfig,
  ColorMode,
  FileMetadata,
  ImportMode,
  ImportResult,
  NoteWithMetadata,
  OneDriveAccount,
  OneDriveAdvancedConfig,
  FolderSwitchResult,
  OneDriveFolderConfig,
  OneDriveFolderItem,
  OneDriveLoginResult,
  OneDriveSyncResult,
  SyncConflict,
  SyncStatus,
  TabSession,
  ThemeMode,
} from "./types";

export type { OneDriveAdvancedConfig, OneDriveLoginResult, SyncConflict };

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
  set_notes_dir: { args: { path: string }; returns: AppConfig };
  set_color_mode: { args: { mode: ColorMode }; returns: AppConfig };
  set_word_wrap: { args: { enabled: boolean }; returns: AppConfig };
  set_readable_line_length: { args: { enabled: boolean }; returns: AppConfig };
  set_auto_check_updates: { args: { enabled: boolean }; returns: AppConfig };
  set_theme_mode: { args: { mode: ThemeMode }; returns: AppConfig };
  set_calendar_sync_enabled: { args: { enabled: boolean }; returns: AppConfig };
  set_last_seen_version: { args: { version: string }; returns: AppConfig };
  list_note_files: { args: NoArgs; returns: string[] };
  read_note: { args: { filename: string }; returns: string | null };
  write_note: {
    args: { filename: string; content: string; expectedHash: string | null };
    returns: FileMetadata;
  };
  /** #63: removes a note file from disk. A missing file is not an error —
   * see `storage.rs::delete_note_at`'s own doc comment for why. */
  delete_note: { args: { filename: string }; returns: void };
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
   * de-duplicated — see `src-tauri/src/agenda.rs`. Desktop-only, like the
   * notes folder itself; the web app has no local file to read. */
  read_agenda_for_date: { args: { date: string }; returns: string[] };
  /** #66: every `(date, title)` pair after `afterDate` — used to find the
   * next occurrence of a recurring meeting when "copy to next occurrence"
   * has calendar sync leading the search. See
   * `src-tauri/src/agenda.rs::read_agenda_after`. */
  read_agenda_after: { args: { afterDate: string }; returns: [string, string][] };
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
}

export type TauriCommand = keyof TauriCommands;
export type CommandArgs<K extends TauriCommand> = TauriCommands[K]["args"];
export type CommandReturn<K extends TauriCommand> = TauriCommands[K]["returns"];
