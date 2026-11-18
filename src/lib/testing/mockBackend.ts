/** In-memory Tauri backend for running ChronoNote's real frontend in a
 * plain browser (Playwright, or `npm run dev` + `?mock` by hand).
 *
 * The frontend talks to Rust exclusively through
 * `window.__TAURI_INTERNALS__.invoke(cmd, args)` (see `src/lib/tauriApi.ts`
 * and the plugin packages). This module installs a stand-in for that
 * object backed by a `Map` of note files, implementing every command in
 * `src-tauri/src/lib.rs` plus the handful of plugin calls the app makes
 * (`plugin:app|version`, `plugin:dialog|open`, `plugin:opener|open_url`,
 * `plugin:updater|*`, `plugin:process|restart`, `plugin:event|*`,
 * `plugin:window|*`).
 *
 * Testing-only. `src/main.ts` imports this dynamically behind an
 * `import.meta.env.DEV` check, so the whole `src/lib/testing/` tree is
 * dropped from `vite build` output — verified by the `build-guard` CI job
 * (`.github/workflows/test.yml`), which greps `dist/` after a real build.
 *
 * Parity note: the command semantics here must track
 * `src-tauri/src/storage.rs`. The behaviours mirrored deliberately:
 *   - `is_valid_note_filename` — exactly `YYYY-MM-DD.txt`; anything else
 *     makes `read_note`/`write_note` reject (this is the path-traversal
 *     guard, and tests assert on it).
 *   - `set_notes_dir` -> `push_recent_notes_dir` — old dir goes to the
 *     front of `recent_notes_dirs`, new dir is removed from it, deduped,
 *     capped at 5.
 *   - `update_config` — apply only the fields present in the patch (with
 *     the same clamps), persist, return the whole `AppConfig`.
 *   - `read_note` returns `null` (not an error) for a missing file.
 *   - the session file lives *inside* the notes dir and is never returned
 */
import type { AppConfig, ColorMode, LanguageMode, PeekConfig, StartupTabMode, TabSession, ThemeMode } from "../types";
import type { TabLabelStyle } from "../generated/tauri-types";
import { PEEK_DEFAULTS } from "../peekDefaults";
import type { ToastOptions } from "../stores";
import type { OneDriveAdvancedConfig, TauriCommand } from "../tauriCommands";
import { isValidNoteFilename } from "../noteFilename";
import { normalizeNoteText } from "../noteText";
import {
  MAX_RECENT,
  MUTATING_COMMANDS,
  toTabSession,
  type CommandHandlers,
  type InvokeLogEntry,
  type MockDir,
  type MockSeed,
  type MockTrashEntry,
  type MockVersionEntry,
  type SeedTabSession,
} from "./mock/seed";
import { getConfig, setNotesDir, updateConfig } from "./mock/commands/config";
import {
  agendaFileExists,
  appendLog,
  checkUpdate,
  getSyncHealth,
  installUpdate,
  onedriveCreateFolder,
  onedriveExchangeCode,
  onedriveGetAccount,
  onedriveGetAdvancedConfig,
  onedriveGetConflicts,
  onedriveGetFolder,
  onedriveGetSyncStatus,
  onedriveListFolders,
  onedriveLogin,
  onedriveLogout,
  onedrivePrepareFolderSwitch,
  onedriveResolveConflict,
  onedriveSetAdvancedConfig,
  onedriveSetFolder,
  onedriveSyncNow,
  openLogFolder,
  pathExists,
  peekDockBottom,
  peekDockState,
  peekLog,
  peekSetBounds,
  peekSetTransparent,
  peekUndock,
  readAgendaAfter,
  readAgendaDates,
  readAgendaDetailsForDate,
  readAgendaEntriesForDate,
  readAgendaForDate,
  readAgendaRemovedForDate,
  readLogTail,
  snapOverlaySetRect,
  spellAdd,
  spellAvailableLanguages,
  spellCheckLines,
  spellIgnore,
  spellLanguages,
  spellSetLanguages,
  spellSuggest,
  spellWindowsLanguages,
  webCheckBrowserNotes,
  webMigrateBrowserNotes,
  writeExportFile,
  zenCoverMonitor,
  zenPrepareLeave,
} from "./mock/commands/misc";
import {
  deleteNote,
  getFileMetadata,
  importNotesBundle,
  listNoteFiles,
  readAllNotes,
  readNote,
  readNoteWithMetadata,
  writeConflictCopy,
  writeNote,
} from "./mock/commands/notes";
import {
  readPhoneInbox,
  readPhoneLedger,
  readSavedSearches,
  writePhoneLedger,
  writePhoneMeetings,
  writePhoneOutbox,
  writeSavedSearches,
} from "./mock/commands/phone";
import {
  loadScratchpadDrafts,
  readTabSession,
  saveScratchpadDrafts,
  writeTabSession,
} from "./mock/commands/session";
import {
  cleanUpVersionsAndTrash,
  listTrash,
  listVersions,
  readVersion,
  restoreFromTrash,
  restoreVersion,
} from "./mock/commands/versions";

export type {
  InvokeLogEntry,
  MockSeed,
  MockTrashEntry,
  MockVersionEntry,
  SeedTabSession,
} from "./mock/seed";

