import { describe, expect, it } from "vitest";
import {
  backspaceContinuation,
  backspaceMarker,
  emptySubItemEnter,
  listGroups,
  renumberLists,
  shiftTabIndentTarget,
  tabIndentTarget,
} from "./numberedLists";
import { parseNumberedItem } from "./tokens";

describe("Rule 1: Tab goes under parent text", () => {
  it("Tab on 2. b under 1. a gives 3 spaces indent", () => {
    const lines = ["1. a", "2. b"];
    expect(tabIndentTarget(lines, 1)).toBe("   ");
  });

  it("Tab on 10. b under 9. a gives 3 spaces indent", () => {
    const lines = ["9. a", "10. b", "11. c"];
    expect(tabIndentTarget(lines, 1)).toBe("   ");
  });

  it("Tab on 11. c under 10. b gives 4 spaces indent", () => {
    const lines = ["9. a", "10. b", "11. c"];
    expect(tabIndentTarget(lines, 2)).toBe("    ");
  });

  it("Tab on - x under 1. a with same-indent numbered predecessor goes to text column", () => {
    const lines = ["1. a", "   1. b", "   - x"];
    expect(tabIndentTarget(lines, 2)).toBe("      ");
  });

  it("Tab on list item with bullet predecessor falls back to default", () => {
    const lines = ["- a", "1. b"];
    expect(tabIndentTarget(lines, 1)).toBeNull();
  });

  it("Tab on first item in block falls back to default", () => {
    const lines = ["1. a"];
    expect(tabIndentTarget(lines, 0)).toBeNull();
  });
});

describe("Rule 1: Shift+Tab outdents to parent indent", () => {
  it("Shift+Tab on indented item outdents to parent indent", () => {
    const lines = ["1. a", "   1. b"];
    expect(shiftTabIndentTarget(lines, 1)).toBe("");
  });

  it("Shift+Tab on nested sub-item outdents to outer parent indent", () => {
    const lines = ["1. a", "   1.1. b", "      1.1.1. c"];
    expect(shiftTabIndentTarget(lines, 2)).toBe("   ");
  });

  it("Shift+Tab on top level item falls back to default", () => {
    const lines = ["1. a", "2. b"];
    expect(shiftTabIndentTarget(lines, 1)).toBeNull();
  });
});

describe("Rule 2 and 5: Indenting restarts numbering and renumbering groups", () => {
  it("1. a\\n2. b + Tab on line 1 -> 1. a\\n   1. b", () => {
    const lines = ["1. a", "2. b"];
    const target = tabIndentTarget(lines, 1)!;
    expect(target).toBe("   ");

    const newLines = [lines[0], target + "1. b"];
    const starts = new Map<number, number>([[1, 1]]);
    const edits = renumberLists(newLines, [1], starts);
    for (const e of edits) newLines[e.line] = e.text;

    expect(newLines.join("\n")).toBe("1. a\n   1. b");
  });

  it("a list starting at 4 stays starting at 4", () => {
    const lines = ["4. a", "5. b", "7. c"];
    const edits = renumberLists(lines, [0]);
    const res = [...lines];
    for (const e of edits) res[e.line] = e.text;
    expect(res.join("\n")).toBe("4. a\n5. b\n6. c");
  });

  it("1) and 1. groups stay apart", () => {
    const lines = ["1. a", "1) b", "3. c", "3) d"];
    const edits = renumberLists(lines, [0]);
    const res = [...lines];
    for (const e of edits) res[e.line] = e.text;
    expect(res.join("\n")).toBe("1. a\n1) b\n2. c\n2) d");
  });

  it("a blank line ends the block", () => {
    const lines = ["1. a", "2. b", "", "1. c", "2. d"];
    const edits = renumberLists(lines, [0]);
    expect(edits).toEqual([]);
    const groups = listGroups(lines, [0]);
    expect(groups).toHaveLength(1);
    expect(groups[0].first).toBe(0);
  });

  it("2-space old sub-items still count as children", () => {
    const lines = ["1. a", "  1.1. b", "  1.3. c"];
    const edits = renumberLists(lines, [1]);
    const res = [...lines];
    for (const e of edits) res[e.line] = e.text;
    expect(res.join("\n")).toBe("1. a\n  1.1. b\n  1.2. c");
  });

  it("renumbering preserves everything after the marker byte for byte", () => {
    const lines = ["1.   spaced\ttext  ", "3.   more\tspaced  "];
    const edits = renumberLists(lines, [0]);
    const res = [...lines];
    for (const e of edits) res[e.line] = e.text;
    expect(res[1]).toBe("2.   more\tspaced  ");
  });
});

