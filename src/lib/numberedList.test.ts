import { describe, expect, it } from "vitest";
import {
  nextNumberedMarker,
  numberedContinuationIndent,
  numberedListEnter,
  parseNumberedItem,
  setActionSymbolTo,
} from "./tokens";

const item = (line: string) => parseNumberedItem(line);

describe("parseNumberedItem: what is a numbered list item", () => {
  it("accepts a number, a dot or parenthesis, and a space", () => {
    expect(item("1. one")).toMatchObject({ marker: "1.", numbers: [1], delimiter: ".", text: "one", indent: "", markerEnd: 2 });
    expect(item("2) two")).toMatchObject({ marker: "2)", numbers: [2], delimiter: ")", text: "two" });
    expect(item("10. ten")).toMatchObject({ marker: "10.", numbers: [10], markerEnd: 3 });
  });

  it("any positive number may start a list", () => {
    for (const n of [1, 2, 7, 10, 42, 100, 2019, 999999999]) expect(item(`${n}. x`)?.numbers).toEqual([n]);
  });

  it("accepts numbered sub-items with several numbers (1.1. and 2.3.1)", () => {
    expect(item("1.1. sub")).toMatchObject({ marker: "1.1.", numbers: [1, 1], delimiter: "." });
    expect(item("1.2.3) deep")).toMatchObject({ marker: "1.2.3)", numbers: [1, 2, 3], delimiter: ")" });
    expect(item("10.12.1. wide")?.numbers).toEqual([10, 12, 1]);
  });

  it("keeps the indentation, spaces or tabs, and records where the marker ends", () => {
    expect(item("  3. x")).toMatchObject({ indent: "  ", markerEnd: 4 });
    expect(item("\t4) x")).toMatchObject({ indent: "\t", markerEnd: 3 });
    expect(item("    1.1. x")).toMatchObject({ indent: "    ", markerEnd: 8 });
  });

  it("an item may be empty once its space has been typed; the text is trimmed", () => {
    expect(item("1. ")?.text).toBe("");
    expect(item("  9) ")?.text).toBe("");
    expect(item("1.   spaced   ")?.text).toBe("spaced");
    expect(item("1.\ttabbed")?.text).toBe("tabbed");
  });

  it("the text may itself look like anything else", () => {
    expect(item("1. - a bullet")?.text).toBe("- a bullet");
    expect(item("1. # a task")?.text).toBe("# a task");
    expect(item("1. 2. nested")?.text).toBe("2. nested");
  });

  it("is not an item without whitespace after the marker", () => {
    for (const line of ["1.", "1)", "  2.", "1.1.", "1.text", "1)text", "1.,x"]) expect(item(line)).toBeNull();
  });

  it("is not an item when the number is not a positive whole number", () => {
    for (const line of ["0. x", "01. x", "1.0. x", "1.01. x", "1..1. x", "-1. x", "+1. x", "1000000000. x", "1e3. x"]) expect(item(line)).toBeNull();
  });

  it("is not an item when the marker does not end in a dot or parenthesis (decimals are prose)", () => {
    for (const line of ["3.5 hours", "1.5", "1.1 x", "2.3.4 x", "12 monkeys", "1 . x", "1 ) x", "1: x", "1- x", "1] x"]) expect(item(line)).toBeNull();
  });

  it("is not an item unless the marker is the first non-blank character", () => {
    for (const line of ["a 1. x", "x. 1. y", "- 1. x", "* 2. x", "# 1. x", "v 2) x", "> 3. x", "=> 1. x", "! 1. x", "(1). x", "[1] x", "  # 1. x"]) {
      expect(item(line)).toBeNull();
    }
  });

  it("is not an item for empty or blank lines", () => {
    for (const line of ["", " ", "   ", "\t"]) expect(item(line)).toBeNull();
  });

  it("letters, roman numerals and mixed markers are not supported", () => {
    for (const line of ["a. x", "A) x", "i. x", "iv. x", "1a. x", "1.a. x"]) expect(item(line)).toBeNull();
  });
});

describe("nextNumberedMarker", () => {
  const next = (line: string) => nextNumberedMarker(item(line)!);

  it("adds one to the last number and keeps the delimiter", () => {
    expect(next("1. a")).toBe("2.");
    expect(next("2) a")).toBe("3)");
    expect(next("9. a")).toBe("10.");
    expect(next("99) a")).toBe("100)");
    expect(next("41. a")).toBe("42.");
  });

  it("for a sub-item, only the last number changes and the parents stay", () => {
    expect(next("1.1. a")).toBe("1.2.");
    expect(next("1.9. a")).toBe("1.10.");
    expect(next("3.4.5) a")).toBe("3.4.6)");
    expect(next("12.7. a")).toBe("12.8.");
  });

  it("carries on from wherever the list starts, even out of sequence", () => {
    expect(next("7. a")).toBe("8.");
    expect(next("1. a")).toBe("2.");
    expect(next("5. a")).toBe("6.");
  });

  it("handles the largest supported number", () => {
    expect(next("999999998. a")).toBe("999999999.");
    expect(next("999999999. a")).toBe("1000000000.");
  });
});