export class MockBackend {
  spellMisspelled = new Set<string>(["teh", "wrods", "mispeled", "sentense"]);
  dirs = new Map<string, MockDir>();
  notesDir: string;
  schemaVersion: number;
  colorMode: ColorMode;
  themeMode: ThemeMode;
  languageMode: LanguageMode;
  wordWrap: boolean;
  spellCheck: boolean;
  spellLanguages: string[] | null = null;
  mockSpellLanguages: string[] = ["nl-NL"];
  readableLineLength: boolean;
  autoCheckUpdates: boolean;
  earlyUpdates: boolean = false;
  phoneCompanion: boolean = false;
  /** `.chrononote-mobile/meetings.json` as `write_phone_meetings` last wrote it (not part of the snapshot). */
  phoneMeetings: string | null = null;
  /** `.chrononote-mobile/outbox.json` as `write_phone_outbox` last wrote it (not part of the snapshot). */
  phoneOutbox: string | null = null;
  /** `.chrononote-mobile/inbox.json` as the phone left it (seedable, not part of the snapshot). */
  phoneInbox: string | null = null;
  /** The phone-request ledger `write_phone_ledger` last wrote (part of the snapshot, as the real one survives a restart). */
  phoneLedger: string | null = null;
  lastCheckUpdateEarly: boolean | null = null;
  lastCheckEarly: boolean | null = null;
  lastSeenVersion: string | null;
  calendarSyncEnabled: boolean;
  calendarAutoAdd: boolean = true;
  minutesName: string = "";
  fontSize: number;
  lineHeight: number;
  pureBlack: boolean;
  startupTabMode: StartupTabMode;
  peek: PeekConfig;
  occurrenceHint: boolean;
  statusBarVisible: boolean;
  tabLabelStyle: TabLabelStyle;
  historyPaneShare: number;
  actionsPaneShare: number;
  onboardingCompleted: boolean;
  lastSyncSuccessMs: number | null = null;
  recentNotesDirs: string[];
  appVersion: string;
  updateCheck: "none" | "available";
  updateCheckVersion: string;
  agendaJson: string | undefined;
  /** Global shortcuts the app has registered and not unregistered (test-only). */
  globalShortcuts: string[] = [];
  scratchpadDrafts: Record<string, string> = {};
  oneDriveAdvancedConfig: OneDriveAdvancedConfig = {};
  /** note name -> the cloud's version, for `onedrive_get_conflicts`. */
  oneDriveConflicts = new Map<string, string>();
  oneDriveSyncError: string | undefined;
  oneDriveFolder: { folderId: string; folderPath: string } | null = { folderId: "folder-2", folderPath: "/Notes" };
  isMinimized: boolean = false;
  trash: MockTrashEntry[] = [];
  backendKind: "desktop" | "demo" | "web" = "desktop";
  browserNotes = new Map<string, string>();
  cloudNotes = new Map<string, string>();
  archiveNotes = new Map<string, string>();

  /** Every `invoke` call, in order — assert on persistence without
   * scraping the DOM. */
  invokeLog: InvokeLogEntry[] = [];
  /** URLs passed to `plugin:opener|open_url` (the About drawer's project
   * link) — nothing actually opens. */
  openedUrls: string[] = [];
  /** Test-only record of window commands that change the window (`set_always_on_top true`, `set_focus`, ...). */
  windowCalls: string[] = [];
  /** Log lines accumulated by append_log. */
  logLines: string[] = [];
  /** §404: the native dock state the mock reports (`peek_dock_state`); a test may set it to simulate a half dock. */
  peekDocked = false;
  /** §404: lines sent by `peek_log`, as `kind: message`. */
  peekLogLines: string[] = [];
  /** What `plugin:dialog|open` (the folder picker) returns next. `null`
   * = user cancelled. Set by tests before triggering a Browse. */
  nextDialogResult: string | string[] | null = null;

  /** Live app-state snapshots, wired up in `bootMock.ts` (needs the
   * controller module). Present only under the mock. */
  debug?: {
    tabs: () => unknown[];
    activeTabId: () => string;
    activeTab: () => unknown;
    modal: () => string;
    statusCounts: () => { open: number; closed: number; forwarded: number };
    setEditorContent: (text: string, options?: { outside?: boolean }) => void;
    getEditorContent: () => string;
    checkDrift: () => Promise<void>;
    setMobile: (val: boolean) => void;
    isMobile: () => boolean;
    setBackendKind: (val: "desktop" | "demo" | "web") => void;
    showToast: (msg: string, options?: ToastOptions | (() => void)) => void;
  };

  private eventListenerId = 0;
  /** Active `@tauri-apps/api/event` listeners. Lets a test drive a Tauri
   * event the real OS would fire — e.g. `tauri://close-requested` for the
   * §93 exit barrier. `fireCallback` is wired by `installMockTauri` (it
   * owns the transformed-callback id→fn map). */
  private eventListeners: { event: string; handlerId: number; eventId: number }[] = [];
  fireCallback?: (handlerId: number, payload: unknown) => void;

  /** Fire a Tauri event to every frontend listener registered for it.
   * Test-only, via `window.__CHRONO_MOCK__.emitEvent(...)`. */
  emitEvent(event: string, payload: unknown = null): void {
    for (const l of this.eventListeners) {
      if (l.event === event) this.fireCallback?.(l.handlerId, { event, id: l.handlerId, payload });
    }
  }

  /** Commands seeded to reject (`MockSeed.throwOnCommands`). */
  throwOnCommands: Set<string>;
  /** Commands seeded to artificially delay (`MockSeed.delayCommands`). */
  delayCommands: Map<string, number>;

  private heldCommands = new Map<
    string,
    { waiting: boolean; resolve?: (outcome?: { reject?: string }) => void }
  >();

  /** Arm a one-shot hold: the next `invoke(cmd)` waits until `releaseHeld(cmd)` is called. */
  holdCommand(cmd: string): void {
    this.heldCommands.set(cmd, { waiting: false });
  }

