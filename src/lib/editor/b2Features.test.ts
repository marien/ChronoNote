// @vitest-environment jsdom
import { EditorSelection } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createTestEditor, type TestEditor } from "../testing/testEditor";
import { applyActionStateToSelection, applyLineToken, indentLines } from "./commands";
import { setActionSymbolTo } from "../tokens";
import { readClipboardPastePayload } from "./clipboardPaste";
import { htmlToNoteText } from "../richClipboard";
import * as controller from "../controller";
import { currentDateISO, tabs } from "../stores";
import type { NoteTab } from "../types";

const editors: TestEditor[] = [];

function openEditor(doc: string): TestEditor {
  const ed = createTestEditor({ doc });
  editors.push(ed);
  return ed;
}

function makeTab(id: string, filename: string, content: string): NoteTab {
  return { id, filename, isScratchpad: false, content };
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
  vi.useRealTimers();
});

describe("B2 features (items 16-20)", () => {
  it("item 16: indentLines indents and outdents numbered items identically to Tab/Shift-Tab", () => {
    const ed = openEditor("1. a\n2. b|");
    expect(indentLines(ed.view, false)).toBe(true);
    expect(ed.caret()).toBe("1. a\n   1. b|");

    expect(indentLines(ed.view, true)).toBe(true);
    expect(ed.caret()).toBe("1. a\n2. b|");

    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("1. a\n   1. b|");
    expect(ed.undo()).toBe(true);
    expect(ed.caret()).toBe("1. a\n2. b|");

    const ed2 = openEditor("[\t# a\n]  plain");
    expect(indentLines(ed2.view, true)).toBe(true);
    expect(ed2.caret()).toBe("[# a\n]  plain");
  });

  it("item 17: applyLineToken combines and toggles bullets/emphasis on action and topic lines", () => {
    const ed = openEditor("# ta|sk");
    applyLineToken(ed.view, "-");
    expect(ed.caret()).toBe("# - ta|sk");

    applyLineToken(ed.view, "!");
    expect(ed.caret()).toBe("# ! - ta|sk");

    applyLineToken(ed.view, "!");
    expect(ed.caret()).toBe("# - ta|sk");

    applyLineToken(ed.view, "-");
    expect(ed.caret()).toBe("# ta|sk");

    applyLineToken(ed.view, "!");
    expect(ed.caret()).toBe("# ! ta|sk");

    applyLineToken(ed.view, "-");
    expect(ed.caret()).toBe("# ! - ta|sk");

    const topicEd = openEditor("o to|pic");
    applyLineToken(topicEd.view, "-");
    expect(topicEd.caret()).toBe("o - to|pic");
    applyLineToken(topicEd.view, "!");
    expect(topicEd.caret()).toBe("o ! - to|pic");

    const selEd = openEditor("[# a\no b\n]plain");
    applyLineToken(selEd.view, "-");
    expect(selEd.caret()).toBe("[# - a\no - b\n]plain");
  });

  it("item 18: paste-forward undo matches target text after by: and empty-marker rewrites", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 12, 0, 0));
    currentDateISO.set("2026-10-22");

    const srcContent = "# call Dana by:tomorrow\nother";
    tabs.set([
      makeTab("src", "2026-10-22.txt", srcContent),
      makeTab("dst", "2026-10-23.txt", "# "),
    ]);

    controller.recordCopiedAction("# call Dana by:tomorrow", "src", 0);
    const ed = openEditor("# |");
    controller.handlePasteIntoTab("dst", "# call Dana by:tomorrow", { targetLineIdx: 0, targetDocText: ed.text() });
    ed.paste("# call Dana by:tomorrow");

    const expectedPasted = "# call Dana by:2026-10-23 (<2026-10-22)";
    expect(ed.text()).toBe(expectedPasted);
    expect(controller._pasteDeferLinkForTest()?.pastedBlock).toBe(expectedPasted);

    const beforeUndo = ed.text();
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe("# ");
    controller.onEditorUndo("dst", beforeUndo, ed.text());
    expect(get(tabs).find((t) => t.id === "src")!.content).toBe(srcContent);
    expect(controller._pasteDeferLinkForTest()?.reverted).toBe(true);

    // Indented multi-line empty-marker paste onto `  # |`
    tabs.set([
      makeTab("src2", "2026-10-22.txt", "# one\n# two"),
      makeTab("dst2", "2026-10-23.txt", "  # "),
    ]);
    controller.recordCopiedAction("# one\n# two", "src2", 0);
    const ed2 = openEditor("  # |");
    controller.handlePasteIntoTab("dst2", "# one\n# two", { targetLineIdx: 0, targetDocText: ed2.text() });
    ed2.paste("# one\n# two");
    expect(ed2.text()).toBe("  # one (<2026-10-22)\n  # two (<2026-10-22)");
    const beforeUndo2 = ed2.text();
    expect(ed2.undo()).toBe(true);
    controller.onEditorUndo("dst2", beforeUndo2, ed2.text());
    expect(get(tabs).find((t) => t.id === "src2")!.content).toBe("# one\n# two");
  });

  it("item 19: readClipboardPastePayload preserves text/html alongside text/plain and falls back to readText", async () => {
    const html = "<ul><li>first</li><li>second</li></ul>";
    const payload = await readClipboardPastePayload({
      read: async () => [
        {
          types: ["text/html", "text/plain"],
          getType: async (type: string) => new Blob([type === "text/html" ? html : "first\nsecond"], { type }),
        } as unknown as ClipboardItem,
      ],
      readText: async () => "should not be needed",
    });

    expect(payload.html).toBe(html);
    expect(payload.plain).toBe("first\nsecond");
    expect(htmlToNoteText(payload.html)).toBe("- first\n- second");

    const fallbackPayload = await readClipboardPastePayload({
      read: async () => {
        throw new Error("denied");
      },
      readText: async () => "plain fallback",
    });
    expect(fallbackPayload.plain).toBe("plain fallback");
    expect(fallbackPayload.html).toBe("");
  });

  it("item 20: multiple selections are disallowed in editingExtensions", () => {
    const ed = openEditor("alpha\nbeta\ngamma|");
    ed.view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(6)]),
    });
    expect(ed.view.state.selection.ranges).toHaveLength(1);
    expect(ed.view.state.selection.main.head).toBe(0);
  });

  it("B3 rules 5 & 6: Bullet/Emphasis preserve topic symbol, title lines stay untouched, and col targets consequence", () => {
    const ed = openEditor("o |agenda");
    applyLineToken(ed.view, "-");
    expect(ed.text()).toBe("o - agenda");
    applyLineToken(ed.view, "-");
    expect(ed.text()).toBe("o agenda");
    applyLineToken(ed.view, "!");
    expect(ed.text()).toBe("o ! agenda");
    applyLineToken(ed.view, "-");
    expect(ed.text()).toBe("o ! - agenda");
    applyLineToken(ed.view, "-");
    expect(ed.text()).toBe("o ! agenda");
    applyLineToken(ed.view, "!");
    expect(ed.text()).toBe("o agenda");

    const ed2 = openEditor("  |plain indented");
    applyLineToken(ed2.view, "-");
    expect(ed2.text()).toBe("  - plain indented");
    applyLineToken(ed2.view, "-");
    expect(ed2.text()).toBe("  plain indented");

    const edTitle = openEditor("# Title|\n---");
    applyLineToken(edTitle.view, "!");
    expect(edTitle.text()).toBe("# Title\n---");

    const edConseq = openEditor("v |done => # next");
    applyActionStateToSelection(edConseq.view, (line, col) => setActionSymbolTo(line, "v", col), "v", 14);
    expect(edConseq.text()).toBe("v done => v next");
  });
});
