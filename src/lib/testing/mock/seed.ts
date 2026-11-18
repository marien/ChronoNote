import {
  activeTitlesAfterDate,
  activeTitlesForDate,
  parseAgendaMeetings,
  removedTitlesForDate as removedTitlesForDateShared,
} from "../../agendaTitles";
import type { ColorMode, FileMetadata, LanguageMode, PeekConfig, StartupTabMode, TabSession, ThemeMode } from "../../types";
import type { TabLabelStyle } from "../../generated/tauri-types";
import type { CommandArgs, CommandReturn, TauriCommands } from "../../tauriCommands";
import { normalizeNoteText } from "../../noteText";

export type SeedTabSession = Omit<TabSession, "schemaVersion"> & { schemaVersion?: number };

export function toTabSession(s: SeedTabSession | null | undefined): TabSession | null {
  if (!s) return null;
  const session: TabSession = {
    schemaVersion: s.schemaVersion ?? 1,
    openTabs: s.openTabs,
    activeTab: s.activeTab,
    lastOpenedDate: s.lastOpenedDate,
  };
  if (s.autoAddedMeetings) {
    session.autoAddedMeetings = s.autoAddedMeetings;
  }
  return session;
}

export interface MockSeed {
  /** Identifies one `seedApp()` call. State saved to `sessionStorage` under
   * a different id belongs to an earlier seed on the same page and is not
   * hydrated (a late write from the old page can land after the helper
   * cleared the storage). Absent = hydrate whatever is saved. */
  seedId?: string;
  /** Path used as the active notes directory. Default `/notes`. */
  notesDir?: string;
  schemaVersion?: number;
  /** `filename -> contents` for the active notes directory. */
  notes?: Record<string, string>;
  /** Saved tab session for the active directory, or `null` for none. */
  session?: SeedTabSession | null;
  colorMode?: ColorMode;
  themeMode?: ThemeMode;
  languageMode?: LanguageMode;
  wordWrap?: boolean;
  spellCheck?: boolean;
  spellLanguages?: string[] | null;
  readableLineLength?: boolean;
  autoCheckUpdates?: boolean;
  earlyUpdates?: boolean;
  phoneCompanion?: boolean;
  /** Seeds `.chrononote-mobile/inbox.json` (the phone's requests) as text. */
  phoneInbox?: string;
  /** #50: the version this config last recorded seeing — seed a value
   * different from `appVersion` to simulate "first launch after an
   * update" in a test. `undefined`/omitted mirrors a fresh install or a
   * pre-#50 config (no update notice). */
  lastSeenVersion?: string | null;
  /** Whether the opt-in "Sync calendar for this day" button is shown at
   * all — mirrors `AppConfig.calendarSyncEnabled`, off by default. */
  calendarSyncEnabled?: boolean;
  /** Mirrors `AppConfig.calendarAutoAdd`, on by default. */
  calendarAutoAdd?: boolean;
  /** Mirrors `AppConfig.minutesName`, empty by default. */
  minutesName?: string;
  fontSize?: number;
  lineHeight?: number;
  pureBlack?: boolean;
  startupTabMode?: StartupTabMode;
  peek?: Partial<PeekConfig>;
  /** Mirrors `AppConfig.occurrenceHint`, off by default. */
  occurrenceHint?: boolean;
  /** Mirrors `AppConfig.statusBarVisible`, on by default. */
  statusBarVisible?: boolean;
  /** Mirrors `AppConfig.tabLabelStyle`, ISO by default. */
  tabLabelStyle?: TabLabelStyle;
  historyPaneShare?: number;
  actionsPaneShare?: number;
  onboardingCompleted?: boolean;
  lastSyncSuccessMs?: number | null;
  backendKind?: "desktop" | "demo" | "web";
  /** Notes in browser storage for web app tests. Defaults to `notes` when `backendKind === "web"` and no OneDrive folder is chosen. */
  browserNotes?: Record<string, string>;
  /** Notes in cloud storage for web app tests. */
  cloudNotes?: Record<string, string>;
  /** Seeds `recent_notes_dirs` directly (normally only `set_notes_dir`
   * writes it). */
  recentNotesDirs?: string[];
  /** Extra directories the user can switch into, `path -> (filename ->
   * contents)`. Their session, if any, is under `sessions`. */
  otherDirs?: Record<string, Record<string, string>>;
  sessions?: Record<string, SeedTabSession>;
  /** Reported by `plugin:app|version` / the About drawer. Default `0.3.0`. */
  appVersion?: string;
  /** Invoke commands that should reject with an error, for testing
   * degraded-boot / failure paths (e.g. `["get_config"]`), or a failed
   * update check/download (`["plugin:updater|check"]` /
   * `["plugin:updater|download_and_install"]`). */
  throwOnCommands?: string[];
  /** Artificially delay specific commands by N ms before they resolve —
   * for deterministically testing a loading state that's otherwise too
   * fast to observe under the mock's instant in-memory reads (e.g.
   * `read_all_notes`, so a test can assert on the date picker's loading
   * spinner and its fast-path prefetch actually landing before the full
   * read does). */
  delayCommands?: Record<string, number>;
  /** §update-check: what `plugin:updater|check` resolves to. `"none"`
   * (default) = no update; `"available"` = a fake newer release exists,
   * version `updateCheckVersion`. A failed check is seeded via
   * `throwOnCommands: ["plugin:updater|check"]` instead of a third value
   * here — one mechanism for every "this command fails" case. */
  updateCheck?: "none" | "available";
  updateCheckVersion?: string;
  /** Raw `.agenda.json` file content for the active notes directory —
   * mirrors `src-tauri/src/agenda.rs`'s `read_agenda_for_date` exactly
   * (see `titlesForDate` below): missing/omitted, blank, `"[]"`, or
   * malformed content all reject with the same error rather than
   * resolving to an empty calendar — none of those states are ever
   * produced by a genuine successful sync, so none can be trusted as "no
   * meetings today." */
  agendaJson?: string;
  /** OneDrive sync conflicts waiting on the user: the note's name plus the
   * cloud's version of it (the "local" side is whatever the note holds). */
  oneDriveConflicts?: { name: string; remote: string }[];
  /** Makes every `onedrive_sync_now` fail with this message until a new sign-in (`onedrive_login`). */
  oneDriveSyncError?: string;
  /** The chosen OneDrive folder. Omitted = a folder is already chosen
   * (`/Notes`); `null` = signed in but no folder chosen yet (the state right
   * after "Connect Microsoft Account" on a fresh install). */
  oneDriveFolder?: { folderId: string; folderPath: string } | null;
  /** Whether the mock window reports being minimized. Defaults to false. */
  isMinimized?: boolean;
  trash?: MockTrashEntry[];
  versions?: Record<string, MockVersionEntry[]>;
}

