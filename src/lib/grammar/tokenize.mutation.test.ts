import { describe, expect, it } from "vitest";
import {
  findBalancedParenEnd,
  getLineActionParts,
  isSetextUnderline,
  isTitleLine,
  tokenAfterArrow,
  tokenizeDocLine,
  tokenizeLine,
  tokenizeNoteLine,
  trailingForwardLinksStart,
} from "./tokenize";

describe("tokenize helpers and edge rules", () => {
  it("isSetextUnderline requires the entire trimmed line to be three or more '='", () => {
    expect(isSetextUnderline("  ===  ")).toBe(true);
    expect(isSetextUnderline("a===")).toBe(false);
    expect(isSetextUnderline("===")).toBe(true);
  });

  it("isTitleLine rejects whitespace-only lines above a title underline", () => {
    expect(isTitleLine("   ", "---")).toBe(false);
    expect(isTitleLine("\t ", "===")).toBe(false);
  });

  it("tokenAfterArrow returns undefined when the following token starts before the arrow ends", () => {
    const arrow = { kind: "arrow" as const, from: 3, to: 6, replaced: true };
    const earlier = { kind: "consequence" as const, from: 0, to: 2, symbol: "#", replaced: true };
    expect(tokenAfterArrow("=> # x", [arrow, earlier], 0)).toBeUndefined();
  });

  it("getLineActionParts treats only arrow tokens as transitions to consequence or delegated parts", () => {
    const line = "# @dana";
    const tokens = tokenizeLine(line);
    expect(getLineActionParts(line, tokens)).toEqual([
      { from: 0, to: 7, isAction: true, state: "#", delegated: false },
    ]);
  });

  it("findBalancedParenEnd stops at line breaks and returns -1 when unclosed", () => {
    expect(findBalancedParenEnd("(a\nb)", 0)).toBe(-1);
    expect(findBalancedParenEnd("(a\rb)", 0)).toBe(-1);
    expect(findBalancedParenEnd("(unclosed", 0)).toBe(-1);
  });

  it("forwardLink tokens omit the section property when no #Section is present", () => {
    const tokens = tokenizeLine("# (>2026-11-20)");
    expect(tokens).toStrictEqual([
      { kind: "action", from: 0, to: 2, symbol: "#", replaced: true },
      { kind: "forwardLink", from: 2, to: 15, dir: ">", date: "2026-11-20", replaced: false },
    ]);
    expect("section" in tokens[1]).toBe(false);
  });

  it("tokenizeNoteLine treats an out-of-range line index as an empty line", () => {
    expect(tokenizeNoteLine(["# task"], 5)).toEqual([]);
  });

  it("tokenizeDocLine treats a line directly above a setext or subsection underline as a plain title", () => {
    const lines = ["# Heading", "==="];
    const doc = {
      lines: lines.length,
      line: (n: number) => ({ text: lines[n - 1] }),
    };
    expect(tokenizeDocLine(doc, { number: 1, text: "# Heading" })).toEqual([]);
    expect(tokenizeDocLine(doc, { number: 2, text: "===" })).toEqual([]);
  });

  it("trailingForwardLinksStart finds trailing links including preceding whitespace, and ignores mid-line links", () => {
    expect(trailingForwardLinksStart("(>2026-11-20)", "all")).toBe(0);
    expect(trailingForwardLinksStart("# task (>2026-11-20)", "all")).toBe(6);
    expect(trailingForwardLinksStart("# task (>2026-11-20) later", "all")).toBeNull();
    expect(trailingForwardLinksStart("# task", "all")).toBeNull();
  });
});
