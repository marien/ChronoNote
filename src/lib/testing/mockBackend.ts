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
 * dropped from `vite build` output — verified by the
 * `tests/e2e/prod-build.spec.ts`-style grep in CI / the build check.
 *
 * Parity note: the command semantics here must track
 * `src-tauri/src/storage.rs`. The behaviours mirrored deliberately:
 *   - `is_valid_note_filename` — exactly `YYYY-MM-DD.txt`; anything else
 *     makes `read_note`/`write_note` reject (this is the path-traversal
 *     guard, and tests assert on it).
 *   - `set_notes_dir` -> `push_recent_notes_dir` — old dir goes to the
 *     front of `recent_notes_dirs`, new dir is removed from it, deduped,
 *     capped at 5.
 *   - `read_note` returns `null` (not an error) for a missing file.
 *   - the session file lives *inside* the notes dir and is never returned
 *     by `list_note_files` / `read_all_notes`.
 */
import type { AppConfig, ColorMode, TabSession } from "../types";

export interface MockSeed {
  /** Path used as the active notes directory. Default `/notes`. */
  notesDir?: string;
  /** `filename -> contents` for the active notes directory. */
  notes?: Record<string, string>;
  /** Saved tab session for the active directory, or `null` for none. */
  session?: TabSession | null;
  colorMode?: ColorMode;
  /** Seeds `recent_notes_dirs` directly (normally only `set_notes_dir`
   * writes it). */
  recentNotesDirs?: string[];
  /** Extra directories the user can switch into, `path -> (filename ->
   * contents)`. Their session, if any, is under `sessions`. */
  otherDirs?: Record<string, Record<string, string>>;
  sessions?: Record<string, TabSession>;
  /** Reported by `plugin:app|version` / the About drawer. Default `0.3.0`. */
  appVersion?: string;
}

interface MockDir {
  notes: Map<string, string>;
  session: TabSession | null;
}

const MAX_RECENT = 5;
const NOTE_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.txt$/;

/** Commands that change persisted state — after these, snapshot to
 * `sessionStorage` so a reload sees the same "disk". */
const MUTATING_COMMANDS = new Set(["set_notes_dir", "set_color_mode", "write_note", "write_tab_session"]);

function isValidNoteFilename(name: string): boolean {
  // Mirrors storage.rs::is_valid_note_filename — length + shape check,
  // which is also what stops `../` and absolute paths.
  return name.length === 14 && NOTE_FILENAME_RE.test(name);
}

export interface InvokeLogEntry {
  cmd: string;
  args: unknown;
  at: number;
}

export class MockBackend {
  dirs = new Map<string, MockDir>();
  notesDir: string;
  colorMode: ColorMode;
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
  };

  private eventListenerId = 0;

  constructor(seed: MockSeed = {}) {
    this.notesDir = seed.notesDir ?? "/notes";
    this.colorMode = seed.colorMode ?? "grayscale";
    this.recentNotesDirs = seed.recentNotesDirs ? [...seed.recentNotesDirs] : [];
    this.appVersion = seed.appVersion ?? "0.3.0";

    this.dirs.set(this.notesDir, {
      notes: new Map(Object.entries(seed.notes ?? {})),
      session: seed.session ?? null,
    });
    for (const [path, notes] of Object.entries(seed.otherDirs ?? {})) {
      this.dirs.set(path, {
        notes: new Map(Object.entries(notes)),
        session: seed.sessions?.[path] ?? null,
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
      recentNotesDirs: this.recentNotesDirs,
      appVersion: this.appVersion,
      dirs: [...this.dirs].map(([path, d]) => [path, [...d.notes], d.session]),
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
        recentNotesDirs: string[];
        appVersion: string;
        dirs: [string, [string, string][], TabSession | null][];
      };
      const b = new MockBackend();
      b.notesDir = s.notesDir;
      b.colorMode = s.colorMode;
      b.recentNotesDirs = s.recentNotesDirs;
      b.appVersion = s.appVersion;
      b.dirs = new Map(s.dirs.map(([path, notes, session]) => [path, { notes: new Map(notes), session }]));
      return b;
    } catch {
      return null;
    }
  }

  private dir(path = this.notesDir): MockDir {
    let d = this.dirs.get(path);
    if (!d) {
      d = { notes: new Map(), session: null };
      this.dirs.set(path, d);
    }
    return d;
  }

  private config(): AppConfig {
    return {
      notesDir: this.notesDir,
      colorMode: this.colorMode,
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

  // --- the invoke dispatcher -------------------------------------------

  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.invokeLog.push({ cmd, args, at: Date.now() });
    const out = await this.dispatch(cmd, args);
    if (MUTATING_COMMANDS.has(cmd)) this.persist();
    return out;
  }

  private async dispatch(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    switch (cmd) {
      case "get_config":
        return this.config();

      case "set_notes_dir": {
        const path = String(args.path);
        if (path !== this.notesDir) {
          pushRecentNotesDir(this.recentNotesDirs, this.notesDir, path);
        }
        this.notesDir = path;
        this.dir(path); // materialise if brand-new
        return this.config();
      }

      case "set_color_mode":
        this.colorMode = args.mode === "color" ? "color" : "grayscale";
        return this.config();

      case "list_note_files":
        return this.listFiles();

      case "read_note": {
        const filename = String(args.filename);
        if (!isValidNoteFilename(filename)) {
          throw new Error(`Invalid note filename: ${filename}`);
        }
        return this.dir().notes.get(filename) ?? null;
      }

      case "write_note": {
        const filename = String(args.filename);
        if (!isValidNoteFilename(filename)) {
          throw new Error(`Invalid note filename: ${filename}`);
        }
        this.dir().notes.set(filename, String(args.content));
        return null;
      }

      case "read_all_notes":
        return this.listFiles().map((f) => [f, this.dir().notes.get(f) ?? ""] as [string, string]);

      case "read_tab_session":
        return this.dir().session;

      case "write_tab_session": {
        this.dir().session = {
          openTabs: (args.openTabs as string[]) ?? [],
          activeTab: (args.activeTab as string | null) ?? null,
        };
        return null;
      }

      case "path_exists":
        return this.dirs.has(String(args.path));

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

      case "plugin:event|listen":
        return ++this.eventListenerId;
      case "plugin:event|unlisten":
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

  window.__CHRONO_MOCK__ = backend;
  return backend;
}
