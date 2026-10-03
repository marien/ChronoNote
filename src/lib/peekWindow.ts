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

/** The bits of Tauri's window this needs (fakes in the unit test). */
export interface PeekWin {
  outerPosition(): Promise<{ x: number; y: number }>;
  /** Content size (what `setBounds` sets). The outer size includes the invisible resize border, so using it to
   * remember and restore a size made the window grow a little on every Peek round trip. */
  size(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
  /** The monitor the window is on, in physical pixels. */
  monitor(): Promise<PeekGeometry | null>;
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
export const FULL_MIN_LOGICAL = { width: 640, height: 420 };

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
        if (!full) full = { geometry: await currentGeometry(), maximized: await win.isMaximized() };
        await win.setTransparent(true);
        if (full.maximized) await win.setMaximized(false);
        await win.setMinSize(PEEK_MIN_LOGICAL.width, PEEK_MIN_LOGICAL.height);
        const scale = (await win.scaleFactor()) || 1;
        const h = Math.round(o.logicalHeight * scale);
        let g: PeekGeometry;
        if (o.geometry) {
          g = { ...o.geometry, height: o.forceHeight ? h : o.geometry.height };
        } else {
          const mon = await win.monitor();
          const w = Math.round(o.logicalWidth * scale);
          const margin = Math.round(24 * scale);
          g = mon
            ? { x: mon.x + mon.width - w - margin, y: mon.y + Math.round(60 * scale), width: w, height: h }
            : { x: full.geometry.x, y: full.geometry.y, width: w, height: h };
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
        await win.setBounds(back.geometry);
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

    /** Grow (positive) or shrink (negative) the window at its TOP edge: the bottom stays where it is. Used when the
     * header strip expands and collapses. */
    resizeKeepingBottom(deltaLogical: number): Promise<void> {
      return run(async () => {
        if (!full) return;
        const [g, scale] = [await currentGeometry(), (await win.scaleFactor()) || 1];
        const d = Math.round(deltaLogical * scale);
        await win.setBounds({ ...g, y: g.y - d, height: g.height + d });
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
  const { getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize, currentMonitor } = await import(
    "@tauri-apps/api/window"
  );
  const { invoke } = await import("@tauri-apps/api/core");
  const w = getCurrentWindow();
  return {
    outerPosition: () => w.outerPosition(),
    size: () => w.innerSize(),
    scaleFactor: () => w.scaleFactor(),
    monitor: async () => {
      const m = await currentMonitor();
      return m ? { x: m.position.x, y: m.position.y, width: m.size.width, height: m.size.height } : null;
    },
    isMaximized: () => w.isMaximized(),
    setMaximized: (on) => (on ? w.maximize() : w.unmaximize()),
    setMinSize: (width, height) => w.setMinSize(new LogicalSize(width, height)),
    setBounds: async (g) => {
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
