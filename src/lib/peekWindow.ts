/** Native window handling for Peek mode (the compact, see-through note window for calls).
 *
 * Peek is the SAME window as the full app, shrunk: it keeps one webview, one set of stores, one editor, so every edit
 * is a normal edit with normal autosave. This module only moves/sizes the window and flips always-on-top and
 * transparency; it remembers where the full window was and puts it back exactly. Everything runs through one queue so
 * a quick double toggle cannot interleave, and nothing here ever rejects (a window error must not break the app).
 * Sizes and positions are PHYSICAL pixels (what the OS reports), minimum sizes are LOGICAL. */

import { peekDockBottom, peekDockState, peekLog, peekSetBounds, peekSetTransparent, peekUndock } from "./tauriApi";

/** §404: what the native side holds (Rust `peek_dock_state`). */
export interface DockState {
  docked: boolean;
  registered: boolean;
  lostPending: boolean;
  window: [number, number, number, number] | null;
  work: [number, number, number, number] | null;
  monitors: number;
}

/** §404: "event" = written to the app log at once; "detail" = the flight recorder (memory, written out when something
 * looks wrong); "warn" = a problem found (and repaired); "dump" = write the flight recorder out now. */
export type PeekLogKind = "event" | "detail" | "warn" | "dump";

const fmtG = (g: PeekGeometry | null | undefined) => (g ? `[${g.x},${g.y} ${g.width}x${g.height}]` : "none");

export interface PeekGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One monitor's usable area (the screen minus the taskbar), in physical pixels. */
export interface MonitorArea {
  work: PeekGeometry;
  /** The monitor the app window is on now. */
  current: boolean;
  /** Its scale factor (Windows display scaling: 1.25 = 125 %). Unknown = the window's own. */
  scale?: number;
}

/** At least this share of the window's own area has to be on a monitor for a remembered position to count as still
 * usable (a laptop that has left its docking station takes the second screen with it). */
const MIN_VISIBLE_SHARE = 0.4;

const overlap = (a: PeekGeometry, b: PeekGeometry): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

/** `g` moved fully inside `work` (and shrunk if it is bigger than it). */
function insideWork(g: PeekGeometry, work: PeekGeometry): PeekGeometry {
  const width = Math.min(g.width, work.width);
  const height = Math.min(g.height, work.height);
  return {
    x: clamp(g.x, work.x, work.x + work.width - width),
    y: clamp(g.y, work.y, work.y + work.height - height),
    width,
    height,
  };
}

/** The monitor most of `g` is on (null when it is on none). */
export function monitorOf(g: PeekGeometry, monitors: MonitorArea[]): MonitorArea | null {
  let best: MonitorArea | null = null;
  let bestOverlap = 0;
  for (const m of monitors) {
    const o = overlap(g, m.work);
    if (o > bestOverlap) {
      best = m;
      bestOverlap = o;
    }
  }
  return best;
}

/** A remembered window position, made safe for the monitors there are NOW: kept (nudged fully inside that monitor's
 * work area) when enough of it is on a monitor, `null` when it is not (its monitor is gone, or the layout changed). */
export function fitToMonitors(g: PeekGeometry, monitors: MonitorArea[]): PeekGeometry | null {
  let best: MonitorArea | null = null;
  let bestOverlap = 0;
  for (const m of monitors) {
    const o = overlap(g, m.work);
    if (o > bestOverlap) {
      best = m;
      bestOverlap = o;
    }
  }
  if (!best || bestOverlap < g.width * g.height * MIN_VISIBLE_SHARE) return null;
  return insideWork(g, best.work);
}

/** §404: whether the window's title bar can be reached: the middle of its top edge (a little below it) lies on a
 * monitor's work area. A window that hangs a little off the bottom or a side is fine; one whose title bar is off screen
 * cannot be dragged back. */
export function titleBarReachable(g: PeekGeometry, monitors: MonitorArea[]): boolean {
  const px = g.x + g.width / 2;
  const py = g.y + Math.min(16, g.height / 2);
  return monitors.some((m) => px >= m.work.x && px < m.work.x + m.work.width && py >= m.work.y && py < m.work.y + m.work.height);
}