  /** Release a waiting `invoke(cmd)` call (or disarm a pending hold). Returns false if nothing was waiting. */
  releaseHeld(cmd: string, outcome?: { reject?: string }): boolean {
    const entry = this.heldCommands.get(cmd);
    this.heldCommands.delete(cmd);
    if (!entry || !entry.waiting || !entry.resolve) return false;
    entry.resolve(outcome);
    return true;
  }

  /** True while an `invoke(cmd)` call is waiting on `releaseHeld(cmd)`. */
  isHeld(cmd: string): boolean {
    return this.heldCommands.get(cmd)?.waiting ?? false;
  }

  /** `MockSeed.seedId` this state came from, saved with it. */
  seedId: string | undefined;

  constructor(seed: MockSeed = {}) {
    this.seedId = seed.seedId;
    this.trash = seed.trash ? [...seed.trash] : [];
    this.notesDir = seed.notesDir ?? "/notes";
    this.schemaVersion = seed.schemaVersion ?? 1;
    this.colorMode = seed.colorMode ?? "color"; // mirrors storage.rs's ColorMode::default()
    this.themeMode = seed.themeMode ?? "system";
    this.languageMode = seed.languageMode ?? "system";
    this.wordWrap = seed.wordWrap ?? false;
    this.spellCheck = seed.spellCheck ?? false;
    this.spellLanguages = seed.spellLanguages ?? null;
    this.mockSpellLanguages = this.spellLanguages ? [...this.spellLanguages] : ["nl-NL"];
    this.readableLineLength = seed.readableLineLength ?? false;
    this.autoCheckUpdates = seed.autoCheckUpdates ?? true;
    this.earlyUpdates = seed.earlyUpdates ?? false;
    this.phoneCompanion = seed.phoneCompanion ?? false;
    this.phoneInbox = seed.phoneInbox ?? null;
    this.lastSeenVersion = seed.lastSeenVersion ?? null;
    this.calendarSyncEnabled = seed.calendarSyncEnabled ?? false;
    this.calendarAutoAdd = seed.calendarAutoAdd ?? true;
    this.minutesName = seed.minutesName ?? "";
    this.fontSize = seed.fontSize ?? 13;
    this.lineHeight = seed.lineHeight ?? 1.6;
    this.pureBlack = seed.pureBlack ?? false;
    this.startupTabMode = seed.startupTabMode ?? "today";
    this.peek = { ...PEEK_DEFAULTS, ...seed.peek };
    this.occurrenceHint = seed.occurrenceHint ?? false;
    this.statusBarVisible = seed.statusBarVisible ?? true;
    this.tabLabelStyle = seed.tabLabelStyle ?? "iso";
    this.historyPaneShare = seed.historyPaneShare ?? 0.30;
    this.actionsPaneShare = seed.actionsPaneShare ?? 0.30;
    this.onboardingCompleted = seed.onboardingCompleted ?? true;
    this.lastSyncSuccessMs = seed.lastSyncSuccessMs ?? null;
    this.recentNotesDirs = seed.recentNotesDirs ? [...seed.recentNotesDirs] : [];
    this.appVersion = seed.appVersion ?? "0.3.0";
    this.updateCheck = seed.updateCheck ?? "none";
    this.updateCheckVersion = seed.updateCheckVersion ?? "9.9.9";
    this.agendaJson = seed.agendaJson;
    this.isMinimized = seed.isMinimized ?? false;
    this.backendKind = seed.backendKind ?? "desktop";
    if (seed.browserNotes) {
      for (const [k, v] of Object.entries(seed.browserNotes)) this.browserNotes.set(k, v);
    } else if (seed.backendKind === "web" && (seed.oneDriveFolder === null || seed.oneDriveFolder === undefined)) {
      for (const [k, v] of Object.entries(seed.notes ?? {})) this.browserNotes.set(k, v);
    }
    if (seed.cloudNotes) {
      for (const [k, v] of Object.entries(seed.cloudNotes)) this.cloudNotes.set(k, v);
    }
    if (seed.otherDirs) {
      for (const notes of Object.values(seed.otherDirs)) {
        for (const [k, v] of Object.entries(notes)) {
          if (!this.cloudNotes.has(k)) this.cloudNotes.set(k, v);
        }
      }
    }
    for (const c of seed.oneDriveConflicts ?? []) this.oneDriveConflicts.set(c.name, c.remote);
    this.oneDriveSyncError = seed.oneDriveSyncError;
    if (seed.oneDriveFolder !== undefined) this.oneDriveFolder = seed.oneDriveFolder;
    this.throwOnCommands = new Set(seed.throwOnCommands ?? []);
    this.delayCommands = new Map(Object.entries(seed.delayCommands ?? {}));

    this.dirs.set(this.notesDir, {
      notes: new Map(Object.entries(seed.notes ?? {})),
      session: toTabSession(seed.session),
      conflictCopies: new Map(),
      versions: new Map(Object.entries(seed.versions ?? {})),
      savedSearches: null,
    });
    for (const [path, notes] of Object.entries(seed.otherDirs ?? {})) {
      this.dirs.set(path, {
        notes: new Map(Object.entries(notes)),
        session: toTabSession(seed.sessions?.[path]),
        conflictCopies: new Map(),
        versions: new Map(),
        savedSearches: null,
      });
    }
  }

