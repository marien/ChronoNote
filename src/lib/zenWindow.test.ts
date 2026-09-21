import { describe, expect, it } from "vitest";
import { createZenWindowController, type ZenWindow } from "./zenWindow";

/** A fake window that records the calls made on it, in order. */
function fakeWindow(opts: { maximized: boolean; failOn?: string; delayMs?: number }) {
  const calls: string[] = [];
  const step = async (name: string) => {
    calls.push(name);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.failOn === name) throw new Error(`${name} failed`);
  };
  const win: ZenWindow = {
    isMaximized: async () => {
      await step("isMaximized");
      return opts.maximized;
    },
    setFullscreen: (on) => step(`setFullscreen(${on})`),
    coverMonitor: () => step("coverMonitor"),
  };
  return { win, calls };
}

describe("Zen mode's native fullscreen", () => {
  it("a maximized window goes fullscreen, then is made to cover the whole monitor; leaving is a plain un-fullscreen", async () => {
    const f = fakeWindow({ maximized: true });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "coverMonitor"]);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "coverMonitor", "setFullscreen(false)"]);
  });

  it("the window is never restored, maximized or hidden by hand (that was the flicker)", async () => {
    const f = fakeWindow({ maximized: true });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    await zen.set(false);
    expect(f.calls.some((c) => /unmaximize|^maximize|hide|show/.test(c))).toBe(false);
  });

  it("a normal window just goes fullscreen and back, with no native cover step", async () => {
    const f = fakeWindow({ maximized: false });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "setFullscreen(false)"]);
  });

  it("the window's state is read fresh at each start of Zen", async () => {
    let maximized = true;
    const calls: string[] = [];
    const win: ZenWindow = {
      isMaximized: async () => maximized,
      setFullscreen: async (on) => void calls.push(`fs(${on})`),
      coverMonitor: async () => void calls.push("cover"),
    };
    const zen = createZenWindowController(win);
    await zen.set(true);
    await zen.set(false);
    maximized = false;
    await zen.set(true);
    expect(calls).toEqual(["fs(true)", "cover", "fs(false)", "fs(true)"]);
  });

  it("calls are serialized: a quick on/off never interleaves the two sequences", async () => {
    const f = fakeWindow({ maximized: true, delayMs: 5 });
    const zen = createZenWindowController(f.win);
    void zen.set(true);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "coverMonitor", "setFullscreen(false)"]);
  });

  it("a failing native cover never rejects and does not wedge later toggles", async () => {
    const f = fakeWindow({ maximized: true, failOn: "coverMonitor" });
    const zen = createZenWindowController(f.win);
    await expect(zen.set(true)).resolves.toBeUndefined();
    await expect(zen.set(false)).resolves.toBeUndefined();
    expect(f.calls).toContain("setFullscreen(false)");
  });

  it("if the maximized state cannot be read, it is treated as a normal window", async () => {
    const f = fakeWindow({ maximized: true, failOn: "isMaximized" });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)"]);
  });
});
