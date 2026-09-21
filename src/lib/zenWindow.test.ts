import { describe, expect, it } from "vitest";
import { createZenWindowController, type ZenWindow } from "./zenWindow";

/** A fake window that records the calls made on it, in order. */
function fakeWindow(opts: { maximized: boolean; failOn?: string; delayMs?: number }) {
  const calls: string[] = [];
  let maximized = opts.maximized;
  const step = async (name: string, fn?: () => void) => {
    calls.push(name);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.failOn === name) throw new Error(`${name} failed`);
    fn?.();
  };
  const win: ZenWindow = {
    isMaximized: async () => {
      await step("isMaximized");
      return maximized;
    },
    maximize: () => step("maximize", () => (maximized = true)),
    unmaximize: () => step("unmaximize", () => (maximized = false)),
    setFullscreen: (on) => step(`setFullscreen(${on})`),
    hide: () => step("hide"),
    show: () => step("show"),
    setFocus: () => step("setFocus"),
  };
  return { win, calls, isMaximized: () => maximized };
}

describe("Zen mode's native fullscreen", () => {
  it("a maximized window is restored first, made fullscreen, and maximized again afterwards", async () => {
    const f = fakeWindow({ maximized: true });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    expect(f.calls).toEqual(["isMaximized", "hide", "unmaximize", "setFullscreen(true)", "show", "setFocus"]);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "hide", "unmaximize", "setFullscreen(true)", "show", "setFocus", "hide", "setFullscreen(false)", "maximize", "show", "setFocus"]);
    expect(f.isMaximized()).toBe(true);
  });

  it("a normal window is never hidden (no flicker to hide there)", async () => {
    const f = fakeWindow({ maximized: false });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    await zen.set(false);
    expect(f.calls).not.toContain("hide");
  });

  it("a normal window just goes fullscreen and back, and is never maximized", async () => {
    const f = fakeWindow({ maximized: false });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "setFullscreen(false)"]);
    expect(f.isMaximized()).toBe(false);
  });

  it("remembers the window's state each time: maximized in the first Zen, normal in the second", async () => {
    const f = fakeWindow({ maximized: true });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    await zen.set(false); // maximized again
    // the user restores the window by hand between the two sessions
    await f.win.unmaximize();
    f.calls.length = 0;
    await zen.set(true);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)", "setFullscreen(false)"]);
    expect(f.isMaximized()).toBe(false);
  });

  it("leaving Zen without having entered it (a stray call) does not maximize anything", async () => {
    const f = fakeWindow({ maximized: false });
    await createZenWindowController(f.win).set(false);
    expect(f.calls).toEqual(["setFullscreen(false)"]);
  });

  it("calls are serialized: a quick on/off never interleaves the two sequences", async () => {
    const f = fakeWindow({ maximized: true, delayMs: 5 });
    const zen = createZenWindowController(f.win);
    void zen.set(true);
    await zen.set(false);
    expect(f.calls).toEqual(["isMaximized", "hide", "unmaximize", "setFullscreen(true)", "show", "setFocus", "hide", "setFullscreen(false)", "maximize", "show", "setFocus"]);
  });

  it("a failing window call never rejects and does not wedge later toggles", async () => {
    const f = fakeWindow({ maximized: true, failOn: "unmaximize" });
    const zen = createZenWindowController(f.win);
    await expect(zen.set(true)).resolves.toBeUndefined();
    await expect(zen.set(false)).resolves.toBeUndefined();
    expect(f.calls).toContain("setFullscreen(false)");
    // the window is never left hidden, even when a step failed
    expect(f.calls.filter((c) => c === "show").length).toBe(f.calls.filter((c) => c === "hide").length);
  });

  it("if the maximized state cannot be read, it is treated as a normal window", async () => {
    const f = fakeWindow({ maximized: true, failOn: "isMaximized" });
    const zen = createZenWindowController(f.win);
    await zen.set(true);
    expect(f.calls).toEqual(["isMaximized", "setFullscreen(true)"]);
  });
});
