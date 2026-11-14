// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultKeymap, history, historyKeymap, indentWithTab, moveLineDown } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { exitNumberedList, moveEmptySubItemOut, numberedListKeymap, numberedListRenumberFilter } from "./numberedListKeys";
import { pasteOverEmptyMarker } from "./pasteOverEmptyMarker";

const views: EditorView[] = [];

function createView(doc: string, selection?: { anchor: number; head?: number }): EditorView {
  const state = EditorState.create({
    doc,
    selection: selection ? EditorSelection.single(selection.anchor, selection.head ?? selection.anchor) : undefined,
    extensions: [
      history(),
      numberedListRenumberFilter,
      pasteOverEmptyMarker,
      numberedListKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    ],
  });
  const view = new EditorView({ state });
  views.push(view);
  return view;
}

function pressKey(view: EditorView, key: string, shiftKey = false) {
  runScopeHandlers(view, new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }), "editor");
}

function caretAtLine(doc: string, lineIdx: number, col?: number): number {
  const lines = doc.split("\n");
  let pos = 0;
  for (let i = 0; i < lineIdx; i++) pos += lines[i].length + 1;
  return pos + (col ?? lines[lineIdx].length);
}

let origError: typeof console.error;
let origGetClientRects: (() => DOMRectList) | undefined;

beforeAll(() => {
  origError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("getClientRects")) return;
    if (args[0] instanceof Error && args[0].message.includes("getClientRects")) return;
    origError(...args);
  };
  if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
    origGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

afterEach(() => {
  while (views.length > 0) views.pop()!.destroy();
});

afterAll(() => {
  console.error = origError;
  if (typeof Range !== "undefined" && origGetClientRects !== undefined) {
    Range.prototype.getClientRects = origGetClientRects;
  }
});

describe("Rule 1 & Rule 2: Tab and Shift+Tab on first item / within parent / selections", () => {
  it("Tab on the first item of a group shifts the whole group +2 without changing numbers", () => {
    const view = createView("1. a\n2. b\n3. c", { anchor: 0 });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("  1. a\n  2. b\n  3. c");
  });

  it("Tab on the first item of an indented sub-group shifts the whole group +2", () => {
    const doc = "1. a\n   1. b\n   2. c";
    const view = createView(doc, { anchor: caretAtLine(doc, 1) });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("1. a\n     1. b\n     2. c");
  });

  it("Tab on the first item below a bullet moves the group to the bullet's text column and keeps numbers", () => {
    const doc = "- bullet\n2. a\n3. b";
    const view = createView(doc, { anchor: caretAtLine(doc, 1) });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("- bullet\n  2. a\n  3. b");
  });

  it("Tab on the first item of a list starting at 4 keeps 4, 5, 6 and shifts subtrees", () => {
    const doc = "4. a\n   4.1. sub\n5. b\n6. c";
    const view = createView(doc, { anchor: 0 });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("  4. a\n     4.1. sub\n  5. b\n  6. c");
  });

  it("Shift+Tab on the first item of an indented group with no parent moves the whole group back by 2", () => {
    const doc = "  1. a\n  2. b";
    const view = createView(doc, { anchor: 2 });
    pressKey(view, "Tab", true);
    expect(view.state.doc.toString()).toBe("1. a\n2. b");
  });

  it("Tab with a selection moves lines together (+2 when none above) and restarts a group after the selection at 1", () => {
    const doc = "4. a\n5. b\n6. c\n7. d";
    const view = createView(doc, { anchor: 0, head: caretAtLine(doc, 1) });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("  4. a\n  5. b\n1. c\n2. d");
  });

  it("Rule 2: Tab looks only within the parent (does not jump under an earlier parent's sub-item)", () => {
    const doc = "1. a\n   1.1. b\n2. c\n   1. d";
    const view = createView(doc, { anchor: caretAtLine(doc, 3) });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("1. a\n   1.1. b\n2. c\n     1. d");
  });

  it("Rule 2: Tab on an item with a different delimiter shifts the group +2", () => {
    const doc = "1. a\n   1. b\n   1) cd\n   2) e";
    const view = createView(doc, { anchor: caretAtLine(doc, 2) });
    pressKey(view, "Tab");
    expect(view.state.doc.toString()).toBe("1. a\n   1. b\n     1) cd\n     2) e");
  });
});