  // --- reload persistence --------------------------------------------
  //
  // The frontend's whole point is persisting to disk and reading it back
  // on next launch. A page reload creates a fresh MockBackend, so tests
  // that check "…survives a restart" need the mutable state to outlive
  // the reload. `sessionStorage` does exactly that — per browser tab,
  // cleared when Playwright opens a fresh context (i.e. per test).

  static STORAGE_KEY = "__chrono_mock_state__";

  private serialize(): string {
    return JSON.stringify({
      seedId: this.seedId,
      schemaVersion: this.schemaVersion,
      notesDir: this.notesDir,
      colorMode: this.colorMode,
      themeMode: this.themeMode,
      languageMode: this.languageMode,
      wordWrap: this.wordWrap,
      spellCheck: this.spellCheck,
      spellLanguages: this.spellLanguages,
      mockSpellLanguages: this.mockSpellLanguages,
      readableLineLength: this.readableLineLength,
      autoCheckUpdates: this.autoCheckUpdates,
      earlyUpdates: this.earlyUpdates,
      phoneCompanion: this.phoneCompanion,
      phoneLedger: this.phoneLedger,
      lastSeenVersion: this.lastSeenVersion,
      calendarSyncEnabled: this.calendarSyncEnabled,
      calendarAutoAdd: this.calendarAutoAdd,
      minutesName: this.minutesName,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
      pureBlack: this.pureBlack,
      startupTabMode: this.startupTabMode,
      peek: this.peek,
      occurrenceHint: this.occurrenceHint,
      statusBarVisible: this.statusBarVisible,
      tabLabelStyle: this.tabLabelStyle,
      historyPaneShare: this.historyPaneShare,
      actionsPaneShare: this.actionsPaneShare,
      onboardingCompleted: this.onboardingCompleted,
      isMinimized: this.isMinimized,
      recentNotesDirs: this.recentNotesDirs,
      appVersion: this.appVersion,
      agendaJson: this.agendaJson,
      trash: this.trash,
      backendKind: this.backendKind,
      browserNotes: [...this.browserNotes],
      cloudNotes: [...this.cloudNotes],
      archiveNotes: [...this.archiveNotes],
      oneDriveFolder: this.oneDriveFolder,
      oneDriveConflicts: [...this.oneDriveConflicts],
      // An expired sign-in outlives a reload, as the web app's stored (unrenewable) token does (§418).
      oneDriveSyncError: this.oneDriveSyncError,
      dirs: [...this.dirs].map(([path, d]) => [
        path,
        [...d.notes],
        d.session,
        [...d.conflictCopies],
        [...d.versions].map(([f, vs]) => [f, vs]),
        d.savedSearches,
      ]),
    });
  }

  persist(): void {
    try {
      sessionStorage.setItem(MockBackend.STORAGE_KEY, this.serialize());
    } catch {
      /* private-mode / disabled storage — reload persistence just won't work */
    }
  }

  static tryHydrate(seedId?: string): MockBackend | null {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(MockBackend.STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as {
        seedId?: string;
        schemaVersion?: number;
        notesDir: string;
        colorMode: ColorMode;
        themeMode?: ThemeMode;
        languageMode?: LanguageMode;
        wordWrap?: boolean;
        spellCheck?: boolean;
        spellLanguages?: string[] | null;
        mockSpellLanguages?: string[];
        readableLineLength?: boolean;
        autoCheckUpdates?: boolean;
        earlyUpdates?: boolean;
        phoneCompanion?: boolean;
        phoneLedger?: string | null;
        lastSeenVersion?: string | null;
        calendarSyncEnabled?: boolean;
        calendarAutoAdd?: boolean;
        minutesName?: string;
        fontSize?: number;
        lineHeight?: number;
        pureBlack?: boolean;
        startupTabMode?: StartupTabMode;
        peek?: Partial<PeekConfig>;
        occurrenceHint?: boolean;
        statusBarVisible?: boolean;
        tabLabelStyle?: TabLabelStyle;
        historyPaneShare?: number;
        actionsPaneShare?: number;
        onboardingCompleted?: boolean;
        isMinimized?: boolean;
        recentNotesDirs: string[];
        appVersion: string;
        agendaJson?: string;
        dirs: [
          string,
          [string, string][],
          TabSession | null,
          [string, string][]?,
          [string, MockVersionEntry[]][]?,
          (string | null)?,
        ][];
      };
      if (seedId !== undefined && s.seedId !== seedId) return null;
      const b = new MockBackend();
      b.seedId = s.seedId;
      b.schemaVersion = s.schemaVersion ?? 1;
      b.notesDir = s.notesDir;
      b.colorMode = s.colorMode;
      b.themeMode = s.themeMode ?? "system";
      b.languageMode = s.languageMode ?? "system";
      b.wordWrap = s.wordWrap ?? false;
      b.spellCheck = s.spellCheck ?? false;
      b.spellLanguages = s.spellLanguages ?? null;
      b.mockSpellLanguages = s.mockSpellLanguages ?? (b.spellLanguages ? [...b.spellLanguages] : ["nl-NL"]);
      b.autoCheckUpdates = s.autoCheckUpdates ?? true;
      b.earlyUpdates = s.earlyUpdates ?? false;
      b.phoneCompanion = s.phoneCompanion ?? false;
      b.phoneLedger = s.phoneLedger ?? null;
      b.lastSeenVersion = s.lastSeenVersion ?? null;
      b.calendarSyncEnabled = s.calendarSyncEnabled ?? false;
      b.calendarAutoAdd = s.calendarAutoAdd ?? true;
      b.minutesName = s.minutesName ?? "";
      b.readableLineLength = s.readableLineLength ?? false;
      b.fontSize = s.fontSize ?? 13;
      b.lineHeight = s.lineHeight ?? 1.6;
      b.isMinimized = s.isMinimized ?? false;
      b.pureBlack = s.pureBlack ?? false;
      // Saved but never read back before §430: a reload fell back to "today".
      b.startupTabMode = s.startupTabMode ?? "today";
      b.peek = { ...PEEK_DEFAULTS, ...s.peek };
      b.occurrenceHint = s.occurrenceHint ?? false;
      b.statusBarVisible = s.statusBarVisible ?? true;
      b.tabLabelStyle = s.tabLabelStyle ?? "iso";
      b.historyPaneShare = s.historyPaneShare ?? 0.30;
      b.actionsPaneShare = s.actionsPaneShare ?? 0.30;
      b.onboardingCompleted = s.onboardingCompleted ?? true;
      b.recentNotesDirs = s.recentNotesDirs;
      b.appVersion = s.appVersion;
      b.agendaJson = s.agendaJson;
      b.trash = (s as unknown as { trash?: MockTrashEntry[] }).trash ?? [];
      b.dirs = new Map(
        s.dirs.map(([path, notes, session, conflicts, versions, savedSearches]) => [
          path,
          {
            notes: new Map(notes),
            session,
            conflictCopies: new Map(conflicts ?? []),
            versions: new Map(versions ?? []),
            savedSearches: savedSearches ?? null,
          },
        ]),
      );
      const ext = s as unknown as {
        backendKind?: "desktop" | "demo" | "web";
        browserNotes?: [string, string][];
        cloudNotes?: [string, string][];
        archiveNotes?: [string, string][];
        oneDriveFolder?: { folderId: string; folderPath: string } | null;
        oneDriveConflicts?: [string, string][];
        oneDriveSyncError?: string;
      };
      if (ext.backendKind) b.backendKind = ext.backendKind;
      if (ext.browserNotes) b.browserNotes = new Map(ext.browserNotes);
      if (ext.cloudNotes) b.cloudNotes = new Map(ext.cloudNotes);
      if (ext.archiveNotes) b.archiveNotes = new Map(ext.archiveNotes);
      if (ext.oneDriveFolder !== undefined) b.oneDriveFolder = ext.oneDriveFolder;
      if (ext.oneDriveConflicts) b.oneDriveConflicts = new Map(ext.oneDriveConflicts);
      b.oneDriveSyncError = ext.oneDriveSyncError;
      return b;
    } catch {
      return null;
    }
  }

