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

const ALL_LEADS = ["# ", "v ", "> ", "x ", "o ", ". ", ", "] as const;

describe("D4 independent tests: list keys behind a state symbol", () => {
  // =========================================================================
  // Rule 1. One list, whatever the symbols
  // =========================================================================
  describe("Rule 1: one list, whatever the symbols", () => {
    it("1.1: deleting 1. a from '1. a\\n# 2. b\\nv 3. c' renumbers to '# 1. b\\nv 2. c' and undoes in one step", () => {
      assertKeyAndUndo("[1. a\n]# 2. b\nv 3. c", "Delete", "|# 1. b\nv 2. c");
    });

    it("1.1: deleting the first item renumbers a list spanning every lead (# v > x o . ,)", () => {
      assertKeyAndUndo(
        "[1. a\n]# 2. b\nv 3. c\n> 4. d\nx 5. e\no 6. f\n. 7. g\n, 8. h",
        "Delete",
        "|# 1. b\nv 2. c\n> 3. d\nx 4. e\no 5. f\n. 6. g\n, 7. h",
      );
    });

    it("1.1: deleting the first item renumbers a ) list with mixed leads", () => {
      assertKeyAndUndo("[1) a\n]# 2) b\nv 3) c", "Delete", "|# 1) b\nv 2) c");
    });

    it("1.1: deleting the first item renumbers an indented (2-space) list with leads", () => {
      assertKeyAndUndo("[  1. a\n]  # 2. b\n  v 3. c", "Delete", "|  # 1. b\n  v 2. c");
    });

    it("1.1: Alt+ArrowDown moves a lead item inside a mixed list and renumbers in doc order", () => {
      assertKeyAndUndo("# 1. a|\n2. b\nv 3. c", "Alt-ArrowDown", "1. b\n# 2. a|\nv 3. c");
    });

    it("1.2: Ctrl+1 on '1. task|\\n2. next' keeps it in the list and does not renumber", () => {
      assertKeyAndUndo("1. task|\n2. next", "Mod-1", "# 1. task|\n2. next");
    });

    it("1.2: Ctrl+2, Ctrl+3, Ctrl+4 on '1. task|\\n2. next' keep it in the list without renumbering", () => {
      assertKeyAndUndo("1. task|\n2. next", "Mod-2", "v 1. task|\n2. next");
      assertKeyAndUndo("1. task|\n2. next", "Mod-3", "> 1. task|\n2. next");
      assertKeyAndUndo("1. task|\n2. next", "Mod-4", "x 1. task|\n2. next");
    });

    it("1.2: Ctrl+1..4 on a middle item (including ) and 2-space indented lists) leave neighbours untouched", () => {
      assertKeyAndUndo("1. a\n2. task|\n3. c", "Mod-1", "1. a\n# 2. task|\n3. c");
      assertKeyAndUndo("1) a\n2) task|\n3) c", "Mod-2", "1) a\nv 2) task|\n3) c");
      assertKeyAndUndo("  1. a\n  2. task|\n  3. c", "Mod-3", "  1. a\n  > 2. task|\n  3. c");
    });

    it("1.2: Ctrl+5..7 set topic states (o . ,) on a numbered item without renumbering", () => {
      assertKeyAndUndo("1. task|\n2. next", "Mod-5", "o 1. task|\n2. next");
      assertKeyAndUndo("1. task|\n2. next", "Mod-6", ". 1. task|\n2. next");
      assertKeyAndUndo("1. task|\n2. next", "Mod-7", ", 1. task|\n2. next");
    });

    it("1.2: Ctrl+Shift+O reopens topic (. / ,) and action (v) items in a list without renumbering, and leaves plain items alone", () => {
      assertKeyAndUndo(". 1. task|\n2. next", "Mod-Shift-o", "o 1. task|\n2. next");
      assertKeyAndUndo(", 1. task|\n2. next", "Mod-Shift-o", "o 1. task|\n2. next");
      assertKeyAndUndo("v 1. task|\n2. next", "Mod-Shift-o", "# 1. task|\n2. next");
      assertKeyAndUndo("1. task|\n2. next", "Mod-Shift-o", "1. task|\n2. next");
    });

    it("1.2: Ctrl+2 over a multi-line selection of numbered items keeps numbering intact", () => {
      assertKeyAndUndo("[1. a\n2. b]\n3. c", "Mod-2", "[v 1. a\nv 2. b]\n3. c");
    });

    it("1.2: removing a state again ('# 1. task' back to '1. task') keeps numbering intact", () => {
      assertKeyAndUndo("# |1. task\n2. next", "Backspace", "|1. task\n2. next");
      assertKeyAndUndo("1. a\nv |2. b\n3. c", "Backspace", "1. a\n|2. b\n3. c");
      assertKeyAndUndo("1. a\no |2. b\n# 3. c", "Backspace", "1. a\n|2. b\n# 3. c");
      assertKeyAndUndo("  1. a\n  # |2. b\n  3. c", "Backspace", "  1. a\n  |2. b\n  3. c");
    });

    it("1.2: round-trip Ctrl+1 then removing the state restores '1. task\\n2. next' without renumbering", () => {
      const ed = openEditor("1. task|\n2. next");
      ed.press("Mod-1");
      expect(ed.caret()).toBe("# 1. task|\n2. next");

      ed.select(2, 2); // "# |1. task"
      ed.press("Backspace");
      expect(ed.caret()).toBe("|1. task\n2. next");

      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("# |1. task\n2. next");
      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.text()).toBe("1. task\n2. next");
    });

    it("1.3: a lead line with no list marker ('# book room') inside a list does not split the list", () => {
      assertKeyAndUndo("[1. x\n]2. a\n# book room\n3. b", "Delete", "|1. a\n# book room\n2. b");
      assertKeyAndUndo("1. a|\n# book room\n2. b", "Enter", "1. a\n2. |\n# book room\n3. b");
      assertKeyAndUndo("1. a|\n. discuss later\n2. b", "Enter", "1. a\n2. |\n. discuss later\n3. b");
      assertKeyAndUndo("# 1. a|\n# book room\n# 2. b", "Enter", "# 1. a\n# 2. |\n# book room\n# 3. b");
      assertKeyAndUndo("  1. a|\n  # book room\n  2. b", "Enter", "  1. a\n  2. |\n  # book room\n  3. b");
    });

    it("1.3: a blank line still splits a list", () => {
      assertKeyAndUndo("1. a|\n# book room\n\n1. b", "Enter", "1. a\n2. |\n# book room\n\n1. b");
    });
  });

  // =========================================================================
  // Rule 2. Tab and Shift+Tab
  // =========================================================================
  describe("Rule 2: Tab and Shift+Tab", () => {
    it("2.1: Tab on '# 2. book hotel' indents to parent's text column (5 spaces) and restarts at 1", () => {
      assertKeyAndUndo("# 1. plan trip\n# 2. book hotel|", "Tab", "# 1. plan trip\n     # 1. book hotel|");
      assertKeyAndUndo("# 1. plan trip\n# 2. |book hotel", "Tab", "# 1. plan trip\n     # 1. |book hotel");
      assertKeyAndUndo("# 1. plan trip\n# 2. bo|ok hotel", "Tab", "# 1. plan trip\n     # 1. bo|ok hotel");
    });

    it("2.1: Tab works with caret before or inside the lead/marker on '# 2. book hotel'", () => {
      for (const line2 of ["|# 2. book hotel", "#| 2. book hotel", "# |2. book hotel", "# 2|. book hotel"]) {
        const input = `# 1. plan trip\n${line2}`;
        const ed = openEditor(input);
        ed.press("Tab");
        expect(ed.text(), line2).toBe("# 1. plan trip\n     # 1. book hotel");
        expect(ed.press("Mod-z")).toBe(true);
        expect(ed.text()).toBe("# 1. plan trip\n# 2. book hotel");
      }
    });

    it("2.1: Tab indents under parent for every lead (# v > x o . ,), ) delimiter, 2-space indent, and two-digit parent", () => {
      for (const lead of ALL_LEADS) {
        assertKeyAndUndo(`# 1. a\n${lead}2. b|`, "Tab", `# 1. a\n     ${lead}1. b|`);
      }
      assertKeyAndUndo("# 1) a\n# 2) b|", "Tab", "# 1) a\n     # 1) b|");
      assertKeyAndUndo("  # 1. a\n  # 2. b|", "Tab", "  # 1. a\n       # 1. b|");
      assertKeyAndUndo("# 10. a\n# 11. b|", "Tab", "# 10. a\n      # 1. b|");
    });

    it("2.2: Tab works with mixed leads and plain items", () => {
      assertKeyAndUndo("1. plan\nv 2. booked|", "Tab", "1. plan\n   v 1. booked|");
      assertKeyAndUndo("# 1. plan\n2. pack|", "Tab", "# 1. plan\n     1. pack|");
      assertKeyAndUndo("o 1. agenda\n> 2. item|", "Tab", "o 1. agenda\n     > 1. item|");
    });

    it("2.3: Tab continues an existing sub-group under the same parent", () => {
      assertKeyAndUndo("# 1. a\n     # 1. b\n# 2. c|", "Tab", "# 1. a\n     # 1. b\n     # 2. c|");
    });

    it("2.3: Tab uses dotted sub-items when the list already uses them", () => {
      assertKeyAndUndo("# 1. a\n     # 1.1. b\n# 2. c|", "Tab", "# 1. a\n     # 1.1. b\n     # 1.2. c|");
      assertKeyAndUndo(
        "# 1. a\n     # 1.1. b\n# 2. c\n# 3. d|",
        "Tab",
        "# 1. a\n     # 1.1. b\n# 2. c\n     # 2.1. d|",
      );
    });

    it("2.3: Tab on the first item of a group moves the whole group without renumbering", () => {
      assertKeyAndUndo("# 1. a|\n# 2. b\nv 3. c", "Tab", "  # 1. a|\n  # 2. b\n  v 3. c");
      assertKeyAndUndo(
        "# 1. a\n     # 1. b|\n     v 2. c",
        "Tab",
        "# 1. a\n       # 1. b|\n       v 2. c",
      );
    });

    it("2.3: Tab on a middle item renumbers what follows", () => {
      assertKeyAndUndo("# 1. a\n# 2. b|\n# 3. c", "Tab", "# 1. a\n     # 1. b|\n# 2. c");
      assertKeyAndUndo("# 1) a\n# 2) b|\nv 3) c", "Tab", "# 1) a\n     # 1) b|\nv 2) c");
    });

    it("2.4: Shift+Tab outdents a sub-item back to the outer list and renumbers what follows", () => {
      assertKeyAndUndo("# 1. plan trip\n     # 1. book hotel|", "Shift-Tab", "# 1. plan trip\n# 2. book hotel|");
      assertKeyAndUndo(
        "# 1. a\n     # 1. b|\n     v 2. c\n# 2. d",
        "Shift-Tab",
        "# 1. a\n# 2. b|\n     v 1. c\n# 3. d",
      );
      assertKeyAndUndo("# 1. a\n     # 1.1. b|\n# 2. c", "Shift-Tab", "# 1. a\n# 2. b|\n# 3. c");
      assertKeyAndUndo("  # 1. a|\n  v 2. b", "Shift-Tab", "# 1. a|\nv 2. b");
      assertKeyAndUndo("# 1) a\n     # 1) b|\n# 2) c", "Shift-Tab", "# 1) a\n# 2) b|\n# 3) c");
      assertKeyAndUndo("  # 1. a\n       # 1. b|\n  # 2. c", "Shift-Tab", "  # 1. a\n  # 2. b|\n  # 3. c");
    });

    it("2.4: Shift+Tab outdents every lead (# v > x o . ,) and is a no-op at col 0", () => {
      for (const lead of ALL_LEADS) {
        assertKeyAndUndo(`# 1. a\n     ${lead}1. b|`, "Shift-Tab", `# 1. a\n${lead}2. b|`);
      }
      assertKeyAndUndo("# 1. a|\n# 2. b", "Shift-Tab", "# 1. a|\n# 2. b");
    });

    it("2.5: bullets with a lead indent under parent's text column (4 spaces) and Shift+Tab takes them back", () => {
      assertKeyAndUndo("o - point\no - detail|", "Tab", "o - point\n    o - detail|");
      assertKeyAndUndo("o - point\n    o - detail|", "Shift-Tab", "o - point\no - detail|");
      assertKeyAndUndo("# * task\n# * sub|", "Tab", "# * task\n    # * sub|");
      assertKeyAndUndo("# * task\n    # * sub|", "Shift-Tab", "# * task\n# * sub|");
      assertKeyAndUndo("# 1. parent\n- child|", "Tab", "# 1. parent\n     - child|");
      assertKeyAndUndo("o - parent\n# 1. child|", "Tab", "o - parent\n    # 1. child|");
      assertKeyAndUndo("  o - point\n  o - detail|", "Tab", "  o - point\n      o - detail|");
    });

    it("2.6: Tab and Shift+Tab on a selection over several items move them together", () => {
      assertKeyAndUndo(
        "# 1. a\n[# 2. b\nv 3. c]\n> 4. d",
        "Tab",
        "# 1. a\n[     # 1. b\n     v 2. c]\n> 2. d",
      );
      assertKeyAndUndo(
        "# 1. a\n[     # 1. b\n     v 2. c]\n> 2. d",
        "Shift-Tab",
        "# 1. a\n[# 2. b\nv 3. c]\n> 4. d",
      );
      assertKeyAndUndo("# 1. a\n[# 2. b\n]# 3. c", "Tab", "# 1. a\n[     # 1. b\n]# 2. c");
      assertKeyAndUndo("o - point\n[o - a\n. - b]", "Tab", "o - point\n[    o - a\n    . - b]");
    });
  });

  // =========================================================================
  // Rule 3. Enter
  // =========================================================================
  describe("Rule 3: Enter and Shift+Enter", () => {
    it("3.1: Enter at the end of 'v 2. x' in '# 1. a\\nv 2. x' gives '# 1. a\\nv 2. x\\n# 3. |'", () => {
      assertKeyAndUndo("# 1. a\nv 2. x|", "Enter", "# 1. a\nv 2. x\n# 3. |");
    });

    it("3.1: Enter continues action leads (# v > x) as '# ' and topic leads (o . ,) as 'o '", () => {
      const expectedNext: Record<(typeof ALL_LEADS)[number], string> = {
        "# ": "# ",
        "v ": "# ",
        "> ": "# ",
        "x ": "# ",
        "o ": "o ",
        ". ": "o ",
        ", ": "o ",
      };
      for (const lead of ALL_LEADS) {
        assertKeyAndUndo(`${lead}1. x|`, "Enter", `${lead}1. x\n${expectedNext[lead]}2. |`);
      }
    });

    it("3.1: Enter handles ) delimiters, dotted sub-items, 2-space indents, and lead+bullet items", () => {
      assertKeyAndUndo("v 2) x|", "Enter", "v 2) x\n# 3) |");
      assertKeyAndUndo(". 1) x|", "Enter", ". 1) x\no 2) |");
      assertKeyAndUndo("     v 1.1. x|", "Enter", "     v 1.1. x\n     # 1.2. |");
      assertKeyAndUndo("     , 1.1. x|", "Enter", "     , 1.1. x\n     o 1.2. |");
      assertKeyAndUndo("  > 1. x|", "Enter", "  > 1. x\n  # 2. |");
      assertKeyAndUndo("v - x|", "Enter", "v - x\n# - |");
      assertKeyAndUndo(". - x|", "Enter", ". - x\no - |");
    });

    it("3.2: Enter in the middle of a list pushes following items down and renumbers them whatever their leads", () => {
      assertKeyAndUndo("# 1. a|\n# 2. b\nv 3. c", "Enter", "# 1. a\n# 2. |\n# 3. b\nv 4. c");
      assertKeyAndUndo("# 1. al|pha\n# 2. b\no 3. c", "Enter", "# 1. al\n# 2. |pha\n# 3. b\no 4. c");
      assertKeyAndUndo(
        "# 1. a|\n     # 1.1. sub\nv 2. b",
        "Enter",
        "# 1. a\n# 2. |\n     # 2.1. sub\nv 3. b",
      );
      assertKeyAndUndo("v 1) a|\n# 2) b\no 3) c", "Enter", "v 1) a\n# 2) |\n# 3) b\no 4) c");
      assertKeyAndUndo("  # 1. a|\n  v 2. b\n  > 3. c", "Enter", "  # 1. a\n  # 2. |\n  v 3. b\n  > 4. c");
    });

    it("3.2: growing from # 9. to # 10. shifts continuation lines and sub-items by +1 space (and shrinking shifts back)", () => {
      assertKeyAndUndo(
        "# 8. pre|\n# 9. a\n     cont\n     # 1. sub",
        "Enter",
        "# 8. pre\n# 9. |\n# 10. a\n      cont\n      # 1. sub",
      );
      assertKeyAndUndo(
        "# 8. pre|\n# 9. a\n     # 9.1. sub",
        "Enter",
        "# 8. pre\n# 9. |\n# 10. a\n      # 10.1. sub",
      );
      assertKeyAndUndo(
        "# 8) pre|\n# 9) a\n     cont\n     # 1) sub",
        "Enter",
        "# 8) pre\n# 9) |\n# 10) a\n      cont\n      # 1) sub",
      );
      assertKeyAndUndo(
        "# 8. pre\n[# 9. y\n]# 10. a\n      cont\n      # 1. sub",
        "Delete",
        "# 8. pre\n|# 9. a\n     cont\n     # 1. sub",
      );
    });

    it("3.3: Enter on an empty top-level item with a lead exits the list to an empty line", () => {
      for (const lead of ALL_LEADS) {
        assertKeyAndUndo(`# 1. a\n${lead}2. |`, "Enter", "# 1. a\n|");
      }
      assertKeyAndUndo("# 1. a\n# 2. |\nv 3. c", "Enter", "# 1. a\n|\nv 1. c");
      assertKeyAndUndo("o - a\n    # 1. |", "Enter", "o - a\n|");
    });

    it("3.3: Enter on an empty sub-item with a lead under a numbered parent promotes out as the parent's next item", () => {
      assertKeyAndUndo("# 1. a\n     # 1. |", "Enter", "# 1. a\n# 2. |");
      assertKeyAndUndo(
        "# 1. a\n     # 1. |\n     v 2. b\n# 2. c",
        "Enter",
        "# 1. a\n# 2. |\n     v 1. b\n# 3. c",
      );
      assertKeyAndUndo(
        "# 1. a\n     # 1.1. |\n     # 1.2. b\n# 2. c",
        "Enter",
        "# 1. a\n# 2. |\n     # 2.1. b\n# 3. c",
      );
      assertKeyAndUndo("# 1) a\n     # 1) |", "Enter", "# 1) a\n# 2) |");
      assertKeyAndUndo("o 1. a\n     o 1. |", "Enter", "o 1. a\no 2. |");
      assertKeyAndUndo("1. a\n   # 1. |", "Enter", "1. a\n# 2. |");
    });

    it("3.4: Shift+Enter stays unchanged, aligning a continuation line under the item's text", () => {
      assertKeyAndUndo("# 1. plan|", "Shift-Enter", "# 1. plan\n     |");
      assertKeyAndUndo("v 10. tenth|", "Shift-Enter", "v 10. tenth\n      |");
      assertKeyAndUndo("o - point|", "Shift-Enter", "o - point\n    |");
      assertKeyAndUndo("  # 1. x|", "Shift-Enter", "  # 1. x\n       |");
    });
  });

  // =========================================================================
  // Rule 4. Backspace at the text start
  // =========================================================================
  describe("Rule 4: Backspace at the text start", () => {
    it("4.1: Backspace at text start removes the number, keeps the lead aligned under item above's text, and renumbers", () => {
      assertKeyAndUndo("# 1. a\n# 2. |b\n# 3. c", "Backspace", "# 1. a\n#    |b\n# 2. c");
    });

    it("4.1: Backspace at text start works for every lead (# v > x o . ,), ) delimiter, 2-space indent, mixed parent, two-digit parent, and sub-items", () => {
      for (const lead of ALL_LEADS) {
        assertKeyAndUndo(`# 1. a\n${lead}2. |b\n# 3. c`, "Backspace", `# 1. a\n${lead}   |b\n# 2. c`);
      }
      assertKeyAndUndo("# 1) a\n# 2) |b\n# 3) c", "Backspace", "# 1) a\n#    |b\n# 2) c");
      assertKeyAndUndo("  # 1. a\n  # 2. |b\n  # 3. c", "Backspace", "  # 1. a\n  #    |b\n  # 2. c");
      assertKeyAndUndo("1. a\n# 2. |b\n3. c", "Backspace", "1. a\n#  |b\n2. c");
      assertKeyAndUndo("# 10. a\n# 11. |b\n# 12. c", "Backspace", "# 10. a\n#     |b\n# 11. c");
      assertKeyAndUndo("# 1. |a\n# 2. b", "Backspace", "# |a\n# 1. b");
      assertKeyAndUndo(
        "# 1. a\n     # 1.1. sub\n# 2. |c\n# 3. d",
        "Backspace",
        "# 1. a\n     # 1.1. sub\n#    |c\n# 2. d",
      );
    });

    it("4.2: second Backspace outdents back to the continued item's indent, keeps the lead+space, and does not split the list", () => {
      assertKeyAndUndo("# 1. a\n#    |b\n# 2. c", "Backspace", "# 1. a\n# |b\n# 2. c");
      assertKeyAndUndo("# 1) a\n#    |b\n# 2) c", "Backspace", "# 1) a\n# |b\n# 2) c");
      assertKeyAndUndo("  # 1. a\n  #    |b\n  # 2. c", "Backspace", "  # 1. a\n  # |b\n  # 2. c");
      assertKeyAndUndo("# 1. a\nv    |b\n# 2. c", "Backspace", "# 1. a\nv |b\n# 2. c");
      assertKeyAndUndo("# 1. a\no    |b\n# 2. c", "Backspace", "# 1. a\no |b\n# 2. c");
    });

    it("4.1 + 4.2: two consecutive Backspaces and two Ctrl+Z undos step cleanly through both states", () => {
      const ed = openEditor("# 1. a\n# 2. |b\n# 3. c");
      ed.press("Backspace");
      expect(ed.caret()).toBe("# 1. a\n#    |b\n# 2. c");
      ed.press("Backspace");
      expect(ed.caret()).toBe("# 1. a\n# |b\n# 2. c");

      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("# 1. a\n#    |b\n# 2. c");
      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("# 1. a\n# 2. |b\n# 3. c");
    });

    it("4.3: Backspace on an empty sub-item with a lead under a numbered parent promotes it to the parent's next item", () => {
      assertKeyAndUndo("# 1. a\n     # 1. |", "Backspace", "# 1. a\n# 2. |");
      assertKeyAndUndo(
        "# 1. a\n     # 1. |\n     v 2. b\n# 2. c",
        "Backspace",
        "# 1. a\n# 2. |\n     v 1. b\n# 3. c",
      );
      assertKeyAndUndo("# 1) a\n     # 1) |", "Backspace", "# 1) a\n# 2) |");
      assertKeyAndUndo("# 1. a\n     # 1.1. |", "Backspace", "# 1. a\n# 2. |");
      assertKeyAndUndo("1. a\n   v 1. |", "Backspace", "1. a\nv 2. |");
      assertKeyAndUndo("o 1. a\n     o 1. |", "Backspace", "o 1. a\no 2. |");
    });

    it("4.4: Backspace inside the text, inside the lead, inside the number, or at col 0 is an ordinary Backspace", () => {
      assertKeyAndUndo("# 1. ta|sk\n# 2. next", "Backspace", "# 1. t|sk\n# 2. next");
      assertKeyAndUndo("#| 1. a\n# 2. b", "Backspace", "| 1. a\n# 2. b");
      assertKeyAndUndo("# 12.| a\n# 13. b", "Backspace", "# 12| a\n# 13. b");
      assertKeyAndUndo("# 12|. a\n# 13. b", "Backspace", "# 1|. a\n# 13. b");
      assertKeyAndUndo("# 1. a\n|# 2. b", "Backspace", "# 1. a|# 2. b");
    });
  });

  // =========================================================================
  // Not changed
  // =========================================================================
  describe("Not changed: manual number typing, plain items, and non-list lead lines", () => {
    it("typing a number by hand on a lead line never renumbers", () => {
      const ed = openEditor("# 1. a\n#    |\n# 3. c");
      ed.type("2");
      expect(ed.caret()).toBe("# 1. a\n#    2|\n# 3. c");
      expect(ed.press("Mod-z")).toBe(true);
      expect(ed.caret()).toBe("# 1. a\n#    |\n# 3. c");
    });

    it("plain 1. lines without a lead behave as before", () => {
      assertKeyAndUndo("1. a\n2. b|", "Tab", "1. a\n   1. b|");
    });

    it("a lead line with no list marker ('# task') is not a list item: plain indent when not under a list", () => {
      assertKeyAndUndo("# task|", "Tab", "  # task|");
      assertKeyAndUndo("# 1. a\ncont|", "Tab", "# 1. a\n     cont|");
    });
  });
});
