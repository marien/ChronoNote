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
 *   - `set_color_mode` / `set_word_wrap` — write the one field, persist,
 *     return the whole `AppConfig`.
 *   - `read_note` returns `null` (not an error) for a missing file.
 *   - the session file lives *inside* the notes dir and is never returned
 *     by `list_note_files` / `read_all_notes`.
 */
import type { AppConfig, ColorMode, FileMetadata, TabSession, ThemeMode } from "../types";
import type { CommandArgs, CommandReturn, OneDriveAdvancedConfig, TauriCommand, TauriCommands } from "../tauriCommands";
import { isValidNoteFilename } from "../noteFilename";

export interface MockSeed {
  /** Path used as the active notes directory. Default `/notes`. */
  notesDir?: string;
  /** `filename -> contents` for the active notes directory. */
  notes?: Record<string, string>;
  /** Saved tab session for the active directory, or `null` for none. */
  session?: TabSession | null;
  colorMode?: ColorMode;
  themeMode?: ThemeMode;
  wordWrap?: boolean;
  readableLineLength?: boolean;
  autoCheckUpdates?: boolean;
  /** #50: the version this config last recorded seeing — seed a value
   * different from `appVersion` to simulate "first launch after an
   * update" in a test. `undefined`/omitted mirrors a fresh install or a
   * pre-#50 config (no update notice). */
  lastSeenVersion?: string | null;
  /** Whether the opt-in "Sync calendar for this day" button is shown at
   * all — mirrors `AppConfig.calendarSyncEnabled`, off by default. */
  calendarSyncEnabled?: boolean;
  /** Seeds `recent_notes_dirs` directly (normally only `set_notes_dir`
   * writes it). */
  recentNotesDirs?: string[];
  /** Extra directories the user can switch into, `path -> (filename ->
   * contents)`. Their session, if any, is under `sessions`. */
  otherDirs?: Record<string, Record<string, string>>;
  sessions?: Record<string, TabSession>;
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
  /** The chosen OneDrive folder. Omitted = a folder is already chosen
   * (`/Notes`); `null` = signed in but no folder chosen yet (the state right
   * after "Connect Microsoft Account" on a fresh install). */
  oneDriveFolder?: { folderId: string; folderPath: string } | null;
}

interface MockDir {
  notes: Map<string, string>;
  session: TabSession | null;
  /** `.chrononote-conflicts/<name>` copies written by `write_conflict_copy`
   * (§94). Kept separate from `notes` so they never surface as note files. */
  conflictCopies: Map<string, string>;
}

const MAX_RECENT = 5;
const CONFLICTS_DIRNAME = ".chrononote-conflicts";

/** Commands that change persisted state — after these, snapshot to
 * `sessionStorage` so a reload sees the same "disk". */
const MUTATING_COMMANDS = new Set([
  "set_notes_dir",
  "set_color_mode",
  "set_theme_mode",
  "set_word_wrap",
  "set_readable_line_length",
  "set_auto_check_updates",
  "set_last_seen_version",
  "write_note",
  "write_conflict_copy",
  "write_tab_session",
  "import_notes_bundle",
]);