  dir(path = this.notesDir): MockDir {
    let d = this.dirs.get(path);
    if (!d) {
      d = { notes: new Map(), session: null, conflictCopies: new Map(), versions: new Map(), savedSearches: null };
      this.dirs.set(path, d);
    }
    return d;
  }

  config(): AppConfig {
    return {
      schemaVersion: this.schemaVersion,
      notesDir: this.notesDir,
      colorMode: this.colorMode,
      themeMode: this.themeMode,
      languageMode: this.languageMode,
      wordWrap: this.wordWrap,
      spellCheck: this.spellCheck,
      spellLanguages: this.spellLanguages,
      readableLineLength: this.readableLineLength,
      recentNotesDirs: [...this.recentNotesDirs],
      autoCheckUpdates: this.autoCheckUpdates,
      earlyUpdates: this.earlyUpdates,
      phoneCompanion: this.phoneCompanion,
      lastSeenVersion: this.lastSeenVersion,
      calendarSyncEnabled: this.calendarSyncEnabled,
      calendarAutoAdd: this.calendarAutoAdd,
      minutesName: this.minutesName,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
      pureBlack: this.pureBlack,
      startupTabMode: this.startupTabMode,
      peek: this.peek,
      occurrenceHint: this.occurrenceHint,
      statusBarVisible: this.statusBarVisible,
      tabLabelStyle: this.tabLabelStyle,
      historyPaneShare: this.historyPaneShare,
      actionsPaneShare: this.actionsPaneShare,
      onboardingCompleted: this.onboardingCompleted,
    };
  }

  // --- test-facing helpers (via window.__CHRONO_MOCK__) -------------------

  getArchiveNotes(): Record<string, string> {
    return Object.fromEntries(this.archiveNotes);
  }

  getBrowserNotes(): Record<string, string> {
    return Object.fromEntries(this.browserNotes);
  }

  getCloudNotes(): Record<string, string> {
    return Object.fromEntries(this.cloudNotes);
  }

  getNote(filename: string, dirPath = this.notesDir): string | null {
    return this.dir(dirPath).notes.get(filename) ?? null;
  }

  setNote(filename: string, content: string, dirPath = this.notesDir): void {
    this.dir(dirPath).notes.set(filename, content);
  }

  /** Simulate an external deletion of a note file. */
  deleteNote(filename: string, dirPath = this.notesDir): void {
    this.dir(dirPath).notes.delete(filename);
  }

  listFiles(dirPath = this.notesDir): string[] {
    return [...this.dir(dirPath).notes.keys()].filter(isValidNoteFilename).sort();
  }

  writesFor(filename: string): string[] {
    return this.invokeLog
      .filter((e) => e.cmd === "write_note" && (e.args as { filename?: string }).filename === filename)
      .map((e) => (e.args as { content: string }).content);
  }

  lastWrite(filename: string): string | null {
    const w = this.writesFor(filename);
    return w.length ? w[w.length - 1] : null;
  }

  /** §94: names of the `.chrononote-conflicts/` copies written this session. */
  conflictCopyNames(): string[] {
    return [...this.dir().conflictCopies.keys()];
  }

