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

  it("emphasis covers to the end of line and is not replaced", () => {
    expect(tokenizeLine("! hi")).toEqual([{ kind: "emphasis", from: 0, to: 4, symbol: "!", replaced: false }]);
    expect(tokenizeLine("  ! hi")).toEqual([{ kind: "emphasis", from: 2, to: 6, symbol: "!", replaced: false }]);
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
    expect(tokenizeLine("a => o b")).toEqual([
      { kind: "arrow", from: 2, to: 5, replaced: true },
      { kind: "consequenceTopic", from: 5, to: 7, symbol: "o", replaced: true },
    ]);
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

  it("topic tag right after an action symbol, a topic symbol, or a consequence", () => {
    expect(tokenizeLine("# (topic) text")[1]).toEqual({ kind: "topicTag", from: 2, to: 9, replaced: false });
    expect(tokenizeLine("a => # (t) x").at(-1)).toEqual({ kind: "topicTag", from: 7, to: 10, replaced: false });
    expect(tokenizeLine("o (topic) text")[1]).toEqual({ kind: "topicTag", from: 2, to: 9, replaced: false });
    expect(tokenizeLine("a => o (t) x").at(-1)).toEqual({ kind: "topicTag", from: 7, to: 10, replaced: false });
    expect(kinds("# text (topic)")).toEqual(["action", "paren"]);
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

  it("rule cases and plain cases from grammar brief", () => {
    // 1. Bullet after state symbol
    expect(tokenizeLine("# - task")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "bullet", from: 2, to: 4, symbol: "-", replaced: true },
    ]);
    expect(tokenizeLine("o * topic")).toEqual([
      { kind: "topic", from: 0, to: 2, symbol: "o", replaced: true },
      { kind: "bullet", from: 2, to: 4, symbol: "*", replaced: true },
    ]);
    expect(tokenizeLine("- # task")).toEqual([
      { kind: "bullet", from: 0, to: 2, symbol: "-", replaced: true },
    ]);
    expect(tokenizeLine("# 1. task")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
    ]);

    // 2. Emphasis in more places
    expect(tokenizeLine("  ! remember")).toEqual([
      { kind: "emphasis", from: 2, to: 12, symbol: "!", replaced: false },
    ]);
    expect(tokenizeLine("# ! urgent")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "emphasis", from: 2, to: 10, symbol: "!", replaced: false },
    ]);
    expect(tokenizeLine("o ! discuss")).toEqual([
      { kind: "topic", from: 0, to: 2, symbol: "o", replaced: true },
      { kind: "emphasis", from: 2, to: 11, symbol: "!", replaced: false },
    ]);
    expect(tokenizeLine("- ! x")).toEqual([
      { kind: "bullet", from: 0, to: 2, symbol: "-", replaced: true },
    ]);
    expect(tokenizeLine("text ! x")).toEqual([]);

    // 3. Agenda topic after follow-up arrow
    expect(tokenizeLine("text => o topic")).toEqual([
      { kind: "arrow", from: 5, to: 8, replaced: true },
      { kind: "consequenceTopic", from: 8, to: 10, symbol: "o", replaced: true },
    ]);
    expect(tokenizeLine("text => . done")).toEqual([
      { kind: "arrow", from: 5, to: 8, replaced: true },
      { kind: "consequenceTopic", from: 8, to: 10, symbol: ".", replaced: true },
    ]);

    // 4. Topic tag after topic symbol
    expect(tokenizeLine("=> o (budget) x")).toEqual([
      { kind: "arrow", from: 0, to: 3, replaced: true },
      { kind: "consequenceTopic", from: 3, to: 5, symbol: "o", replaced: true },
      { kind: "topicTag", from: 5, to: 13, replaced: false },
    ]);
    expect(tokenizeLine("o (budget) x")).toEqual([
      { kind: "topic", from: 0, to: 2, symbol: "o", replaced: true },
      { kind: "topicTag", from: 2, to: 10, replaced: false },
    ]);

    // Still plain / unchanged
    expect(tokenizeLine("=> @dana x")).toEqual([
      { kind: "arrow", from: 0, to: 3, replaced: true },
      { kind: "assignee", from: 3, to: 8, replaced: false },
    ]);
    expect(tokenizeLine("text o x")).toEqual([]);
  });
});

describe("GLYPHS", () => {
  it("maps every symbol, falls back to the open glyph", () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([",", ".", "#", ">", "bullet", "o", "v", "x"].sort());
    expect(glyphSpecForSymbol("zzz")).toEqual(GLYPHS["#"]);
    expect(glyphSpecForSymbol("v").cls).toBe("glyph-done");
  });
});
