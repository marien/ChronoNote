/** In-memory Tauri backend for running ChronoNote's real frontend in a
 * plain browser (Playwright, or `npm run dev` + `?mock` by hand).
 *
 * The frontend talks to Rust exclusively through
 * `window.__TAURI_INTERNALS__.invoke(cmd, args)` (see `src/lib/tauriApi.ts`
 * and the plugin packages). This module installs a stand-in for that
 * object backed by a `Map` of note files, implementing every command in
 * `src-tauri/src/lib.rs` plus the handful of plugin calls the app makes
 * (`plugin:app|version`, `plugin:dialog|open`, `plugin:opener|open_url`,
 * `plugin:event|*`, `plugin:window|*`).
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
import type { AppConfig, ColorMode, FileMetadata, TabSession } from "../types";
import type { CommandArgs, CommandReturn, TauriCommand, TauriCommands } from "../tauriCommands";

export interface MockSeed {
  /** Path used as the active notes directory. Default `/notes`. */
  notesDir?: string;
  /** `filename -> contents` for the active notes directory. */
  notes?: Record<string, string>;
  /** Saved tab session for the active directory, or `null` for none. */
  session?: TabSession | null;
  colorMode?: ColorMode;
  wordWrap?: boolean;
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
   * degraded-boot / failure paths (e.g. `["get_config"]`). */
  throwOnCommands?: string[];
}

interface MockDir {
  notes: Map<string, string>;
  session: TabSession | null;
  /** `.chrononote-conflicts/<name>` copies written by `write_conflict_copy`
   * (§94). Kept separate from `notes` so they never surface as note files. */
  conflictCopies: Map<string, string>;
}

const MAX_RECENT = 5;
const NOTE_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.txt$/;
const CONFLICTS_DIRNAME = ".chrononote-conflicts";

/** Commands that change persisted state — after these, snapshot to
 * `sessionStorage` so a reload sees the same "disk". */
const MUTATING_COMMANDS = new Set([
  "set_notes_dir",
  "set_color_mode",
  "set_word_wrap",
  "write_note",
  "write_conflict_copy",
  "write_tab_session",
]);

function isValidNoteFilename(name: string): boolean {
  // Mirrors storage.rs::is_valid_note_filename — length + shape check,
  // which is also what stops `../` and absolute paths.
  return name.length === 14 && NOTE_FILENAME_RE.test(name);
}

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
  wordWrap: boolean;
  recentNotesDirs: string[];
  appVersion: string;

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

  constructor(seed: MockSeed = {}) {
    this.notesDir = seed.notesDir ?? "/notes";
    this.colorMode = seed.colorMode ?? "grayscale";
    this.wordWrap = seed.wordWrap ?? false;
    this.recentNotesDirs = seed.recentNotesDirs ? [...seed.recentNotesDirs] : [];
    this.appVersion = seed.appVersion ?? "0.3.0";
    this.throwOnCommands = new Set(seed.throwOnCommands ?? []);

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
      wordWrap: this.wordWrap,
      recentNotesDirs: this.recentNotesDirs,
      appVersion: this.appVersion,
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
        wordWrap?: boolean;
        recentNotesDirs: string[];
        appVersion: string;
        dirs: [string, [string, string][], TabSession | null, [string, string][]?][];
      };
      const b = new MockBackend();
      b.notesDir = s.notesDir;
      b.colorMode = s.colorMode;
      b.wordWrap = s.wordWrap ?? false;
      b.recentNotesDirs = s.recentNotesDirs;
      b.appVersion = s.appVersion;
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
      wordWrap: this.wordWrap,
      recentNotesDirs: [...this.recentNotesDirs],
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

    set_word_wrap: ({ enabled }) => {
      this.wordWrap = enabled;
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