  conflictCopy(name: string): string | null {
    return this.dir().conflictCopies.get(name) ?? null;
  }

  formatVersionStamp(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}${m}${day}-${h}${min}${s}`;
  }

  hasVersionToday(filename: string, dirPath = this.notesDir): boolean {
    const todayPrefix = this.formatVersionStamp().slice(0, 8);
    const vers = this.dir(dirPath).versions.get(filename) ?? [];
    return vers.some((v) => v.name.startsWith(todayPrefix));
  }

  shouldKeepVersion(
    filename: string,
    newContent: string,
    expectedHash: string | null,
    now = Date.now(),
    dirPath = this.notesDir,
  ): boolean {
    if (expectedHash === null || newContent.trim().length === 0) {
      return true;
    }
    const vers = this.dir(dirPath).versions.get(filename) ?? [];
    if (vers.length === 0) return true;
    return now - vers[0].savedMs > 5 * 60 * 1000;
  }

  keepVersion(filename: string, content: string, dirPath = this.notesDir, now = Date.now()): void {
    if (!content || !content.trim()) return;
    const norm = normalizeNoteText(content);
    let vers = this.dir(dirPath).versions.get(filename) ?? [];
    if (vers.length > 0 && normalizeNoteText(vers[0].content) === norm) {
      return;
    }
    let d = new Date(now);
    let stamp = this.formatVersionStamp(d);
    while (vers.some((v) => v.name === stamp)) {
      d = new Date(d.getTime() + 1000);
      stamp = this.formatVersionStamp(d);
    }
    const entry: MockVersionEntry = {
      name: stamp,
      savedMs: d.getTime(),
      sizeBytes: new TextEncoder().encode(norm).length,
      content: norm,
    };
    vers = [entry, ...vers];
    vers.sort((a, b) => b.savedMs - a.savedMs || b.name.localeCompare(a.name));
    this.dir(dirPath).versions.set(filename, vers);
  }

  cleanUpVersionsAndTrash(now = Date.now()): void {
    const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
    const todayPrefix = this.formatVersionStamp(new Date(now)).slice(0, 8);

    for (const [, dir] of this.dirs) {
      for (const [filename, vers] of [...dir.versions.entries()]) {
        const todayVersions: MockVersionEntry[] = [];
        const earlierByDay = new Map<string, MockVersionEntry[]>();

        for (const v of vers) {
          if (now - v.savedMs > KEEP_MS) {
            continue;
          }
          const dayPrefix = this.formatVersionStamp(new Date(v.savedMs)).slice(0, 8);
          if (dayPrefix === todayPrefix) {
            todayVersions.push(v);
          } else {
            const list = earlierByDay.get(dayPrefix) ?? [];
            list.push(v);
            earlierByDay.set(dayPrefix, list);
          }
        }

        const kept: MockVersionEntry[] = [...todayVersions];
        for (const [, dayList] of earlierByDay) {
          dayList.sort((a, b) => b.savedMs - a.savedMs);
          if (dayList.length > 0) {
            kept.push(dayList[0]);
          }
        }
        kept.sort((a, b) => b.savedMs - a.savedMs || b.name.localeCompare(a.name));

        if (kept.length === 0) {
          dir.versions.delete(filename);
        } else {
          dir.versions.set(filename, kept);
        }
      }
    }

    this.trash = this.trash.filter((item) => now - item.deletedMs <= KEEP_MS);
  }

  getVersions(filename: string, dirPath = this.notesDir): MockVersionEntry[] {
    return [...(this.dir(dirPath).versions.get(filename) ?? [])];
  }

  // --- the invoke dispatcher -------------------------------------------

  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.invokeLog.push({ cmd, args, at: Date.now() });
    const held = this.heldCommands.get(cmd);
    if (held && !held.waiting) {
      held.waiting = true;
      const outcome = await new Promise<{ reject?: string } | undefined>((resolve) => {
        held.resolve = resolve;
      });
      if (outcome?.reject !== undefined) {
        throw new Error(outcome.reject);
      }
    }
    if (this.throwOnCommands.has(cmd)) {
      throw new Error(`mock: ${cmd} failed (seeded via throwOnCommands)`);
    }
    const delayMs = this.delayCommands.get(cmd);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const out = await this.dispatch(cmd, args);
    if (MUTATING_COMMANDS.has(cmd)) this.persist();
    return out;
  }

  /** Every `#[tauri::command]` in `src-tauri/src/lib.rs`, one arrow each,
   * type-checked against the `TauriCommands` contract. Plugin calls
   * (`plugin:*`) are not commands and stay in `dispatch`'s switch. */
  private readonly core: CommandHandlers = {
    clean_up_versions_and_trash: () => cleanUpVersionsAndTrash(this),
    check_update: (args) => checkUpdate(this, args),
    get_config: () => getConfig(this),
    set_notes_dir: (args) => setNotesDir(this, args),
    update_config: (args) => updateConfig(this, args),
    list_note_files: () => listNoteFiles(this),
    read_note: (args) => readNote(this, args),
    write_note: (args) => writeNote(this, args),
    delete_note: (args) => deleteNote(this, args),
    list_trash: () => listTrash(this),
    restore_from_trash: (args) => restoreFromTrash(this, args),
    list_versions: (args) => listVersions(this, args),
    read_version: (args) => readVersion(this, args),
    restore_version: (args) => restoreVersion(this, args),
    get_file_metadata: (args) => getFileMetadata(this, args),
    read_note_with_metadata: (args) => readNoteWithMetadata(this, args),
    write_conflict_copy: (args) => writeConflictCopy(this, args),
    write_phone_meetings: (args) => writePhoneMeetings(this, args),
    write_phone_outbox: (args) => writePhoneOutbox(this, args),
    read_phone_inbox: () => readPhoneInbox(this),
    read_saved_searches: () => readSavedSearches(this),
    write_saved_searches: (args) => writeSavedSearches(this, args),
    read_phone_ledger: () => readPhoneLedger(this),
    write_phone_ledger: (args) => writePhoneLedger(this, args),
    read_all_notes: () => readAllNotes(this),
    read_tab_session: () => readTabSession(this),
    write_tab_session: (args) => writeTabSession(this, args),
    path_exists: (args) => pathExists(this, args),
    import_notes_bundle: (args) => importNotesBundle(this, args),
    read_agenda_for_date: (args) => readAgendaForDate(this, args),
    read_agenda_removed_for_date: (args) => readAgendaRemovedForDate(this, args),
    read_agenda_entries_for_date: (args) => readAgendaEntriesForDate(this, args),
    read_agenda_details_for_date: (args) => readAgendaDetailsForDate(this, args),
    read_agenda_after: (args) => readAgendaAfter(this, args),
    read_agenda_dates: () => readAgendaDates(this),
    agenda_file_exists: () => agendaFileExists(this),
    onedrive_login: () => onedriveLogin(this),
    onedrive_logout: () => onedriveLogout(),
    onedrive_get_account: () => onedriveGetAccount(),
    onedrive_list_folders: () => onedriveListFolders(),
    onedrive_create_folder: (args) => onedriveCreateFolder(args),
    onedrive_set_folder: (args) => onedriveSetFolder(this, args),
    onedrive_get_folder: () => onedriveGetFolder(this),
    onedrive_exchange_code: () => onedriveExchangeCode(),
    onedrive_sync_now: () => onedriveSyncNow(this),
    onedrive_get_conflicts: () => onedriveGetConflicts(this),
    onedrive_resolve_conflict: (args) => onedriveResolveConflict(this, args),
    onedrive_get_sync_status: () => onedriveGetSyncStatus(),
    onedrive_get_advanced_config: () => onedriveGetAdvancedConfig(this),
    onedrive_set_advanced_config: (args) => onedriveSetAdvancedConfig(this, args),
    save_scratchpad_drafts: (args) => saveScratchpadDrafts(this, args),
    load_scratchpad_drafts: () => loadScratchpadDrafts(this),
    web_check_browser_notes: () => webCheckBrowserNotes(this),
    web_migrate_browser_notes: () => webMigrateBrowserNotes(this),
    onedrive_prepare_folder_switch: () => onedrivePrepareFolderSwitch(),
    get_sync_health: () => getSyncHealth(this),
    append_log: (args) => appendLog(this, args),
    read_log_tail: (args) => readLogTail(this, args),
    open_log_folder: () => openLogFolder(this),
    write_export_file: (args) => writeExportFile(args),
    spell_available_languages: () => spellAvailableLanguages(),
    spell_windows_languages: () => spellWindowsLanguages(),
    spell_set_languages: (args) => spellSetLanguages(this, args),
    spell_languages: () => spellLanguages(this),
    spell_check_lines: (args) => spellCheckLines(this, args),
    spell_suggest: (args) => spellSuggest(args),
    spell_add: (args) => spellAdd(this, args),
    spell_ignore: (args) => spellIgnore(this, args),
    peek_set_bounds: () => peekSetBounds(),
    peek_set_transparent: () => peekSetTransparent(),
    peek_dock_bottom: (args) => peekDockBottom(this, args),
    peek_undock: () => peekUndock(this),
    peek_dock_state: () => peekDockState(this),
    peek_log: (args) => peekLog(this, args),
    snap_overlay_set_rect: () => snapOverlaySetRect(),
    zen_cover_monitor: () => zenCoverMonitor(),
    zen_prepare_leave: () => zenPrepareLeave(),
    install_update: (args) => installUpdate(args),
  };

