import { describe, expect, it } from "vitest";
import {
  createPeekWindowController,
  defaultPeekGeometry,
  fitToMonitors,
  monitorOf,
  type MonitorArea,
  type PeekGeometry,
  type PeekWin,
} from "./peekWindow";

/** A 1920x1080 screen whose taskbar takes the bottom 40 px. */
const SCREEN: PeekGeometry = { x: 0, y: 0, width: 1920, height: 1040 };

/** A fake window that records what the controller does to it. */
function fakeWindow(
  opts: {
    geometry?: PeekGeometry;
    maximized?: boolean;
    scale?: number;
    monitors?: MonitorArea[];
    noDock?: boolean;
    /** §404: report a native dock state (and record peek_log lines); off = no native side, as before. */
    native?: boolean;
  } = {},
) {
  let geo: PeekGeometry = opts.geometry ?? { x: 100, y: 100, width: 1100, height: 700 };
  let maximized = opts.maximized ?? false;
  const log: string[] = [];
  const peekLog: string[] = [];
  /** What the native side holds; a test may flip it to make a half dock. */
  const native = { docked: false };
  const win: PeekWin = {
    outerPosition: async () => ({ x: geo.x, y: geo.y }),
    size: async () => ({ width: geo.width, height: geo.height }),
    scaleFactor: async () => opts.scale ?? 1,
    monitors: async () => opts.monitors ?? [{ work: SCREEN, current: true }],
    isMaximized: async () => maximized,
    setMaximized: async (on) => {
      log.push(`maximized:${on}`);
      maximized = on;
    },
    setMinSize: async (w, h) => void log.push(`min:${w}x${h}`),
    setBounds: async (g) => {
      log.push(`bounds:${g.x},${g.y} ${g.width}x${g.height}`);
      geo = g;
    },
    setAlwaysOnTop: async (on) => void log.push(`top:${on}`),
    reveal: async () => void log.push("reveal"),
    setTransparent: async (on) => void log.push(`transparent:${on}`),
    // A 1920x1080 screen with a 40 px taskbar: the strip ends at 1040 (Windows moves it above the taskbar).
    dockBottom: async (height) => {
      if (opts.noDock) throw new Error("not available");
      log.push(`dock:${height}`);
      native.docked = true;
      geo = { x: 0, y: 1040 - height, width: 1920, height };
      return geo;
    },
    undock: async () => {
      log.push("undock");
      native.docked = false;
    },
    ...(opts.native
      ? {
          dockState: async () => ({
            docked: native.docked,
            registered: native.docked,
            lostPending: false,
            window: [geo.x, geo.y, geo.x + geo.width, geo.y + geo.height] as [number, number, number, number],
            work: null,
            monitors: 1,
          }),
          log: (kind: string, message: string) => void peekLog.push(`${kind}: ${message}`),
        }
      : {}),
  };
  return {
    win,
    log,
    peekLog,
    native,
    get geo() {
      return geo;
    },
    set geo(g: PeekGeometry) {
      geo = g;
    },
  };
}

const enterOpts = { geometry: null, logicalWidth: 420, logicalHeight: 200, forceHeight: true, alwaysOnTop: true };