describe("Rule 4 & Rule 5: splitting, joining, and digit edits", () => {
  it("pasting a newline into a list splits it and restarts the second part at 1", () => {
    const view = createView("1. a\n2. b\n3. c", { anchor: 4 });
    view.dispatch({ changes: { from: 4, to: 4, insert: "\n" }, userEvent: "input.paste" });
    expect(view.state.doc.toString()).toBe("1. a\n\n1. b\n2. c");
  });

  it("Alt+Down (move.line) moving non-list text into a list splits it and restarts the tail at 1", () => {
    const view = createView("text\n1. a\n2. b\n3. c", { anchor: 0 });
    moveLineDown(view);
    expect(view.state.doc.toString()).toBe("1. a\ntext\n1. b\n2. c");
  });

  it("typing over a multi-line selection splits the list and restarts the tail at 1", () => {
    const doc = "1. a\n2. b\n3. c\n4. d";
    const from = caretAtLine(doc, 1, 0);
    const to = caretAtLine(doc, 2);
    const view = createView(doc, { anchor: from, head: to });
    view.dispatch({ changes: { from, to, insert: "x" }, selection: { anchor: from + 1 }, userEvent: "input.type" });
    expect(view.state.doc.toString()).toBe("1. a\nx\n1. d");
  });

  it("a list starting at 4: Backspace on 5. b then Shift+Tab splits so 6. c becomes 1. c", () => {
    const doc = "4. a\n5. b\n6. c";
    const view = createView(doc, { anchor: caretAtLine(doc, 1, 3) });
    pressKey(view, "Backspace");
    expect(view.state.doc.toString()).toBe("4. a\n   b\n5. c");
    pressKey(view, "Tab", true);
    expect(view.state.doc.toString()).toBe("4. a\nb\n1. c");
  });

  it("exiting an empty item in the middle of a list restarts the rest from 1", () => {
    const doc = "1. a\n2. \n3. c";
    const view = createView(doc, { anchor: caretAtLine(doc, 1) });
    exitNumberedList(view, view.state.doc.line(2).from, 1);
    expect(view.state.doc.toString()).toBe("1. a\n\n1. c");
  });

  it("Rule 5: typing or deleting a digit on a blank line between two lists never renumbers", () => {
    const doc = "1. a\n   \n3. c";
    const pos = caretAtLine(doc, 1);
    const view = createView(doc, { anchor: pos });
    view.dispatch({ changes: { from: pos, to: pos, insert: "2" }, selection: { anchor: pos + 1 }, userEvent: "input.type" });
    expect(view.state.doc.toString()).toBe("1. a\n   2\n3. c");

    view.dispatch({ changes: { from: pos, to: pos + 1, insert: "" }, selection: { anchor: pos }, userEvent: "delete.backward" });
    expect(view.state.doc.toString()).toBe("1. a\n   \n3. c");

    view.dispatch({ changes: { from: pos, to: pos, insert: "x" }, selection: { anchor: pos + 1 }, userEvent: "input.type" });
    expect(view.state.doc.toString()).toBe("1. a\n   x\n2. c");
  });
});

