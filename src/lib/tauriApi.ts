import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppConfig, ColorMode, TabSession } from "./types";

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

export function writeNote(filename: string, content: string): Promise<void> {
  return invoke("write_note", { filename, content });
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
