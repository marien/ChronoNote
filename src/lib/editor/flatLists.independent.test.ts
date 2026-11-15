// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTestEditor, type TestEditor } from "../testing/testEditor";

const editors: TestEditor[] = [];

function openEditor(doc: string): TestEditor {
  const ed = createTestEditor({ doc });
  editors.push(ed);
  return ed;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

function stripMarkers(s: string): string {
  return s.replace(/[|[\]]/g, "");
}

function assertKeyAndUndo(input: string, key: string, expected: string): void {
  const ed = openEditor(input);
  ed.press(key);
  expect(ed.caret()).toBe(expected);

  if (stripMarkers(expected) !== stripMarkers(input)) {
    expect(ed.press("Mod-z")).toBe(true);
    expect(ed.caret()).toBe(input);
  }
}

function assertKeyTextAndUndo(input: string, key: string, expectedText: string): void {
  const ed = openEditor(input);
  ed.press(key);
  expect(ed.text()).toBe(expectedText);

  if (expectedText !== stripMarkers(input)) {
    expect(ed.press("Mod-z")).toBe(true);
    expect(ed.caret()).toBe(input);
  }
}

describe("Flat numbered outlines: independent tests", () => {
  // =========================================================================
  // Rules 1-5: Enter
  // =========================================================================
  describe("Rules 1-5: Enter", () => {
    it("Rule 1: Enter on flat sub-item continues at same depth without turning 1.1. into 2.", () => {
      assertKeyAndUndo("1. a\n1.1. b|", "Enter", "1. a\n1.1. b\n1.2. |");
    });

    it("Rule 1: Enter on flat sub-item before later top-level sibling keeps sub-items under parent", () => {
      assertKeyAndUndo("1. a\n1.1. b|\n2. c", "Enter", "1. a\n1.1. b\n1.2. |\n2. c");
    });

    it("Rule 1 (three levels): Enter on 1.1.1. continues to 1.1.2.", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.1.1. c|", "Enter", "1. a\n1.1. b\n1.1.1. c\n1.1.2. |");
    });

    it("Rule 1 () delimiter): Enter on 1.1) continues to 1.2)", () => {
      assertKeyAndUndo("1) a\n1.1) b|", "Enter", "1) a\n1.1) b\n1.2) |");
    });

    it("Rule 1 (indented parent): Enter on flat sub-item inside indented list keeps indent", () => {
      assertKeyAndUndo("- topic\n  1. a\n  1.1. b|", "Enter", "- topic\n  1. a\n  1.1. b\n  1.2. |");
    });

    it("Rule 2: Enter on top-level item after flat sub-items continues top-level numbering", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. c\n2. e|", "Enter", "1. a\n1.1. b\n1.2. c\n2. e\n3. |");
    });

    it("Rule 2 () delimiter): Enter on 2) after flat sub-items continues to 3)", () => {
      assertKeyAndUndo("1) a\n1.1) b\n1.2) c\n2) e|", "Enter", "1) a\n1.1) b\n1.2) c\n2) e\n3) |");
    });

    it("Rule 3: Enter on empty flat sub-item promotes to parent group's next item", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. |", "Enter", "1. a\n1.1. b\n2. |");
    });

    it("Rule 3: Enter on empty flat sub-item converts following flat sub-items into children from 1", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.2. |\n1.3. d\n2. e",
        "Enter",
        "1. a\n1.1. b\n2. |\n2.1. d\n3. e",
      );
    });

    it("Rule 3: Enter on empty top-level 2. ends the list", () => {
      assertKeyAndUndo("1. a\n1.1. b\n2. |", "Enter", "1. a\n1.1. b\n|");
    });

    it("Rule 3 (three levels): Enter on empty 1.1.2. promotes to 1.2. and re-parents 1.1.3.", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.1.1. c\n1.1.2. |\n1.1.3. d\n1.2. e",
        "Enter",
        "1. a\n1.1. b\n1.1.1. c\n1.2. |\n1.2.1. d\n1.3. e",
      );
    });

    it("Rule 3 () delimiter): Enter on empty 1.2) promotes to 2) and re-parents 1.3)", () => {
      assertKeyAndUndo(
        "1) a\n1.1) b\n1.2) |\n1.3) d\n2) e",
        "Enter",
        "1) a\n1.1) b\n2) |\n2.1) d\n3) e",
      );
    });

    it("Rule 3 (indented parent): Enter on empty flat sub-item inside indented list promotes at list indent", () => {
      assertKeyAndUndo("- topic\n  1. a\n  1.1. b\n  1.2. |", "Enter", "- topic\n  1. a\n  1.1. b\n  2. |");
    });

    it("Rule 4: Enter at end of parent moves flat sub-items under the new item and renumbers", () => {
      assertKeyAndUndo(
        "1. a|\n1.1. b\n1.2. c\n2. e",
        "Enter",
        "1. a\n2. |\n2.1. b\n2.2. c\n3. e",
      );
    });

    it("Rule 4 (three levels): Enter at end of 1.1. moves 1.1.1. under new 1.2.", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b|\n1.1.1. c\n1.2. d",
        "Enter",
        "1. a\n1.1. b\n1.2. |\n1.2.1. c\n1.3. d",
      );
    });

    it("Rule 4 () delimiter): Enter at end of 1) moves flat sub-items under 2)", () => {
      assertKeyAndUndo(
        "1) a|\n1.1) b\n1.2) c\n2) e",
        "Enter",
        "1) a\n2) |\n2.1) b\n2.2) c\n3) e",
      );
    });

    it("Rule 4 (indented parent): Enter at end of indented flat parent moves flat sub-items under 2.", () => {
      assertKeyAndUndo(
        "- topic\n  1. a|\n  1.1. b\n  2. e",
        "Enter",
        "- topic\n  1. a\n  2. |\n  2.1. b\n  3. e",
      );
    });

    it("Rule 5: Enter in the middle of a flat item's text splits it and renumbers later siblings", () => {
      assertKeyAndUndo("1.1. ab|cd", "Enter", "1.1. ab\n1.2. |cd");
      assertKeyAndUndo("1. a\n1.1. ab|cd\n1.2. e", "Enter", "1. a\n1.1. ab\n1.2. |cd\n1.3. e");
    });
  });

  // =========================================================================
  // Rules 6-9: Tab and Shift+Tab
  // =========================================================================
  describe("Rules 6-9: Tab and Shift+Tab", () => {
    it("Rule 6: Tab makes flat sub-item first child of preceding sibling by number", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. c|", "Tab", "1. a\n1.1. b\n1.1.1. c|");
    });

    it("Rule 6: Tab on top-level item in flat list makes it sub-item of preceding top-level item", () => {
      assertKeyAndUndo("1. a\n1.1. b\n2. e\n3. f|", "Tab", "1. a\n1.1. b\n2. e\n2.1. f|");
    });

    it("Rule 6: Tab continues an existing deeper flat sub-group", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.1.1. x\n1.2. c|",
        "Tab",
        "1. a\n1.1. b\n1.1.1. x\n1.1.2. c|",
      );
    });

    it("Rule 6: Tab on first top-level item of a flat list does nothing and keeps caret", () => {
      assertKeyAndUndo("1. a|\n1.1. b", "Tab", "1. a|\n1.1. b");
    });

    it("Rule 6: Tab on first item of a flat sub-group does nothing and keeps caret", () => {
      assertKeyAndUndo("1. a\n1.1. b|\n1.2. c", "Tab", "1. a\n1.1. b|\n1.2. c");
    });

    it("Rule 6: Tab moves item's own flat sub-items deeper and renumbers later siblings", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.2. c|\n1.2.1. d\n1.3. e",
        "Tab",
        "1. a\n1.1. b\n1.1.1. c|\n1.1.1.1. d\n1.2. e",
      );
      assertKeyAndUndo(
        "1. a\n1.1. b\n2. c|\n2.1. d\n3. e",
        "Tab",
        "1. a\n1.1. b\n1.2. c|\n1.2.1. d\n2. e",
      );
    });

    it("Rule 6 () delimiter): Tab deepens 1.2) to 1.1.1)", () => {
      assertKeyAndUndo("1) a\n1.1) b\n1.2) c|", "Tab", "1) a\n1.1) b\n1.1.1) c|");
    });

    it("Rule 6 (indented parent): Tab deepens flat item inside indented list without adding spaces", () => {
      assertKeyAndUndo(
        "- topic\n  1. a\n  1.1. b\n  1.2. c|",
        "Tab",
        "- topic\n  1. a\n  1.1. b\n  1.1.1. c|",
      );
    });

    it("Rule 6 & 7 (mid-text caret): Tab and Shift+Tab preserve caret position inside item text", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. c|d", "Tab", "1. a\n1.1. b\n1.1.1. c|d");
      assertKeyAndUndo("1. a\n1.1. b\n1.1.1. c|d", "Shift-Tab", "1. a\n1.1. b\n1.2. c|d");
    });

    it("Rule 7: Shift+Tab on three-level flat sub-item moves it one level shallower", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.1.1. c|", "Shift-Tab", "1. a\n1.1. b\n1.2. c|");
    });

    it("Rule 7: Shift+Tab on two-level flat sub-item promotes to top-level and renumbers following", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. c|\n2. e", "Shift-Tab", "1. a\n1.1. b\n2. c|\n3. e");
    });

    it("Rule 7: Shift+Tab turns later siblings of old group into sub-items from 1", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.2. c|\n1.3. d\n2. e",
        "Shift-Tab",
        "1. a\n1.1. b\n2. c|\n2.1. d\n3. e",
      );
    });

    it("Rule 7: Shift+Tab brings own flat sub-items shallower and folds later siblings after them", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.2. c|\n1.2.1. x\n1.3. d\n2. e",
        "Shift-Tab",
        "1. a\n1.1. b\n2. c|\n2.1. x\n2.2. d\n3. e",
      );
    });

    it("Rule 7 () delimiter): Shift+Tab promotes 1.2) to 2) and turns 1.3) into 2.1)", () => {
      assertKeyAndUndo(
        "1) a\n1.1) b\n1.2) c|\n1.3) d\n2) e",
        "Shift-Tab",
        "1) a\n1.1) b\n2) c|\n2.1) d\n3) e",
      );
    });

    it("Rule 7 (indented parent): Shift+Tab promotes flat sub-item inside indented list keeping list indent", () => {
      assertKeyAndUndo(
        "- topic\n  1. a\n  1.1. b\n  1.2. c|\n  1.3. d\n  2. e",
        "Shift-Tab",
        "- topic\n  1. a\n  1.1. b\n  2. c|\n  2.1. d\n  3. e",
      );
    });

    it("Rule 8: list without flat sub-items keeps today's Tab (indent under text)", () => {
      assertKeyAndUndo("1. a\n2. b|", "Tab", "1. a\n   1. b|");
    });

    it("Rule 8: indented dotted list keeps today's Tab and Shift+Tab (§462)", () => {
      assertKeyAndUndo("1. a\n   1.1. x\n2. b\n3. c|", "Tab", "1. a\n   1.1. x\n2. b\n   2.1. c|");
      assertKeyAndUndo("1. a\n   1.1. b|", "Shift-Tab", "1. a\n2. b|");
    });

    it("Rule 9: Tab on multi-item selection in flat list deepens all selected items and renumbers", () => {
      assertKeyTextAndUndo(
        "1. a\n1.1. x\n2. b\n[3. c\n4. d]",
        "Tab",
        "1. a\n1.1. x\n2. b\n2.1. c\n2.2. d",
      );
      assertKeyTextAndUndo(
        "1. a\n1.1. b\n[1.2. c\n1.3. d]\n1.4. e",
        "Tab",
        "1. a\n1.1. b\n1.1.1. c\n1.1.2. d\n1.2. e",
      );
    });

    it("Rule 9: Shift+Tab on multi-item selection in flat list shallows all selected items and renumbers", () => {
      assertKeyTextAndUndo(
        "1. a\n[1.1. b\n1.2. c]\n1.3. d\n2. e",
        "Shift-Tab",
        "1. a\n2. b\n3. c\n3.1. d\n4. e",
      );
      assertKeyTextAndUndo(
        "1. a\n1.1. b\n[1.1.1. c\n1.1.2. d]\n1.1.3. e",
        "Shift-Tab",
        "1. a\n1.1. b\n1.2. c\n1.3. d\n1.3.1. e",
      );
    });
  });

  // =========================================================================
  // Rules 11-12: Backspace
  // =========================================================================
  describe("Rules 11-12: Backspace", () => {
    it("Rule 11: Backspace on empty flat sub-item moves it out to parent's next item", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. |", "Backspace", "1. a\n1.1. b\n2. |");
    });

    it("Rule 11: Backspace on empty flat sub-item converts following siblings into children from 1", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b\n1.2. |\n1.3. d\n2. e",
        "Backspace",
        "1. a\n1.1. b\n2. |\n2.1. d\n3. e",
      );
    });

    it("Rule 11 (three levels, ) delimiter, indented): Backspace on empty flat sub-item promotes one level", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.1.1. c\n1.1.2. |", "Backspace", "1. a\n1.1. b\n1.1.1. c\n1.2. |");
      assertKeyAndUndo("1) a\n1.1) b\n1.2) |", "Backspace", "1) a\n1.1) b\n2) |");
      assertKeyAndUndo("- topic\n  1. a\n  1.1. b\n  1.2. |", "Backspace", "- topic\n  1. a\n  1.1. b\n  2. |");
    });

    it("Rule 12: Backspace at text start of non-empty flat sub-item aligns under item above and renumbers", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.2. |c\n1.3. d", "Backspace", "1. a\n1.1. b\n     |c\n1.2. d");
    });

    it("Rule 12: Backspace at text start of non-empty top-level item after flat sub-item aligns under the item above (1.1. b)", () => {
      assertKeyAndUndo("1. a\n1.1. b\n2. |c\n3. d", "Backspace", "1. a\n1.1. b\n     |c\n2. d");
    });
  });

  // =========================================================================
  // Rules 13-16: Renumbering, typing/deleting numbers, marker width
  // =========================================================================
  describe("Rules 13-16: Renumbering, typing, and marker width", () => {
    it("Rule 13: flat sub-item prefix follows its parent on an edit that renumbers", () => {
      assertKeyAndUndo("1. a\n2.1. b|", "Enter", "1. a\n1.1. b\n1.2. |");
      assertKeyAndUndo("1. a\n2.1. b\n2. c|", "Enter", "1. a\n1.1. b\n2. c\n3. |");
    });

    it("Rule 13: deleting parent line keeps flat sub-item prefix and restarts following items at 1", () => {
      assertKeyAndUndo("[1. a\n]1.1. b\n2. e", "Delete", "|1.1. b\n1. e");
      assertKeyAndUndo("[1. a\n]1.1. b\n2. e", "Backspace", "|1.1. b\n1. e");
      assertKeyAndUndo("[1) a\n]1.1) b\n2) e", "Delete", "|1.1) b\n1) e");
    });

    it("Rule 14: parentless dotted list keeps its own numbers at top and under a bullet", () => {
      assertKeyAndUndo("1.1. a\n1.2. b|", "Enter", "1.1. a\n1.2. b\n1.3. |");
      assertKeyAndUndo("4.1. a\n4.2. b|", "Enter", "4.1. a\n4.2. b\n4.3. |");
      assertKeyAndUndo("- topic\n  1.1. a\n  1.2. b|", "Enter", "- topic\n  1.1. a\n  1.2. b\n  1.3. |");
    });

    it("Rule 15: typing 1.1. b by hand under 1. a never renumbers, and subsequent Enter gives 1.2.", () => {
      const ed = openEditor("1. a\n|");
      ed.type("1.1. b");
      expect(ed.caret()).toBe("1. a\n1.1. b|");

      expect(ed.press("Enter")).toBe(true);
      expect(ed.caret()).toBe("1. a\n1.1. b\n1.2. |");

      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("1. a\n1.1. b|");
    });

    it("Rule 15: typing mismatched 2.1. b by hand under 1. a is left as typed without renumbering", () => {
      const ed = openEditor("1. a\n|");
      ed.type("2.1. b");
      expect(ed.caret()).toBe("1. a\n2.1. b|");
    });

    it("Rule 15: deleting a digit inside a flat sub-item marker never renumbers", () => {
      assertKeyAndUndo("1. a\n1.1. b\n1.12|. c\n1.3. d", "Backspace", "1. a\n1.1. b\n1.1|. c\n1.3. d");
    });

    it("Rule 16: two-digit parent (9. to 10.) updates flat sub-item prefix without adding indent", () => {
      assertKeyAndUndo(
        "8. x|\n9. a\n9.1. b\n9.2. c",
        "Enter",
        "8. x\n9. |\n10. a\n10.1. b\n10.2. c",
      );
      assertKeyAndUndo(
        "- topic\n  8. x|\n  9. a\n  9.1. b",
        "Enter",
        "- topic\n  8. x\n  9. |\n  10. a\n  10.1. b",
      );
    });

    it("Rule 16: shrinking 10. back to 9. keeps flat sub-item at col 0 while indented subtree shifts", () => {
      assertKeyAndUndo("8. x\n[9. y\n]10. a\n10.1. b", "Delete", "8. x\n|9. a\n9.1. b");
      assertKeyAndUndo("8. x|\n9. a\n   9.1. b", "Enter", "8. x\n9. |\n10. a\n    10.1. b");
    });
  });

  // =========================================================================
  // Rule 17: With a lead (state symbol)
  // =========================================================================
  describe("Rule 17: Flat lists with state symbol leads", () => {
    it("Rule 17: Enter continues flat sub-item preserving/reopening lead (#, v, o)", () => {
      assertKeyAndUndo("# 1. a\n# 1.1. b|", "Enter", "# 1. a\n# 1.1. b\n# 1.2. |");
      assertKeyAndUndo("v 1. a\nv 1.1. b|", "Enter", "v 1. a\nv 1.1. b\n# 1.2. |");
      assertKeyAndUndo("o 1. a\no 1.1. b|", "Enter", "o 1. a\no 1.1. b\no 1.2. |");
      assertKeyAndUndo(
        "# 1. a\nv 1.1. b\no 1.2. c|",
        "Enter",
        "# 1. a\nv 1.1. b\no 1.2. c\no 1.3. |",
      );
    });

    it("Rule 17: Tab changes only the number after the lead and never the lead", () => {
      assertKeyAndUndo("# 1. a\n# 1.1. b\nv 1.2. c|", "Tab", "# 1. a\n# 1.1. b\nv 1.1.1. c|");
      assertKeyAndUndo(
        "# 1. a\nv 1.1. b\no 1.2. c|\n# 1.2.1. d\nv 1.3. e",
        "Tab",
        "# 1. a\nv 1.1. b\no 1.1.1. c|\n# 1.1.1.1. d\nv 1.2. e",
      );
      assertKeyAndUndo("# 1. a|\n# 1.1. b", "Tab", "# 1. a|\n# 1.1. b");
    });

    it("Rule 17: Shift+Tab, Enter on empty, Backspace on empty, and parent delete preserve leads", () => {
      assertKeyAndUndo(
        "# 1. a\n# 1.1. b\nv 1.2. c|\no 1.3. d\n# 2. e",
        "Shift-Tab",
        "# 1. a\n# 1.1. b\nv 2. c|\no 2.1. d\n# 3. e",
      );
      assertKeyAndUndo("o 1. a\no 1.1. b\no 1.2. |", "Enter", "o 1. a\no 1.1. b\no 2. |");
      assertKeyAndUndo("# 1. a\n# 1.1. b\n# 1.2. |", "Backspace", "# 1. a\n# 1.1. b\n# 2. |");
      assertKeyAndUndo("[# 1. a\n]v 1.1. b\no 2. e", "Delete", "|v 1.1. b\no 1. e");
    });
  });

  // =========================================================================
  // Rule 18: Delimiters (mixed delimiter not linked)
  // =========================================================================
  describe("Rule 18: Delimiters", () => {
    it("Rule 18: mixed delimiters (1. a then 1.1) b) are not linked", () => {
      assertKeyAndUndo("1. a\n1.1) b|", "Enter", "1. a\n1.1) b\n1.2) |");
      assertKeyAndUndo("1. a|\n1.1) b", "Enter", "1. a\n2. |\n1.1) b");
      assertKeyAndUndo("[0. x\n]1. a\n2.1) b", "Delete", "|1. a\n2.1) b");
      assertKeyAndUndo("1. a\n1.1) b|", "Tab", "1. a\n  1.1) b|");
    });
  });

  // =========================================================================
  // Core rule: Moving lines, pasting, and bullets
  // =========================================================================
  describe("Core rule: move lines, paste, and bullets", () => {
    it("Alt-ArrowDown and Alt-ArrowUp move flat sub-items and renumber across parent boundaries", () => {
      assertKeyAndUndo(
        "1. a\n1.1. b|\n1.2. c\n2. d",
        "Alt-ArrowDown",
        "1. a\n1.1. c\n1.2. b|\n2. d",
      );
      assertKeyAndUndo("1. a\n2. d\n2.1. b|", "Alt-ArrowUp", "1. a\n1.1. b|\n2. d");
    });

    it("paste of flat sub-items into a flat list renumbers to match parent", () => {
      const ed = openEditor("1. a\n[1.1. old]\n1.2. d");
      ed.paste("9.1. b\n9.2. c");
      expect(ed.caret()).toBe("1. a\n1.1. b\n1.2. c|\n1.3. d");
      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("1. a\n[1.1. old]\n1.2. d");
    });

    it("bullet at same indent behaves as today next to a flat list", () => {
      assertKeyAndUndo("- note\n1. a\n1.1. b|", "Enter", "- note\n1. a\n1.1. b\n1.2. |");
      assertKeyAndUndo("1. a\n1.1. b\n- note|", "Enter", "1. a\n1.1. b\n- note\n- |");
    });
  });
});
