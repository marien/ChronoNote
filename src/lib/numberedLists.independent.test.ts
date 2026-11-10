import { describe, expect, it } from "vitest";
import {
  type LineEdit,
  tabIndentTarget,
  shiftTabIndentTarget,
  renumberLists,
  listGroups,
  backspaceMarker,
  backspaceContinuation,
  emptySubItemEnter,
} from "./numberedLists";

describe("tabIndentTarget: Rule 1 & Rule 6", () => {
  it("returns 3 spaces under a 1. item", () => {
    const lines = ["1. first", "2. second"];
    expect(tabIndentTarget(lines, 1)).toBe("   ");
  });

  it("returns 4 spaces under a 10. item", () => {
    const lines = ["10. tenth", "11. eleventh"];
    expect(tabIndentTarget(lines, 1)).toBe("    ");
  });

  it("returns 5 spaces under a 1.2. item", () => {
    const lines = ["1.2. sub", "1.3. next"];
    expect(tabIndentTarget(lines, 1)).toBe("     ");
  });

  it("returns 3 spaces for a bullet under 1. (sub-bullet alignment)", () => {
    const lines = ["1. parent", "- bullet"];
    expect(tabIndentTarget(lines, 1)).toBe("   ");
  });

  it("returns 4 spaces for an asterisk bullet under 10.", () => {
    const lines = ["10. parent", "* bullet"];
    expect(tabIndentTarget(lines, 1)).toBe("    ");
  });

  it("returns null for the first item in a list", () => {
    expect(tabIndentTarget(["1. only"], 0)).toBeNull();
    expect(tabIndentTarget(["- bullet only"], 0)).toBeNull();
  });

  it("returns null when the nearest preceding item with the same indent is a bullet", () => {
    expect(tabIndentTarget(["- bullet", "1. item"], 1)).toBeNull();
    expect(tabIndentTarget(["- bullet", "- another bullet"], 1)).toBeNull();
    expect(tabIndentTarget(["* bullet", "1. item"], 1)).toBeNull();
  });

  it("finds the nearest preceding item with the same indent across intervening deeper children", () => {
    const lines = ["1. parent", "   1. child", "2. sibling"];
    expect(tabIndentTarget(lines, 2)).toBe("   ");
  });

  it("returns null if the nearest preceding item with the same indent across deeper children is a bullet", () => {
    const lines = ["- parent bullet", "   1. child", "2. sibling"];
    expect(tabIndentTarget(lines, 2)).toBeNull();
  });

  it("returns null across a blank line because a list block ends at a blank line", () => {
    const lines = ["1. block one", "", "2. block two"];
    expect(tabIndentTarget(lines, 2)).toBeNull();
  });

  it("computes text column for an already indented item", () => {
    // indent 2 spaces + marker "1." (2) + 1 space = 5 spaces
    const lines = ["  1. parent", "  2. next"];
    expect(tabIndentTarget(lines, 1)).toBe("     ");
  });

  it("returns null for non-list lines or out-of-range line indices", () => {
    expect(tabIndentTarget(["plain text", "more text"], 1)).toBeNull();
    expect(tabIndentTarget(["1. item"], 5)).toBeNull();
  });
});

describe("shiftTabIndentTarget: Rule 1 & Rule 3", () => {
  it("returns parent's indent (empty string) for an item indented under top-level 1.", () => {
    const lines = ["1. parent", "   1. child"];
    expect(shiftTabIndentTarget(lines, 1)).toBe("");
  });

  it("returns parent's indent for an item indented under an already indented parent", () => {
    const lines = ["  1. parent", "     1. child"];
    expect(shiftTabIndentTarget(lines, 1)).toBe("  ");
  });

  it("returns parent's indent for deeply nested items", () => {
    const lines = ["1. top", "   1. level 1", "      1. level 2"];
    expect(shiftTabIndentTarget(lines, 2)).toBe("   ");
  });

  it("returns parent's indent when the parent is a bullet", () => {
    const lines = ["- bullet parent", "   1. numbered child"];
    expect(shiftTabIndentTarget(lines, 1)).toBe("");
  });

  it("returns parent's indent for old notes with 2-space sub-items", () => {
    const lines = ["1. parent", "  1. child"];
    expect(shiftTabIndentTarget(lines, 1)).toBe("");
  });

  it("returns null for top-level items with no parent", () => {
    expect(shiftTabIndentTarget(["1. top level"], 0)).toBeNull();
    expect(shiftTabIndentTarget(["- bullet top"], 0)).toBeNull();
  });

  it("returns null for indented items with no preceding parent", () => {
    expect(shiftTabIndentTarget(["   1. indented without parent"], 0)).toBeNull();
  });

  it("returns null when parent search hits a blank line", () => {
    const lines = ["1. parent", "", "   1. child separated by blank line"];
    expect(shiftTabIndentTarget(lines, 2)).toBeNull();
  });

  it("returns null for out-of-range line indices", () => {
    expect(shiftTabIndentTarget(["1. parent"], 3)).toBeNull();
  });
});

