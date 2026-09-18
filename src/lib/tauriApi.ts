import { invoke as coreInvoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import type { CommandArgs, CommandReturn, OneDriveAdvancedConfig, TauriCommand } from "./tauriCommands";

/** Every Rust IPC call goes through this: the command name is constrained
 * to `TauriCommands`, and the arg shape + resolved type are checked
 * against it (see `tauriCommands.ts`). A command that exists in Rust but
 * not the contract — or an arg typo — fails `svelte-check` here. */
function invoke<K extends TauriCommand>(cmd: K, args: CommandArgs<K>): Promise<CommandReturn<K>> {
  return coreInvoke(cmd, args);
}

export function getConfig(): Promise<AppConfig> {
  return invoke("get_config", {});
}

export function setNotesDir(path: string): Promise<AppConfig> {
  return invoke("set_notes_dir", { path });
}

export function setColorMode(mode: ColorMode): Promise<AppConfig> {
  return invoke("set_color_mode", { mode });
}

export function setWordWrap(enabled: boolean): Promise<AppConfig> {
  return invoke("set_word_wrap", { enabled });
}

export function setReadableLineLength(enabled: boolean): Promise<AppConfig> {
  return invoke("set_readable_line_length", { enabled });
}

export function setAutoCheckUpdates(enabled: boolean): Promise<AppConfig> {
  return invoke("set_auto_check_updates", { enabled });
}

export function setThemeMode(mode: ThemeMode): Promise<AppConfig> {
  return invoke("set_theme_mode", { mode });
}

export function setCalendarSyncEnabled(enabled: boolean): Promise<AppConfig> {
  return invoke("set_calendar_sync_enabled", { enabled });
}

export function setLastSeenVersion(version: string): Promise<AppConfig> {
  return invoke("set_last_seen_version", { version });
}

export function listNoteFiles(): Promise<string[]> {
  return invoke("list_note_files", {});
}

export function readNote(filename: string): Promise<string | null> {
  return invoke("read_note", { filename });
}

/** Write a note. `expectedHash` opts into a compare-and-swap: the write
 * is rejected (error message starting `conflict: note changed on disk`)
 * if the file's current SHA-256 isn't `expectedHash` — used only by the
 * conflict-resolution "keep my version" path (§94), never by autosave.
 * Resolves to the metadata of what was just written. */
export function writeNote(
  filename: string,
  content: string,
  expectedHash?: string,
): Promise<FileMetadata> {
  return invoke("write_note", { filename, content, expectedHash: expectedHash ?? null });
}

/** #63: removes a note file from disk. A missing file is not an error —
 * see `storage.rs::delete_note_at`'s own doc comment for why. */
export function deleteNote(filename: string): Promise<void> {
  return invoke("delete_note", { filename });
}

export function getFileMetadata(filename: string): Promise<FileMetadata> {
  return invoke("get_file_metadata", { filename });
}

export function readNoteWithMetadata(filename: string): Promise<NoteWithMetadata> {
  return invoke("read_note_with_metadata", { filename });
}

/** Write the user's in-memory version to `.chrononote-conflicts/<name>`
 * when they chose "save mine as a copy". `name` is a plain basename the
 * frontend builds from the note's date + the local time. Resolves to the
 * absolute path written, for the confirmation toast. */
export function writeConflictCopy(name: string, content: string): Promise<string> {
  return invoke("write_conflict_copy", { name, content });
}

export function readAllNotes(): Promise<[string, string][]> {
  return invoke("read_all_notes", {});
}

export function readTabSession(): Promise<TabSession | null> {
  return invoke("read_tab_session", {});
}

export function writeTabSession(
  openTabs: string[],
  activeTab: string | null,
  lastOpenedDate: string | null,
): Promise<void> {
  return invoke("write_tab_session", { openTabs, activeTab, lastOpenedDate });
}

export function pathExists(path: string): Promise<boolean> {
  return invoke("path_exists", { path });
}

/** Writes `notes` (filename -> content, parsed frontend-side from an
 * export file) straight into storage. `"merge"` skips any filename that
 * already exists; `"replace"` clears every existing note first. Shared by
 * the desktop app's "Import notes from a file" Settings entry and the web
 * app's importer. */
export function importNotesBundle(notes: Record<string, string>, mode: ImportMode): Promise<ImportResult> {
  return invoke("import_notes_bundle", { notes, mode });
}

/** The app's own version (from `tauri.conf.json`, kept in sync with
 * `package.json`/`Cargo.toml` at release time) — read live via Tauri's
 * core `app` module rather than baked into a JS constant, so the About
 * drawer never drifts from what's actually running. */
export function getAppVersion(): Promise<string> {
  return getVersion();
}

/** Opens a URL in the OS's default browser (via `tauri-plugin-opener`)
 * rather than navigating the app's own webview to it. */
export function openExternalUrl(url: string): Promise<void> {
  return openUrl(url);
}

/** Calendar sync (`.agenda.json`, see `src-tauri/src/agenda.rs`): already date-scoped, sorted, and
 * de-duplicated titles from `.agenda.json` in the notes folder — see
 * `src-tauri/src/agenda.rs`. */
export function readAgendaForDate(date: string): Promise<string[]> {
  return invoke("read_agenda_for_date", { date });
}

/** #66: every `(date, title)` pair after `afterDate` — see
 * `src-tauri/src/agenda.rs::read_agenda_after`. */
export function readAgendaAfter(afterDate: string): Promise<[string, string][]> {
  return invoke("read_agenda_after", { afterDate });
}

export function agendaFileExists(): Promise<boolean> {
  return invoke("agenda_file_exists", {});
}

export function oneDriveLogin(): Promise<{ success: boolean; account?: { email: string; displayName: string }; error?: string }> {
  return invoke("onedrive_login", {});
}

export function oneDriveLogout(): Promise<void> {
  return invoke("onedrive_logout", {});
}

export function oneDriveGetAccount(): Promise<{ email: string; displayName: string } | null> {
  return invoke("onedrive_get_account", {});
}

export function oneDriveListFolders(parentId?: string | null): Promise<Array<{ id: string; name: string }>> {
  return invoke("onedrive_list_folders", { parentId: parentId ?? null });
}

export function oneDriveCreateFolder(name: string, parentId?: string | null): Promise<{ id: string; name: string }> {
  return invoke("onedrive_create_folder", { parentId: parentId ?? null, name });
}

export function oneDriveSetFolder(folderId: string, folderPath: string): Promise<void> {
  return invoke("onedrive_set_folder", { folderId, folderPath });
}

export function oneDriveGetFolder(): Promise<{ folderId: string; folderPath: string } | null> {
  return invoke("onedrive_get_folder", {});
}

export function oneDriveExchangeCode(code: string): Promise<{ success: boolean; account?: { email: string; displayName: string }; error?: string }> {
  return invoke("onedrive_exchange_code", { code });
}

export function oneDriveSyncNow(): Promise<{ success: boolean; message?: string }> {
  return invoke("onedrive_sync_now", {});
}

export function oneDriveGetSyncStatus(): Promise<"idle" | "syncing" | "offline" | "error"> {
  return invoke("onedrive_get_sync_status", {});
}

export function oneDriveGetAdvancedConfig(): Promise<OneDriveAdvancedConfig> {
  return invoke("onedrive_get_advanced_config", {});
}

export function oneDriveSetAdvancedConfig(config: OneDriveAdvancedConfig): Promise<void> {
  return invoke("onedrive_set_advanced_config", { config });
}

export function saveScratchpadDrafts(drafts: Record<string, string>): Promise<void> {
  return invoke("save_scratchpad_drafts", { drafts });
}

export function loadScratchpadDrafts(): Promise<Record<string, string>> {
  return invoke("load_scratchpad_drafts", {});
}