describe("Rule 3: Outdenting continues outer list", () => {
  it("1. a\\n   1. b\\n   2. c\\n2. d Shift+Tab on line 1 -> 1. a\\n2. b\\n   1. c\\n3. d", () => {
    const lines = ["1. a", "   1. b", "   2. c", "2. d"];
    const oldGroups = listGroups(lines, [1]);
    const target = shiftTabIndentTarget(lines, 1)!;
    expect(target).toBe("");

    // Line 1 outdented to target indent:
    // L was 1. b, now joins outer group.
    const newLines = [
      lines[0],
      target + "2. b",
      lines[2], // "   2. c"
      lines[3], // "2. d"
    ];

    // Carry starts:
    // Old group at line 1 had start 1. New group at line 2 (child of line 1) starts at 1.
    // Outer group started at 1.
    const starts = new Map<number, number>([
      [0, 1],
      [2, 1],
    ]);
    const edits = renumberLists(newLines, [1], starts);
    for (const e of edits) newLines[e.line] = e.text;

    expect(newLines.join("\n")).toBe("1. a\n2. b\n   1. c\n3. d");
  });

  it("dotted 1. a\\n   1.1. b\\n   1.2. c Shift+Tab on line 2 -> 1. a\\n   1.1. b\\n2. c", () => {
    const lines = ["1. a", "   1.1. b", "   1.2. c"];
    const target = shiftTabIndentTarget(lines, 2)!;
    expect(target).toBe("");

    // Line 2 outdents to "" and takes outer group's style (plain)
    const newLines = [
      lines[0],
      lines[1],
      target + "2. c",
    ];

    const starts = new Map<number, number>([[0, 1]]);
    const edits = renumberLists(newLines, [2], starts);
    for (const e of edits) newLines[e.line] = e.text;

    expect(newLines.join("\n")).toBe("1. a\n   1.1. b\n2. c");
  });
});

describe("Rule 4: Backspace on marker and continuation", () => {
  it("first Backspace at text start replaces marker with continuation spaces", () => {
    const lines = ["1. first", "2. second"];
    // On line 1 "2. second", text start is col 3
    expect(backspaceMarker(lines, 1, 3)).toBe("   second");
  });

  it("first Backspace at text start with no predecessor uses own indent", () => {
    const lines = ["1. single"];
    expect(backspaceMarker(lines, 0, 3)).toBe("single");
  });

  it("first Backspace does not apply when caret is not at text start", () => {
    const lines = ["1. first", "2. second"];
    expect(backspaceMarker(lines, 1, 2)).toBeNull();
    expect(backspaceMarker(lines, 1, 4)).toBeNull();
  });

  it("second Backspace at end of leading whitespace on continuation deletes leading whitespace", () => {
    const lines = ["1. first", "   second"];
    // On line 1 "   second", col 3 (end of leading whitespace)
    expect(backspaceContinuation(lines, 1, 3)).toBe("second");
  });

  it("second Backspace does not apply when caret is not at end of whitespace", () => {
    const lines = ["1. first", "   second"];
    expect(backspaceContinuation(lines, 1, 2)).toBeNull();
    expect(backspaceContinuation(lines, 1, 4)).toBeNull();
  });

  it("second Backspace does not apply when indent does not match text column", () => {
    const lines = ["1. first", "  second"];
    expect(backspaceContinuation(lines, 1, 2)).toBeNull();
  });
});

describe("Rule 5: Delete and carrying starts across edit", () => {
  it("delete line 1. a from 1. a\\n2. b\\n3. c -> 1. b\\n2. c (with starts)", () => {
    const oldLines = ["1. a", "2. b", "3. c"];
    const oldGroups = listGroups(oldLines, [0]);
    expect(oldGroups[0].start).toBe(1);

    // Delete line 0:
    const newLines = ["2. b", "3. c"];
    // Pair new group at line 0 with old group start (1)
    const starts = new Map<number, number>([[0, oldGroups[0].start]]);
    const edits = renumberLists(newLines, [0], starts);
    for (const e of edits) newLines[e.line] = e.text;

    expect(newLines.join("\n")).toBe("1. b\n2. c");
  });
});

describe("Rule 7: Enter on empty sub-item", () => {
  it("Enter on empty sub-item replaces line with parent's next marker", () => {
    const lines = ["1. parent", "   1.1. child", "   1.2. "];
    expect(emptySubItemEnter(lines, 2)).toBe("2. ");
  });

  it("Enter on empty bullet sub-item under numbered parent replaces line with parent's next marker", () => {
    const lines = ["1. parent", "   - first", "   - "];
    expect(emptySubItemEnter(lines, 2)).toBe("2. ");
  });

  it("Enter on empty item with bullet parent returns null", () => {
    const lines = ["- parent", "  1. child", "  2. "];
    expect(emptySubItemEnter(lines, 2)).toBeNull();
  });

  it("Enter on empty top-level item returns null", () => {
    const lines = ["1. a", "2. "];
    expect(emptySubItemEnter(lines, 1)).toBeNull();
  });
});

describe("review fixes", () => {
  const apply = (lines: string[], touched: number[]) => {
    const out = [...lines];
    for (const e of renumberLists(lines, touched)) out[e.line] = e.text;
    return out;
  };

  it("a top-level dotted list keeps its prefix when renumbered", () => {
    expect(apply(["1.1. first", "1.3. third"], [0])).toEqual(["1.1. first", "1.2. third"]);
  });

  it("a dotted list under a bullet keeps its prefix", () => {
    expect(apply(["- x", "  2.1. a", "  2.5. b"], [1])).toEqual(["- x", "  2.1. a", "  2.2. b"]);
  });

  it("the second Backspace works on a tab-indented continuation line", () => {
    expect(backspaceContinuation(["\t1. first", "\t   cont"], 1, 4)).toBe("\tcont");
  });

  it("only the lists around the touched lines are renumbered", () => {
    const lines = ["1. a", "3. b", "", "5. c", "9. d"];
    expect(apply(lines, [0])).toEqual(["1. a", "2. b", "", "5. c", "9. d"]);
  });
});
