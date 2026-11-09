// #208: `! - item` / `! * item` is an emphasised list item (also indented, and after an action or topic symbol).
import { describe, it, expect } from "vitest";
import { tokenizeLine } from "./tokenize";
import { parseGlyphLine } from "../editor/glyphLine";
import { getLineWrapIndent } from "../editor/wrapIndent";
import { actionLineEnter, leadingMarkerIndent } from "../tokens";

const kinds = (line: string) => tokenizeLine(line).map((t) => t.kind);
const text = (line: string) => parseGlyphLine(line, { today: "2026-11-09" }).map((p) => p.text).join("");
const classed = (line: string) =>
  parseGlyphLine(line, { today: "2026-11-09" })
    .filter((p) => p.cls)
    .map((p) => [p.cls, p.text]);

describe("emphasised list items (#208)", () => {
  it("tokenizes the bullet after a leading `! `", () => {
    expect(tokenizeLine("! - item")).toEqual([
      { kind: "emphasis", from: 0, to: 8, symbol: "!", replaced: false },
      { kind: "bullet", from: 2, to: 4, symbol: "-", replaced: true },
    ]);
    expect(tokenizeLine("    ! * nested")[1]).toMatchObject({ kind: "bullet", from: 6, to: 8, symbol: "*" });
  });

  it("after an action or topic symbol: symbol, emphasis, bullet", () => {
    expect(kinds("# ! - urgent item")).toEqual(["action", "emphasis", "bullet"]);
    expect(kinds("o ! * topic item")).toEqual(["topic", "emphasis", "bullet"]);
  });

  it("keeps the other forms as they were", () => {
    expect(kinds("! important")).toEqual(["emphasis"]);
    expect(kinds("- ! item")).toEqual(["bullet"]); // list marker first: `!` stays text
    expect(kinds("! -item")).toEqual(["emphasis"]); // no space after the dash: not a bullet
    expect(kinds("! - see @sam")).toEqual(["emphasis", "bullet", "assignee"]);
  });

  it("draws the bullet inside the emphasised line", () => {
    expect(text("! - item")).toBe("! • item");
    expect(classed("! - item")).toEqual([
      ["glyph-emphasis-line", "! "],
      ["glyph-bullet glyph-bullet-emphasis", "•"],
      ["glyph-emphasis-line", "item"],
    ]);
    expect(text("  # ! * urgent")).toBe("  ☐ ! • urgent");
  });

  it("wraps under the item's text", () => {
    expect(getLineWrapIndent("! - item")).toBe(4);
    expect(getLineWrapIndent("  ! * item")).toBe(6);
  });

  it("Enter continues `# ! - ` and treats the `!` as the line's leading marker", () => {
    expect(actionLineEnter("# ! - urgent")).toEqual({ insert: "\n# ! - " });
    expect(actionLineEnter("  v ! * done")).toEqual({ insert: "\n  # ! * " });
    expect(actionLineEnter("# ! - ")).toEqual({ removeSymbol: true });
    expect(leadingMarkerIndent("  ! - item")).toBe(2);
    expect(leadingMarkerIndent("! plain emphasis")).toBeNull();
  });
});
