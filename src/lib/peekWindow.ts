/** Native window handling for Peek mode (the compact, see-through note window for calls).
 *
 * Peek is the SAME window as the full app, shrunk: it keeps one webview, one set of stores, one editor, so every edit
 * is a normal edit with normal autosave. This module only moves/sizes the window and flips always-on-top and
 * transparency; it remembers where the full window was and puts it back exactly. Everything runs through one queue so
 * a quick double toggle cannot interleave, and nothing here ever rejects (a window error must not break the app).
 * Sizes and positions are PHYSICAL pixels (what the OS reports), minimum sizes are LOGICAL. */

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
}

export function createPeekWindowController(win: PeekWin) {
  let queue: Promise<unknown> = Promise.resolve();
  let full: { geometry: PeekGeometry; maximized: boolean } | null = null;

  const run = <T>(job: () => Promise<T>, fallback: T): Promise<T> => {
    const next = queue.then(job).catch(() => fallback);
    queue = next;
    return next;
  };

  const currentGeometry = async (): Promise<PeekGeometry> => {
    const [p, s] = await Promise.all([win.outerPosition(), win.size()]);
    return { x: p.x, y: p.y, width: s.width, height: s.height };
  };

  return {
    enter(o: PeekEnterOptions): Promise<void> {
      return run(async () => {
        if (!full) {
          // A maximized window only reveals the size it will have when restored once it IS restored. Reading its
          // geometry while maximized would record the screen-sized rectangle, and putting that back before
          // maximizing again would make it the size "restore" goes to afterwards.
          const maximized = await win.isMaximized();
          if (maximized) await win.setMaximized(false);
          full = { geometry: await currentGeometry(), maximized };
        }
        await win.setTransparent(true);
        await win.setMinSize(PEEK_MIN_LOGICAL.width, PEEK_MIN_LOGICAL.height);
        const scale = (await win.scaleFactor()) || 1;
        const h = Math.round(o.logicalHeight * scale);
        const monitors = await win.monitors();
        // The remembered position if it is still on a screen; else the lower centre of the current monitor, just above
        // the taskbar.
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
              x: full.geometry.x,
              y: full.geometry.y,
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
        await win.setAlwaysOnTop(o.alwaysOnTop);
        await win.reveal();
      }, undefined);
    },

    /** Puts the full window back; resolves to the compact geometry it had (to remember), or null. */
    leave(): Promise<PeekGeometry | null> {
      return run(async () => {
        if (!full) return null;
        const compact = await currentGeometry();
        const back = full;
        full = null;
        await win.setAlwaysOnTop(false);
        await win.setTransparent(false);
        await win.setMinSize(FULL_MIN_LOGICAL.width, FULL_MIN_LOGICAL.height);
        // The screen the full window was on may be gone (a laptop undocked during the call): bring it back onto one.
        const monitors = await win.monitors();
        // Exactly where it was if enough of it is still on a screen; else onto the current one.
        const onScreen = monitors.length === 0 || fitToMonitors(back.geometry, monitors) !== null;
        const home = onScreen ? back.geometry : (defaultPeekGeometry(back.geometry, monitors, 0) ?? back.geometry);
        await win.setBounds(home);
        if (back.maximized) await win.setMaximized(true);
        await win.reveal();
        return compact;
      }, null);
    },

    /** Height changed by a setting or by the section growing: keep position and width. */
    setLogicalHeight(logicalHeight: number): Promise<void> {
      return run(async () => {
        if (!full) return;
        const [g, scale] = [await currentGeometry(), (await win.scaleFactor()) || 1];
        await win.setBounds({ ...g, height: Math.round(logicalHeight * scale) });
      }, undefined);
    },

    setAlwaysOnTop(on: boolean): Promise<void> {
      return run(async () => {
        if (full) await win.setAlwaysOnTop(on);
      }, undefined);
    },

    /** The compact window's current geometry while in Peek (for remembering), else null. */
    snapshot(): Promise<PeekGeometry | null> {
      return run(async () => (full ? await currentGeometry() : null), null);
    },
  };
}

/** The real thing, on the desktop app. */
export async function nativePeekWindow(): Promise<PeekWin> {
  const { getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor } = await import(
    "@tauri-apps/api/window"
  );
  const { invoke } = await import("@tauri-apps/api/core");
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
    setMaximized: (on) => (on ? w.maximize() : w.unmaximize()),
    setMinSize: (width, height) => w.setMinSize(new LogicalSize(width, height)),
    setBounds: async (g) => {
      // One native call (Windows): size and position change together, nothing in between is ever shown.
      try {
        await invoke("peek_set_bounds", { x: g.x, y: g.y, width: g.width, height: g.height });
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
      await invoke("peek_set_transparent", { transparent: on, r, g, b });
    },
  };
}
