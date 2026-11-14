import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { lineWordSpans, wordRangeAt } from "./wordSpans";

function spanTexts(line: string, nextLine?: string): string[] {
  return lineWordSpans(line, nextLine).map((s) => line.slice(s.from, s.to));
}

function clickTexts(line: string, nextLine?: string): string[] {
  return lineWordSpans(line, nextLine).map((s) => line.slice(s.from, s.clickTo ?? s.to));
}

describe("lineWordSpans", () => {
  it("extracts leading action, topic, bullet, emphasis, follow-up, and consequence markers with 1 space", () => {
    expect(spanTexts("# task")).toEqual(["# "]);
    expect(spanTexts("v done")).toEqual(["v "]);
    expect(spanTexts("> forwarded")).toEqual(["> "]);
    expect(spanTexts("x cancelled")).toEqual(["x "]);
    expect(spanTexts("o topic")).toEqual(["o "]);
    expect(spanTexts(". point")).toEqual([". "]);
    expect(spanTexts(", note")).toEqual([", "]);
    expect(spanTexts("- item")).toEqual(["- "]);
    expect(spanTexts("* item")).toEqual(["* "]);
    expect(spanTexts("! urgent")).toEqual(["! "]);
    expect(spanTexts("=> follow up")).toEqual(["=> "]);
    expect(spanTexts("  # indented")).toEqual(["# "]);
    expect(spanTexts("\t- tabbed")).toEqual(["- "]);
  });

  it("extracts each marker separately in combined leads", () => {
    expect(spanTexts("# - task")).toEqual(["# ", "- "]);
    expect(spanTexts("=> # call")).toEqual(["=> ", "# "]);
    expect(spanTexts("=> v fixed")).toEqual(["=> ", "v "]);
    expect(spanTexts("=> . thought")).toEqual(["=> ", ". "]);
    expect(spanTexts("v 12. done")).toEqual(["v ", "12. "]);
  });

  it("extracts numbered markers with 1 trailing space and shorter double-click span", () => {
    expect(spanTexts("12. done")).toEqual(["12. "]);
    expect(clickTexts("12. done")).toEqual(["12."]);
    expect(spanTexts("2) second")).toEqual(["2) "]);
    expect(clickTexts("2) second")).toEqual(["2)"]);
    expect(spanTexts("1.1. sub")).toEqual(["1.1. "]);
    expect(clickTexts("1.1. sub")).toEqual(["1.1."]);
    expect(clickTexts("! urgent")).toEqual(["!"]);
  });

  it("extracts due pills on action lines and omits dueWord on plain prose", () => {
    expect(spanTexts("# call by:2026-11-20")).toEqual(["# ", "by:2026-11-20"]);
    expect(spanTexts("# call by:fri")).toEqual(["# ", "by:fri"]);
    expect(spanTexts("# call by:tomorrow")).toEqual(["# ", "by:tomorrow"]);
    expect(spanTexts("# call by:2026-02-30")).toEqual(["# ", "by:2026-02-30"]);
    expect(spanTexts("plain by:fri")).toEqual([]);
    // On plain lines, by:YYYY-MM-DD is not a due pill, so dateLinks matches the date part only.
    expect(spanTexts("plain by:2026-11-20")).toEqual(["2026-11-20"]);
  });

  it("extracts topic tags with parens and does not duplicate inner date", () => {
    expect(spanTexts("# (bug) task by:2026-11-20 fix")).toEqual(["# ", "(bug)", "by:2026-11-20"]);
    // Trailing `(bug)` after task text is a plain paren, not a topic tag.
    expect(spanTexts("# task by:2026-11-20 (bug) fix")).toEqual(["# ", "by:2026-11-20"]);
    expect(spanTexts("# (2026-11-20) review")).toEqual(["# ", "(2026-11-20)"]);
    expect(spanTexts("see (parenthetical) word")).toEqual([]);
    expect(spanTexts("see (bug)")).toEqual([]);
  });

  it("extracts plain dates and 10-char date parts of forward links, excluding URLs and invalid dates", () => {
    expect(spanTexts("on 2026-11-20 we met")).toEqual(["2026-11-20"]);
    expect(spanTexts("see (>2026-11-20) and (<2026-11-20#Sync)")).toEqual(["2026-11-20", "2026-11-20"]);
    expect(spanTexts("https://example.com/2026-11-20/notes")).toEqual([]);
    expect(spanTexts("bad date 2026-02-30")).toEqual([]);
  });

  it("extracts assignees matching tokenizer rules", () => {
    expect(spanTexts("# ask @dana and @dana-k and @dana.k and @Ren\u00e9")).toEqual([
      "# ",
      "@dana",
      "@dana-k",
      "@dana",
      "@Ren\u00e9",
    ]);
    expect(spanTexts("mail user@example.com or (@a, @b)")).toEqual(["@a", "@b"]);
    expect(spanTexts("  @dana")).toEqual(["@dana"]);
  });

  it("returns no spans on setext title lines", () => {
    expect(lineWordSpans("# Header 2026-11-20 (tag) @dana", "===")).toEqual([]);
    expect(lineWordSpans("Notes 2026-11-20", "---")).toEqual([]);
  });
});

function doubleClickText(line: string, offset: number, bias = 1): string {
  const state = EditorState.create({ doc: line });
  const r = wordRangeAt(state, offset, bias);
  return state.sliceDoc(r.from, r.to);
}

describe("wordRangeAt (double-click)", () => {
  it("selects custom spans as whole words and leaves trailing spaces out of markers", () => {
    expect(doubleClickText("# (bug) task", 4)).toBe("(bug)");
    expect(doubleClickText("# task by:2026-11-20", 8)).toBe("by:2026-11-20");
    expect(doubleClickText("# task by:2026-11-20", 15)).toBe("by:2026-11-20");
    expect(doubleClickText("see 2026-11-20 now", 7)).toBe("2026-11-20");
    expect(doubleClickText("see (>2026-11-20#Sync)", 9)).toBe("2026-11-20");
    expect(doubleClickText("ask @dana", 6)).toBe("@dana");
    expect(doubleClickText("ask @dana-k", 10)).toBe("@dana-k");
    expect(doubleClickText("ask @dana.k", 6)).toBe("@dana");
    expect(doubleClickText("12. done", 1)).toBe("12.");
    expect(doubleClickText("12. done", 3)).toBe(" ");
  });

  it("clamps ordinary punctuation and word selection at adjacent span boundaries", () => {
    expect(doubleClickText("(@dana)", 0)).toBe("(");
    expect(doubleClickText("(@dana)", 3)).toBe("@dana");
    expect(doubleClickText("fix-it don't", 1)).toBe("fix");
  });
});