describe("createPeekWindowController", () => {
  it("first time: opens in the lower centre of the monitor, just above the taskbar, at the requested size, on top, see-through", async () => {
    const f = fakeWindow({ scale: 1.5 });
    await createPeekWindowController(f.win).enter(enterOpts);
    // width 420*1.5=630, height 200*1.5=300, 12*1.5=18 above the bottom of the work area (1040)
    expect(f.geo).toEqual({ x: Math.round((1920 - 630) / 2), y: 1040 - 300 - 18, width: 630, height: 300 });
    expect(f.log).toContain("transparent:true");
    expect(f.log).toContain("top:true");
    expect(f.log).toContain("min:240x80");
  });

  it("monitors with different scaling: a forced height uses the scale of the monitor Peek goes to", async () => {
    // Full window on a 125 % monitor; Peek remembered on a 100 % one next to it.
    const left: MonitorArea = { work: SCREEN, current: true, scale: 1.25 };
    const right: MonitorArea = { work: { x: 1920, y: 0, width: 1920, height: 1040 }, current: false, scale: 1 };
    const f = fakeWindow({ scale: 1.25, monitors: [left, right] });
    await createPeekWindowController(f.win).enter({
      ...enterOpts,
      geometry: { x: 2200, y: 600, width: 420, height: 150 },
    });
    expect(f.geo).toEqual({ x: 2200, y: 600, width: 420, height: 200 }); // 200 logical at 100 %, not 250
  });

  it("it opens on the monitor the app is on, which need not be the first one", async () => {
    const second: PeekGeometry = { x: 1920, y: 0, width: 2560, height: 1400 };
    const f = fakeWindow({ monitors: [{ work: SCREEN, current: false }, { work: second, current: true }] });
    await createPeekWindowController(f.win).enter(enterOpts);
    expect(f.geo.x).toBe(1920 + Math.round((2560 - 420) / 2));
    expect(f.geo.y).toBe(1400 - 200 - 12);
  });

  it("without any monitor information it stays where the full window was", async () => {
    const f = fakeWindow({ monitors: [], geometry: { x: 50, y: 60, width: 1000, height: 600 } });
    await createPeekWindowController(f.win).enter(enterOpts);
    expect(f.geo.x).toBe(50);
    expect(f.geo.y).toBe(60);
  });

  it("reuses the remembered geometry, but takes the height from the setting when asked to", async () => {
    const remembered: PeekGeometry = { x: 700, y: 400, width: 500, height: 250 };
    const keep = fakeWindow();
    await createPeekWindowController(keep.win).enter({ ...enterOpts, geometry: remembered, forceHeight: false });
    expect(keep.geo).toEqual(remembered);

    const forced = fakeWindow();
    await createPeekWindowController(forced.win).enter({ ...enterOpts, geometry: remembered, forceHeight: true });
    expect(forced.geo).toEqual({ ...remembered, height: 200 });
  });

  it("leave puts the full window back exactly, reports where the compact one was, and undoes top/transparency", async () => {
    const f = fakeWindow({ geometry: { x: 329, y: 329, width: 1115, height: 729 } });
    const peek = createPeekWindowController(f.win);
    await peek.enter(enterOpts);
    const compact = await peek.leave();
    expect(compact).toMatchObject({ width: 420, height: 200 });
    expect(f.geo).toEqual({ x: 329, y: 329, width: 1115, height: 729 });
    expect(f.log).toContain("top:false");
    expect(f.log).toContain("transparent:false");
    expect(f.log).toContain("min:500x420");
  });

  it("a maximized window is un-maximized for Peek and maximized again afterwards", async () => {
    const f = fakeWindow({ maximized: true });
    const peek = createPeekWindowController(f.win);
    await peek.enter(enterOpts);
    expect(f.log).toContain("maximized:false");
    await peek.leave();
    expect(f.log.at(-2)).toBe("maximized:true");
  });

  it("entering twice does not overwrite the remembered full-window geometry with the compact one", async () => {
    const f = fakeWindow({ geometry: { x: 10, y: 20, width: 900, height: 600 } });
    const peek = createPeekWindowController(f.win);
    await peek.enter(enterOpts);
    await peek.enter(enterOpts);
    await peek.leave();
    expect(f.geo).toEqual({ x: 10, y: 20, width: 900, height: 600 });
  });

  it("leave without enter is a no-op", async () => {
    const f = fakeWindow();
    expect(await createPeekWindowController(f.win).leave()).toBeNull();
    expect(f.log).toEqual([]);
  });

  it("a failing window call never rejects", async () => {
    const f = fakeWindow();
    f.win.setBounds = async () => {
      throw new Error("boom");
    };
    await expect(createPeekWindowController(f.win).enter(enterOpts)).resolves.toBeUndefined();
  });

  it("a maximized window remembers the size it will be restored to, not the screen-sized rectangle", async () => {
    // Like Windows: while maximized the window reports the screen rectangle, and the rectangle it was set to while
    // NOT maximized is what "restore" goes back to.
    const screen: PeekGeometry = { x: 0, y: 0, width: 1920, height: 1040 };
    let normal: PeekGeometry = { x: 300, y: 200, width: 1000, height: 600 };
    let maximized = true;
    const geo = () => (maximized ? screen : normal);
    const win: PeekWin = {
      outerPosition: async () => ({ x: geo().x, y: geo().y }),
      size: async () => ({ width: geo().width, height: geo().height }),
      scaleFactor: async () => 1,
      monitors: async () => [{ work: screen, current: true }],
      isMaximized: async () => maximized,
      setMaximized: async (on) => void (maximized = on),
      setMinSize: async () => {},
      setBounds: async (g) => void (normal = g),
      setAlwaysOnTop: async () => {},
      reveal: async () => {},
      setTransparent: async () => {},
      dockBottom: async () => screen,
      undock: async () => {},
    };
    const peek = createPeekWindowController(win);
    await peek.enter(enterOpts);
    expect(maximized).toBe(false);
    await peek.leave();
    expect(maximized).toBe(true);
    // Restoring (un-maximizing) afterwards goes back to the size it had before, not to almost full screen.
    maximized = false;
    expect(normal).toEqual({ x: 300, y: 200, width: 1000, height: 600 });
  });

  describe("docked to the bottom of the screen (§393)", () => {
    it("reserves a full-width strip at the logical height times the scale, on top, and does not float", async () => {
      const f = fakeWindow({ scale: 1.25 });
      const peek = createPeekWindowController(f.win);
      await peek.enter({ ...enterOpts, dockLogicalHeight: 200 });
      expect(f.log).toContain("dock:250");
      expect(f.log.some((l) => l.startsWith("bounds:"))).toBe(false);
      expect(f.log).toContain("top:true");
      expect(f.geo).toEqual({ x: 0, y: 790, width: 1920, height: 250 });
      expect(peek.isDocked()).toBe(true);
    });

    it("leaving gives the strip back first, restores the full window, and reports no floating position to remember", async () => {
      const f = fakeWindow();
      const peek = createPeekWindowController(f.win);
      await peek.enter({ ...enterOpts, dockLogicalHeight: 200 });
      expect(await peek.leave()).toBeNull();
      expect(f.log.indexOf("undock")).toBeLessThan(f.log.lastIndexOf("bounds:100,100 1100x700"));
      expect(f.geo).toEqual({ x: 100, y: 100, width: 1100, height: 700 });
      expect(peek.isDocked()).toBe(false);
    });

    it("the lines setting does not resize a docked strip", async () => {
      const f = fakeWindow();
      const peek = createPeekWindowController(f.win);
      await peek.enter({ ...enterOpts, dockLogicalHeight: 200 });
      await peek.setLogicalHeight(90);
      expect(f.geo.height).toBe(200);
    });

    it("switching while in Peek: dock remembers the floating position, float puts it back there", async () => {
      const f = fakeWindow();
      const peek = createPeekWindowController(f.win);
      const kept = { x: 700, y: 400, width: 630, height: 250 };
      await peek.enter({ ...enterOpts, geometry: kept, forceHeight: false });
      expect(f.geo).toEqual(kept);
      expect(await peek.dock(200, true)).toEqual(kept);
      expect(peek.isDocked()).toBe(true);
      expect(f.geo).toEqual({ x: 0, y: 840, width: 1920, height: 200 });
      await peek.float({ ...enterOpts, geometry: kept, forceHeight: false });
      expect(f.log.slice(-4)).toContain("undock");
      expect(peek.isDocked()).toBe(false);
      expect(f.geo).toEqual(kept);
    });

    it("dock and float do nothing outside Peek or when already in that mode", async () => {
      const f = fakeWindow();
      const peek = createPeekWindowController(f.win);
      expect(await peek.dock(200, true)).toBeNull();
      await peek.float(enterOpts);
      expect(f.log).toEqual([]);
      await peek.enter({ ...enterOpts, dockLogicalHeight: 200 });
      expect(await peek.dock(200, true)).toBeNull();
    });

    describe("docks on the screen it was last docked on (#187)", () => {
      const left: MonitorArea = { work: SCREEN, current: true };
      const right: MonitorArea = { work: { x: 1920, y: 0, width: 1920, height: 1040 }, current: false };
      const lastStrip = { x: 1920, y: 840, width: 1920, height: 200 };
      /** Like the native side: the strip goes on the screen the window is mostly on. */
      const twoScreens = (monitors: MonitorArea[]) => {
        const f = fakeWindow({ monitors });
        f.win.dockBottom = async (height) => {
          const m = monitorOf(f.geo, monitors) ?? monitors[0];
          f.log.push(`dock:${height}`);
          f.geo = { x: m.work.x, y: m.work.y + m.work.height - height, width: m.work.width, height };
          return f.geo;
        };
        return f;
      };

      it("entering Peek from a window on the other screen", async () => {
        const f = twoScreens([left, right]);
        const peek = createPeekWindowController(f.win);
        await peek.enter({ ...enterOpts, dockLogicalHeight: 200, dockGeometry: lastStrip });
        expect(f.geo).toEqual(lastStrip);
        expect(peek.dockStrip()).toEqual(lastStrip);
      });

      it("the dock button on a Peek floating on the other screen", async () => {
        const f = twoScreens([left, right]);
        const peek = createPeekWindowController(f.win);
        await peek.enter({ ...enterOpts, geometry: { x: 600, y: 500, width: 420, height: 200 }, forceHeight: false });
        await peek.dock(200, true, lastStrip);
        expect(f.geo).toEqual(lastStrip);
      });

      it("moves by screen only: keeps its own size, to that screen's lower centre, then docks", async () => {
        const f = twoScreens([left, right]);
        const peek = createPeekWindowController(f.win);
        const floating = { x: 600, y: 500, width: 420, height: 200 };
        await peek.enter({ ...enterOpts, geometry: floating, forceHeight: false });
        await peek.dock(200, true, lastStrip);
        expect(f.log).toContain(`bounds:${1920 + (1920 - 420) / 2},840 420x200`);
      });

      it("the dock fails after the move: back where it was, not left on the other screen", async () => {
        const f = twoScreens([left, right]);
        const peek = createPeekWindowController(f.win);
        const floating = { x: 600, y: 500, width: 420, height: 200 };
        await peek.enter({ ...enterOpts, geometry: floating, forceHeight: false });
        f.win.dockBottom = async () => {
          throw new Error("ABM_NEW refused");
        };
        expect(await peek.dock(200, true, lastStrip)).toBeNull();
        expect(f.geo).toEqual(floating);
        expect(peek.isDocked()).toBe(false);
      });

      it("a minimized window is not moved first", async () => {
        const f = twoScreens([left, right]);
        f.win.isMinimized = async () => true;
        const peek = createPeekWindowController(f.win);
        await peek.enter({ ...enterOpts, dockLogicalHeight: 200, dockGeometry: lastStrip });
        expect(f.log.some((l) => l.startsWith("bounds:"))).toBe(false);
      });

      it("that screen is gone: docks on the window's screen, without moving it first", async () => {
        const f = twoScreens([left]);
        const peek = createPeekWindowController(f.win);
        await peek.enter({ ...enterOpts, dockLogicalHeight: 200, dockGeometry: lastStrip });
        expect(f.geo).toEqual({ x: 0, y: 840, width: 1920, height: 200 });
        expect(f.log.some((l) => l.startsWith("bounds:"))).toBe(false);
      });
    });

    it("where docking is not available, Peek floats as usual", async () => {
      const f = fakeWindow({ noDock: true });
      const peek = createPeekWindowController(f.win);
      await peek.enter({ ...enterOpts, dockLogicalHeight: 200 });
      expect(peek.isDocked()).toBe(false);
      expect(f.log.some((l) => l.startsWith("bounds:"))).toBe(true);
    });
  });

  it("setLogicalHeight keeps position and width, only while in Peek", async () => {
    const f = fakeWindow({ scale: 2 });
    const peek = createPeekWindowController(f.win);
    await peek.setLogicalHeight(100);
    expect(f.log).toEqual([]);
    await peek.enter(enterOpts);
    const before = { ...f.geo };
    await peek.setLogicalHeight(100);
    expect(f.geo).toEqual({ ...before, height: 200 });
  });

  it("a remembered position on a monitor that is gone (laptop undocked) is not used: back to the lower centre", async () => {
    const gone: PeekGeometry = { x: 2400, y: 300, width: 630, height: 250 }; // on a second screen that is no longer there
    const f = fakeWindow();
    await createPeekWindowController(f.win).enter({ ...enterOpts, geometry: gone, forceHeight: false });
    expect(f.geo).toEqual({ x: Math.round((1920 - 630) / 2), y: 1040 - 250 - 12, width: 630, height: 250 });
  });

  it("a remembered position that is still on a screen is used as it is", async () => {
    const kept: PeekGeometry = { x: 700, y: 400, width: 630, height: 250 };
    const f = fakeWindow();
    await createPeekWindowController(f.win).enter({ ...enterOpts, geometry: kept, forceHeight: false });
    expect(f.geo).toEqual(kept);
  });

  it("a remembered position that now hangs half off the screen is pulled back inside", async () => {
    const f = fakeWindow();
    await createPeekWindowController(f.win).enter({
      ...enterOpts,
      geometry: { x: 1500, y: 850, width: 630, height: 250 },
      forceHeight: false,
    });
    expect(f.geo).toEqual({ x: 1920 - 630, y: 1040 - 250, width: 630, height: 250 });
  });

  it("leaving Peek brings the full window back onto a screen when its monitor is gone", async () => {
    const f = fakeWindow({ geometry: { x: 2500, y: 200, width: 1100, height: 700 } });
    const peek = createPeekWindowController(f.win);
    await peek.enter(enterOpts);
    // the full window was on a second monitor that has been unplugged since
    await peek.leave();
    expect(f.geo.width).toBe(1100);
    expect(f.geo.height).toBe(700);
    expect(f.geo.x).toBeGreaterThanOrEqual(0);
    expect(f.geo.x + f.geo.width).toBeLessThanOrEqual(1920);
  });
});

