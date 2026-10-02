import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildResolvedLineDecorations, resolvedLinesPlugin } from "./resolvedLines";

function getResolvedLineIndices(doc: string): number[] {
  const state = EditorState.create({ doc });
  const view = new EditorView({ state });
  const decos = buildResolvedLineDecorations(view);
  const resolvedLineIndices: number[] = [];
  decos.between(0, state.doc.length, (from) => {
    const line = state.doc.lineAt(from);
    resolvedLineIndices.push(line.number - 1);
  });
  view.destroy();
  return resolvedLineIndices;
}

describe("resolvedLinesPlugin", () => {
  it("decorates done 'v', deferred '>' and won't-do 'x' lines with cm-line-resolved", () => {
    const doc = [
      "# Open action",
      "v Done action",
      "> Deferred action",
      "x Cancelled action",
      "Plain text line",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    // Lines 1, 2 and 3 (0-indexed): done, deferred and won't-do all read as "not open"
    expect(indices).toEqual([1, 2, 3]);
  });

  it("decorates indented and consequence resolved actions", () => {
    const doc = [
      "  v Indented done",
      "  => x Consequence cancelled",
      "  => # Consequence open",
      "  > Indented deferred",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    // Line 0 done, line 1 won't-do consequence, line 3 deferred; line 2 (an open consequence) stays
    expect(indices).toEqual([0, 1, 3]);
  });

  it("a resolved topic with an OPEN action after its arrow mutes only the part before the arrow", () => {
    const doc = ". discussed budget => # send the numbers\n. discussed => v already sent\n, skipped";
    const state = EditorState.create({ doc });
    const view = new EditorView({ state });
    const found: { line: number; from: number; to: number; cls: string }[] = [];
    buildResolvedLineDecorations(view).between(0, state.doc.length, (from, to, value) => {
      found.push({ line: state.doc.lineAt(from).number - 1, from: from - state.doc.lineAt(from).from, to: to - state.doc.lineAt(from).from, cls: value.spec.class });
    });
    view.destroy();
    // Line 0: a partial line class plus a mark over ". discussed budget " (up to the arrow), nothing after.
    expect(found.filter((f) => f.line === 0)).toEqual([
      { line: 0, from: 0, to: 0, cls: "cm-line-resolved-partial cm-line-resolved-active" }, // the caret starts on line 0
      { line: 0, from: 0, to: ". discussed budget ".length, cls: "cm-resolved-part" },
    ]);
    // Line 1 (the follow-up is done) and line 2 stay whole-line muted.
    expect(found.filter((f) => f.line === 1).map((f) => f.cls)).toEqual(["cm-line-resolved"]);
    expect(found.filter((f) => f.line === 2).map((f) => f.cls)).toEqual(["cm-line-resolved"]);
  });

  it("does not decorate section header titles that start with v or x", () => {
    const doc = [
      "v Section title",
      "===============",
      "v Real done action",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    // Line 0 is header title, Line 1 is underline, Line 2 is real done action
    expect(indices).toEqual([2]);
  });

  it("leaves open (#), bullets (-), and prose alone", () => {
    const doc = [
      "# Open task",
      "- Bullet item",
      "Normal prose mentioning v and x in middle",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    expect(indices).toEqual([]);
  });

  it("marks active resolved line with cm-line-resolved-active when cursor is on it", () => {
    const doc = ["# Task 1", "v Done task", "x Cancelled task"].join("\n");
    // Place caret on line 1 ("v Done task", pos 12)
    const state = EditorState.create({
      doc,
      selection: { anchor: 12 },
    });
    const view = new EditorView({ state });
    const decos = buildResolvedLineDecorations(view);
    const classes: { line: number; cls: string }[] = [];
    decos.between(0, state.doc.length, (from, to, value) => {
      const line = state.doc.lineAt(from);
      classes.push({ line: line.number - 1, cls: (value.spec as any).class });
    });
    view.destroy();

    // Line 1 is active (caret on it), Line 2 is inactive
    expect(classes).toEqual([
      { line: 1, cls: "cm-line-resolved cm-line-resolved-active" },
      { line: 2, cls: "cm-line-resolved" },
    ]);
  });

  it("decorates discussed '.' and not-discussed ',' topic lines, but leaves 'o' open", () => {
    const doc = [
      "o Open topic",
      ". Discussed topic",
      ", Postponed topic",
      "  . Indented discussed topic",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    expect(indices).toEqual([1, 2, 3]);
  });
});
