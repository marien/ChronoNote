// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import {
  applyListEdit,
  exitNumberedList,
  moveEmptySubItemOut,
  numberedListKeymap,
  numberedListRenumberFilter,
  shiftTabCommand,
  tabCommand,
} from "./numberedListKeys";

const views: EditorView[] = [];

function createView(doc: string, selection?: EditorSelection): EditorView {
  const state = EditorState.create({
    doc,
    selection,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      history(),
      numberedListRenumberFilter,
      numberedListKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    ],
  });
  const view = new EditorView({ state });
  views.push(view);
  return view;
}

function pressKey(view: EditorView, key: string, shiftKey = false): boolean {
  return runScopeHandlers(view, new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }), "editor");
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

describe("numberedListKeys multi-cursor, selection direction, and command contracts", () => {
  it("Tab, Shift+Tab, and Backspace leave multi-cursor list edits to CodeMirror defaults", () => {
    const doc = "1. a\n2. b\n3. c";
    const multiCaret = EditorSelection.create([EditorSelection.cursor(7), EditorSelection.cursor(12)]);
    const tabView = createView(doc, multiCaret);
    expect(tabCommand(tabView)).toBe(false);
    expect(tabView.state.doc.toString()).toBe(doc);

    const contDoc = "1. a\ncont\n2. b";
    const contMulti = EditorSelection.create([EditorSelection.cursor(6), EditorSelection.cursor(13)]);
    const contView = createView(contDoc, contMulti);
    expect(tabCommand(contView)).toBe(false);
    expect(contView.state.doc.toString()).toBe(contDoc);

    const shiftView = createView("1. a\n   1. b\n   2. c", EditorSelection.create([EditorSelection.cursor(10), EditorSelection.cursor(17)]));
    expect(shiftTabCommand(shiftView)).toBe(false);
    expect(shiftView.state.doc.toString()).toBe("1. a\n   1. b\n   2. c");

    const bsView = createView("1. a\n2. b\n3. c", EditorSelection.create([EditorSelection.cursor(8), EditorSelection.cursor(13)]));
    pressKey(bsView, "Backspace");
    expect(bsView.state.doc.toString()).toBe("1. a\n2.b\n3.c");
  });

  it("Backspace on a backwards selection ending at text start deletes the selection instead of the marker", () => {
    const view = createView("1. item", EditorSelection.single(7, 3));
    pressKey(view, "Backspace");
    expect(view.state.doc.toString()).toBe("1. ");
    expect(view.state.selection.main.head).toBe(3);
  });

  it("tabCommand and shiftTabCommand return false on no-op plain or col-0 list selections", () => {
    const plainView = createView("alpha\nbeta", EditorSelection.single(0, 10));
    expect(tabCommand(plainView)).toBe(false);
    expect(plainView.state.doc.toString()).toBe("alpha\nbeta");

    const col0View = createView("1. a\n2. b", EditorSelection.single(0));
    expect(shiftTabCommand(col0View)).toBe(false);

    const col0MultiView = createView("1. a\n2. b", EditorSelection.single(0, 9));
    expect(shiftTabCommand(col0MultiView)).toBe(false);

    const indentedMultiView = createView("   1. a\n   2. b", EditorSelection.single(0, 15));
    expect(shiftTabCommand(indentedMultiView)).toBe(true);
    expect(indentedMultiView.state.doc.toString()).toBe(" 1. a\n 2. b");
  });

  it("exitNumberedList returns true when exiting an empty item", () => {
    const doc = "1. a\n2. \n3. c";
    const view = createView(doc, EditorSelection.single(8));
    expect(exitNumberedList(view, view.state.doc.line(2).from, 1)).toBe(true);
    expect(view.state.doc.toString()).toBe("1. a\n\n1. c");
  });

  it("applyListEdit reads prior lines from the editor state when before is omitted", () => {
    const view = createView("intro\n\n1. a\n2. b", EditorSelection.single(10));
    expect(applyListEdit(view, ["1. a", "   1. b"], "input.indent", undefined, 2)).toBe(true);
    expect(view.state.doc.toString()).toBe("intro\n\n1. a\n   1. b");
  });

  it("list commands tag dispatched transactions with standard CodeMirror userEvent values", () => {
    const events: (string | undefined)[] = [];
    const record = (view: EditorView) => {
      const origDispatch = view.dispatch.bind(view);
      view.dispatch = ((...args: Parameters<EditorView["dispatch"]>) => {
        const spec = args[0];
        if (spec && typeof spec === "object" && "userEvent" in spec) {
          events.push(spec.userEvent);
        } else {
          const tr = view.state.update(spec);
          events.push(tr.annotation(Transaction.userEvent));
        }
        return origDispatch(...args);
      }) as EditorView["dispatch"];
    };

    const v1 = createView("1. a\n2. b", EditorSelection.single(8));
    record(v1);
    pressKey(v1, "Tab");

    const v2 = createView("1. a\n   1. b", EditorSelection.single(10));
    record(v2);
    pressKey(v2, "Tab", true);

    const v3 = createView("1. a\ncont", EditorSelection.single(9));
    record(v3);
    pressKey(v3, "Tab");

    const v4 = createView("1. a\n- bullet\n2. b\n3. c", EditorSelection.single(18));
    record(v4);
    pressKey(v4, "Tab");

    const v5 = createView("1. a\n1.1. b\n2. c", EditorSelection.single(16));
    record(v5);
    pressKey(v5, "Tab");

    const v6 = createView("1. a\n1.1. b\n1.2. c", EditorSelection.single(18));
    record(v6);
    pressKey(v6, "Tab", true);

    const v7 = createView("1. a\n2. b", EditorSelection.single(8));
    record(v7);
    pressKey(v7, "Backspace");
    pressKey(v7, "Backspace");

    const v8 = createView("1. a\n   1. ", EditorSelection.single(11));
    record(v8);
    pressKey(v8, "Backspace");

    const v9 = createView("1. a\n2. \n3. c", EditorSelection.single(8));
    record(v9);
    exitNumberedList(v9, v9.state.doc.line(2).from, 1);

    const v10 = createView("1. a\n   1. ", EditorSelection.single(11));
    record(v10);
    moveEmptySubItemOut(v10, v10.state.doc.line(2).from, 1, "input");

    const v11 = createView("- a\n- b", EditorSelection.single(7));
    record(v11);
    pressKey(v11, "Tab");

    const v12 = createView("1. a\n2. b", EditorSelection.single(4));
    record(v12);
    pressKey(v12, "Tab");

    const v13 = createView("1. a\n2. b\n3. c", EditorSelection.single(0, 14));
    record(v13);
    pressKey(v13, "Tab");

    const v14 = createView("  1. a\n  2. b", EditorSelection.single(6));
    record(v14);
    pressKey(v14, "Tab", true);

    const v15 = createView("  1. a\n  2. b", EditorSelection.single(13));
    record(v15);
    pressKey(v15, "Tab", true);

    const v16 = createView("1. a\n   1. b\n   2. c", EditorSelection.single(5, 19));
    record(v16);
    pressKey(v16, "Tab", true);

    expect(events).toEqual([
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
      "delete.backward",
      "delete.backward",
      "delete.backward",
      "input",
      "input",
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
      "input.indent",
    ]);
  });

  it("numberedListRenumberFilter handles IME compose, completion, drag-drop, and pasted newlines inside markers", () => {
    const composeView = createView("1. a\n\n3. c", EditorSelection.single(5));
    composeView.dispatch({ changes: { from: 5, to: 5, insert: "   x" }, userEvent: "input.type.compose" });
    expect(composeView.state.doc.toString()).toBe("1. a\n   x\n2. c");

    const completeView = createView("1. a\n\n3. c", EditorSelection.single(5));
    completeView.dispatch({ changes: { from: 5, to: 5, insert: "   x" }, userEvent: "input.complete.word" });
    expect(completeView.state.doc.toString()).toBe("1. a\n   x\n2. c");

    const dropView = createView("1. a\nx\n2. c", EditorSelection.single(5, 6));
    dropView.dispatch({ changes: { from: 5, to: 6, insert: "5. mid" }, userEvent: "input.drop" });
    expect(dropView.state.doc.toString()).toBe("1. a\n2. mid\n3. c");

    const pasteNewlineView = createView("1. a\n23. b", EditorSelection.single(6));
    pasteNewlineView.dispatch({ changes: { from: 6, to: 6, insert: "\n" }, userEvent: "input.paste" });
    expect(pasteNewlineView.state.doc.toString()).toBe("1. a\n2\n1. b");

    const undoView = createView("1. a\n\n3. c");
    undoView.dispatch({ changes: { from: 4, to: 5, insert: "" }, userEvent: "undo" });
    expect(undoView.state.doc.toString()).toBe("1. a\n3. c");

    const replaceInMarkerView = createView("1. a\n234. b");
    replaceInMarkerView.dispatch({ changes: { from: 6, to: 7, insert: "\n" }, userEvent: "input" });
    expect(replaceInMarkerView.state.doc.toString()).toBe("1. a\n2\n1. b");
  });
});
