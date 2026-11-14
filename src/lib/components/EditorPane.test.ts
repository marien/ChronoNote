import { describe, expect, it } from "vitest";
import { EditorState, Transaction } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { editorChanges } from "../editor/editorChanges";

function createState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [history()] });
}

function applySetContent(state: EditorState, text: string, options?: { outside?: boolean }): EditorState {
  const changes = editorChanges(state.doc.toString(), text);
  if (!changes.length) return state;
  return state.update({
    changes,
    ...(options?.outside ? { annotations: Transaction.addToHistory.of(false) } : {}),
  }).state;
}

function runCommand(state: EditorState, cmd: (target: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean): EditorState {
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

describe("Rule 1: Ctrl+Z never undoes an outside change", () => {
  it("example 1: outside change replacing the whole note is never undone by Ctrl+Z", () => {
    let state = createState("original line\n");
    state = state.update({ changes: { from: 0, to: 0, insert: "typed " }, selection: { anchor: 6 } }).state;
    expect(state.doc.toString()).toBe("typed original line\n");

    state = applySetContent(state, "EXTERNAL change\n", { outside: true });
    expect(state.doc.toString()).toBe("EXTERNAL change\n");

    state = runCommand(state, undo);
    expect(state.doc.toString()).toBe("EXTERNAL change\n");
  });

  it("example 2: earlier user undo and redo steps map through an outside change and keep it", () => {
    let state = createState("A\nB\n");
    state = state.update({ changes: { from: 1, to: 1, insert: "x" }, selection: { anchor: 2 } }).state;
    expect(state.doc.toString()).toBe("Ax\nB\n");

    state = applySetContent(state, "Ax\nB2\n", { outside: true });
    expect(state.doc.toString()).toBe("Ax\nB2\n");

    state = runCommand(state, undo);
    expect(state.doc.toString()).toBe("A\nB2\n");

    state = runCommand(state, redo);
    expect(state.doc.toString()).toBe("Ax\nB2\n");
  });

  it("internal setContent without { outside: true } remains undoable", () => {
    let state = createState("# task\n");
    state = applySetContent(state, "v task\n");
    expect(state.doc.toString()).toBe("v task\n");

    state = runCommand(state, undo);
    expect(state.doc.toString()).toBe("# task\n");
  });

  it("outside emoji change never splits surrogate pairs or introduces U+FFFD", () => {
    let state = EditorState.create({
      doc: "\uD83D\uDCC5 meeting",
      selection: { anchor: "\uD83D\uDCC5 ".length },
      extensions: [history()],
    });
    state = applySetContent(state, "\uD83D\uDCC6 meeting", { outside: true });
    expect(state.doc.toString()).toBe("\uD83D\uDCC6 meeting");
    expect(state.doc.toString().includes("\uFFFD")).toBe(false);

    state = applySetContent(state, "\uD83D\uDCC6! meeting", { outside: true });
    expect(state.doc.toString()).toBe("\uD83D\uDCC6! meeting");
    expect(state.doc.toString().includes("\uFFFD")).toBe(false);
  });

  it("5,000-line outside change far from caret keeps caret on the same text without scrollIntoView", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`);
    const doc = lines.join("\n");
    const target = "line 4900";
    const caret = doc.indexOf(target) + 2;
    const state = EditorState.create({ doc, selection: { anchor: caret }, extensions: [history()] });

    const updated = [...lines];
    updated[5] = "line 6 changed externally";
    const next = updated.join("\n");
    const tr = state.update({
      changes: editorChanges(state.doc.toString(), next),
      annotations: Transaction.addToHistory.of(false),
    });

    expect(tr.scrollIntoView).toBe(false);
    expect(tr.state.doc.toString()).toBe(next);
    const pos = tr.state.selection.main.head;
    expect(tr.state.doc.sliceString(pos - 2, pos - 2 + target.length)).toBe(target);
  });
});
