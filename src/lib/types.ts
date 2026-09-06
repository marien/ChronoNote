export interface NoteTab {
  id: string;
  filename: string;
  isScratchpad: boolean;
  content: string;
}

export interface ActionSnapshotItem {
  id: string;
  /** Present when the source file is already open as a tab; absent for
   * "All Files" mode results whose file isn't open yet. */
  tabId?: string;
  filename: string;
  lineIdx: number;
  line: string;
  header: string;
}

export interface HistoryItem {
  filename: string;
  lineIdx: number;
  line: string;
  date: string;
}

export interface SearchResultItem {
  /** Present when the source file is already open as a tab; absent for
   * "All Files" mode results whose file isn't open yet. */
  tabId?: string;
  tabFilename: string;
  lineIdx: number;
  line: string;
}

export type ColorMode = "color" | "grayscale";

export interface AppConfig {
  notesDir: string;
  colorMode: ColorMode;
}
