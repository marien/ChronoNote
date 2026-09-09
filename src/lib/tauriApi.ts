import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppConfig, ColorMode, FileMetadata, TabSession } from "./types";

export function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
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

export function listNoteFiles(): Promise<string[]> {
  return invoke("list_note_files");
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

export function getFileMetadata(filename: string): Promise<FileMetadata> {
  return invoke("get_file_metadata", { filename });
}

export function readNoteWithMetadata(
  filename: string,
): Promise<{ content: string | null; metadata: FileMetadata }> {
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
  return invoke("read_all_notes");
}

export function readTabSession(): Promise<TabSession | null> {
  return invoke("read_tab_session");
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
