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
  return s.replace(/[|\[\]]/g, "");
}

interface KeyCase {
  label: string;
  input: string;
  key: "Tab" | "Shift-Tab" | "Backspace";
  expected: string;
}

function runKeyTable(cases: KeyCase[]): void {
  for (const c of cases) {
    it(`${c.label}: ${JSON.stringify(c.input)} + ${c.key}`, () => {
      const ed = openEditor(c.input);
      ed.press(c.key);
      expect(ed.caret()).toBe(c.expected);

      if (stripMarkers(c.expected) !== stripMarkers(c.input)) {
        expect(ed.undo()).toBe(true);
        expect(ed.caret()).toBe(c.input);
        expect(ed.redo()).toBe(true);
        expect(ed.text()).toBe(stripMarkers(c.expected));
      }
    });
  }
}

describe("editing table: Tab, Shift-Tab & Backspace", () => {
  // Rule: Tab indents non-numbered lines by 2 spaces; Shift-Tab outdents up to 2 spaces / 1 tab (Spec 2.4, §2)
  const nonNumberedTabCases: KeyCase[] = (() => {
    const lines: Array<[string, string]> = [
      ["empty", ""],
      ["spaces", "  "],
      ["prose", "plain text"],
      ["indented prose", "  indented"],
      ["bullet -", "- item"],
      ["bullet *", "* item"],
      ["open action #", "# task"],
      ["done action v", "v task"],
      ["deferred action >", "> task"],
      ["wont-do action x", "x task"],
      ["open topic o", "o topic"],
      ["discussed topic .", ". topic"],
      ["postponed topic ,", ", topic"],
      ["emphasis !", "! urgent"],
      ["action+bullet # -", "# - task"],
      ["action+emphasis # !", "# ! urgent"],
      ["action+emphasis+bullet # ! -", "# ! - item"],
      ["follow-up =>", "=> follow"],
      ["consequence => #", "=> # action"],
      ["prose+consequence a => # b", "a => # b"],
      ["action+numbered # 1.", "# 1. task"],
      ["topic+numbered o 1.", "o 1. topic"],
    ];
    const rows: KeyCase[] = [];
    for (const [name, text] of lines) {
      rows.push({
        label: `Tab end of ${name}`,
        input: `${text}|`,
        key: "Tab",
        expected: `  ${text}|`,
      });
      if (text.length >= 2) {
        rows.push({
          label: `Tab col 0 of ${name}`,
          input: `|${text}`,
          key: "Tab",
          expected: `  |${text}`,
        });
      }
      if (text.startsWith("  ")) {
        rows.push({
          label: `Shift-Tab on ${name}`,
          input: `${text}|`,
          key: "Shift-Tab",
          expected: `${text.slice(2)}|`,
        });
      } else {
        rows.push({
          label: `Shift-Tab at col 0 no-op on ${name}`,
          input: `${text}|`,
          key: "Shift-Tab",
          expected: `${text}|`,
        });
      }
    }
    return rows;
  })();

  runKeyTable(nonNumberedTabCases);

  // Rule: Tab / Shift-Tab on special lines and selections (Spec 2.4, Known Bug: Shift+Down ends at col 0)
  runKeyTable([
    { label: "Shift-Tab on 1-space indent", input: " prose|", key: "Shift-Tab", expected: "prose|" },
    { label: "Shift-Tab on tab-indented action", input: "\t# task|", key: "Shift-Tab", expected: "# task|" },
    { label: "Tab on continuation line under bullet", input: "- item\n  cont|", key: "Tab", expected: "- item\n    cont|" },
    { label: "Shift-Tab on continuation line under bullet", input: "- item\n    cont|", key: "Shift-Tab", expected: "- item\n  cont|" },
    { label: "Tab on section title", input: "Title|\n=====", key: "Tab", expected: "  Title|\n=====" },
    { label: "Tab on === underline", input: "Title\n=====|", key: "Tab", expected: "Title\n  =====|" },
    { label: "Tab on subtitle", input: "Sub|\n---", key: "Tab", expected: "  Sub|\n---" },
    {
      label: "Tab on two-line selection",
      input: "[# a\n# b]",
      key: "Tab",
      expected: "  [# a\n  # b]",
    },
    {
      label: "Tab on Shift+Down whole-line selection excludes trailing col 0",
      input: "[# a\n]second",
      key: "Tab",
      expected: "  [# a\n]second",
    },
    {
      label: "Shift-Tab on Shift+Down whole-line selection excludes trailing col 0",
      input: "[  # a\n]  second",
      key: "Shift-Tab",
      expected: "[# a\n]  second",
    },
  ]);

  // Rule: Tab / Shift-Tab on numbered lists, sub-items, bullets under numbered lists, and continuation stops (Spec 2.4, §457, §462, §464)
  runKeyTable([
    {
      label: "Tab indents item 2 under 1. text column (3 spaces)",
      input: "1. a\n2. b|",
      key: "Tab",
      expected: "1. a\n   1. b|",
    },
    {
      label: "Tab indents under 10. text column (4 spaces)",
      input: "10. a\n11. b|",
      key: "Tab",
      expected: "10. a\n    1. b|",
    },
    {
      label: "Tab joins existing plain sub-group",
      input: "1. a\n   1. sub\n2. b|",
      key: "Tab",
      expected: "1. a\n   1. sub\n   2. b|",
    },
    {
      label: "Tab joins existing dotted sub-group and renumbers rest",
      input: "1. a\n   1.1. sub\n2. b|\n3. c",
      key: "Tab",
      expected: "1. a\n   1.1. sub\n   1.2. b|\n2. c",
    },
    {
      label: "Tab keeps dotted style when block already has dotted sub-items (§462)",
      input: "1. a\n2. b|\n3. c\n   3.1. d",
      key: "Tab",
      expected: "1. a\n   1.1. b|\n2. c\n   2.1. d",
    },
    {
      label: "Tab on first item moves whole group +2 without renumbering (§464)",
      input: "1. a|\n2. b",
      key: "Tab",
      expected: "  1. a|\n  2. b",
    },
    {
      label: "Tab on first item under bullet moves group to bullet text column",
      input: "- bullet\n1. a|\n2. b",
      key: "Tab",
      expected: "- bullet\n  1. a|\n  2. b",
    },
    {
      label: "Tab on first item of sub-group moves sub-group +2",
      input: "1. a\n   1. sub|\n   2. sub2",
      key: "Tab",
      expected: "1. a\n     1. sub|\n     2. sub2",
    },
    {
      label: "Tab on bullet under numbered item aligns under text column",
      input: "1. a\n- sub|",
      key: "Tab",
      expected: "1. a\n   - sub|",
    },
    {
      label: "Tab on non-item line below numbered list aligns to list text column",
      input: "1. a\ncont|",
      key: "Tab",
      expected: "1. a\n   cont|",
    },
    {
      label: "Tab on Shift+Down selection on 2. b excludes 3. c",
      input: "1. a\n[2. b\n]3. c",
      key: "Tab",
      expected: "1. a\n[   1. b\n]2. c",
    },
    {
      label: "Shift-Tab outdents sub-item to parent indent and continues outer list",
      input: "1. a\n   1. b|",
      key: "Shift-Tab",
      expected: "1. a\n2. b|",
    },
    {
      label: "Shift-Tab outdents sub-item and restarts remaining children from 1",
      input: "1. a\n   1. b|\n   2. c\n2. d",
      key: "Shift-Tab",
      expected: "1. a\n2. b|\n   1. c\n3. d",
    },
    {
      label: "Shift-Tab on dotted sub-item converts to plain outer number",
      input: "1. a\n   1.1. b|",
      key: "Shift-Tab",
      expected: "1. a\n2. b|",
    },
    {
      label: "Shift-Tab on first item of indented parentless group moves whole group back",
      input: "  1. a|\n  2. b",
      key: "Shift-Tab",
      expected: "1. a|\n2. b",
    },
    {
      label: "Shift-Tab on multi-line sub-item selection outdents both",
      input: "1. a\n[   1. b\n   2. c]",
      key: "Shift-Tab",
      expected: "1. a\n[2. b\n3. c]",
    },
    {
      label: "Shift-Tab at col 0 of top-level numbered item is a no-op",
      input: "1. a|\n2. b",
      key: "Shift-Tab",
      expected: "1. a|\n2. b",
    },
  ]);

  // Rule: Backspace at text start on atomic tokens removes whole token (Spec 2.2, §5, §11); held caret deletes 1 char (§463)
  const backspaceTokenCases: KeyCase[] = [
    ["open action #", "# ", "|task"],
    ["done action v", "v ", "|task"],
    ["deferred action >", "> ", "|task"],
    ["wont-do action x", "x ", "|task"],
    ["open topic o", "o ", "|topic"],
    ["discussed topic .", ". ", "|topic"],
    ["postponed topic ,", ", ", "|topic"],
    ["bullet -", "- ", "|task"],
    ["bullet *", "* ", "|task"],
    ["emphasis !", "! ", "!|task"],
    ["follow-up =>", "=> ", "|task"],
    ["delegated => @name", "=> ", "|@dana"],
    ["consequence => #", "=> # ", "=> |task"],
    ["action+bullet # -", "# - ", "# |task"],
    ["action+emphasis # ! (not a glyph: one space goes)", "# ! ", "# !|task"],
    ["action+emphasis+bullet # ! -", "# ! - ", "# ! |task"],
    ["indented action", "  # ", "  |task"],
    ["tab-indented action", "\t# ", "\t|task"],
  ].map(([name, prefix, expected]) => {
    const tail = expected.replace(/^[^|]*\|/, "");
    return {
      label: `Backspace at text start removes ${name}`,
      input: `${prefix}|${tail}`,
      key: "Backspace" as const,
      expected,
    };
  });

  runKeyTable(backspaceTokenCases);

  // Rule: Backspace on held caret, plain/indented lines, and non-marker boundaries (§463, plain editing)
  runKeyTable([
    { label: "Backspace inside held caret #| task deletes only #", input: "#| task", key: "Backspace", expected: "| task" },
    { label: "Backspace inside held caret =>| text deletes only >", input: "=>| text", key: "Backspace", expected: "=| text" },
    { label: "Backspace on empty line is no-op", input: "|", key: "Backspace", expected: "|" },
    { label: "Backspace at col 0 of prose is no-op", input: "|prose", key: "Backspace", expected: "|prose" },
    { label: "Backspace on spaces-only deletes indent unit", input: "  |", key: "Backspace", expected: "|" },
    { label: "Backspace at text start of indented prose deletes the indent unit", input: "  |indented", key: "Backspace", expected: "|indented" },
    { label: "Backspace at text start of continuation line deletes the indent unit", input: "- item\n  |cont", key: "Backspace", expected: "- item\n|cont" },
    { label: "Backspace at col 0 of underline joins lines", input: "Title\n|=====", key: "Backspace", expected: "Title|=====" },
    { label: "Backspace at text start of a => # b removes # ", input: "a => # |b", key: "Backspace", expected: "a => |b" },
    { label: "Backspace mid-text deletes 1 char", input: "# ta|sk", key: "Backspace", expected: "# t|sk" },
  ]);

  // Rule: Backspace at text start on numbered items and empty sub-items (Spec 2.4, §457, §464)
  runKeyTable([
    {
      label: "Backspace on first numbered item removes marker to own indent (0)",
      input: "1. |item",
      key: "Backspace",
      expected: "|item",
    },
    {
      label: "Backspace on indented numbered item with no parent keeps own indent",
      input: "  1. |item",
      key: "Backspace",
      expected: "  |item",
    },
    {
      label: "Backspace on second item replaces marker with preceding text-column spaces and renumbers",
      input: "1. a\n2. |b\n3. c",
      key: "Backspace",
      expected: "1. a\n   |b\n2. c",
    },
    {
      label: "Second Backspace on continuation line outdents to item indent and splits/renumbers",
      input: "1. a\n   |b\n2. c",
      key: "Backspace",
      expected: "1. a\n|b\n1. c",
    },
    {
      label: "Backspace on empty sub-item with numbered parent moves it out as parent next item",
      input: "1. a\n   1. |",
      key: "Backspace",
      expected: "1. a\n2. |",
    },
    {
      label: "Backspace on empty sub-item with following siblings makes them children from 1",
      input: "1. a\n   1. |\n   2. b",
      key: "Backspace",
      expected: "1. a\n2. |\n   1. b",
    },
    {
      label: "Backspace on empty bullet sub-item with numbered parent moves it out as parent next item",
      input: "1. a\n   - |",
      key: "Backspace",
      expected: "1. a\n2. |",
    },
    {
      label: "Backspace on empty top-level numbered item replaces marker with own indent",
      input: "1. |",
      key: "Backspace",
      expected: "|",
    },
    {
      label: "Backspace on empty sub-item under bullet keeps continuation spaces",
      input: "- a\n  1. |",
      key: "Backspace",
      expected: "- a\n  |",
    },
    {
      label: "Backspace on tab-indented numbered item keeps tab",
      input: "\t1. |item",
      key: "Backspace",
      expected: "\t|item",
    },
  ]);
});
