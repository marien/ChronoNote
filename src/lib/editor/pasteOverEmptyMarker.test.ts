import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { mergePasteOverEmptyMarker, pasteOverEmptyMarker, rewritePasted } from "./pasteOverEmptyMarker";
import { currentDateISO } from "../stores";
import { editingExtensions } from "./editingExtensions";

function paste(doc: string, caret: number, text: string, userEvent = "input.paste"): { doc: string; caret: number } {
  const state = EditorState.create({ doc, selection: { anchor: caret }, extensions: [pasteOverEmptyMarker] });
  const tr = state.update({ changes: { from: caret, insert: text }, selection: { anchor: caret + text.length }, userEvent });
  return { doc: tr.state.doc.toString(), caret: tr.state.selection.main.head };
}

describe("mergePasteOverEmptyMarker", () => {
  it("drops the empty symbol when the pasted line brings its own", () => {
    expect(mergePasteOverEmptyMarker("# ", "", "# call Dana")).toEqual({ deleteBefore: 2, insert: "# call Dana" });
  });
  it("keeps the line's indentation and drops the pasted indentation", () => {
    expect(mergePasteOverEmptyMarker("  # ", "", "    v done")).toEqual({ deleteBefore: 2, insert: "v done" });
  });
  it("works for topics, bullets, and numbered items (rule 12)", () => {
    expect(mergePasteOverEmptyMarker("o ", "", ", postponed")).not.toBeNull();
    expect(mergePasteOverEmptyMarker("- ", "", "* item")).not.toBeNull();
    expect(mergePasteOverEmptyMarker("2. ", "", "1. x\n2. y")).toEqual({ deleteBefore: 3, insert: "1. x\n2. y" });
    expect(mergePasteOverEmptyMarker("  1.2) ", "", "    1) x")).toEqual({ deleteBefore: 5, insert: "1) x" });
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
    expect(paste("  # ", 4, "v sent\n# follow up").doc).toBe("  v sent\n  # follow up");
  });
  it("does nothing for typed input", () => {
    const state = EditorState.create({ doc: "# ", selection: { anchor: 2 }, extensions: [pasteOverEmptyMarker] });
    expect(state.update({ changes: { from: 2, insert: "# x" }, userEvent: "input.type" }).state.doc.toString()).toBe("# # x");
  });
  it("rewrites list marker then state symbol on each pasted line", () => {
    expect(paste("", 0, "- # a\n1. o b")).toEqual({ doc: "# - a\no 1. b", caret: 12 });
  });
});

describe("rewritePasted", () => {
  it("rewrites due words in pasted actions", () => {
    currentDateISO.set("2026-10-22");
    // # call by:tomorrow -> # call by:2026-10-23
    expect(rewritePasted("# call by:tomorrow")).toBe("# call by:2026-10-23");
    // # call by:fri (Thursday today -> Friday is 2026-10-23)
    expect(rewritePasted("# call by:fri")).toBe("# call by:2026-10-23");
    // # x by:tomorrow
    expect(rewritePasted("# x by:tomorrow")).toBe("# x by:2026-10-23");
  });

  it("leaves unknown words and plain lines untouched", () => {
    expect(rewritePasted("# call by:foo")).toBe("# call by:foo");
    expect(rewritePasted("plain text by:tomorrow")).toBe("plain text by:tomorrow");
  });
});

describe("drop handling (Rule 7)", () => {
  it("applies state-first, due-word rewrite, and empty-marker merge on input.drop", () => {
    currentDateISO.set("2026-10-22");
    expect(paste("Notes\n# ", 8, "# call Dana", "input.drop")).toEqual({ doc: "Notes\n# call Dana", caret: 17 });
    expect(paste("", 0, "- # call by:tomorrow\n1. o topic", "input.drop").doc).toBe(
      "# - call by:2026-10-23\no 1. topic",
    );
  });

  it("rewrites, merges, renumbers lists, and stays one undo step on internal move.drop", () => {
    currentDateISO.set("2026-10-22");
    let state = EditorState.create({
      doc: "1. first\n2. # call by:tomorrow\n3. third",
      selection: { anchor: 9, head: 30 },
      extensions: [history(), ...editingExtensions()],
    });
    // Simulate dragging "2. # call by:tomorrow\n" (9..31) to line 1 start (0)
    const tr = state.update({
      changes: [
        { from: 9, to: 31, insert: "" },
        { from: 0, to: 0, insert: "2. # call by:tomorrow\n" },
      ],
      userEvent: "move.drop",
    });
    state = tr.state;
    expect(state.doc.line(1).text).toBe("# 2. call by:2026-10-23");
    expect(state.doc.line(2).text).toBe("1. first");
    expect(state.doc.line(3).text).toBe("2. third");

    undo({
      state,
      dispatch: (u) => {
        state = state.update(u).state;
      },
    });
    expect(state.doc.toString()).toBe("1. first\n2. # call by:tomorrow\n3. third");

    // Dragging an action onto an empty action marker merges without doubling `# # ` and stays one undo step
    let mergeState = EditorState.create({
      doc: "# call Dana\n# ",
      extensions: [history(), ...editingExtensions()],
    });
    mergeState = mergeState.update({
      changes: [
        { from: 0, to: 11, insert: "" },
        { from: 14, to: 14, insert: "# call Dana" },
      ],
      userEvent: "move.drop",
    }).state;
    expect(mergeState.doc.toString()).toBe("\n# call Dana");
    undo({
      state: mergeState,
      dispatch: (u) => {
        mergeState = mergeState.update(u).state;
      },
    });
    expect(mergeState.doc.toString()).toBe("# call Dana\n# ");

    // Moving a numbered item within the list renumbers in one undo step
    let listState = EditorState.create({
      doc: "1. alpha\n2. beta\n3. gamma\n",
      extensions: [history(), ...editingExtensions()],
    });
    listState = listState.update({
      changes: [
        { from: 0, to: 0, insert: "3. gamma\n" },
        { from: 17, to: 26, insert: "" },
      ],
      userEvent: "move.drop",
    }).state;
    expect(listState.doc.toString()).toBe("1. gamma\n2. alpha\n3. beta\n");

    undo({
      state: listState,
      dispatch: (u) => {
        listState = listState.update(u).state;
      },
    });
    expect(listState.doc.toString()).toBe("1. alpha\n2. beta\n3. gamma\n");
  });
});
