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
    expect(text("> deferred")).toBe("☐ deferred");
    expect(classed("> deferred")).toEqual([["glyph-progress", "☐"]]);
    expect(text("x nope")).toBe("☒ nope");
    expect(text("o topic")).toBe("○ topic");
    expect(classed("o topic")).toEqual([["glyph-topic-open", "○"]]);
    expect(text(". discussed")).toBe("◉ discussed");
    expect(classed(". discussed")).toEqual([["glyph-topic-done", "◉"]]);
    expect(text(", postponed")).toBe("◌ postponed");
    expect(classed(", postponed")).toEqual([["glyph-topic-skipped", "◌"]]);
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

  it("a bare @name is highlighted on any line, with or without a `=> ` or an action symbol", () => {
    expect(classed("email @dana about it")).toEqual([["glyph-assignee", "@dana"]]);
    expect(text("email @dana about it")).toBe("email @dana about it");
    expect(classed("# ask @sam, then @lee")).toEqual([
      ["glyph-open", "☐"],
      ["glyph-assignee", "@sam"],
      ["glyph-assignee", "@lee"],
    ]);
    expect(classed("@sam owns this")).toEqual([["glyph-assignee", "@sam"]]);
  });

  it("an @ glued to a word (an email address) or a URL path is not a name", () => {
    expect(classed("mail dana@example.com today")).toEqual([]);
    expect(classed("see https://social.example/@dana")).toEqual([]);
    expect(classed("a@b and @c")).toEqual([["glyph-assignee", "@c"]]); // only the free-standing one
  });

  it("#125: a hyphenated @name is one badge", () => {
    expect(classed("=> @jean-luc owns the migration")).toContainEqual(["glyph-assignee", "@jean-luc"]);
    expect(classed("=> talk to @mary-jane about it")).toContainEqual(["glyph-assignee", "@mary-jane"]);
  });

  it("a list of delegates, (@a, @b, @c), badges every name and keeps the commas and parens", () => {
    const line = "# review the doc (@dana, @sam-jay, @lee) by friday";
    const names = classed(line).filter(([cls]) => cls === "glyph-assignee").map(([, txt]) => txt);
    expect(names).toEqual(["@dana", "@sam-jay", "@lee"]);
    expect(text(line)).toBe("☐ review the doc (@dana, @sam-jay, @lee) by friday");
    // space-separated works too, and it needs no leading action symbol at all
    expect(classed("# x (@a @b)").filter(([cls]) => cls === "glyph-assignee").map(([, txt]) => txt)).toEqual(["@a", "@b"]);
    expect(classed("just prose (@a, @b)").filter(([cls]) => cls === "glyph-assignee").map(([, txt]) => txt)).toEqual(["@a", "@b"]);
  });

  it("#126: `(@name)` badges the name, keeps the parens, and is not a topic", () => {
    const cs = classed("# review the doc (@dana) by friday");
    expect(cs).toContainEqual(["glyph-assignee", "@dana"]);
    expect(cs.some(([c]) => c === "glyph-topic")).toBe(false);
    expect(text("# review the doc (@dana) by friday")).toBe("☐ review the doc (@dana) by friday");
    // right after the symbol, `(@dana)` is still a delegate, not a topic
    expect(classed("# (@dana) chase it")).toContainEqual(["glyph-assignee", "@dana"]);
  });

  it("`(@name)` needs no action symbol or `=> ` at all — badges on plain prose and agenda topics too", () => {
    expect(classed("notes from lunch with (@dana)")).toContainEqual(["glyph-assignee", "@dana"]);
    expect(classed("o discuss the roadmap with (@dana, @sam)").filter(([cls]) => cls === "glyph-assignee").map(([, txt]) => txt)).toEqual(["@dana", "@sam"]);
  });

  it("#36/#39: highlights a (topic) tag only right after the action symbol", () => {
    expect(classed("# (release) ship the docs")).toContainEqual(["glyph-topic", "(release)"]);
    // not right after the symbol → plain text
    expect(classed("# ship the docs (release)")).toEqual([["glyph-open", "☐"]]);
    // consequence-action: right after the inner symbol counts too
    expect(classed("Talked to Sam => # (q3) follow up")).toContainEqual(["glyph-topic", "(q3)"]);
    // prose parenthetical → untouched
    expect(classed("just prose (aside) here")).toEqual([]);
  });

  it("round-trips plain prose unchanged", () => {
    expect(text("nothing special on this line")).toBe("nothing special on this line");
    expect(classed("nothing special on this line")).toEqual([]);
  });
});
