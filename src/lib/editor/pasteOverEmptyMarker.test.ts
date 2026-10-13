import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { mergePasteOverEmptyMarker, pasteOverEmptyMarker } from "./pasteOverEmptyMarker";

function paste(doc: string, caret: number, text: string): { doc: string; caret: number } {
  const state = EditorState.create({ doc, selection: { anchor: caret }, extensions: [pasteOverEmptyMarker] });
  const tr = state.update({ changes: { from: caret, insert: text }, selection: { anchor: caret + text.length }, userEvent: "input.paste" });
  return { doc: tr.state.doc.toString(), caret: tr.state.selection.main.head };
}

describe("mergePasteOverEmptyMarker", () => {
  it("drops the empty symbol when the pasted line brings its own", () => {
    expect(mergePasteOverEmptyMarker("# ", "", "# call Dana")).toEqual({ deleteBefore: 2, insert: "# call Dana" });
  });
  it("keeps the line's indentation and drops the pasted indentation", () => {
    expect(mergePasteOverEmptyMarker("  # ", "", "    v done")).toEqual({ deleteBefore: 2, insert: "v done" });
  });
  it("works for topics and bullets", () => {
    expect(mergePasteOverEmptyMarker("o ", "", ", postponed")).not.toBeNull();
    expect(mergePasteOverEmptyMarker("- ", "", "* item")).not.toBeNull();
  });
  it("leaves a paste alone when the line has text, text follows the caret, or the paste has no symbol", () => {
    expect(mergePasteOverEmptyMarker("# call ", "", "# Dana")).toBeNull();
    expect(mergePasteOverEmptyMarker("# ", "later", "# Dana")).toBeNull();
    expect(mergePasteOverEmptyMarker("# ", "", "call Dana")).toBeNull();
    expect(mergePasteOverEmptyMarker("", "", "# call Dana")).toBeNull();
    expect(mergePasteOverEmptyMarker("#", "", "# call Dana")).toBeNull();
  });
});

describe("pasteOverEmptyMarker filter", () => {
  it("pastes an action onto an empty open action without a second symbol", () => {
    expect(paste("Notes\n# ", 8, "# call Dana")).toEqual({ doc: "Notes\n# call Dana", caret: 17 });
  });
  it("keeps the pasted symbol and every pasted line", () => {
    expect(paste("  # ", 4, "v sent\n# follow up").doc).toBe("  v sent\n# follow up");
  });
  it("does nothing for typed input", () => {
    const state = EditorState.create({ doc: "# ", selection: { anchor: 2 }, extensions: [pasteOverEmptyMarker] });
    expect(state.update({ changes: { from: 2, insert: "# x" }, userEvent: "input.type" }).state.doc.toString()).toBe("# # x");
  });
  it("rewrites list marker then state symbol on each pasted line", () => {
    expect(paste("", 0, "- # a\n1. o b")).toEqual({ doc: "# - a\no 1. b", caret: 12 });
  });
});
