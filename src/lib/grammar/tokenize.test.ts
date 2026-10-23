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

  it("names with letters from any script, accents included (\\w alone is ASCII-only)", () => {
    const names = (line: string) =>
      tokenizeLine(line).filter((t) => t.kind === "assignee").map((t) => line.slice(t.from, t.to));
    expect(names("ask @René now")).toEqual(["@René"]);
    expect(names("@Zoë and @Łukasz and @José-Luis")).toEqual(["@Zoë", "@Łukasz", "@José-Luis"]);
    expect(names("ping @田中")).toEqual(["@田中"]);
    // A combining accent (e + U+0301) belongs to the name too.
    expect(names("ask @René now")).toEqual(["@René"]);
    expect(names("# t => @René x")).toEqual(["@René"]);
    // An accented letter before the @ is still an email address, not a name.
    expect(names("mail josé@example.com")).toEqual([]);
  });

  it("names in parentheses are plain assignees; the parentheses have no meaning of their own", () => {
    expect(tokenizeLine("(@a, @b) x")).toEqual([
      { kind: "assignee", from: 1, to: 3, replaced: false },
      { kind: "assignee", from: 5, to: 7, replaced: false },
    ]);
    expect(kinds("(@a)")).toEqual(["assignee"]);
    expect(kinds("# (@dana) task")).toEqual(["action", "assignee"]); // a name is never a topic tag
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


describe("tokenizeLine due and dueWord (Section 1 table)", () => {
  it("# send the report by:2026-10-30 -> due 2026-10-30", () => {
    expect(tokenizeLine("# send the report by:2026-10-30")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 18, to: 31, date: "2026-10-30", replaced: false },
    ]);
  });

  it("# (budget) ask finance by:2026-11-03 -> due 2026-11-03", () => {
    expect(tokenizeLine("# (budget) ask finance by:2026-11-03")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "topicTag", from: 2, to: 10, replaced: false },
      { kind: "due", from: 23, to: 36, date: "2026-11-03", replaced: false },
    ]);
  });

  it("v sent by:2026-10-20 -> due 2026-10-20 (done actions still carry it)", () => {
    expect(tokenizeLine("v sent by:2026-10-20")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "v", replaced: true },
      { kind: "due", from: 7, to: 20, date: "2026-10-20", replaced: false },
    ]);
  });

  it(". budget => # send numbers by:2026-10-28 -> due 2026-10-28, in the consequence part", () => {
    expect(tokenizeLine(". budget => # send numbers by:2026-10-28")).toEqual([
      { kind: "topic", from: 0, to: 2, symbol: ".", replaced: true },
      { kind: "arrow", from: 9, to: 12, replaced: true },
      { kind: "consequence", from: 12, to: 14, symbol: "#", replaced: true },
      { kind: "due", from: 27, to: 40, date: "2026-10-28", replaced: false },
    ]);
  });

  it("# ask Sam => he agreed by:2026-10-28 -> due 2026-10-28, belongs to the # part", () => {
    expect(tokenizeLine("# ask Sam => he agreed by:2026-10-28")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "arrow", from: 10, to: 13, replaced: true },
      { kind: "due", from: 23, to: 36, date: "2026-10-28", replaced: false },
    ]);
  });

  it("=> @dana send the slides by:2026-10-29 -> due 2026-10-29, delegated part", () => {
    expect(tokenizeLine("=> @dana send the slides by:2026-10-29")).toEqual([
      { kind: "arrow", from: 0, to: 3, replaced: true },
      { kind: "assignee", from: 3, to: 8, replaced: false },
      { kind: "due", from: 25, to: 38, date: "2026-10-29", replaced: false },
    ]);
  });

  it("# a by:2026-10-30 => # b by:2026-10-31 -> two due tokens, one per part", () => {
    expect(tokenizeLine("# a by:2026-10-30 => # b by:2026-10-31")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 4, to: 17, date: "2026-10-30", replaced: false },
      { kind: "arrow", from: 18, to: 21, replaced: true },
      { kind: "consequence", from: 21, to: 23, symbol: "#", replaced: true },
      { kind: "due", from: 25, to: 38, date: "2026-10-31", replaced: false },
    ]);
  });

  it("# a by:2026-10-30 by:2026-10-31 -> one due token (the first)", () => {
    expect(tokenizeLine("# a by:2026-10-30 by:2026-10-31")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 4, to: 17, date: "2026-10-30", replaced: false },
    ]);
  });

  it("# call by:fri -> dueWord fri", () => {
    expect(tokenizeLine("# call by:fri")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 7, to: 13, word: "fri", replaced: false },
    ]);
  });

  it("# call by:2026-02-30 -> dueWord 2026-02-30", () => {
    expect(tokenizeLine("# call by:2026-02-30")).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "dueWord", from: 7, to: 20, word: "2026-02-30", replaced: false },
    ]);
  });

  it("non-action lines yield none", () => {
    for (const line of [
      "o budget by:2026-10-30",
      "- item by:2026-10-30",
      "plain by:2026-10-30",
      "! x by:2026-10-30",
    ]) {
      expect(tokenizeLine(line).some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("nearby, parenthesized, and empty by: yield none", () => {
    for (const line of ["# nearby:2026-10-30", "# (by:2026-10-30)", "# by:"]) {
      expect(tokenizeLine(line).some((t) => t.kind === "due" || t.kind === "dueWord")).toBe(false);
    }
  });

  it("# send By:2026-10-30. -> due 2026-10-30, token ends before the .", () => {
    const tokens = tokenizeLine("# send By:2026-10-30.");
    expect(tokens).toEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "due", from: 7, to: 20, date: "2026-10-30", replaced: false },
    ]);
    expect("# send By:2026-10-30.".slice(7, 20)).toBe("By:2026-10-30");
  });
});