  private async dispatch(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    if (Object.prototype.hasOwnProperty.call(this.core, cmd)) {
      const handler = this.core[cmd as TauriCommand] as (a: unknown) => unknown;
      return handler(args);
    }
    switch (cmd) {
      // --- plugins the frontend pulls in ---
      case "plugin:app|version":
        return this.appVersion;

      case "plugin:opener|open_url":
        this.openedUrls.push(String(args.url ?? (args as Record<string, unknown>).path));
        return null;

      case "plugin:dialog|open":
      case "plugin:dialog|save": {
        const r = this.nextDialogResult;
        this.nextDialogResult = null;
        return r;
      }

      // --- §update-check: @tauri-apps/plugin-updater / plugin-process ---
      // `check()`'s IPC args pass straight through with no serialization
      // under the mock (same JS runtime), so `args.onEvent` here is the
      // live `Channel` instance the frontend passed to `downloadAndInstall`
      // — calling `.onmessage(...)` on it drives the caller's own progress
      // handler directly, no transformCallback plumbing needed.
      case "plugin:updater|download_and_install": {
        const channel = args.onEvent as { onmessage?: (e: unknown) => void } | undefined;
        channel?.onmessage?.({ event: "Started", data: { contentLength: 1000 } });
        channel?.onmessage?.({ event: "Progress", data: { chunkLength: 600 } });
        channel?.onmessage?.({ event: "Progress", data: { chunkLength: 400 } });
        channel?.onmessage?.({ event: "Finished" });
        return null;
      }

      case "plugin:resources|close":
        return null;

      case "plugin:process|restart":
        return null;

      case "plugin:event|listen": {
        const eventId = ++this.eventListenerId;
        if (typeof args.event === "string" && typeof args.handler === "number") {
          this.eventListeners.push({ event: args.event, handlerId: args.handler, eventId });
        }
        return eventId;
      }
      case "plugin:event|unlisten": {
        if (typeof args.eventId === "number") {
          this.eventListeners = this.eventListeners.filter((l) => l.eventId !== args.eventId);
        }
        return null;
      }

      // §merged-titlebar: the custom close button calls `.close()` (not
      // `.destroy()`) precisely so it goes through the same §93 exit
      // barrier a real OS close button/Alt+F4 already did — a real Tauri
      // window's `.close()` emits `tauri://close-requested` and leaves
      // the frontend's own listener (`wireCloseBarrier`, `boot.ts`) to
      // decide whether/when to actually `.destroy()` it. Mirrored here
      // via the same `emitEvent` mechanism `exit-barrier.spec.ts` already
      // drives directly, so a test clicking the real close button
      // exercises the identical path.
      case "plugin:window|close":
        this.emitEvent("tauri://close-requested");
        return null;

      case "plugin:window|set_title":
        // A real Tauri app sets the OS window title here; in a browser the
        // frontend expects `document.title` to follow (the app relies on
        // `getCurrentWindow().setTitle(...)` and never touches
        // `document.title` itself).
        if (typeof document !== "undefined" && typeof args.value === "string") {
          document.title = args.value;
        }
        return null;

      default:
        if (cmd.startsWith("plugin:global-shortcut|")) {
          // Test-only record of what is registered (the real shortcut cannot be pressed in a browser).
          const keys = ([] as unknown[]).concat(args.shortcuts ?? args.shortcut ?? []).filter((x): x is string => typeof x === "string");
          if (cmd.endsWith("|register")) for (const k of keys) if (!this.globalShortcuts.includes(k)) this.globalShortcuts.push(k);
          if (cmd.endsWith("|unregister")) this.globalShortcuts = this.globalShortcuts.filter((x) => !keys.includes(x));
          return null;
        }
        if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) {
          return this.mockWindowCall(cmd, args);
        }
        // Unknown command — don't throw (that would surface as an unhandled
        // rejection and fail a test for the wrong reason); log loudly.
        console.warn(`[mockBackend] unhandled invoke: ${cmd}`, args);
        return null;
    }
  }

  /** Benign answers for the window-introspection calls
   * `initWindowChromeWatcher` / `notesDir.subscribe(setTitle)` make. */
  private mockWindowCall(cmd: string, args: Record<string, unknown> = {}): unknown {
    const method = cmd.split("|")[1] ?? "";
    if (method.startsWith("set_")) this.windowCalls.push("value" in args ? `${method} ${String(args.value)}` : method);
    switch (method) {
      case "is_fullscreen":
      case "is_maximized":
      case "is_focused":
        return false;
      case "is_minimized":
        return this.isMinimized;
      case "minimize":
        this.isMinimized = true;
        return null;
      case "unminimize":
        this.isMinimized = false;
        return null;
      case "set_focus":
        return null;
      case "inner_size":
      case "outer_size":
        return { width: 1100, height: 720 };
      case "scale_factor":
        return 1;
      case "outer_position":
        return { x: 0, y: 0 };
      case "current_monitor":
        return { name: "mock", size: { width: 1920, height: 1080 }, position: { x: 0, y: 0 }, scaleFactor: 1 };
      case "theme":
        return "light";
      case "set_title":
      default:
        return null;
    }
  }
}