describe("listGroups: grouping, indents, delimiters, and parents", () => {
  it("identifies a single top-level group starting at 1", () => {
    const lines = ["1. a", "2. b", "3. c"];
    const groups = listGroups(lines, [1]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
    ]);
  });

  it("records start at 4 when the group starts at 4", () => {
    const lines = ["4. a", "5. b", "6. c"];
    const groups = listGroups(lines, [0]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 4 },
    ]);
  });

  it("keeps . and ) groups separate at the same indent", () => {
    const lines = ["1. a", "1) b", "2. c", "2) d"];
    const groups = listGroups(lines, [0, 1]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
      { first: 1, indent: 0, delimiter: ")", parent: null, start: 1 },
    ]);
  });

  it("identifies parent and child groups", () => {
    const lines = ["1. a", "   1. b", "   2. c", "2. d"];
    const groups = listGroups(lines, [1]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
      { first: 1, indent: 3, delimiter: ".", parent: 0, start: 1 },
    ]);
  });

  it("recognizes 2-space old notes children as a child group", () => {
    const lines = ["1. a", "  1. b", "  2. c"];
    const groups = listGroups(lines, [1]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
      { first: 1, indent: 2, delimiter: ".", parent: 0, start: 1 },
    ]);
  });

  it("does not break a numbered group when bullets are inside", () => {
    const lines = ["1. a", "- bullet", "2. b"];
    const groups = listGroups(lines, [0]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
    ]);
  });

  it("ends the block at a blank line, ignoring other blocks", () => {
    const lines = ["1. a", "2. b", "", "1. c", "2. d"];
    const groups = listGroups(lines, [0]);
    expect(groups).toEqual([
      { first: 0, indent: 0, delimiter: ".", parent: null, start: 1 },
    ]);
  });
});