describe("numberedListEnter: what Enter does", () => {
  const at = (line: string, col = line.length, nextLine?: string) => numberedListEnter(line, col, nextLine);

  it("at the end of an item, continues with the next number at the same indentation", () => {
    expect(at("1. one")).toEqual({ insert: "\n2. " });
    expect(at("2) two")).toEqual({ insert: "\n3) " });
    expect(at("  4. four")).toEqual({ insert: "\n  5. " });
    expect(at("\t1. tab")).toEqual({ insert: "\n\t2. " });
    expect(at("9. nine")).toEqual({ insert: "\n10. " });
  });

  it("continues numbered sub-items", () => {
    expect(at("1.1. first")).toEqual({ insert: "\n1.2. " });
    expect(at("  1.9. ninth")).toEqual({ insert: "\n  1.10. " });
    expect(at("2.3.1) x")).toEqual({ insert: "\n2.3.2) " });
  });

  it("an empty item exits the list, at any indentation and depth", () => {
    for (const line of ["1. ", "12) ", "  3. ", "1.1. ", "\t2.3) ", "1.    "]) expect(at(line)).toEqual({ exit: true });
  });

  it("an empty item exits even with the caret in the marker", () => {
    expect(at("1. ", 0)).toEqual({ exit: true });
    expect(at("1. ", 1)).toEqual({ exit: true });
  });

  it("in the middle of an item, splits it: the caret position does not matter to the marker", () => {
    expect(at("1. hello world", 8)).toEqual({ insert: "\n2. " });
    expect(at("1. hello world", 3)).toEqual({ insert: "\n2. " });
  });

  it("with the caret in the indent or inside the marker, only a plain newline (the marker is not split)", () => {
    expect(at("1. one", 0)).toEqual({ plain: true });
    expect(at("1. one", 1)).toEqual({ plain: true });
    expect(at("1. one", 2)).toEqual({ plain: true }); // right after the dot, before the space
    expect(at("  1. one", 0)).toEqual({ plain: true });
    expect(at("  1. one", 2)).toEqual({ plain: true });
    expect(at("  1. one", 4)).toEqual({ plain: true });
    expect(at("1.2. one", 3)).toEqual({ plain: true });
    expect(at("1. one", 3)).toEqual({ insert: "\n2. " }); // past the space: a real split
    expect(at("  1. one", 5)).toEqual({ insert: "\n  2. " });
  });

  it("on a section title (the next line is its underline) it is a plain newline, so the title is not broken up", () => {
    expect(at("1. Introduction", undefined, "===============")).toEqual({ plain: true });
    expect(at("2) Scope", undefined, "=====")).toEqual({ plain: true });
    expect(at("1. Introduction", undefined, "not an underline")).toEqual({ insert: "\n2. " });
    expect(at("1. Introduction", undefined, "")).toEqual({ insert: "\n2. " });
    expect(at("1. Introduction", undefined, undefined)).toEqual({ insert: "\n2. " });
  });

  it("returns null for everything that is not a numbered item", () => {
    for (const line of ["", "plain", "3.5 hours", "1.", "- bullet", "* bullet", "# task", "=> follow", "- 1. bullet with number", "# 1. task with number"]) {
      expect(at(line)).toBeNull();
    }
  });
});

describe("numberedContinuationIndent: Shift+Enter aligns under the text", () => {
  it("is the indent plus as many spaces as the marker and its space", () => {
    expect(numberedContinuationIndent("1. a")).toBe("   ");
    expect(numberedContinuationIndent("10. a")).toBe("    ");
    expect(numberedContinuationIndent("  2) a")).toBe("     ");
    expect(numberedContinuationIndent("1.1. a")).toBe("     ");
    expect(numberedContinuationIndent("\t1. a")).toBe("\t   ");
  });
  it("is null for anything else", () => {
    for (const line of ["", "plain", "- bullet", "3.5 x", "1."]) expect(numberedContinuationIndent(line)).toBeNull();
  });
});

describe("numbered items next to actions and bullets", () => {
  it("a numbered item is structure: Ctrl+1-4 do not turn it into an action (like a bullet)", () => {
    for (const line of ["1. buy milk", "  2) call Sam", "1.1. sub item", "3. "]) {
      expect(setActionSymbolTo(line, "#")).toBeNull();
    }
  });
  it("a bullet stays left alone and prose that only looks numeric is still promoted", () => {
    expect(setActionSymbolTo("- bullet", "#")).toBeNull();
    expect(setActionSymbolTo("3.5 hours of work", "#")).toBe("# 3.5 hours of work");
    expect(setActionSymbolTo("1.5", "v")).toBe("v 1.5");
    expect(setActionSymbolTo("1.", "#")).toBe("# 1.");
  });
  it("an action line that merely contains a numbered-looking text is an action, not an item", () => {
    expect(parseNumberedItem("# 1. task")).toBeNull();
    expect(setActionSymbolTo("# 1. task", "v")).toBe("v 1. task");
  });
});
