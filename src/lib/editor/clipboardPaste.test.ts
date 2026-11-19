// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPasteDataTransfer, readClipboardPastePayload, resolveClipboardPaste } from "./clipboardPaste";

function makeClipboardItem(entries: Record<string, string>): ClipboardItem {
  const types = Object.keys(entries);
  return {
    types,
    getType: async (type: string) => {
      if (!(type in entries)) {
        throw new Error(`Unexpected clipboard type: ${type}`);
      }
      return new Blob([entries[type]], { type });
    },
  } as unknown as ClipboardItem;
}

class FakeDataTransfer {
  private readonly store = new Map<string, string>();

  get types(): readonly string[] {
    return Array.from(this.store.keys());
  }

  setData(format: string, data: string): void {
    this.store.set(format, data);
  }

  getData(format: string): string {
    return this.store.get(format) ?? "";
  }
}

describe("clipboardPaste", () => {
  beforeEach(() => {
    vi.stubGlobal("DataTransfer", FakeDataTransfer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads text/html and text/plain from clipboard.read() without calling readText()", async () => {
    const readText = vi.fn().mockResolvedValue("unused");
    const payload = await readClipboardPastePayload({
      read: async () => [makeClipboardItem({ "text/html": "<ul><li>a</li></ul>", "text/plain": "- a" })],
      readText,
    });

    expect(payload).toEqual({ html: "<ul><li>a</li></ul>", plain: "- a" });
    expect(readText).not.toHaveBeenCalled();
  });

  it("handles plain-only items without requesting html, and html-only items by falling back to readText()", async () => {
    const readTextPlainOnly = vi.fn().mockResolvedValue("unused");
    const plainOnly = await readClipboardPastePayload({
      read: async () => [makeClipboardItem({ "text/plain": "only plain" })],
      readText: readTextPlainOnly,
    });
    expect(plainOnly).toEqual({ html: "", plain: "only plain" });
    expect(readTextPlainOnly).not.toHaveBeenCalled();

    const readTextHtmlOnly = vi.fn().mockResolvedValue("fallback plain");
    const htmlOnly = await readClipboardPastePayload({
      read: async () => [makeClipboardItem({ "text/html": "<ul><li>one</li></ul>" })],
      readText: readTextHtmlOnly,
    });
    expect(htmlOnly).toEqual({ html: "<ul><li>one</li></ul>", plain: "fallback plain" });
    expect(readTextHtmlOnly).toHaveBeenCalledTimes(1);
  });

  it("keeps the first non-empty text/html and text/plain across multiple items", async () => {
    const payload = await readClipboardPastePayload({
      read: async () => [
        makeClipboardItem({ "text/html": "<ul><li>first</li></ul>", "text/plain": "first" }),
        makeClipboardItem({ "text/html": "<ul><li>second</li></ul>", "text/plain": "second" }),
      ],
      readText: async () => "unused",
    });

    expect(payload).toEqual({ html: "<ul><li>first</li></ul>", plain: "first" });
  });

  it("falls back when clipboard.read is absent and keeps html when readText() rejects", async () => {
    const noRead = await readClipboardPastePayload({
      readText: async () => "from readText",
    });
    expect(noRead).toEqual({ html: "", plain: "from readText" });

    const htmlOnlyWhenReadTextFails = await readClipboardPastePayload({
      read: async () => [makeClipboardItem({ "text/html": "<ul><li>kept</li></ul>" })],
      readText: async () => {
        throw new Error("plain blocked");
      },
    });
    expect(htmlOnlyWhenReadTextFails).toEqual({ html: "<ul><li>kept</li></ul>", plain: "" });
  });

  it("rethrows readText() error when no html was obtained", async () => {
    const err = new Error("clipboard denied");
    await expect(
      readClipboardPastePayload({
        read: async () => {
          throw new Error("read denied");
        },
        readText: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);

    await expect(
      readClipboardPastePayload({
        read: async () => [],
        readText: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });

  it("buildPasteDataTransfer sets only non-empty text/html and text/plain entries", async () => {
    const both = await buildPasteDataTransfer({
      read: async () => [makeClipboardItem({ "text/html": "<ul><li>x</li></ul>", "text/plain": "- x" })],
      readText: async () => "",
    });
    expect(both.types).toEqual(["text/html", "text/plain"]);
    expect(both.getData("text/html")).toBe("<ul><li>x</li></ul>");
    expect(both.getData("text/plain")).toBe("- x");

    const plainOnly = await buildPasteDataTransfer({
      readText: async () => "plain only",
    });
    expect(plainOnly.types).toEqual(["text/plain"]);
    expect(plainOnly.getData("text/html")).toBe("");
    expect(plainOnly.getData("text/plain")).toBe("plain only");

    const htmlOnly = await buildPasteDataTransfer({
      read: async () => [makeClipboardItem({ "text/html": "<ul><li>html only</li></ul>" })],
      readText: async () => "",
    });
    expect(htmlOnly.types).toEqual(["text/html"]);
    expect(htmlOnly.getData("text/html")).toBe("<ul><li>html only</li></ul>");
    expect(htmlOnly.getData("text/plain")).toBe("");
  });

  describe("resolveClipboardPaste", () => {
    it("converts leading, nested, and inline tabs to two spaces on foreign plain-text pastes", () => {
      expect(resolveClipboardPaste(undefined, "\titem")).toEqual({
        insertText: "  item",
        pasteCheckText: "  item",
      });
      expect(resolveClipboardPaste("", "\t\t- sub")).toEqual({
        insertText: "    - sub",
        pasteCheckText: "    - sub",
      });
      expect(resolveClipboardPaste("", "key\tvalue\t\tmore")).toEqual({
        insertText: "key  value    more",
        pasteCheckText: "key  value    more",
      });
      expect(resolveClipboardPaste("", "\ta\r\n\tb")).toEqual({
        insertText: "  a\n  b",
        pasteCheckText: "  a\n  b",
      });
    });

    it("leaves plain text without tabs for CodeMirror's default handler", () => {
      expect(resolveClipboardPaste("", "plain text")).toEqual({
        insertText: null,
        pasteCheckText: "plain text",
      });
      expect(resolveClipboardPaste(undefined, undefined)).toEqual({
        insertText: null,
        pasteCheckText: undefined,
      });
    });

    it("converts tabs when foreign non-list HTML falls back to plain text", () => {
      expect(resolveClipboardPaste("<p>a\tb</p>", "\titem\t2")).toEqual({
        insertText: "  item  2",
        pasteCheckText: "  item  2",
      });
    });

    it("converts HTML lists and <pre> tabs via htmlToNoteText", () => {
      expect(
        resolveClipboardPaste(
          "<ul><li>Code:</li></ul><pre>\ta = 1;\n\t\tb = 2;</pre>",
          "Code:\n\ta = 1;\n\t\tb = 2;",
        ),
      ).toEqual({
        insertText: "- Code:\n  a = 1;\n    b = 2;",
        pasteCheckText: "- Code:\n  a = 1;\n    b = 2;",
      });
    });

    it("keeps tabs untouched for ChronoNote's own data-chrononote copy", () => {
      const ownHtml = '<html><body><!--StartFragment--><div data-chrononote=""><ul><li>item</li></ul></div><!--EndFragment--></body></html>';
      expect(resolveClipboardPaste(ownHtml, "\t- item\tmore")).toEqual({
        insertText: null,
        pasteCheckText: "\t- item\tmore",
      });
    });

    it("does not treat prose mentioning data-chrononote as ChronoNote's own copy", () => {
      expect(resolveClipboardPaste("<p>about data-chrononote</p>", "\titem")).toEqual({
        insertText: "  item",
        pasteCheckText: "  item",
      });
    });
  });
});