describe("renumberLists: consecutive numbering, delimiters, gaps, and tails", () => {
  it("renumbers consecutive items starting from the first item without starts", () => {
    const lines = ["1. a", "3. b", "4. c"];
    const edits = renumberLists(lines, [1]);
    expect(edits).toEqual([
      { line: 1, text: "2. b" },
      { line: 2, text: "3. c" },
    ]);
  });

  it("returns only lines that change (empty if already consecutive)", () => {
    const lines = ["1. a", "2. b", "3. c"];
    expect(renumberLists(lines, [0])).toEqual([]);

    const linesWithGap = ["1. a", "2. b", "4. c"];
    expect(renumberLists(linesWithGap, [2])).toEqual([
      { line: 2, text: "3. c" },
    ]);
  });

  it("keeps a list starting at 4 starting at 4", () => {
    const lines = ["4. a", "6. b", "7. c"];
    const edits = renumberLists(lines, [0]);
    expect(edits).toEqual([
      { line: 1, text: "5. b" },
      { line: 2, text: "6. c" },
    ]);
  });

  it("respects explicit starts map overriding group start", () => {
    const lines = ["4. a", "5. b"];
    const starts = new Map<number, number>([[0, 1]]);
    const edits = renumberLists(lines, [0], starts);
    expect(edits).toEqual([
      { line: 0, text: "1. a" },
      { line: 1, text: "2. b" },
    ]);
  });

  it("keeps . and ) groups separate during renumbering", () => {
    const lines = ["1. a", "1) b", "3. c", "3) d"];
    const edits = renumberLists(lines, [2, 3]);
    expect(edits).toEqual([
      { line: 2, text: "2. c" },
      { line: 3, text: "2) d" },
    ]);
  });

  it("stops at a blank line and leaves subsequent list blocks untouched", () => {
    const lines = ["1. a", "3. b", "", "1. c", "4. d"];
    const edits = renumberLists(lines, [0]);
    expect(edits).toEqual([
      { line: 1, text: "2. b" },
    ]);
  });

  it("renumbers 2-space old children under their parent", () => {
    const lines = ["1. a", "  1. b", "  3. c", "2. d"];
    const edits = renumberLists(lines, [1]);
    expect(edits).toEqual([
      { line: 2, text: "  2. c" },
    ]);
  });

  it("does not renumber bullets inside a group and keeps numbered items consecutive", () => {
    const lines = ["1. a", "- bullet", "3. b", "* another bullet", "4. c"];
    const edits = renumberLists(lines, [0]);
    expect(edits).toEqual([
      { line: 2, text: "2. b" },
      { line: 4, text: "3. c" },
    ]);
  });

  it("preserves text after the marker byte for byte (multiple spaces, tags, mentions, trailing spaces)", () => {
    const lines = ["1. first", "3.   two spaces  #important  @alice  "];
    const edits = renumberLists(lines, [1]);
    expect(edits).toEqual([
      { line: 1, text: "2.   two spaces  #important  @alice  " },
    ]);
  });

  it("renumbers dotted sub-items within their group", () => {
    const lines = ["1. a", "   1.1. b", "   1.3. c"];
    const edits = renumberLists(lines, [1]);
    expect(edits).toEqual([
      { line: 2, text: "   1.2. c" },
    ]);
  });

  it("updates dotted sub-item prefixes when the parent item number changes", () => {
    const lines = ["2. a", "   2.1. b", "   2.2. c"];
    const starts = new Map<number, number>([[0, 1]]);
    const edits = renumberLists(lines, [0], starts);
    expect(edits).toEqual([
      { line: 0, text: "1. a" },
      { line: 1, text: "   1.1. b" },
      { line: 2, text: "   1.2. c" },
    ]);
  });

  it("simulates Tab restart: item indented under parent restarts at 1 and outer list closes gap", () => {
    // 1. a \n 2. b \n 3. c  -> line 1 indented to 3 spaces as 2. b
    const lines = ["1. a", "   2. b", "3. c"];
    const starts = new Map<number, number>([[1, 1]]);
    const edits = renumberLists(lines, [1], starts);
    expect(edits).toEqual([
      { line: 1, text: "   1. b" },
      { line: 2, text: "2. c" },
    ]);
  });
});

describe("backspaceMarker: Rule 4 step 1", () => {
  it("removes marker and aligns text under previous item's text (column 3)", () => {
    const lines = ["1. a", "2. b", "3. c"];
    expect(backspaceMarker(lines, 1, 3)).toBe("   b");
  });

  it("aligns under a 4-column previous item (10.)", () => {
    const lines = ["10. a", "11. b"];
    expect(backspaceMarker(lines, 1, 4)).toBe("    b");
  });

  it("aligns under a 5-column previous dotted item (1.1.)", () => {
    const lines = ["1.1. a", "1.2. b"];
    expect(backspaceMarker(lines, 1, 5)).toBe("     b");
  });

  it("aligns an indented item under an indented previous item's text", () => {
    const lines = ["  1. a", "  2. b"];
    expect(backspaceMarker(lines, 1, 5)).toBe("     b");
  });

  it("removes marker and keeps text at own indent for a first item with nothing before it", () => {
    const lines = ["1. a", "2. b"];
    expect(backspaceMarker(lines, 0, 3)).toBe("a");
  });

  it("removes marker and keeps text at own indent for an indented first item", () => {
    const lines = ["  1. a"];
    expect(backspaceMarker(lines, 0, 5)).toBe("  a");
  });

  it("removes marker and keeps text at own indent when preceded by a blank line", () => {
    const lines = ["1. a", "", "1. b"];
    expect(backspaceMarker(lines, 2, 3)).toBe("b");
  });

  it("preserves text verbatim including extra spaces, tags, and symbols", () => {
    const lines = ["1. a", "2.   spaced  #tag  @person"];
    expect(backspaceMarker(lines, 1, 3)).toBe("     spaced  #tag  @person");
  });

  it("returns null when caret is not right after the marker space", () => {
    const lines = ["1. a", "2. b"];
    expect(backspaceMarker(lines, 1, 0)).toBeNull(); // start of line
    expect(backspaceMarker(lines, 1, 1)).toBeNull(); // inside number
    expect(backspaceMarker(lines, 1, 2)).toBeNull(); // after dot, before space
    expect(backspaceMarker(lines, 1, 4)).toBeNull(); // inside text
  });

  it("returns null for bullet lines or non-list lines", () => {
    expect(backspaceMarker(["- a", "- b"], 1, 2)).toBeNull();
    expect(backspaceMarker(["plain prose"], 0, 2)).toBeNull();
    expect(backspaceMarker(["1. a"], 10, 0)).toBeNull();
  });
});

