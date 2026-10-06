import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let failRegister: string | null = null;
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn(async (key: string) => {
    calls.push(`register ${key}`);
    if (key === failRegister) throw new Error("already registered");
  }),
  unregister: vi.fn(async (key: string) => {
    calls.push(`unregister ${key}`);
  }),
}));

import { createGlobalShortcutBinder } from "./globalShortcut";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe("createGlobalShortcutBinder", () => {
  beforeEach(() => {
    calls.length = 0;
    failRegister = null;
  });

  it("overlapping binds of the same key register it once and keep it registered", async () => {
    const b = createGlobalShortcutBinder(() => {});
    b.bind("Ctrl+Alt+N");
    b.bind("Ctrl+Alt+N");
    b.bind("Ctrl+Alt+N");
    await flush();
    expect(calls).toEqual(["register Ctrl+Alt+N"]);
  });

  it("changing the key unregisters the old one and registers the new one, in order", async () => {
    const b = createGlobalShortcutBinder(() => {});
    b.bind("Ctrl+Alt+N");
    b.bind("Ctrl+Alt+K");
    await flush();
    expect(calls).toEqual(["register Ctrl+Alt+K"]); // the first was superseded before it ran
    b.bind("Ctrl+Alt+L");
    await flush();
    expect(calls).toEqual(["register Ctrl+Alt+K", "unregister Ctrl+Alt+K", "register Ctrl+Alt+L"]);
  });

  it("binding nothing never loads or touches the plugin", async () => {
    const b = createGlobalShortcutBinder(() => {});
    b.bind("");
    await flush();
    expect(calls).toEqual([]);
  });

  it("a key another app holds fails quietly and is retried by the next bind", async () => {
    failRegister = "Ctrl+Alt+N";
    const b = createGlobalShortcutBinder(() => {});
    b.bind("Ctrl+Alt+N");
    await flush();
    failRegister = null;
    b.bind("Ctrl+Alt+N");
    await flush();
    expect(calls).toEqual(["register Ctrl+Alt+N", "register Ctrl+Alt+N"]);
  });

  it("dispose unregisters and later binds do nothing", async () => {
    const b = createGlobalShortcutBinder(() => {});
    b.bind("Ctrl+Alt+N");
    await flush();
    b.dispose();
    b.bind("Ctrl+Alt+K");
    await flush();
    expect(calls).toEqual(["register Ctrl+Alt+N", "unregister Ctrl+Alt+N"]);
  });
});
