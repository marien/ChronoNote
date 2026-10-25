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

  it("bolds the line from `! ` for leading, indented, and following emphasis", () => {
    expect(classed("! important")).toEqual([["glyph-emphasis-line", "! important"]]);
    expect(classed("  ! indented")).toEqual([["glyph-emphasis-line", "! indented"]]);
    expect(text("  ! indented")).toBe("  ! indented");
    expect(classed("# ! urgent")).toEqual([["glyph-open", "☐"], ["glyph-emphasis-line", "! urgent"]]);
    expect(text("# ! urgent")).toBe("☐ ! urgent");
    expect(classed("o ! discuss")).toEqual([["glyph-topic-open", "○"], ["glyph-emphasis-line", "! discuss"]]);
  });

  it("renders bullet after an action or topic symbol", () => {
    expect(text("# - task")).toBe("☐ • task");
    expect(classed("# - task")).toEqual([["glyph-open", "☐"], ["glyph-bullet", "•"]]);
    expect(text("o * topic")).toBe("○ • topic");
    expect(classed("o * topic")).toEqual([["glyph-topic-open", "○"], ["glyph-bullet", "•"]]);
  });

  it("renders `=> ` follow-up forms and consequence topic", () => {
    expect(text("=> chase it")).toBe("➔ chase it");
    expect(text("=> @sam owns it")).toBe("➔ @sam owns it");
    expect(classed("=> @sam owns it")).toEqual([
      ["glyph-followup", "➔"],
      ["glyph-assignee", "@sam"],
    ]);
    expect(text("=> # open consequence")).toBe("➔ ☐ open consequence");
    expect(text("=> o topic consequence")).toBe("➔ ○ topic consequence");
    expect(classed("=> o topic consequence")).toEqual([
      ["glyph-followup", "➔"],
      ["glyph-topic-open", "○"],
    ]);
    expect(classed("Talked to Sam => . done")).toEqual([
      ["glyph-followup", "➔"],
      ["glyph-topic-done", "◉"],
    ]);
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

  describe("due dates and range clipping (S426)", () => {
    const today = "2026-10-24";

    it("renders due dates with status class, tooltip title, and flag subpart", () => {
      const parts = parseGlyphLine("# task by:2026-10-30", { today });
      const due = parts.find((p) => p.cls?.startsWith("cm-due"));
      expect(due).toBeDefined();
      expect(due?.cls).toBe("cm-due cm-due-later");
      expect(due?.text).toBe("by:2026-10-30");
      expect(due?.title).toBeDefined();
      expect(due?.parts).toEqual([
        { text: "by:", cls: "cm-due-flag" },
        { text: "2026-10-30" },
      ]);
    });

    it("marks overdue, today, and resolved statuses correctly", () => {
      const overdue = parseGlyphLine("# task by:2026-10-20", { today });
      expect(overdue.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-overdue");

      const dueToday = parseGlyphLine("# task by:2026-10-24", { today });
      expect(dueToday.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-today");

      const resolvedV = parseGlyphLine("v task by:2026-10-20", { today });
      expect(resolvedV.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-resolved");

      const resolvedFwd = parseGlyphLine("> task by:2026-10-20", { today });
      expect(resolvedFwd.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-resolved");

      const resolvedX = parseGlyphLine("x task by:2026-10-20", { today });
      expect(resolvedX.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-resolved");
    });

    it("marks consequence actions resolved based on the consequence state", () => {
      const openConseq = parseGlyphLine("Talked => # follow up by:2026-10-20", { today });
      expect(openConseq.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-overdue");

      const doneConseq = parseGlyphLine("Talked => v follow up by:2026-10-20", { today });
      expect(doneConseq.find((p) => p.cls?.startsWith("cm-due"))?.cls).toBe("cm-due cm-due-resolved");
    });

    it("keeps dueWord tokens as plain text", () => {
      const parts = parseGlyphLine("# task by:tomorrow", { today });
      expect(parts.some((p) => p.cls?.startsWith("cm-due"))).toBe(false);
      expect(parts.map((p) => p.text).join("")).toBe("☐ task by:tomorrow");
    });

    it("clips parts according to from and to ranges", () => {
      const line = "# (topic) review doc by:2026-10-30";
      // Clip out the leading action glyph, keep topic and due date
      const clipped = parseGlyphLine(line, { today, from: 2, to: line.length });
      expect(clipped.map((p) => p.text).join("")).toBe("(topic) review doc by:2026-10-30");
      expect(clipped[0].cls).toBe("glyph-topic");
      expect(clipped[0].text).toBe("(topic)");
      const due = clipped.find((p) => p.cls?.startsWith("cm-due"));
      expect(due?.text).toBe("by:2026-10-30");

      // Clip plain text and drop tokens outside range
      const inner = parseGlyphLine(line, { today, from: 10, to: 20 });
      expect(inner.map((p) => p.text).join("")).toBe("review doc");
      expect(inner.every((p) => !p.cls)).toBe(true);

      // Straddled token is emitted as plain text for the part inside
      const straddled = parseGlyphLine(line, { today, from: 21, to: 26 });
      expect(straddled).toEqual([{ text: "by:20" }]);
    });
  });

  describe("forward links in parseGlyphLine", () => {
    it("renders forward link with section as a pill with nested parts", () => {
      const parts = parseGlyphLine("task (>2026-10-26#Weekly Sync)");
      const pill = parts.find((p) => p.cls === "cm-fwd-link");
      expect(pill).toEqual({
        text: "(>2026-10-26#Weekly Sync)",
        cls: "cm-fwd-link",
        title: "October 26, 2026 · Weekly Sync",
        parts: [
          { text: "(>", cls: "cm-fwd-dir cm-fwd-dir-to" },
          { text: "2026-10-26" },
          { text: "#", cls: "cm-fwd-sep" },
          { text: "Weekly Sync" },
          { text: ")", cls: "cm-fwd-paren" },
        ],
      });
    });

    it("renders back link without section as a pill with nested parts", () => {
      const parts = parseGlyphLine("task (<2026-10-13)");
      const pill = parts.find((p) => p.cls === "cm-fwd-link");
      expect(pill).toEqual({
        text: "(<2026-10-13)",
        cls: "cm-fwd-link",
        title: "October 13, 2026",
        parts: [
          { text: "(<", cls: "cm-fwd-dir cm-fwd-dir-from" },
          { text: "2026-10-13" },
          { text: ")", cls: "cm-fwd-paren" },
        ],
      });
    });

    it("renders two forward links on one line", () => {
      const parts = parseGlyphLine("> task (<2026-10-20#Standup) (>2026-10-26#Weekly Sync)");
      const pills = parts.filter((p) => p.cls === "cm-fwd-link");
      expect(pills).toHaveLength(2);
      expect(pills[0].title).toBe("October 20, 2026 · Standup");
      expect(pills[0].parts?.[0].cls).toBe("cm-fwd-dir cm-fwd-dir-from");
      expect(pills[1].title).toBe("October 26, 2026 · Weekly Sync");
      expect(pills[1].parts?.[0].cls).toBe("cm-fwd-dir cm-fwd-dir-to");
    });
  });
});