describe("backspaceContinuation: Rule 4 step 2", () => {
  it("removes leading whitespace on a continuation line aligned under previous text", () => {
    const lines = ["1. a", "   b", "2. c"];
    expect(backspaceContinuation(lines, 1, 3)).toBe("b");
  });

  it("removes 4 spaces of leading continuation whitespace under a 10. item", () => {
    const lines = ["10. a", "    b"];
    expect(backspaceContinuation(lines, 1, 4)).toBe("b");
  });

  it("removes continuation indent back to base indent for an indented list", () => {
    const lines = ["  1. a", "     b", "  2. c"];
    expect(backspaceContinuation(lines, 1, 5)).toBe("  b");
  });

  it("returns null when caret is not at the continuation boundary", () => {
    const lines = ["1. a", "   b"];
    expect(backspaceContinuation(lines, 1, 0)).toBeNull();
    expect(backspaceContinuation(lines, 1, 1)).toBeNull();
    expect(backspaceContinuation(lines, 1, 2)).toBeNull();
    expect(backspaceContinuation(lines, 1, 4)).toBeNull();
  });

  it("returns null for lines that are not continuation lines", () => {
    expect(backspaceContinuation(["1. a", "b"], 1, 0)).toBeNull();
    expect(backspaceContinuation(["1. a", "2. b"], 1, 3)).toBeNull();
    expect(backspaceContinuation(["1. a"], 5, 0)).toBeNull();
  });
});

describe("emptySubItemEnter: Rule 7", () => {
  it("turns an empty numbered sub-item into the parent list's next item", () => {
    const lines = ["1. a", "   1. b", "   2. "];
    expect(emptySubItemEnter(lines, 2)).toBe("2. ");
  });

  it("turns an empty bullet sub-item into the numbered parent list's next item", () => {
    const lines = ["1. a", "   - "];
    expect(emptySubItemEnter(lines, 1)).toBe("2. ");

    const linesAsterisk = ["1. a", "   * "];
    expect(emptySubItemEnter(linesAsterisk, 1)).toBe("2. ");
  });

  it("preserves the parent's delimiter )", () => {
    const lines = ["1) a", "   1) b", "   2) "];
    expect(emptySubItemEnter(lines, 2)).toBe("2) ");
  });

  it("turns a nested sub-item into its parent level's next item with appropriate indent", () => {
    const lines = ["1. a", "   1. b", "      1. c", "      2. "];
    expect(emptySubItemEnter(lines, 3)).toBe("   2. ");
  });

  it("handles empty sub-item with extra trailing whitespace after marker", () => {
    const lines = ["1. a", "   1. b", "   2.   "];
    expect(emptySubItemEnter(lines, 2)).toBe("2. ");
  });

  it("returns null when the parent is a bullet (empty item clears the line as before)", () => {
    const lines = ["- bullet parent", "   1. "];
    expect(emptySubItemEnter(lines, 1)).toBeNull();

    const linesBullets = ["- bullet parent", "   - "];
    expect(emptySubItemEnter(linesBullets, 1)).toBeNull();
  });

  it("returns null for a top-level empty item (no parent)", () => {
    expect(emptySubItemEnter(["1. "], 0)).toBeNull();
    expect(emptySubItemEnter(["1. a", "2. "], 1)).toBeNull();
    expect(emptySubItemEnter(["- "], 0)).toBeNull();
  });

  it("returns null when the sub-item is not empty", () => {
    const lines = ["1. a", "   1. b", "   2. c"];
    expect(emptySubItemEnter(lines, 2)).toBeNull();

    const linesBullet = ["1. a", "   - content"];
    expect(emptySubItemEnter(linesBullet, 1)).toBeNull();
  });

  it("returns null for non-list lines or out-of-range line indices", () => {
    expect(emptySubItemEnter(["plain text"], 0)).toBeNull();
    expect(emptySubItemEnter(["1. a"], 8)).toBeNull();
  });
});
