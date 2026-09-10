import { describe, it, expect } from "vitest";
import { parseGlyphLine } from "./glyphLine";

/** Collapse the parts back to a plain string, and to a "class map" of the
 * non-plain spans, so assertions read clearly. */
const text = (line: string) =>
  parseGlyphLine(line)
    .map((p) => p.text)
    .join("");
const classed = (line: string) =>
  parseGlyphLine(line)
    .filter((p) => p.cls)
    .map((p) => [p.cls, p.text] as const);

describe("parseGlyphLine", () => {
  it("replaces a leading action symbol with its glyph and a gap", () => {
    expect(text("# buy milk")).toBe("☐ buy milk");
    expect(classed("# buy milk")).toEqual([["glyph-open", "☐"]]);
    expect(text("v done")).toBe("☑ done");
    expect(text("> deferred")).toBe("» deferred");
    expect(text("x nope")).toBe("☒ nope");
  });

  it("keeps indentation before the glyph", () => {
    expect(text("  # nested")).toBe("  ☐ nested");
  });

  it("renders bullets", () => {
    expect(text("- a point")).toBe("• a point");
    expect(classed("* another")).toEqual([["glyph-bullet", "•"]]);
  });

  it("bolds the whole line for `! `", () => {
    expect(classed("! important")).toEqual([["glyph-emphasis-line", "! important"]]);
  });

  it("renders `=> ` follow-up forms", () => {
    expect(text("=> chase it")).toBe("➔ chase it");
    expect(text("=> @sam owns it")).toBe("➔ @sam owns it");
    expect(classed("=> @sam owns it")).toEqual([
      ["glyph-followup", "➔"],
      ["glyph-assignee", "@sam"],
    ]);
    expect(text("=> # open consequence")).toBe("➔ ☐ open consequence");
  });

  it("#35: highlights every @name on a delegation line, not just after the arrow", () => {
    const cs = classed("=> @sam and later @dana too");
    expect(cs).toContainEqual(["glyph-assignee", "@sam"]);
    expect(cs).toContainEqual(["glyph-assignee", "@dana"]);
  });

  it("#35: leaves @name alone on a line with no `=> `", () => {
    expect(classed("email @dana about it")).toEqual([]);
    expect(text("email @dana about it")).toBe("email @dana about it");
  });

  it("#36: highlights a (topic) tag on an action line only", () => {
    expect(classed("# ship the docs (release)")).toContainEqual(["glyph-topic", "(release)"]);
    expect(classed("just prose (aside) here")).toEqual([]);
  });

  it("round-trips plain prose unchanged", () => {
    expect(text("nothing special on this line")).toBe("nothing special on this line");
    expect(classed("nothing special on this line")).toEqual([]);
  });
});
