import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { stateFirstFilter } from "./stateFirst";

function makeState(doc: string, anchor = 0) {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [history(), stateFirstFilter],
  });
}

describe("stateFirstFilter", () => {
  it("rewrites list-then-state when caret leaves the line", () => {
    let state = makeState("- # task\n", 8);
    // Move caret to line 2
    state = state.update({ selection: { anchor: 9 }, userEvent: "select" }).state;
    expect(state.doc.line(1).text).toBe("# - task");
  });

  it("leaves a line alone when the move is not the user's (a note loaded or synced in)", () => {
    let state = makeState("- # task\n", 8);
    state = state.update({ selection: { anchor: 9 } }).state;
    expect(state.doc.line(1).text).toBe("- # task");
    state = makeState("x\n", 0);
    state = state.update({ changes: { from: 0, to: 2, insert: "- # loaded\nnext" }, selection: { anchor: 13 } }).state;
    expect(state.doc.line(1).text).toBe("- # loaded");
  });

  it("rewrites on Enter leaving the line, and one undo restores original", () => {
    let state = makeState("- # task", 8);
    // Press Enter (insert \n and move caret)
    state = state.update({ changes: { from: 8, insert: "\n" }, selection: { anchor: 9 }, userEvent: "input" }).state;
    expect(state.doc.line(1).text).toBe("# - task");

    // Undo should restore the line to "- # task" with 1 step
    const viewMock = {
      state,
      dispatch(tr: any) {
        state = tr.state ?? state.update(tr).state;
      },
    };
    undo(viewMock as any);
    expect(state.doc.toString()).toBe("- # task");
  });

  it("does not touch the line while caret is still on it", () => {
    let state = makeState("- # task", 2);
    state = state.update({ selection: { anchor: 8 } }).state;
    expect(state.doc.line(1).text).toBe("- # task");
  });

  it("ignores multi-cursor selections", () => {
    let state = EditorState.create({
      doc: "- # task\nline 2",
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(9)]),
      extensions: [stateFirstFilter],
    });
    state = state.update({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(10)]) }).state;
    expect(state.doc.line(1).text).toBe("- # task");
  });

  it("leaves unchanged lines alone when caret leaves", () => {
    for (const line of ["- item", "# - task", "text - # x", "- #hashtag", "====="]) {
      let state = makeState(`${line}\n`, line.length);
      state = state.update({ selection: { anchor: line.length + 1 } }).state;
      expect(state.doc.line(1).text).toBe(line);
    }
  });
});
