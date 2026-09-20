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
  it("decorates completed 'v' and won't-do 'x' lines with cm-line-resolved", () => {
    const doc = [
      "# Open action",
      "v Done action",
      "> Deferred action",
      "x Cancelled action",
      "Plain text line",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    // Line 1 is "v Done action", Line 3 is "x Cancelled action" (0-indexed)
    expect(indices).toEqual([1, 3]);
  });

  it("decorates indented and consequence resolved actions", () => {
    const doc = [
      "  v Indented done",
      "  => x Consequence cancelled",
      "  => # Consequence open",
      "  > Indented deferred",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    // Line 0 is "  v Indented done", Line 1 is "  => x Consequence cancelled"
    expect(indices).toEqual([0, 1]);
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

  it("leaves deferred (>), open (#), bullets (-), and prose alone", () => {
    const doc = [
      "# Open task",
      "> Deferred task",
      "- Bullet item",
      "Normal prose mentioning v and x in middle",
    ].join("\n");

    const indices = getResolvedLineIndices(doc);
    expect(indices).toEqual([]);
  });

  it("instantiates ViewPlugin successfully", () => {
    const state = EditorState.create({
      doc: "v Done",
      extensions: [resolvedLinesPlugin],
    });
    const view = new EditorView({ state });
    const plugin = view.plugin(resolvedLinesPlugin);
    expect(plugin).toBeDefined();
    view.destroy();
  });
});