/** Mirrors `storage.rs::push_recent_notes_dir`. */
export function pushRecentNotesDir(recent: string[], oldPath: string, newPath: string): void {
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i] === newPath || recent[i] === oldPath) recent.splice(i, 1);
  }
  recent.unshift(oldPath);
  recent.length = Math.min(recent.length, MAX_RECENT);
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, unknown>;
    __CHRONO_MOCK__?: MockBackend;
    /** Set by Playwright's `addInitScript` before any page script runs. */
    __CHRONO_SEED__?: MockSeed;
  }
}

/** Installs the mock as `window.__TAURI_INTERNALS__` and exposes the
 * backend at `window.__CHRONO_MOCK__`. Call before mounting the app.
 *
 * On a reload, state saved to `sessionStorage` by the previous page wins
 * over the seed — so "…persists across a restart" is actually testable. */
export function installMockTauri(seed?: MockSeed): MockBackend {
  const source = seed ?? window.__CHRONO_SEED__ ?? {};
  const backend = MockBackend.tryHydrate(source.seedId) ?? new MockBackend(source);

  const callbacks = new Map<number, (payload: unknown) => void>();
  let nextCallbackId = 1;

  window.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args?: Record<string, unknown>) => backend.invoke(cmd, args ?? {}),
    transformCallback: (cb: (payload: unknown) => void, _once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, cb);
      return id;
    },
    unregisterCallback: (id: number) => callbacks.delete(id),
    convertFileSrc: (path: string) => path,
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  };

  // Let the backend fire Tauri events at the real frontend listeners
  // (`backend.emitEvent(...)` from a test) — it registers listener ids in
  // `plugin:event|listen`, this closure owns the id→fn map.
  backend.fireCallback = (id, payload) => callbacks.get(id)?.(payload);

  // `@tauri-apps/api/event`'s unlisten path touches this before its
  // invoke; stub it so a listener teardown can't throw under the mock.
  (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  window.__CHRONO_MOCK__ = backend;
  return backend;
}