export interface MockTrashEntry {
  name: string;
  originalFilename: string;
  deletedMs: number;
  preview: string;
  content: string;
}

export interface MockVersionEntry {
  name: string;
  savedMs: number;
  sizeBytes: number;
  content: string;
}

export interface MockDir {
  notes: Map<string, string>;
  session: TabSession | null;
  /** `.chrononote-conflicts/<name>` copies written by `write_conflict_copy`
   * (§94). Kept separate from `notes` so they never surface as note files. */
  conflictCopies: Map<string, string>;
  versions: Map<string, MockVersionEntry[]>;
  savedSearches: string | null;
}

export const MAX_RECENT = 5;
export const CONFLICTS_DIRNAME = ".chrononote-conflicts";

/** Commands that change persisted state — after these, snapshot to
 * `sessionStorage` so a reload sees the same "disk". */
export const MUTATING_COMMANDS = new Set([
  "set_notes_dir",
  "update_config",
  "write_note",
  "delete_note",
  "restore_from_trash",
  "restore_version",
  "write_conflict_copy",
  "write_phone_ledger",
  "write_saved_searches",
  "write_tab_session",
  "import_notes_bundle",
  "spell_add",
  "spell_ignore",
  "spell_set_languages",
  "onedrive_login", // clears `oneDriveSyncError`
]);

/** SHA-256 hex — the exact digest `storage.rs`'s `sha2` produces and
 * `drift.ts`'s `sha256Hex` computes in-memory, so mock metadata hashes
 * compare correctly against both. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fileMetadata(content: string | undefined): Promise<FileMetadata> {
  if (content === undefined) {
    return { exists: false, contentHash: null, sizeBytes: null, modifiedMs: null };
  }
  return {
    exists: true,
    contentHash: await sha256Hex(normalizeNoteText(content)),
    sizeBytes: new TextEncoder().encode(content).length,
    modifiedMs: Date.now(),
  };
}

export interface InvokeLogEntry {
  cmd: string;
  args: unknown;
  at: number;
}

/** #74/#78: the title rules (removed prefixes, "Placeholder"/"Confirmed" stamps) live in the shared
 * `agendaTitles.ts`, mirroring `agenda.rs`. */
export function titlesForDate(raw: string | undefined, date: string): string[] {
  return activeTitlesForDate(parseAgendaMeetings(raw), date);
}

export function removedTitlesForDate(raw: string | undefined, date: string): string[] {
  return removedTitlesForDateShared(parseAgendaMeetings(raw), date);
}

/** #66: mirrors `agenda.rs`'s `titles_after_date`. */
export function titlesAfterDate(raw: string | undefined, afterDate: string): [string, string][] {
  return activeTitlesAfterDate(parseAgendaMeetings(raw), afterDate);
}

/** One handler per Tauri command, its args and resolved value both bound
 * to the `TauriCommands` contract (the same one `tauriApi.ts` checks the
 * real IPC wrapper against). Adding or reshaping a Rust command breaks
 * `svelte-check` here until the mock is updated to match — so the mock
 * can't silently drift from the backend. */
export type CommandHandlers = {
  [K in keyof TauriCommands]: (
    args: CommandArgs<K>,
  ) => CommandReturn<K> | Promise<CommandReturn<K>>;
};

export const MOCK_SPELL_SUGGESTIONS: Record<string, string[]> = {
  teh: ["the", "ten"],
  wrods: ["words", "rods"],
  mispeled: ["misspelled"],
  sentense: ["sentence"],
};
