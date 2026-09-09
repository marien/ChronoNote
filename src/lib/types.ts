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

/** Snapshot of a note file on disk, for external-modification detection
 * (§94). `contentHash` (SHA-256 hex) is the authority — mtime is
 * unreliable across cloud-sync clients. */
export interface FileMetadata {
  exists: boolean;
  contentHash: string | null;
  sizeBytes: number | null;
  modifiedMs: number | null;
}

export interface AppConfig {
  notesDir: string;
  colorMode: ColorMode;
  wordWrap: boolean;
  recentNotesDirs: string[];
}

export interface TabSession {
  openTabs: string[];
  activeTab: string | null;
  /** ISO date (`YYYY-MM-DD`) this folder was last opened on. `null`/absent
   * for sessions written before #23. At boot, a value other than today
   * means this is the first launch of the day, so today's note is forced
   * active regardless of `activeTab`. */
  lastOpenedDate?: string | null;
}