/** SHA-256 hex — the exact digest `storage.rs`'s `sha2` produces and
 * `drift.ts`'s `sha256Hex` computes in-memory, so mock metadata hashes
 * compare correctly against both. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fileMetadata(content: string | undefined): Promise<FileMetadata> {
  if (content === undefined) {
    return { exists: false, contentHash: null, sizeBytes: null, modifiedMs: null };
  }
  return {
    exists: true,
    contentHash: await sha256Hex(content),
    sizeBytes: new TextEncoder().encode(content).length,
    modifiedMs: Date.now(),
  };
}

export interface InvokeLogEntry {
  cmd: string;
  args: unknown;
  at: number;
}

interface AgendaMeeting {
  date: string;
  start: string;
  end: string;
  title: string;
}

function isAgendaMeeting(x: unknown): x is AgendaMeeting {
  const m = x as Record<string, unknown> | null;
  return (
    !!m &&
    typeof m === "object" &&
    typeof m.date === "string" &&
    typeof m.start === "string" &&
    typeof m.end === "string" &&
    typeof m.title === "string"
  );
}

const AGENDA_ERROR = "The calendar file (.agenda.json) is missing, empty, or invalid — check whatever syncs it.";

/** Mirrors `src-tauri/src/agenda.rs`'s `parse_agenda` + `titles_for_date`
 * exactly: scoped to `date`, sorted by (start, end, title), de-duplicated
 * on the exact (start, end, title) tuple. Throws — rather than resolving
 * to an empty list — for anything that isn't a genuine, non-empty array of
 * well-formed meetings: missing/blank content, unparseable JSON, a bare
 * `[]`, or an array with even one malformed element. Rust's `serde_json`
 * deserialization of `Vec<AgendaMeeting>` fails the *whole* array if even
 * one element doesn't match the struct shape (not just that element) —
 * `isAgendaMeeting` validated with `.every()`, not `.filter()`, mirrors
 * that all-or-nothing behavior. A day with no matching entries in an
 * otherwise-valid, non-empty file is a legitimate empty result, not an
 * error — only the whole file being empty/invalid is. */
function parseAgendaMeetings(raw: string | undefined): AgendaMeeting[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse((raw ?? "").trim());
  } catch {
    throw new Error(AGENDA_ERROR);
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isAgendaMeeting)) {
    throw new Error(AGENDA_ERROR);
  }
  return parsed as AgendaMeeting[];
}

/** #74: mirrors `agenda.rs`'s `EXCLUDED_TITLE_PREFIXES`/`is_excluded_title`
 * — a declined, cancelled, or forwarded ("Following:") meeting never
 * creates or matches a section. Case-sensitive, exact-prefix match. */
const EXCLUDED_TITLE_PREFIXES = ["Declined:", "Cancelled:", "Following:"];
function isExcludedTitle(title: string): boolean {
  return EXCLUDED_TITLE_PREFIXES.some((p) => title.startsWith(p));
}