/** Where Peek opens when there is no usable remembered position: centred horizontally on the current monitor, just above
 * the taskbar (the bottom of the work area), `margin` pixels clear of it. */
export function defaultPeekGeometry(
  size: { width: number; height: number },
  monitors: MonitorArea[],
  margin: number,
): PeekGeometry | null {
  const mon = monitors.find((m) => m.current) ?? monitors[0];
  if (!mon) return null;
  const { work } = mon;
  const width = Math.min(size.width, work.width);
  const height = Math.min(size.height, work.height);
  return {
    x: work.x + Math.round((work.width - width) / 2),
    y: Math.max(work.y, work.y + work.height - height - margin),
    width,
    height,
  };
}

/** The bits of Tauri's window this needs (fakes in the unit test). */
export interface PeekWin {
  outerPosition(): Promise<{ x: number; y: number }>;
  /** Content size (what `setBounds` sets). The outer size includes the invisible resize border, so using it to
   * remember and restore a size made the window grow a little on every Peek round trip. */
  size(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
  /** Every monitor's work area (the screen minus the taskbar), physical pixels, and which one the window is on. Empty
   * when unknown. */
  monitors(): Promise<MonitorArea[]>;
  isMaximized(): Promise<boolean>;
  setMaximized(on: boolean): Promise<void>;
  setMinSize(logicalWidth: number, logicalHeight: number): Promise<void>;
  setBounds(g: PeekGeometry): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  reveal(): Promise<void>;
  /** Rust `peek_set_transparent`: clear (true) or restore (false) the opaque colour under the page. */
  setTransparent(on: boolean): Promise<void>;
  /** §393: Rust `peek_dock_bottom`: reserve a strip `height` physical pixels tall along the bottom of the window's
   * monitor (an AppBar) and fill it; resolves to the strip. Rejects where docking is not available. */
  dockBottom(height: number): Promise<PeekGeometry>;
  /** Rust `peek_undock`: give the strip back. */
  undock(): Promise<void>;
  /** §405: whether Windows has the window minimized (optional: treated as not minimized when absent). */
  isMinimized?(): Promise<boolean>;
  /** §404: Rust `peek_dock_state`; null where there is no native side. */
  dockState?(): Promise<DockState | null>;
  /** §404: Rust `peek_log`. */
  log?(kind: PeekLogKind, message: string): void;
}

export const PEEK_MIN_LOGICAL = { width: 240, height: 80 };
export const FULL_MIN_LOGICAL = { width: 500, height: 420 };

export interface PeekEnterOptions {
  /** Where the compact window was last left; null = first time. */
  geometry: PeekGeometry | null;
  /** Logical size to use when there is no remembered geometry, and the height to force (fit-to-section mode). */
  logicalWidth: number;
  logicalHeight: number;
  /** Ignore the remembered height and use `logicalHeight` (the "lines" setting or fit-to-section). */
  forceHeight: boolean;
  alwaysOnTop: boolean;
  /** §393: dock to the bottom of the screen at this logical height instead of floating. */
  dockLogicalHeight?: number;
  /** Where Peek was last docked: docking goes to that screen while it is there (#187). */
  dockGeometry?: PeekGeometry | null;
}

export function createPeekWindowController(win: PeekWin) {
  let queue: Promise<unknown> = Promise.resolve();
  let full: { geometry: PeekGeometry; maximized: boolean } | null = null;
  /** The strip Peek fills while docked; null when floating (or not in Peek). */
  let docked: PeekGeometry | null = null;

  /** The options Peek was last opened with, for floating it again after a repair (§404). */
  let lastOptions: PeekEnterOptions | null = null;
  /** Where leaving Peek last put the full window, for a repair after leaving (§404). */
  let lastHome: PeekGeometry | null = null;
  /** §405: a lost dock was found while Windows had the window minimized. Moving a minimized window does not change
   * where it comes back on restore (it came back at the strip's place and size), so the float waits for the restore. */
  let floatOnRestore = false;
  /** §407: Windows 11 remembers where a window was in each screen setup and puts it back there when that setup returns
   * (reproduced with Win+P on two screens). The window is one window in two roles, so after leaving Peek the full
   * window came back where Peek had been (on the dock strip, or the floating spot), and Peek could come back where the
   * full window had been. These lists hold the outer rectangles seen this session in each role; landing exactly on a
   * rectangle of the other role is Windows' doing, never the user's. */
  type Rect4 = [number, number, number, number];
  type Seen = { r: Rect4; scale: number };
  const seen = { strips: [] as Seen[], peek: [] as Seen[], home: [] as Seen[] };
  const near = (list: Seen[], r: Rect4, scale: number) =>
    list.some((s) => {
      if (s.r.every((v, i) => Math.abs(v - r[i]) <= 6)) return true;
      // Put back on a screen with other scaling, the size is scaled (a 1938x265 strip at 125 % came back 1550x212 at
      // 100 %) and the place differs: the scaled size is what matches then.
      if (s.scale === scale) return false;
      const k = scale / s.scale;
      return Math.abs((s.r[2] - s.r[0]) * k - (r[2] - r[0])) <= 6 && Math.abs((s.r[3] - s.r[1]) * k - (r[3] - r[1])) <= 6;
    });
  const remember = (list: Seen[], r: Rect4, scale: number) => {
    if (near(list, r, scale)) return;
    list.push({ r, scale });
    if (list.length > 8) list.shift();
  };
  /** The last repair, so a window Windows keeps putting back is not moved back and forth forever. */
  let lastRepair = { key: "", at: 0 };
  /** Whether leaving Peek maximized the full window again. */
  let homeMaximized = false;
  const minimized = async (): Promise<boolean> => (win.isMinimized ? await win.isMinimized().catch(() => false) : false);

  const log = (kind: PeekLogKind, message: string) => {
    try {
      win.log?.(kind, message);
    } catch {
      // logging must never break Peek
    }
  };

  // §404: a failing step used to vanish here silently; now it is logged, and the flight recorder written out with it.
  const run = <T>(name: string, job: () => Promise<T>, fallback: T): Promise<T> => {
    const next = queue.then(job).catch((e) => {
      log("warn", `${name} failed: ${String(e)}`);
      log("dump", `${name} failed`);
      return fallback;
    });
    queue = next;
    return next;
  };

  const currentGeometry = async (): Promise<PeekGeometry> => {
    const [p, s] = await Promise.all([win.outerPosition(), win.size()]);
    return { x: p.x, y: p.y, width: s.width, height: s.height };
  };

  /** The native side docks on the window's screen: first moves the window onto the screen of `at` when that screen is
   * still there and the window is on another one. Done while not docked yet, so a change of scale happens before the
   * dock (a scale change while docked floats Peek, §404). The window keeps its own size and goes to that screen's lower
   * centre: only the screen counts, not the old strip's rectangle, which may not fit a changed layout. Never while
   * minimized (moving a minimized window spoils where it is restored, §405). Resolves to where it was, if it moved. */
  const moveToScreenOf = async (at: PeekGeometry): Promise<PeekGeometry | null> => {
    if (await minimized()) return null;
    const monitors = await win.monitors();
    if (monitors.length === 0) return null;
    const target = monitorOf(at, monitors);
    const before = await currentGeometry();
    if (!target || target === monitorOf(before, monitors)) return null;
    const g = defaultPeekGeometry(before, [target], 0);
    if (!g) return null;
    log("detail", `dock: moving to the screen it was last docked on, ${fmtG(g)}`);
    await win.setBounds(g);
    return before;
  };

  /** Docks at `logicalHeight` (true), or reports that docking is not available here (false). The strip goes on the
   * screen of `at` (where Peek was last docked) when that screen is still there, else on the window's screen (#187). */
  const dockAt = async (logicalHeight: number, at?: PeekGeometry | null): Promise<boolean> => {
    // Best effort: not knowing the screens must never stop the dock itself.
    const movedFrom = at
      ? await moveToScreenOf(at).catch((e) => {
          log("warn", `dock: could not go to the last dock's screen: ${String(e)}`);
          return null;
        })
      : null;
    const scale = (await win.scaleFactor()) || 1;
    try {
      docked = await win.dockBottom(Math.round(logicalHeight * scale));
      log("detail", `docked: strip ${fmtG(docked)}`);
      return true;
    } catch (e) {
      log("event", `docking not possible, floating instead: ${String(e)}`);
      docked = null;
      // Not left on the other screen: back where it was (review of §435).
      if (movedFrom) await win.setBounds(movedFrom);
      return false;
    }
  };

  /** §404: compares what this controller believes with what the native side holds, and repairs a mismatch (the "half
   * docked" states: the page floating while the native side still holds the window to a strip, or the other way
   * round). Runs inside a queued job, after each transition. */
  const readNative = async (): Promise<DockState | null> => {
    if (!win.dockState) return null;
    let native = await win.dockState().catch(() => null);
    // A screen change was just found: the native side undocks within a moment. Wait for it rather than skip the check:
    // the event that announces it is ignored while a transition is still on its way (review of §404).
    for (let i = 0; i < 10 && native?.lostPending; i++) {
      await new Promise((r) => setTimeout(r, 100));
      native = await win.dockState().catch(() => null);
    }
    return native;
  };

  const verify = async (after: string): Promise<void> => {
    const native = await readNative();
    if (!native) return;
    log("detail", `check after ${after}: page ${full ? (docked ? "docked" : "floating") : "not in Peek"}, native ${JSON.stringify(native)}`);
    if (native.lostPending) return; // still undocking after a second: the next check will see it
    if (floatOnRestore && full && !docked && !native.docked && !(await minimized())) {
      floatOnRestore = false;
      log("event", "restored after the screens changed: placing the floating window");
      if (lastOptions) await placeFloating(lastOptions);
      return;
    }
    const w = native.window;
    // Peek is never maximized, so a maximized window is neither a landing to repair nor a place to remember.
    const maximized = await win.isMaximized().catch(() => false);
    const shown = !!w && !(await minimized()) && !maximized;
    const scale = (await win.scaleFactor()) || 1;
    if (w && shown && !native.docked) {
      const key = w.join(",");
      const again = key === lastRepair.key && Date.now() - lastRepair.at < 3000;
      const onStrip = near(seen.strips, w, scale);
      const onHome = near(seen.home, w, scale) && !near(seen.peek, w, scale);
      if (!again && full && !docked && lastOptions && (onStrip || onHome)) {
        lastRepair = { key, at: Date.now() };
        log("warn", `after ${after}: Windows put Peek back where ${onStrip ? "its dock strip" : "the full window"} was in an earlier screen setup; placing it as floating`);
        log("dump", `old place after ${after}`);
        await placeFloating(lastOptions);
        return;
      }
      if (!again && !full && lastHome && near(seen.peek, w, scale) && !near(seen.home, w, scale)) {
        lastRepair = { key, at: Date.now() };
        const monitors = await win.monitors();
        const home = (monitors.length ? fitToMonitors(lastHome, monitors) : lastHome) ?? defaultPeekGeometry(lastHome, monitors, 0) ?? lastHome;
        log("warn", `after ${after}: Windows put the full window back where Peek was in an earlier screen setup; moved it back to ${fmtG(home)}`);
        log("dump", `old place after ${after}`);
        await win.setBounds(home);
        if (homeMaximized) await win.setMaximized(true);
        return;
      }
    }
    if (w && shown) {
      if (native.docked) remember(seen.strips, w, scale);
      if (full || native.docked) remember(seen.peek, w, scale);
      else remember(seen.home, w, scale);
      // Where the user has moved it since is where it belongs now (review of §407): a later repair goes there.
      // Only when nothing changed between the two reads: a dock made in between (the window already on its strip, the
      // native state read just before) must not become the floating place (CI caught that race).
      if (!native.docked && ((full && !docked && lastOptions) || (!full && lastHome))) {
        const g = await currentGeometry();
        const again = win.dockState ? await win.dockState().catch(() => null) : null;
        const same = !!again && !again.docked && !!again.window && again.window.every((v, i) => v === w[i]);
        if (same && full && lastOptions) lastOptions = { ...lastOptions, geometry: g };
        if (same && !full) {
          lastHome = g;
          homeMaximized = false;
        }
      }
    } else if (!full && maximized && lastHome) homeMaximized = true;
    if (native.docked && !(full && docked)) {
      log("warn", `after ${after}: the native side still held a dock the page did not know about; released it`);
      log("dump", `half docked after ${after}`);
      await win.undock();
      // The window may have been held at the strip's size: put it back where it belongs now.
      if (full && lastOptions) await placeFloating(lastOptions);
      else if (!full && lastHome) await win.setBounds(lastHome);
    } else if (!native.docked && full && docked) {
      log("warn", `after ${after}: the page thought Peek was docked but the native side was not; floating it`);
      log("dump", `half docked after ${after}`);
      docked = null;
      if (await minimized()) {
        floatOnRestore = true;
        log("event", "the window is minimized: it floats when it is restored");
      } else if (lastOptions) await placeFloating(lastOptions);
    }
  };

  /** §404: after leaving Peek, the full window must be on a screen (it once vanished after a docking station change). */
  const ensureOnScreen = async (): Promise<void> => {
    const monitors = await win.monitors();
    if (monitors.length === 0) return;
    const now = await currentGeometry();
    // Fine when mostly on a screen with its title bar reachable. Otherwise: pulled fully inside the screen it is mostly
    // on, or, when it is mostly off every screen, to the default place on the current one.
    const fit = fitToMonitors(now, monitors);
    if (fit && titleBarReachable(now, monitors)) return;
    const home = fit ?? defaultPeekGeometry(now, monitors, 0);
    log("warn", `the window was ${fit ? "partly off screen (title bar out of reach)" : "off screen"} at ${fmtG(now)}; moved it to ${fmtG(home)}`);
    log("dump", "window off screen");
    if (home) {
      lastHome = home;
      await win.setBounds(home);
    }
  };

  /** Places the floating compact window: where it was last left if that is still on a screen; else the lower centre of
   * the current monitor, just above the taskbar. */
  const placeFloating = async (o: PeekEnterOptions): Promise<void> => {
    const scale = (await win.scaleFactor()) || 1;
    const h = Math.round(o.logicalHeight * scale);
    const monitors = await win.monitors();
    let g: PeekGeometry | null = null;
    if (o.geometry) {
      const wanted = { ...o.geometry, height: o.forceHeight ? h : o.geometry.height };
      g = monitors.length > 0 ? fitToMonitors(wanted, monitors) : wanted;
    }
    if (!g) {
      const size = {
        width: o.geometry?.width ?? Math.round(o.logicalWidth * scale),
        height: o.forceHeight ? h : (o.geometry?.height ?? h),
      };
      g =
        defaultPeekGeometry(size, monitors, Math.round(12 * scale)) ?? {
          x: full!.geometry.x,
          y: full!.geometry.y,
          ...size,
        };
    }
    // A forced height (fit-to-section, the lines setting) is logical, so it has to be converted with the scale of
    // the monitor Peek goes to, which is not the full window's when they are on screens with different scaling.
    const target = monitorOf(g, monitors);
    if (o.forceHeight && target?.scale && target.scale !== scale) {
      g = insideWork({ ...g, height: Math.round(o.logicalHeight * target.scale) }, target.work);
    }
    await win.setBounds(g);
  };

  return {
    enter(o: PeekEnterOptions): Promise<void> {
      return run("enter", async () => {
        floatOnRestore = false;
        lastOptions = o;
        if (!full) {
          // A maximized window only reveals the size it will have when restored once it IS restored. Reading its
          // geometry while maximized would record the screen-sized rectangle, and putting that back before
          // maximizing again would make it the size "restore" goes to afterwards.
          const maximized = await win.isMaximized();
          if (maximized) await win.setMaximized(false);
          full = { geometry: await currentGeometry(), maximized };
          const before = win.dockState ? await win.dockState().catch(() => null) : null;
          if (before?.window && !before.docked) remember(seen.home, before.window, (await win.scaleFactor()) || 1);
        }
        log("event", `enter Peek: full window ${fmtG(full.geometry)}${full.maximized ? " (maximized)" : ""}, ${o.dockLogicalHeight === undefined ? "floating" : `docked at ${o.dockLogicalHeight}`}`);
        await win.setTransparent(true);
        await win.setMinSize(PEEK_MIN_LOGICAL.width, PEEK_MIN_LOGICAL.height);
        if (o.dockLogicalHeight === undefined || !(await dockAt(o.dockLogicalHeight, o.dockGeometry))) await placeFloating(o);
        await win.setAlwaysOnTop(o.alwaysOnTop);
        await win.reveal();
        log("detail", `entered: window ${fmtG(await currentGeometry())}`);
        await verify("enter");
      }, undefined);
    },

    /** §396: while in Peek, switch to docked. Resolves to the floating geometry it had (to remember for the way back),
     * or null when it was not floating or docking is not available. */
    dock(logicalHeight: number, alwaysOnTop: boolean, at?: PeekGeometry | null): Promise<PeekGeometry | null> {
      return run("dock", async () => {
        floatOnRestore = false;
        if (!full || docked) return null;
        const floating = await currentGeometry();
        log("event", `dock button: floating window was ${fmtG(floating)}`);
        if (!(await dockAt(logicalHeight, at))) return null;
        await win.setAlwaysOnTop(alwaysOnTop);
        await win.reveal();
        await verify("dock");
        return floating;
      }, null);
    },

    /** §396: while in Peek, switch from docked to floating, placed like a floating Peek opens. Also used when the
     * native side reports the dock lost (§398): the strip is already given back then, and the undock is a no-op. */
    float(o: PeekEnterOptions): Promise<void> {
      return run("float", async () => {
        if (!full || !docked) return;
        floatOnRestore = false;
        docked = null;
        await win.undock();
        await placeFloating(o);
        await win.setAlwaysOnTop(o.alwaysOnTop);
        await win.reveal();
        const now = await currentGeometry();
        log("event", `float: window ${fmtG(now)}`);
        await verify("float");
      }, undefined);
    },

    /** Puts the full window back; resolves to the compact geometry it had (to remember), or null. */
    leave(): Promise<PeekGeometry | null> {
      return run("leave", async () => {
        floatOnRestore = false;
        if (!full) return null;
        const compact = await currentGeometry();
        const back = full;
        full = null;
        const wasDocked = docked !== null;
        docked = null;
        // §404: give the strip back whenever the native side still holds it, also when the page had lost track (the
        // window kept the strip's size after leaving).
        const native = win.dockState ? await win.dockState().catch(() => null) : null;
        if (wasDocked || native?.docked) {
          if (!wasDocked) log("warn", "leave: the native side still held a dock the page did not know about");
          await win.undock();
        }
        await win.setAlwaysOnTop(false);
        await win.setTransparent(false);
        await win.setMinSize(FULL_MIN_LOGICAL.width, FULL_MIN_LOGICAL.height);
        // The screen the full window was on may be gone (a laptop undocked during the call): bring it back onto one.
        const monitors = await win.monitors();
        // Exactly where it was if enough of it is still on a screen; else onto the current one.
        // Exactly where it was when it is mostly on a screen with its title bar reachable; pulled fully inside that
        // screen when the title bar is out of reach (§404); onto the current screen when its own is gone.
        const fitted = monitors.length === 0 ? back.geometry : fitToMonitors(back.geometry, monitors);
        const onScreen = fitted !== null;
        const reachable = monitors.length === 0 || titleBarReachable(back.geometry, monitors);
        const home = fitted
          ? reachable
            ? back.geometry
            : fitted
          : (defaultPeekGeometry(back.geometry, monitors, 0) ?? back.geometry);
        lastHome = home;
        homeMaximized = back.maximized;
        await win.setBounds(home);
        if (back.maximized) await win.setMaximized(true);
        await win.reveal();
        log(
          "event",
          `leave Peek: ${wasDocked ? "was docked" : `was floating at ${fmtG(compact)}`}; full window back at ${fmtG(home)}${onScreen ? "" : " (its old screen is gone)"}${back.maximized ? ", maximized" : ""}`,
        );
        if (!back.maximized) await ensureOnScreen();
        await verify("leave");
        // A docked strip is not a floating position to come back to.
        return wasDocked ? null : compact;
      }, null);
    },

    /** Whether Peek is docked now. */
    isDocked(): boolean {
      return docked !== null;
    },

    /** The strip Peek is docked to now (to remember where it was docked), else null. */
    dockStrip(): PeekGeometry | null {
      return docked;
    },

    /** §404: run the consistency check now (Peek calls it when Windows moves or rescales the window, which is what
     * happens during a docking-station change). */
    check(reason: string): Promise<void> {
      return run("check", async () => {
        // Outside Peek only once Peek has been used this session (§407): the full window can land where Peek was.
        if (full || seen.peek.length > 0) await verify(reason);
      }, undefined);
    },

    /** Height changed by a setting or by the section growing: keep position and width. */
    setLogicalHeight(logicalHeight: number): Promise<void> {
      return run("set height", async () => {
        // Docked, the strip keeps its own height (dragged by its top edge).
        if (!full || docked) return;
        const [g, scale] = [await currentGeometry(), (await win.scaleFactor()) || 1];
        await win.setBounds({ ...g, height: Math.round(logicalHeight * scale) });
      }, undefined);
    },

    setAlwaysOnTop(on: boolean): Promise<void> {
      return run("always on top", async () => {
        if (full) await win.setAlwaysOnTop(on);
      }, undefined);
    },

    /** The compact window's current geometry while in Peek (for remembering), else null. */
    snapshot(): Promise<PeekGeometry | null> {
      return run("snapshot", async () => (full ? await currentGeometry() : null), null);
    },
  };
}

/** The real thing, on the desktop app. */
export async function nativePeekWindow(): Promise<PeekWin> {
  const { getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor } = await import(
    "@tauri-apps/api/window"
  );
  const w = getCurrentWindow();
  return {
    outerPosition: () => w.outerPosition(),
    size: () => w.innerSize(),
    scaleFactor: () => w.scaleFactor(),
    monitors: async () => {
      const [all, now] = await Promise.all([availableMonitors(), currentMonitor()]);
      return all.map((m) => ({
        work: { x: m.workArea.position.x, y: m.workArea.position.y, width: m.workArea.size.width, height: m.workArea.size.height },
        current: !!now && now.position.x === m.position.x && now.position.y === m.position.y,
        scale: m.scaleFactor,
      }));
    },
    isMaximized: () => w.isMaximized(),
    isMinimized: () => w.isMinimized(),
    setMaximized: (on) => (on ? w.maximize() : w.unmaximize()),
    setMinSize: (width, height) => w.setMinSize(new LogicalSize(width, height)),
    setBounds: async (g) => {
      // One native call (Windows): size and position change together, nothing in between is ever shown.
      try {
        await peekSetBounds(g.x, g.y, g.width, g.height);
        return;
      } catch {
        // fall through to the two-call version below
      }
      await w.setSize(new PhysicalSize(g.width, g.height));
      // An undecorated window comes out a little larger than asked (the invisible resize border is added on top),
      // which made it grow on every Peek round trip. Read it back and take the difference off once.
      const got = await w.innerSize();
      if (got.width !== g.width || got.height !== g.height) {
        await w.setSize(new PhysicalSize(Math.max(1, 2 * g.width - got.width), Math.max(1, 2 * g.height - got.height)));
      }
      await w.setPosition(new PhysicalPosition(g.x, g.y));
    },
    setAlwaysOnTop: (on) => w.setAlwaysOnTop(on),
    reveal: async () => {
      await w.unminimize();
      await w.show();
      await w.setFocus();
    },
    setTransparent: async (on) => {
      // Restoring needs the real theme colour; probe `--bg` as the browser resolves it.
      const probe = document.createElement("div");
      probe.style.background = "var(--bg)";
      document.body.appendChild(probe);
      const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(probe).backgroundColor);
      probe.remove();
      const [r, g, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0x1e, 0x1e, 0x1e];
      await peekSetTransparent(on, r, g, b);
    },
    dockBottom: (height) => peekDockBottom(height),
    undock: () => peekUndock(),
    dockState: () => peekDockState(),
    log: (kind, message) => {
      void peekLog(kind, message).catch(() => {});
    },
  };
}