describe("fitToMonitors / defaultPeekGeometry", () => {
  const main: MonitorArea = { work: { x: 0, y: 0, width: 1920, height: 1040 }, current: true };
  const side: MonitorArea = { work: { x: 1920, y: 0, width: 2560, height: 1400 }, current: false };

  it("keeps a position that is on one monitor, and picks the monitor it overlaps most", () => {
    expect(fitToMonitors({ x: 2000, y: 100, width: 600, height: 300 }, [main, side])).toEqual({ x: 2000, y: 100, width: 600, height: 300 });
  });

  it("rejects a position that is mostly outside every monitor", () => {
    expect(fitToMonitors({ x: 1800, y: 100, width: 600, height: 300 }, [main])).toBeNull(); // 120 of 600 px visible
    expect(fitToMonitors({ x: 5000, y: 100, width: 600, height: 300 }, [main, side])).toBeNull();
    expect(fitToMonitors({ x: 100, y: 100, width: 600, height: 300 }, [])).toBeNull();
  });

  it("shrinks a window that is bigger than the monitor", () => {
    expect(fitToMonitors({ x: 0, y: 0, width: 4000, height: 300 }, [main])).toEqual({ x: 0, y: 0, width: 1920, height: 300 });
  });

  it("the default is centred on the current monitor, just above the taskbar", () => {
    expect(defaultPeekGeometry({ width: 600, height: 300 }, [side, main], 12)).toEqual({ x: 660, y: 1040 - 300 - 12, width: 600, height: 300 });
    expect(defaultPeekGeometry({ width: 600, height: 300 }, [], 12)).toBeNull();
  });
});

