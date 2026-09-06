import { invoke } from "@tauri-apps/api/core";
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

export function writeTabSession(openTabs: string[], activeTab: string | null): Promise<void> {
  return invoke("write_tab_session", { openTabs, activeTab });
}

export function pathExists(path: string): Promise<boolean> {
  return invoke("path_exists", { path });
}
