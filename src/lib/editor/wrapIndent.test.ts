import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  buildWrapIndentDecorations,
  getLineWrapIndent,
} from "./wrapIndent";

describe("getLineWrapIndent", () => {
  it("returns 0 for empty or whitespace-only lines", () => {
    expect(getLineWrapIndent("")).toBe(0);
    expect(getLineWrapIndent("   ")).toBe(0);
    expect(getLineWrapIndent("\t")).toBe(0);
  });

  it("returns 0 for unindented plain prose", () => {
    expect(getLineWrapIndent("This is a normal paragraph that starts at column 0.")).toBe(0);
    expect(getLineWrapIndent("ChronoNote is a fast note-taking app.")).toBe(0);
  });

  it("returns indent length for plain indented text", () => {
    expect(getLineWrapIndent("  Two spaces indented")).toBe(2);
    expect(getLineWrapIndent("    Four spaces indented")).toBe(4);
    expect(getLineWrapIndent("      Six spaces indented")).toBe(6);
    expect(getLineWrapIndent("\tOne tab (2 spaces)")).toBe(2);
  });

  it("returns marker offset for action lines (#, v, >, x)", () => {
    expect(getLineWrapIndent("# Unindented open action")).toBe(2);
    expect(getLineWrapIndent("v Unindented done action")).toBe(2);
    expect(getLineWrapIndent("> Unindented deferred action")).toBe(2);
    expect(getLineWrapIndent("x Unindented cancelled action")).toBe(2);

    expect(getLineWrapIndent("  # Indented 2 spaces")).toBe(4);
    expect(getLineWrapIndent("    # Indented 4 spaces")).toBe(6);
    expect(getLineWrapIndent("  v Indented done")).toBe(4);
    expect(getLineWrapIndent("  > Indented deferred")).toBe(4);
    expect(getLineWrapIndent("  x Indented cancelled")).toBe(4);
  });

  it("returns marker offset for consequence lines (=>)", () => {
    expect(getLineWrapIndent("=> Follow-up note")).toBe(3);
    expect(getLineWrapIndent("  => Indented follow-up")).toBe(5);
    expect(getLineWrapIndent("=> # Follow-up action")).toBe(5);
    expect(getLineWrapIndent("  => # Indented follow-up action")).toBe(7);
    expect(getLineWrapIndent("  => v Indented consequence done")).toBe(7);
  });

  it("returns marker offset for bullet and emphasis items (-, *, !)", () => {
    expect(getLineWrapIndent("- Dash bullet item")).toBe(2);
    expect(getLineWrapIndent("* Asterisk bullet item")).toBe(2);
    expect(getLineWrapIndent("! Emphasis note")).toBe(2);

    expect(getLineWrapIndent("  - Indented dash bullet")).toBe(4);
    expect(getLineWrapIndent("  * Indented asterisk bullet")).toBe(4);
    expect(getLineWrapIndent("  ! Indented emphasis")).toBe(4);
  });

  it("returns marker offset for numbered items", () => {
    expect(getLineWrapIndent("1. Single digit item")).toBe(3);
    expect(getLineWrapIndent("2) Parenthesis delimiter")).toBe(3);
    expect(getLineWrapIndent("10. Double digit item")).toBe(4);
    expect(getLineWrapIndent("100. Triple digit item")).toBe(5);
    expect(getLineWrapIndent("1.2. Hierarchical item")).toBe(5);

    expect(getLineWrapIndent("  1. Indented numbered item")).toBe(5);
    expect(getLineWrapIndent("  10. Indented 10. item")).toBe(6);
  });

  it("returns marker offset for agenda topic items (o, ., ,)", () => {
    expect(getLineWrapIndent("o Plain topic item")).toBe(2);
    expect(getLineWrapIndent(". Completed topic item")).toBe(2);
    expect(getLineWrapIndent(", Skipped topic item")).toBe(2);

    expect(getLineWrapIndent("  o Indented topic item")).toBe(4);
    expect(getLineWrapIndent("o - Bulleted topic item")).toBe(4);
    expect(getLineWrapIndent("o * Star bulleted topic item")).toBe(4);
    expect(getLineWrapIndent("o 1. Numbered topic item")).toBe(5);
    expect(getLineWrapIndent("o 10. Numbered topic item")).toBe(6);
  });
});

describe("buildWrapIndentDecorations", () => {
  it("decorates indented and list lines with cm-line-wrap-indent and style variable", () => {
    const doc = [
      "# Action item",
      "  v Indented done",
      "Plain unindented text",
      "  Indented prose",
      "- Bullet item",
      "1. Numbered item",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });
    const decos = buildWrapIndentDecorations(view);

    const decoratedLines: { lineNum: number; style: string; className: string }[] = [];
    decos.between(0, state.doc.length, (from, _to, deco) => {
      const line = state.doc.lineAt(from);
      decoratedLines.push({
        lineNum: line.number,
        style: (deco.spec.attributes?.style as string) ?? "",
        className: (deco.spec.class as string) ?? "",
      });
    });

    view.destroy();

    // Line 1: "# Action item" -> 2ch
    // Line 2: "  v Indented done" -> 4ch
    // Line 3: "Plain unindented text" -> 0ch (not decorated)
    // Line 4: "  Indented prose" -> 2ch
    // Line 5: "- Bullet item" -> 2ch
    // Line 6: "1. Numbered item" -> 3ch
    expect(decoratedLines).toEqual([
      { lineNum: 1, style: "--line-indent: 2ch;", className: "cm-line-wrap-indent" },
      { lineNum: 2, style: "--line-indent: 4ch;", className: "cm-line-wrap-indent" },
      { lineNum: 4, style: "--line-indent: 2ch;", className: "cm-line-wrap-indent" },
      { lineNum: 5, style: "--line-indent: 2ch;", className: "cm-line-wrap-indent" },
      { lineNum: 6, style: "--line-indent: 3ch;", className: "cm-line-wrap-indent" },
    ]);
  });

  it("does not decorate section header title lines or setext underlines", () => {
    const doc = [
      "Section Header Title",
      "====================",
      "# Action under header",
      "--------------------",
    ].join("\n");

    const state = EditorState.create({ doc });
    const view = new EditorView({ state });
    const decos = buildWrapIndentDecorations(view);

    const decoratedLines: number[] = [];
    decos.between(0, state.doc.length, (from) => {
      const line = state.doc.lineAt(from);
      decoratedLines.push(line.number);
    });

    view.destroy();

    // Only line 3 ("# Action under header") should be decorated
    expect(decoratedLines).toEqual([3]);
  });
});
