import type {
  AppConfig,
  ColorMode,
  FileMetadata,
  ImportMode,
  ImportResult,
  NoteWithMetadata,
  TabSession,
  ThemeMode,
} from "./types";

type NoArgs = Record<string, never>;

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
  set_last_seen_version: { args: { version: string }; returns: AppConfig };
  list_note_files: { args: NoArgs; returns: string[] };
  read_note: { args: { filename: string }; returns: string | null };
  write_note: {
    args: { filename: string; content: string; expectedHash: string | null };
    returns: FileMetadata;
  };
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
}

export type TauriCommand = keyof TauriCommands;
export type CommandArgs<K extends TauriCommand> = TauriCommands[K]["args"];
export type CommandReturn<K extends TauriCommand> = TauriCommands[K]["returns"];