function titlesForDate(raw: string | undefined, date: string): string[] {
  const day = parseAgendaMeetings(raw).filter((m) => m.date === date && !isExcludedTitle(m.title));
  day.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
  const seen = new Set<string>();
  return day
    .filter((m) => {
      const key = `${m.start}|${m.end}|${m.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => m.title);
}

/** #66: mirrors `agenda.rs`'s `titles_after_date` — every `(date, title)`
 * pair for a date strictly after `afterDate`, sorted/de-duplicated the
 * same way `titlesForDate` is but scoped to a range instead of one day. */
function titlesAfterDate(raw: string | undefined, afterDate: string): [string, string][] {
  const future = parseAgendaMeetings(raw).filter((m) => m.date > afterDate && !isExcludedTitle(m.title));
  future.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.title.localeCompare(b.title),
  );
  const seen = new Set<string>();
  return future
    .filter((m) => {
      const key = `${m.date}|${m.start}|${m.end}|${m.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => [m.date, m.title] as [string, string]);
}

/** One handler per Tauri command, its args and resolved value both bound
 * to the `TauriCommands` contract (the same one `tauriApi.ts` checks the
 * real IPC wrapper against). Adding or reshaping a Rust command breaks
 * `svelte-check` here until the mock is updated to match — so the mock
 * can't silently drift from the backend. */
type CommandHandlers = {
  [K in keyof TauriCommands]: (
    args: CommandArgs<K>,
  ) => CommandReturn<K> | Promise<CommandReturn<K>>;
};

export class MockBackend {
  dirs = new Map<string, MockDir>();
  notesDir: string;
  colorMode: ColorMode;
  themeMode: ThemeMode;
  wordWrap: boolean;
  readableLineLength: boolean;
  autoCheckUpdates: boolean;
  lastSeenVersion: string | null;
  calendarSyncEnabled: boolean;
  recentNotesDirs: string[];
  appVersion: string;
  updateCheck: "none" | "available";
  updateCheckVersion: string;
  agendaJson: string | undefined;
  scratchpadDrafts: Record<string, string> = {};
  oneDriveAdvancedConfig: OneDriveAdvancedConfig = {};
  /** note name -> the cloud's version, for `onedrive_get_conflicts`. */
  oneDriveConflicts = new Map<string, string>();
  oneDriveFolder: { folderId: string; folderPath: string } | null = { folderId: "folder-2", folderPath: "/Notes" };

  /** Every `invoke` call, in order — assert on persistence without
   * scraping the DOM. */
  invokeLog: InvokeLogEntry[] = [];
  /** URLs passed to `plugin:opener|open_url` (the About drawer's project
   * link) — nothing actually opens. */
  openedUrls: string[] = [];
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
    setEditorContent: (text: string) => void;
    getEditorContent: () => string;
    checkDrift: () => Promise<void>;
    setMobile: (val: boolean) => void;
    isMobile: () => boolean;
    showToast: (msg: string) => void;
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

  constructor(seed: MockSeed = {}) {
    this.notesDir = seed.notesDir ?? "/notes";
    this.colorMode = seed.colorMode ?? "color"; // mirrors storage.rs's ColorMode::default()
    this.themeMode = seed.themeMode ?? "system";
    this.wordWrap = seed.wordWrap ?? false;
    this.readableLineLength = seed.readableLineLength ?? false;
    this.autoCheckUpdates = seed.autoCheckUpdates ?? true;
    this.lastSeenVersion = seed.lastSeenVersion ?? null;
    this.calendarSyncEnabled = seed.calendarSyncEnabled ?? false;
    this.recentNotesDirs = seed.recentNotesDirs ? [...seed.recentNotesDirs] : [];
    this.appVersion = seed.appVersion ?? "0.3.0";
    this.updateCheck = seed.updateCheck ?? "none";
    this.updateCheckVersion = seed.updateCheckVersion ?? "9.9.9";
    this.agendaJson = seed.agendaJson;
    for (const c of seed.oneDriveConflicts ?? []) this.oneDriveConflicts.set(c.name, c.remote);
    if (seed.oneDriveFolder !== undefined) this.oneDriveFolder = seed.oneDriveFolder;
    this.throwOnCommands = new Set(seed.throwOnCommands ?? []);
    this.delayCommands = new Map(Object.entries(seed.delayCommands ?? {}));

    this.dirs.set(this.notesDir, {
      notes: new Map(Object.entries(seed.notes ?? {})),
      session: seed.session ?? null,
      conflictCopies: new Map(),
    });
    for (const [path, notes] of Object.entries(seed.otherDirs ?? {})) {
      this.dirs.set(path, {
        notes: new Map(Object.entries(notes)),
        session: seed.sessions?.[path] ?? null,
        conflictCopies: new Map(),
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
      notesDir: this.notesDir,
      colorMode: this.colorMode,
      themeMode: this.themeMode,
      wordWrap: this.wordWrap,
      readableLineLength: this.readableLineLength,
      autoCheckUpdates: this.autoCheckUpdates,
      lastSeenVersion: this.lastSeenVersion,
      calendarSyncEnabled: this.calendarSyncEnabled,
      recentNotesDirs: this.recentNotesDirs,
      appVersion: this.appVersion,
      agendaJson: this.agendaJson,
      dirs: [...this.dirs].map(([path, d]) => [path, [...d.notes], d.session, [...d.conflictCopies]]),
    });
  }

  private persist(): void {
    try {
      sessionStorage.setItem(MockBackend.STORAGE_KEY, this.serialize());
    } catch {
      /* private-mode / disabled storage — reload persistence just won't work */
    }
  }

  static tryHydrate(): MockBackend | null {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(MockBackend.STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as {
        notesDir: string;
        colorMode: ColorMode;
        themeMode?: ThemeMode;
        wordWrap?: boolean;
        readableLineLength?: boolean;
        autoCheckUpdates?: boolean;
        lastSeenVersion?: string | null;
        calendarSyncEnabled?: boolean;
        recentNotesDirs: string[];
        appVersion: string;
        agendaJson?: string;
        dirs: [string, [string, string][], TabSession | null, [string, string][]?][];
      };
      const b = new MockBackend();
      b.notesDir = s.notesDir;
      b.colorMode = s.colorMode;
      b.themeMode = s.themeMode ?? "system";
      b.wordWrap = s.wordWrap ?? false;
      b.autoCheckUpdates = s.autoCheckUpdates ?? true;
      b.lastSeenVersion = s.lastSeenVersion ?? null;
      b.calendarSyncEnabled = s.calendarSyncEnabled ?? false;
      b.readableLineLength = s.readableLineLength ?? false;
      b.recentNotesDirs = s.recentNotesDirs;
      b.appVersion = s.appVersion;
      b.agendaJson = s.agendaJson;
      b.dirs = new Map(
        s.dirs.map(([path, notes, session, conflicts]) => [
          path,
          { notes: new Map(notes), session, conflictCopies: new Map(conflicts ?? []) },
        ]),
      );
      return b;
    } catch {
      return null;
    }
  }

  private dir(path = this.notesDir): MockDir {
    let d = this.dirs.get(path);
    if (!d) {
      d = { notes: new Map(), session: null, conflictCopies: new Map() };
      this.dirs.set(path, d);
    }
    return d;
  }

  private config(): AppConfig {
    return {
      notesDir: this.notesDir,
      colorMode: this.colorMode,
      themeMode: this.themeMode,
      wordWrap: this.wordWrap,
      readableLineLength: this.readableLineLength,
      recentNotesDirs: [...this.recentNotesDirs],
      autoCheckUpdates: this.autoCheckUpdates,
      lastSeenVersion: this.lastSeenVersion,
      calendarSyncEnabled: this.calendarSyncEnabled,
    };
  }

  // --- test-facing helpers (via window.__CHRONO_MOCK__) -------------------

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

  // --- the invoke dispatcher -------------------------------------------

  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.invokeLog.push({ cmd, args, at: Date.now() });
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
    get_config: () => this.config(),

    set_notes_dir: ({ path }) => {
      if (path !== this.notesDir) {
        pushRecentNotesDir(this.recentNotesDirs, this.notesDir, path);
      }
      this.notesDir = path;
      this.dir(path); // materialise if brand-new
      return this.config();
    },

    set_color_mode: ({ mode }) => {
      this.colorMode = mode;
      return this.config();
    },

    set_theme_mode: ({ mode }) => {
      this.themeMode = mode;
      return this.config();
    },

    set_calendar_sync_enabled: ({ enabled }) => {
      this.calendarSyncEnabled = enabled;
      return this.config();
    },

    set_last_seen_version: ({ version }) => {
      this.lastSeenVersion = version;
      return this.config();
    },

    set_word_wrap: ({ enabled }) => {
      this.wordWrap = enabled;
      return this.config();
    },

    set_readable_line_length: ({ enabled }) => {
      this.readableLineLength = enabled;
      return this.config();
    },

    set_auto_check_updates: ({ enabled }) => {
      this.autoCheckUpdates = enabled;
      return this.config();
    },

    list_note_files: () => this.listFiles(),

    read_note: ({ filename }) => {
      if (!isValidNoteFilename(filename)) {
        throw new Error(`Invalid note filename: ${filename}`);
      }
      return this.dir().notes.get(filename) ?? null;
    },

    write_note: async ({ filename, content, expectedHash }) => {
      if (!isValidNoteFilename(filename)) {
        throw new Error(`Invalid note filename: ${filename}`);
      }
      // §94: compare-and-swap when the caller passed the hash it last saw.
      if (typeof expectedHash === "string") {
        const current = this.dir().notes.get(filename);
        const currentHash = current === undefined ? null : await sha256Hex(current);
        if (currentHash !== expectedHash) {
          throw new Error(`conflict: note changed on disk: ${filename}`);
        }
      }
      this.dir().notes.set(filename, content);
      return fileMetadata(content);
    },

    // #63: a missing file is not an error — mirrors
    // `storage.rs::delete_note_at`'s own idempotent behavior.
    delete_note: ({ filename }) => {
      if (!isValidNoteFilename(filename)) {
        throw new Error(`Invalid note filename: ${filename}`);
      }
      this.dir().notes.delete(filename);
    },

    get_file_metadata: ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      return fileMetadata(this.dir().notes.get(filename));
    },

    read_note_with_metadata: async ({ filename }) => {
      if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
      const content = this.dir().notes.get(filename) ?? null;
      return { content, metadata: await fileMetadata(content ?? undefined) };
    },

    write_conflict_copy: ({ name, content }) => {
      if (!/^[A-Za-z0-9._-]+\.txt$/.test(name) || name.includes("..")) {
        throw new Error(`Invalid conflict-copy filename: ${name}`);
      }
      this.dir().conflictCopies.set(name, content);
      return `${this.notesDir}/${CONFLICTS_DIRNAME}/${name}`;
    },

    read_all_notes: () =>
      this.listFiles().map((f) => [f, this.dir().notes.get(f) ?? ""] as [string, string]),

    read_tab_session: () => this.dir().session,

    write_tab_session: ({ openTabs, activeTab, lastOpenedDate }) => {
      this.dir().session = {
        openTabs: openTabs ?? [],
        activeTab: activeTab ?? null,
        lastOpenedDate: lastOpenedDate ?? null,
      };
    },

    path_exists: ({ path }) => this.dirs.has(path),

    import_notes_bundle: ({ notes, mode }) => {
      const d = this.dir();
      if (mode === "replace") {
        for (const name of [...d.notes.keys()]) {
          if (isValidNoteFilename(name)) d.notes.delete(name);
        }
      }
      let imported = 0;
      let skipped = 0;
      for (const [filename, content] of Object.entries(notes)) {
        if (!isValidNoteFilename(filename)) {
          skipped++;
          continue;
        }
        if (mode === "merge" && d.notes.has(filename)) {
          skipped++;
          continue;
        }
        d.notes.set(filename, content);
        imported++;
      }
      return { imported, skipped };
    },

    read_agenda_for_date: ({ date }) => titlesForDate(this.agendaJson, date),

    read_agenda_after: ({ afterDate }) => titlesAfterDate(this.agendaJson, afterDate),

    // Mirrors `agenda.rs::agenda_file_exists` — a cheap existence check,
    // deliberately not the fuller `titlesForDate` validation (an
    // existing-but-invalid file still greys the button *in* rather than
    // out, so its own real error surfaces on click).
    agenda_file_exists: () => this.agendaJson !== undefined,
    onedrive_login: () => ({ success: true, account: { email: "test@example.com", displayName: "Test User" }, pending: false }),
    onedrive_logout: () => {},
    onedrive_get_account: () => ({ email: "test@example.com", displayName: "Test User" }),
    onedrive_list_folders: () => [
      { id: "folder-1", name: "Documents" },
      { id: "folder-2", name: "Notes" },
    ],
    onedrive_create_folder: ({ name }) => ({ id: `folder-${Date.now()}`, name }),
    onedrive_set_folder: ({ folderId, folderPath }) => {
      this.oneDriveFolder = { folderId, folderPath };
    },
    onedrive_get_folder: () => this.oneDriveFolder,
    onedrive_exchange_code: () => ({
      success: true,
      account: { email: "test@example.com", displayName: "Test User" },
      pending: false,
    }),
    onedrive_sync_now: () => ({ success: true, message: "Synced" }),
    // Mirrors `sync.rs::list_conflicts` / `resolve_conflict_files`.
    onedrive_get_conflicts: () =>
      [...this.oneDriveConflicts].map(([name, remote]) => ({
        name,
        local: this.dir().notes.get(name) ?? "",
        remote,
      })),
    onedrive_resolve_conflict: ({ name, resolution }) => {
      const remote = this.oneDriveConflicts.get(name);
      if (remote === undefined) throw new Error(`${name} has no sync conflict to resolve`);
      const notes = this.dir().notes;
      if (resolution === "theirs") notes.set(name, remote);
      else if (resolution === "both") {
        notes.set(name, `${(notes.get(name) ?? "").trimEnd()}\n\n--- other version (sync conflict) ---\n${remote}`);
      } else if (resolution !== "mine") throw new Error(`Unknown resolution: ${resolution}`);
      this.oneDriveConflicts.delete(name);
      this.persist();
    },
    onedrive_get_sync_status: () => "idle",
    onedrive_get_advanced_config: () => ({ ...this.oneDriveAdvancedConfig }),
    onedrive_set_advanced_config: ({ config }) => {
      this.oneDriveAdvancedConfig = { ...config };
    },
    save_scratchpad_drafts: ({ drafts }) => {
      this.scratchpadDrafts = { ...drafts };
    },
    load_scratchpad_drafts: () => ({ ...this.scratchpadDrafts }),
    web_check_browser_notes: () => ({ count: 0, filenames: [] }),
    web_migrate_browser_notes: () => ({ migratedCount: 0, conflictCount: 0 }),
    onedrive_prepare_folder_switch: () => ({ ready: true, switched: false, archivedCount: 0 }),
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

      case "plugin:dialog|open": {
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
      case "plugin:updater|check":
        if (this.updateCheck === "available") {
          return {
            rid: 1,
            currentVersion: this.appVersion,
            version: this.updateCheckVersion,
            date: undefined,
            body: "Mock release notes for the test suite.",
            rawJson: {},
          };
        }
        return null;

      case "plugin:updater|download_and_install": {
        const channel = args.onEvent as { onmessage?: (e: unknown) => void } | undefined;
        channel?.onmessage?.({ event: "Started", data: { contentLength: 1000 } });
        channel?.onmessage?.({ event: "Progress", data: { chunkLength: 600 } });
        channel?.onmessage?.({ event: "Progress", data: { chunkLength: 400 } });
        channel?.onmessage?.({ event: "Finished" });
        return null;
      }

      // Rust's `install_update` (update_install.rs): same idea as the plugin's
      // download_and_install above, with its own (camelCase) event names.
      case "install_update": {
        const channel = args.onEvent as { onmessage?: (e: unknown) => void } | undefined;
        channel?.onmessage?.({ event: "started", data: { contentLength: 1000 } });
        channel?.onmessage?.({ event: "progress", data: { chunkLength: 600 } });
        channel?.onmessage?.({ event: "progress", data: { chunkLength: 400 } });
        channel?.onmessage?.({ event: "finished" });
        channel?.onmessage?.({ event: "launching" });
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
        if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) {
          return mockWindowCall(cmd);
        }
        // Unknown command — don't throw (that would surface as an unhandled
        // rejection and fail a test for the wrong reason); log loudly.
        console.warn(`[mockBackend] unhandled invoke: ${cmd}`, args);
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

/** Benign answers for the window-introspection calls
 * `initWindowChromeWatcher` / `notesDir.subscribe(setTitle)` make. */
function mockWindowCall(cmd: string): unknown {
  const method = cmd.split("|")[1] ?? "";
  switch (method) {
    case "is_fullscreen":
    case "is_maximized":
    case "is_minimized":
    case "is_focused":
      return false;
    case "inner_size":
    case "outer_size":
      return { width: 1100, height: 720 };
    case "scale_factor":
      return 1;
    case "theme":
      return "light";
    case "set_title":
    default:
      return null;
  }
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
  const backend = MockBackend.tryHydrate() ?? new MockBackend(seed ?? window.__CHRONO_SEED__ ?? {});

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