/** §404: the half-docked states seen on a work laptop with a docking station, and the logging around them. */
describe("docked Peek: consistency with the native side, and logging", () => {
  const docked = { ...enterOpts, dockLogicalHeight: 200 };

  it("leaving Peek gives a dock back that the page had lost track of (the window kept the strip's size)", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(enterOpts); // floating, as far as the page knows
    f.native.docked = true; // ...but the native side still holds a strip
    await c.leave();
    expect(f.log).toContain("undock");
    expect(f.native.docked).toBe(false);
    expect(f.geo).toEqual({ x: 100, y: 100, width: 1100, height: 700 });
    expect(f.peekLog.some((l) => l.startsWith("warn: leave: the native side still held a dock"))).toBe(true);
  });

  it("a dock the page does not know about is released right after the step that found it, and the recorder written out", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    f.native.docked = true; // left over from an earlier, failed docking
    await c.enter(enterOpts);
    expect(f.native.docked).toBe(false);
    expect(f.peekLog).toContain("dump: half docked after enter");
  });

  it("released while floating, the window goes back to a floating Peek's size (not the strip's)", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(enterOpts);
    f.native.docked = true;
    f.geo = { x: 0, y: 840, width: 1920, height: 200 }; // the native dock put it on a strip
    await c.check("window moved");
    expect(f.native.docked).toBe(false);
    expect(f.geo.width).toBe(420);
  });

  it("when the page believes it is docked but the native side is not, Peek floats", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    expect(c.isDocked()).toBe(true);
    f.native.docked = false; // the native side lost it without telling the page
    await c.check("window moved"); // Peek runs this when Windows moves or rescales the window
    expect(f.peekLog.some((l) => l.startsWith("warn: after window moved: the page thought Peek was docked"))).toBe(true);
    expect(c.isDocked()).toBe(false);
    expect(f.geo.width).toBe(420); // floating size, not the full-width strip
  });

  // §405, from a work-laptop log: Windows minimized Peek just before switching to "external screens only". Floating it
  // while minimized did nothing useful (it came back at the strip's place and size); it now floats on restore.
  it("a dock lost while Windows has the window minimized floats it once it is restored", async () => {
    const f = fakeWindow({ native: true });
    let min = false;
    f.win.isMinimized = async () => min;
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    min = true;
    f.native.docked = false;
    const boundsBefore = f.log.filter((l) => l.startsWith("bounds:")).length;
    await c.check("dock lost");
    expect(c.isDocked()).toBe(false);
    expect(f.log.filter((l) => l.startsWith("bounds:"))).toHaveLength(boundsBefore); // not moved while minimized
    expect(f.peekLog).toContain("event: the window is minimized: it floats when it is restored");
    await c.check("window moved"); // still minimized: still waiting
    expect(f.log.filter((l) => l.startsWith("bounds:"))).toHaveLength(boundsBefore);
    min = false; // restored, at the strip's old place
    await c.check("window moved");
    expect(f.geo.width).toBe(420);
    expect(f.peekLog).toContain("event: restored after the screens changed: placing the floating window");
    await c.check("window moved"); // only once
    expect(f.peekLog.filter((l) => l.startsWith("event: restored after"))).toHaveLength(1);
  });

  // §407, reproduced on two screens with Win+P: Windows remembers where a window was for each screen setup. Docked
  // when that setup ended, the window comes back on the strip when the setup returns, also after leaving Peek.
  it("after leaving Peek, the full window put back on an old strip by Windows is moved home", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    const home = { ...f.geo };
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.float(enterOpts);
    await c.leave();
    expect(f.geo).toEqual(home);
    f.geo = { ...strip }; // the screen setup changed back
    await c.check("window moved");
    expect(f.geo).toEqual(home);
    expect(f.peekLog.some((l) => l.startsWith("warn: after window moved: Windows put the full window back where Peek was"))).toBe(true);
    f.geo = { x: 300, y: 300, width: 900, height: 600 }; // the user's own move is left alone
    await c.check("window moved");
    expect(f.geo).toEqual({ x: 300, y: 300, width: 900, height: 600 });
  });

  it("a floating Peek put back on an old strip by Windows is placed as floating again", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.float(enterOpts);
    const floating = { ...f.geo };
    f.geo = { ...strip };
    await c.check("window moved");
    expect(f.geo).toEqual(floating);
    expect(c.isDocked()).toBe(false);
  });

  it("after leaving Peek, the full window put back on the floating Peek's place is moved home", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    const home = { ...f.geo };
    await c.enter(enterOpts);
    const floating = { ...f.geo };
    await c.leave();
    f.geo = { ...floating };
    await c.check("window moved");
    expect(f.geo).toEqual(home);
  });

  it("a floating Peek put back on the full window's place is placed as floating again", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    const home = { ...f.geo };
    await c.enter(enterOpts);
    const floating = { ...f.geo };
    f.geo = { ...home };
    await c.check("window moved");
    expect(f.geo).toEqual(floating);
    expect(f.peekLog.some((l) => l.includes("where the full window was in an earlier screen setup"))).toBe(true);
  });

  // Review of §407 (Gemini): a repair must go where the user last put the window, not where leaving Peek put it.
  it("a repair of the full window goes where the user moved it after leaving Peek", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.leave();
    const moved = { x: 400, y: 150, width: 900, height: 650 };
    f.geo = { ...moved };
    await c.check("window moved"); // the user's own move: noted
    f.geo = { ...strip };
    await c.check("window moved");
    expect(f.geo).toEqual(moved);
  });

  it("a repair of a floating Peek goes where the user dragged it", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.float(enterOpts);
    const dragged = { x: 1200, y: 100, width: 420, height: 200 }; // fit-to-section keeps the height
    f.geo = { ...dragged };
    await c.check("window moved");
    f.geo = { ...strip };
    await c.check("window moved");
    expect(f.geo).toEqual(dragged);
  });

  // CI (0.32.5-5): a dock made between reading the native state and reading the window's place made the strip the
  // floating place, so the half-dock repair floated Peek at the strip's size.
  it("a dock made while a check runs does not become the floating place", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(enterOpts);
    const floating = { ...f.geo };
    const outer = f.win.outerPosition;
    let dockNow = true;
    f.win.outerPosition = async () => {
      if (dockNow) {
        dockNow = false;
        await f.win.dockBottom(200); // behind the page's back, just now
      }
      return outer();
    };
    await c.check("window moved"); // read "not docked", then the window: already the strip
    await c.check("window moved"); // finds the half dock and repairs it
    expect(f.native.docked).toBe(false);
    expect(f.geo).toEqual(floating);
  });

  it("a maximized window is never repaired, and the same landing is not repaired twice in a row", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.leave();
    f.geo = { ...strip };
    await f.win.setMaximized(true);
    await c.check("window moved");
    expect(f.geo).toEqual(strip); // maximized: left alone
    await f.win.setMaximized(false);
    await c.check("window moved"); // repaired once
    const repairs = () => f.peekLog.filter((l) => l.includes("Windows put the full window back")).length;
    expect(repairs()).toBe(1);
    f.geo = { ...strip }; // Windows puts it back at once
    await c.check("window moved");
    expect(repairs()).toBe(1); // not again within a few seconds: no back-and-forth
  });

  it("a strip put back on a screen with other scaling is recognised by its scaled size", async () => {
    const f = fakeWindow({ native: true, scale: 1.25 });
    const c = createPeekWindowController(f.win);
    const home = { ...f.geo };
    await c.enter(docked);
    const strip = { ...f.geo };
    await c.leave();
    f.win.scaleFactor = async () => 1; // now on a 100 % screen
    f.geo = { x: 3, y: 820, width: Math.round(strip.width / 1.25), height: Math.round(strip.height / 1.25) };
    await c.check("window moved");
    expect(f.geo).toEqual(home);
  });

  it("without Peek this session, moves of the full window are not checked at all", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.check("window moved");
    expect(f.peekLog).toEqual([]);
  });

  it("a consistent dock is left alone and only noted in the flight recorder", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    await c.leave();
    expect(f.peekLog.filter((l) => l.startsWith("warn:"))).toEqual([]);
    expect(f.peekLog.some((l) => l.startsWith("event: enter Peek"))).toBe(true);
    expect(f.peekLog.some((l) => l.startsWith("event: leave Peek: was docked"))).toBe(true);
    expect(f.log.filter((l) => l === "undock")).toHaveLength(1);
  });

  it("after leaving, a full window that ended up off every screen is brought back onto one", async () => {
    const f = fakeWindow({ native: true });
    const c = createPeekWindowController(f.win);
    await c.enter(docked);
    // The setBounds that puts the full window back lands it off screen (Windows moving it during a dock change).
    const realSetBounds = f.win.setBounds;
    let first = true;
    f.win.setBounds = async (g) => {
      if (first) {
        first = false;
        f.geo = { x: 6000, y: 100, width: g.width, height: g.height };
        return;
      }
      await realSetBounds(g);
    };
    await c.leave();
    expect(fitToMonitors(f.geo, [{ work: SCREEN, current: true }])).not.toBeNull();
    expect(f.peekLog.some((l) => l.startsWith("warn: the window was off screen"))).toBe(true);
  });

  it("leaving keeps a window exactly where it was when its title bar is on a screen, and pulls it in when not", async () => {
    // Slightly over the taskbar: left exactly as it was.
    const a = fakeWindow({ native: true, geometry: { x: 329, y: 400, width: 1115, height: 729 } });
    const ca = createPeekWindowController(a.win);
    await ca.enter(enterOpts);
    await ca.leave();
    expect(a.geo).toEqual({ x: 329, y: 400, width: 1115, height: 729 });
    // Title bar above the top of the screen (mostly still on it): pulled inside.
    const b = fakeWindow({ native: true, geometry: { x: 329, y: -60, width: 1115, height: 729 } });
    const cb = createPeekWindowController(b.win);
    await cb.enter(enterOpts);
    await cb.leave();
    expect(b.geo).toEqual({ x: 329, y: 0, width: 1115, height: 729 });
  });

  it("a failing step is logged with its name instead of vanishing", async () => {
    const f = fakeWindow({ native: true });
    f.win.setTransparent = async () => {
      throw new Error("boom");
    };
    await createPeekWindowController(f.win).enter(enterOpts);
    expect(f.peekLog).toContain("warn: enter failed: Error: boom");
    expect(f.peekLog).toContain("dump: enter failed");
  });
});
