import { describe, expect, it } from "vitest";
import { tokenizeLine } from "./tokenize";
import { GLYPHS, glyphSpecForSymbol } from "./glyphs";

const kinds = (line: string) => tokenizeLine(line).map((t) => t.kind);

describe("tokenizeLine", () => {
  it("line-start action symbol includes the trailing space, not the indentation", () => {
    expect(tokenizeLine("# a")).toEqual([{ kind: "action", from: 0, to: 2, symbol: "#", replaced: true }]);
    expect(tokenizeLine("    v done")).toEqual([{ kind: "action", from: 4, to: 6, symbol: "v", replaced: true }]);
    for (const s of [">", "x"]) expect(tokenizeLine(`${s} a`)[0]).toMatchObject({ kind: "action", symbol: s });
  });

  it("needs a space after the symbol", () => {
    expect(tokenizeLine("#no")).toEqual([]);
    expect(tokenizeLine("#")).toEqual([]);
  });

  it("agenda topics", () => {
    for (const s of ["o", ".", ","]) {
      expect(tokenizeLine(`  ${s} t`)).toEqual([{ kind: "topic", from: 2, to: 4, symbol: s, replaced: true }]);
    }
  });

  it("bullets", () => {
    expect(tokenizeLine("- a")).toEqual([{ kind: "bullet", from: 0, to: 2, symbol: "-", replaced: true }]);
    expect(tokenizeLine("  * a")[0]).toMatchObject({ kind: "bullet", from: 2, to: 4, symbol: "*" });
  });

  it("emphasis covers the whole line and is not replaced", () => {
    expect(tokenizeLine("! hi")).toEqual([{ kind: "emphasis", from: 0, to: 4, symbol: "!", replaced: false }]);
    expect(tokenizeLine("  ! hi")).toEqual([]);
    expect(tokenizeLine("!hi")).toEqual([]);
  });

  it("plain arrow", () => {
    expect(tokenizeLine("a => b")).toEqual([{ kind: "arrow", from: 2, to: 5, replaced: true }]);
  });

  it("arrow with a consequence symbol", () => {
    expect(tokenizeLine("a => # b")).toEqual([
      { kind: "arrow", from: 2, to: 5, replaced: true },
      { kind: "consequence", from: 5, to: 7, symbol: "#", replaced: true },
    ]);
    // only the four action symbols can be a consequence
    expect(kinds("a => o b")).toEqual(["arrow"]);
  });

  it("arrow with an assignee", () => {
    expect(tokenizeLine("# t => @dana ok")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "arrow", from: 4, to: 7, replaced: true },
      { kind: "assignee", from: 7, to: 12, replaced: false },
    ]);
  });

  it("bare assignee, with hyphens, but not in an email or URL path", () => {
    expect(tokenizeLine("ask @first-last now")).toEqual([{ kind: "assignee", from: 4, to: 15, replaced: false }]);
    expect(tokenizeLine("mail dana@example.com")).toEqual([]);
    expect(tokenizeLine("see https://x.y/@user")).toEqual([]);
  });

  it("parenthesised assignee list: a list token, then one token per name", () => {
    expect(tokenizeLine("(@a, @b) x")).toEqual([
      { kind: "assigneeList", from: 0, to: 8, replaced: false },
      { kind: "assignee", from: 1, to: 3, replaced: false },
      { kind: "assignee", from: 5, to: 7, replaced: false },
    ]);
    expect(kinds("(@a)")).toEqual(["assigneeList", "assignee"]);
  });

  it("topic tag only right after the action symbol or a consequence", () => {
    expect(tokenizeLine("# (topic) text")[1]).toEqual({ kind: "topicTag", from: 2, to: 9, replaced: false });
    expect(tokenizeLine("a => # (t) x").at(-1)).toEqual({ kind: "topicTag", from: 7, to: 10, replaced: false });
    expect(kinds("# text (topic)")).toEqual(["action", "paren"]);
    expect(kinds("o (topic)")).toEqual(["topic", "paren"]);
    expect(kinds("(word) at the start")).toEqual(["paren"]);
  });

  it("a paren consumes what is inside it", () => {
    expect(kinds("(a@b) @c")).toEqual(["paren", "assignee"]);
  });

  it("empty and blank lines have no tokens", () => {
    expect(tokenizeLine("")).toEqual([]);
    expect(tokenizeLine("   ")).toEqual([]);
  });

  it("continues scanning after the emphasis marker", () => {
    expect(kinds("! see @sam")).toEqual(["emphasis", "assignee"]);
  });
});

describe("GLYPHS", () => {
  it("maps every symbol, falls back to the open glyph", () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([",", ".", "#", ">", "bullet", "o", "v", "x"].sort());
    expect(glyphSpecForSymbol("zzz")).toEqual(GLYPHS["#"]);
    expect(glyphSpecForSymbol("v").cls).toBe("glyph-done");
  });
});