describe("Rule 6, 7, 8, 9: Backspace, empty sub-items, and selection Shift+Tab", () => {
  it("Rule 6: second Backspace works across sub-items and renumbers what follows", () => {
    const doc1 = "1. a\n   1.1. sub\n2. c";
    const view1 = createView(doc1, { anchor: caretAtLine(doc1, 2, 3) });
    pressKey(view1, "Backspace");
    expect(view1.state.doc.toString()).toBe("1. a\n   1.1. sub\n   c");
    pressKey(view1, "Backspace");
    expect(view1.state.doc.toString()).toBe("1. a\n   1.1. sub\nc");

    const doc2 = "1. a\n2. b\n3. c";
    const view2 = createView(doc2, { anchor: caretAtLine(doc2, 1, 3) });
    pressKey(view2, "Backspace");
    expect(view2.state.doc.toString()).toBe("1. a\n   b\n2. c");
    pressKey(view2, "Backspace");
    expect(view2.state.doc.toString()).toBe("1. a\nb\n1. c");

    const doc3 = "4. a\n5. b\n6. c";
    const view3 = createView(doc3, { anchor: caretAtLine(doc3, 1, 3) });
    pressKey(view3, "Backspace");
    expect(view3.state.doc.toString()).toBe("4. a\n   b\n5. c");
    pressKey(view3, "Backspace");
    expect(view3.state.doc.toString()).toBe("4. a\nb\n1. c");
  });

  it("Rule 7: Backspace on an empty sub-item with a numbered parent moves it out like Enter", () => {
    const doc = "1. a\n   1.1. b\n   1.2. ";
    const view = createView(doc, { anchor: caretAtLine(doc, 2) });
    pressKey(view, "Backspace");
    expect(view.state.doc.toString()).toBe("1. a\n   1.1. b\n2. ");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("Rule 7: Backspace on an empty item under a bullet is unchanged", () => {
    const doc = "- bullet\n  1. ";
    const view = createView(doc, { anchor: caretAtLine(doc, 1) });
    pressKey(view, "Backspace");
    // Unchanged behaviour: removes the marker, does not promote out of bullet.
    expect(view.state.doc.toString()).toBe("- bullet\n  ");
  });

  it("Rule 8: moving an empty sub-item out makes following sub-items its children starting at 1", () => {
    const doc = "1. a\n   1. b\n   2. \n   3. c\n2. d";
    const view = createView(doc, { anchor: caretAtLine(doc, 2) });
    moveEmptySubItemOut(view, view.state.doc.line(3).from, 2, "input");
    expect(view.state.doc.toString()).toBe("1. a\n   1. b\n2. \n   1. c\n3. d");
  });

  it("Rule 9: Shift+Tab on a selection restarts sub-items left behind at 1", () => {
    const doc = "1. a\n   4. b\n   5. c\n   6. d";
    const view = createView(doc, { anchor: caretAtLine(doc, 1, 0), head: caretAtLine(doc, 2) });
    pressKey(view, "Tab", true);
    expect(view.state.doc.toString()).toBe("1. a\n2. b\n3. c\n   1. d");
  });

  it("Rule 10: Shift+Tab on a dotted item does not shift its new sub-items by marker width delta", () => {
    const doc = "1. a\n   1.1. x\n2. b\n   2.1. c\n   2.2. d\n3. e";
    const view = createView(doc, { anchor: caretAtLine(doc, 3) });
    pressKey(view, "Tab", true);
    expect(view.state.doc.toString()).toBe("1. a\n   1.1. x\n2. b\n3. c\n   3.1. d\n4. e");
  });
});

describe("Rule 10, 11, 12, 14, 15: width shift, tabs, paste over marker, 1.1. style, speed", () => {
  it("Rule 10: marker width changes from 9. to 10. and back shift subtrees on paste/delete", () => {
    const doc = "8. z\n9. a\n   sub text\n   1. sub";
    const view = createView(doc, { anchor: 4 });
    view.dispatch({ changes: { from: 4, to: 4, insert: "\n9. ins" }, userEvent: "input.paste" });
    expect(view.state.doc.toString()).toBe("8. z\n9. ins\n10. a\n    sub text\n    1. sub");

    const doc2 = "1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g\n8. h\n9. i\n10. j\n    sub text\n    1. sub";
    const view2 = createView(doc2, { anchor: 5 });
    view2.dispatch({ changes: { from: 5, to: 10, insert: "" }, userEvent: "delete.cut" });
    const lines2 = view2.state.doc.toString().split("\n");
    expect(lines2[8]).toBe("9. j");
    expect(lines2[9]).toBe("   sub text");
    expect(lines2[10]).toBe("   1. sub");
  });

  it("Rule 11: Backspace on tab-indented item keeps the tab", () => {
    const doc = "\t1. a\n\t2. b";
    const view = createView(doc, { anchor: caretAtLine(doc, 1, 4) });
    pressKey(view, "Backspace");
    expect(view.state.doc.toString()).toBe("\t1. a\n\t   b");
    pressKey(view, "Backspace");
    expect(view.state.doc.toString()).toBe("\t1. a\n\tb");
  });

  it("Rule 12: pasting a numbered list onto an empty numbered item replaces it and follows numbering", () => {
    const doc = "1. a\n2. ";
    const view = createView(doc, { anchor: doc.length });
    view.dispatch({
      changes: { from: doc.length, to: doc.length, insert: "1. x\n2. y" },
      selection: { anchor: doc.length + 9 },
      userEvent: "input.paste",
    });
    expect(view.state.doc.toString()).toBe("1. a\n2. x\n3. y");

    const viewSingle = createView(doc, { anchor: doc.length });
    viewSingle.dispatch({
      changes: { from: doc.length, to: doc.length, insert: "1. x" },
      selection: { anchor: doc.length + 4 },
      userEvent: "input.paste",
    });
    expect(viewSingle.state.doc.toString()).toBe("1. a\n2. x");
  });

  it("Rule 14: 1.1. style requires numbered parent and matching delimiter, and does not flatten existing dotted sub-groups", () => {
    const doc1 = "1. a\n   1.1. x\n1) p\n2) q";
    const view1 = createView(doc1, { anchor: caretAtLine(doc1, 3) });
    pressKey(view1, "Tab");
    expect(view1.state.doc.toString()).toBe("1. a\n   1.1. x\n1) p\n   1) q");

    const doc2 = "- bullet\n  1.1. x\n1. a\n2. b";
    const view2 = createView(doc2, { anchor: caretAtLine(doc2, 3) });
    pressKey(view2, "Tab");
    expect(view2.state.doc.toString()).toBe("- bullet\n  1.1. x\n1. a\n   1. b");

    const doc3 = "1. a\n   1.1. x\n2. b\n3. c\n   3.1. e";
    const view3 = createView(doc3, { anchor: caretAtLine(doc3, 3) });
    pressKey(view3, "Tab");
    expect(view3.state.doc.toString()).toBe("1. a\n   1.1. x\n2. b\n   2.1. c\n   2.2. e");
  });

  it("Rule 15: Tab on item 2 of a 3,000-item list takes well under 100 ms", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `${i + 1}. item ${i + 1}`);
    const doc = lines.join("\n");
    const anchor = caretAtLine(doc, 1);
    const warmView = createView(doc, { anchor });
    pressKey(warmView, "Tab");
    const view = createView(doc, { anchor });
    const t0 = performance.now();
    pressKey(view, "Tab");
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
    expect(view.state.doc.line(2).text).toBe("   1. item 2");
    expect(view.state.doc.line(3).text).toBe("2. item 3");
    expect(view.state.doc.line(3000).text).toBe("2999. item 3000");
  });

  it("Rule 15: typing on a blank line of a 3,000-line note never calls doc.toString()", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => (i === 1500 ? "" : `line ${i}`));
    const doc = lines.join("\n");
    const view = createView(doc, { anchor: caretAtLine(doc, 1500) });
    const toStringSpy = vi.spyOn(view.state.doc, "toString");
    const pos = caretAtLine(doc, 1500);
    view.dispatch({ changes: { from: pos, to: pos, insert: "a" }, selection: { anchor: pos + 1 }, userEvent: "input.type" });
    expect(toStringSpy).not.toHaveBeenCalled();
  });
});
