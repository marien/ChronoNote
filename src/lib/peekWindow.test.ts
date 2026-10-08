import { describe, expect, it } from "vitest";
import {
  createPeekWindowController,
  defaultPeekGeometry,
  fitToMonitors,
  type MonitorArea,
  type PeekGeometry,
  type PeekWin,
} from "./peekWindow";

/** A 1920x1080 screen whose taskbar takes the bottom 40 px. */
const SCREEN: PeekGeometry = { x: 0, y: 0, width: 1920, height: 1040 };

/** A fake window that records what the controller does to it. */
function fakeWindow(opts: { geometry?: PeekGeometry; maximized?: boolean; scale?: number; monitors?: MonitorArea[] } = {}) {
  let geo: PeekGeometry = opts.geometry ?? { x: 100, y: 100, width: 1100, height: 700 };
  let maximized = opts.maximized ?? false;
  const log: string[] = [];
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
  };
  return { win, log, get geo() { return geo; } };
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
    expect(f.log).toContain("min:640x420");
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
