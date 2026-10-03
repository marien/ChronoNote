import { describe, expect, it } from "vitest";
import { createPeekWindowController, type PeekGeometry, type PeekWin } from "./peekWindow";

/** A fake window that records what the controller does to it. */
function fakeWindow(opts: { geometry?: PeekGeometry; maximized?: boolean; scale?: number; monitor?: PeekGeometry | null } = {}) {
  let geo: PeekGeometry = opts.geometry ?? { x: 100, y: 100, width: 1100, height: 700 };
  let maximized = opts.maximized ?? false;
  const log: string[] = [];
  const win: PeekWin = {
    outerPosition: async () => ({ x: geo.x, y: geo.y }),
    size: async () => ({ width: geo.width, height: geo.height }),
    scaleFactor: async () => opts.scale ?? 1,
    monitor: async () => (opts.monitor === undefined ? { x: 0, y: 0, width: 1920, height: 1080 } : opts.monitor),
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
  it("first time: opens in the top-right of the monitor at the requested size, on top, see-through", async () => {
    const f = fakeWindow({ scale: 1.5 });
    await createPeekWindowController(f.win).enter(enterOpts);
    // width 420*1.5=630, height 200*1.5=300, margin 24*1.5=36, top offset 60*1.5=90
    expect(f.geo).toEqual({ x: 1920 - 630 - 36, y: 90, width: 630, height: 300 });
    expect(f.log).toContain("transparent:true");
    expect(f.log).toContain("top:true");
    expect(f.log).toContain("min:240x80");
  });

  it("without a monitor it stays where the full window was", async () => {
    const f = fakeWindow({ monitor: null, geometry: { x: 50, y: 60, width: 1000, height: 600 } });
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

  it("resizeKeepingBottom grows and shrinks at the top: the bottom edge does not move", async () => {
    const f = fakeWindow({ scale: 1.5 });
    const peek = createPeekWindowController(f.win);
    await peek.resizeKeepingBottom(22); // not in Peek: nothing happens
    expect(f.log).toEqual([]);
    await peek.enter(enterOpts);
    const before = { ...f.geo };
    await peek.resizeKeepingBottom(22); // the header strip expands: +22 logical = +33 physical
    expect(f.geo).toEqual({ ...before, y: before.y - 33, height: before.height + 33 });
    expect(f.geo.y + f.geo.height).toBe(before.y + before.height);
    await peek.resizeKeepingBottom(-22); // and collapses again
    expect(f.geo).toEqual(before);
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
});
