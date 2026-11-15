// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyPlain, copyRich } from "./clipboardWrite";

describe("clipboardWrite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("copyRich uses navigator.clipboard.write with text/html and text/plain", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });

    const ok = await copyRich("<p>Hello</p>", "Hello");

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0].items)).toEqual(["text/html", "text/plain"]);
    expect(await items[0].items["text/html"].text()).toBe("<p>Hello</p>");
    expect(await items[0].items["text/plain"].text()).toBe("Hello");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copyRich falls back to navigator.clipboard.writeText when write throws", async () => {
    const write = vi.fn().mockRejectedValue(new Error("blocked"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });

    const ok = await copyRich("<p>Hello</p>", "Hello");

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("Hello");
  });

  it("copyRich falls back to document.execCommand('copy') when both clipboard APIs fail", async () => {
    const write = vi.fn().mockRejectedValue(new Error("blocked"));
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    class MockClipboardItem {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    const ok = await copyRich("<p>Hello</p>", "Hello");

    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("copyPlain uses writeText and returns false only when both writeText and execCommand fail", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    expect(await copyPlain("plain text")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("plain text");

    writeText.mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    expect(await copyPlain("plain text")).toBe(false);

    writeText.mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => {
        throw new Error("execCommand unsupported");
      }),
      configurable: true,
    });
    expect(await copyPlain("plain text")).toBe(false);
  });
});
