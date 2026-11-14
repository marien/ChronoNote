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
  key: "Enter" | "Shift-Enter";
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

describe("editing table: Enter & Shift-Enter", () => {
  // Rule: Enter continues leading markers (Spec 2.2, 2.4, §50, §51, §85, §124, §201, §244, §367, §454, bug: o ! -)
  const enterContinueCases: KeyCase[] = (() => {
    const kinds: Array<[string, string, string]> = [
      ["bullet -", "- ", "- "],
      ["bullet *", "* ", "* "],
      ["indented bullet", "  - ", "  - "],
      ["open action #", "# ", "# "],
      ["done action v", "v ", "# "],
      ["deferred action >", "> ", "# "],
      ["wont-do action x", "x ", "# "],
      ["indented action", "  # ", "  # "],
      ["tab-indented action", "\t# ", "\t# "],
      ["open topic o", "o ", "o "],
      ["discussed topic .", ". ", "o "],
      ["postponed topic ,", ", ", "o "],
      ["action+bullet # -", "# - ", "# - "],
      ["action+bullet v *", "v * ", "# * "],
      ["emphasis+bullet ! -", "! - ", "! - "],
      ["emphasis+bullet ! *", "! * ", "! * "],
      ["action+emphasis+bullet # ! -", "# ! - ", "# ! - "],
      ["topic+bullet o -", "o - ", "o - "],
      ["topic+emphasis+bullet o ! -", "o ! - ", "o ! - "],
      ["follow-up =>", "=> ", "=> "],
      ["delegated follow-up => @name", "=> @dana ", "=> "],
      ["consequence open => #", "=> # ", "=> # "],
      ["consequence done => v", "=> v ", "=> # "],
      ["consequence topic => o", "=> o ", "=> o "],
      ["consequence topic => .", "=> . ", "=> o "],
      ["numbered 1.", "1. ", "2. "],
      ["numbered 2)", "2) ", "3) "],
      ["dotted sub-item 1.1.", "   1.1. ", "   1.2. "],
      ["action+numbered # 1.", "# 1. ", "# 2. "],
      ["done+numbered v 1.", "v 1. ", "# 2. "],
      ["topic+numbered o 1.", "o 1. ", "o 2. "],
    ];
    const rows: KeyCase[] = [];
    for (const [name, prefix, nextPrefix] of kinds) {
      rows.push(
        {
          label: `continue ${name} at end`,
          input: `${prefix}alpha|`,
          key: "Enter",
          expected: `${prefix}alpha\n${nextPrefix}|`,
        },
        {
          label: `continue ${name} mid-text`,
          input: `${prefix}al|pha`,
          key: "Enter",
          expected: `${prefix}al\n${nextPrefix}|pha`,
        },
        {
          label: `continue ${name} at text start`,
          input: `${prefix}|alpha`,
          key: "Enter",
          expected: `${prefix}\n${nextPrefix}|alpha`,
        },
      );
    }
    return rows;
  })();

  runKeyTable(enterContinueCases);

  // Rule: Enter on empty leading marker exits / clears the marker (Spec 2.4, §85, §124, §201, §244, §367, §454)
  const enterExitCases: KeyCase[] = [
    "- |",
    "  - |",
    "* |",
    "# |",
    "v |",
    "> |",
    "x |",
    "  # |",
    "\t# |",
    "o |",
    ". |",
    ", |",
    "# - |",
    "! - |",
    "# ! - |",
    "o - |",
    "o ! - |",
    "=> |",
    "=> # |",
    "=> o |",
    "1. |",
    "2) |",
    "# 1. |",
    "o 1. |",
  ].map((input) => ({
    label: "exit empty marker",
    input,
    key: "Enter" as const,
    expected: "|",
  }));

  runKeyTable(enterExitCases);

  // Rule: Enter on empty sub-item or mid-list numbered item (Spec 2.4, §264, §457, §464)
  runKeyTable([
    {
      label: "empty numbered sub-item promotes out under numbered parent",
      input: "1. a\n   1. |",
      key: "Enter",
      expected: "1. a\n2. |",
    },
    {
      label: "empty bullet sub-item promotes out under numbered parent",
      input: "1. a\n   - |",
      key: "Enter",
      expected: "1. a\n2. |",
    },
    {
      label: "empty numbered sub-item with following siblings makes them children from 1",
      input: "1. a\n   1. |\n   2. b",
      key: "Enter",
      expected: "1. a\n2. |\n   1. b",
    },
    {
      label: "empty numbered sub-item under bullet parent exits normally",
      input: "- a\n  1. |",
      key: "Enter",
      expected: "- a\n|",
    },
    {
      label: "exiting empty middle numbered item restarts rest from 1",
      input: "1. a\n2. |\n3. b",
      key: "Enter",
      expected: "1. a\n|\n1. b",
    },
    {
      label: "Enter mid-list collides and renumbers siblings",
      input: "1. a|\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n3. b",
    },
    {
      label: "Enter mid-list without collision keeps non-colliding sibling",
      input: "1. a|\n3. b",
      key: "Enter",
      expected: "1. a\n2. |\n3. b",
    },
    {
      label: "Enter on item with dotted sub-items updates sub-items and renumbers siblings",
      input: "1. a|\n   1.1. sub\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n   2.1. sub\n3. b",
    },
    {
      label: "Enter mid-text splits item and renumbers following siblings",
      input: "1. al|pha\n2. beta",
      key: "Enter",
      expected: "1. al\n2. |pha\n3. beta",
    },
    // D4 Rule 3: Enter on numbered items behind a lead
    {
      label: "Enter on done action+numbered opens next as # (Rule 3.1)",
      input: "# 1. a\nv 2. x|",
      key: "Enter",
      expected: "# 1. a\nv 2. x\n# 3. |",
    },
    {
      label: "Enter on deferred action+numbered opens next as # (Rule 3.1)",
      input: "> 1. x|",
      key: "Enter",
      expected: "> 1. x\n# 2. |",
    },
    {
      label: "Enter on topic+numbered opens next as o (Rule 3.1)",
      input: ". 1. x|",
      key: "Enter",
      expected: ". 1. x\no 2. |",
    },
    {
      label: "Enter mid-list on lead item renumbers mixed following leads (Rule 3.2)",
      input: "# 1. a|\n# 2. b\nv 3. c",
      key: "Enter",
      expected: "# 1. a\n# 2. |\n# 3. b\nv 4. c",
    },
    {
      label: "Enter on empty top-level lead item exits list to empty line (Rule 3.3)",
      input: "# 1. a\n# 2. |",
      key: "Enter",
      expected: "# 1. a\n|",
    },
    {
      label: "Enter on empty lead sub-item promotes to parent numbered list (Rule 3.3)",
      input: "# 1. a\n     # 1. |",
      key: "Enter",
      expected: "# 1. a\n# 2. |",
    },
    {
      label: "Shift+Enter on lead numbered item creates indented continuation under text column (Rule 3.4)",
      input: "# 1. plan|",
      key: "Shift-Enter",
      expected: "# 1. plan\n     |",
    },
    {
      label: "Enter does not split unified list across non-list lead line (Rule 1.3)",
      input: "1. a|\n# book room\n2. b",
      key: "Enter",
      expected: "1. a\n2. |\n# book room\n3. b",
    },
  ]);

  // Rule: Enter at col 0, inside indent, or between symbol and space (§115, §201, §463, §465) is a plain line break
  runKeyTable([
    ...([
      "|- item",
      "|* item",
      "|# task",
      "|v task",
      "|> task",
      "|x task",
      "|o topic",
      "|. topic",
      "|, topic",
      "|=> follow",
      "|=> # act",
      "|1. item",
      "|# - task",
      "|# ! - item",
      "|o 1. topic",
      "|  - indented",
      "|\t# tab",
    ].map((input) => ({
      label: "Enter at col 0",
      input,
      key: "Enter" as const,
      expected: `\n${input}`,
    }))),
    {
      label: "Enter inside indent of bullet",
      input: " | - item",
      key: "Enter",
      expected: " \n| - item",
    },
    {
      label: "Enter inside indent of action",
      input: " | # task",
      key: "Enter",
      expected: " \n| # task",
    },
    {
      label: "Enter inside indent of numbered item",
      input: " | 1. item",
      key: "Enter",
      expected: " \n| 1. item",
    },
    {
      label: "Enter inside held symbol x|  (§465)",
      input: "x|  ",
      key: "Enter",
      expected: "x\n|  ",
    },
    {
      label: "Enter inside held symbol #| hello (§465)",
      input: "#| hello",
      key: "Enter",
      expected: "#\n| hello",
    },
    {
      label: "Enter inside held symbol =>| hello (§465)",
      input: "=>| hello",
      key: "Enter",
      expected: "=>\n| hello",
    },
    {
      label: "Enter inside held symbol -| item",
      input: "-| item",
      key: "Enter",
      expected: "-\n| item",
    },
    {
      label: "Enter inside held symbol o| topic",
      input: "o| topic",
      key: "Enter",
      expected: "o\n| topic",
    },
    {
      label: "Enter inside numbered marker 1.| item (§201)",
      input: "1.| item",
      key: "Enter",
      expected: "1.\n| item",
    },
  ]);

  // Rule: Enter on non-list/plain/title lines defers to smart-indent newline (§23), except title lines which are plain breaks (Known Bug)
  runKeyTable([
    { label: "empty line", input: "|", key: "Enter", expected: "\n|" },
    { label: "spaces only (§23 smart-indent)", input: "  |", key: "Enter", expected: "\n  |" },
    { label: "prose mid", input: "plain |text", key: "Enter", expected: "plain \n|text" },
    { label: "prose end", input: "plain text|", key: "Enter", expected: "plain text\n|" },
    { label: "indented prose (§23 smart-indent)", input: "  inde|nted", key: "Enter", expected: "  inde\n  |nted" },
    { label: "plain emphasis ! urgent", input: "! urgent|", key: "Enter", expected: "! urgent\n|" },
    { label: "action+emphasis # ! urgent", input: "# ! urgent|", key: "Enter", expected: "# ! urgent\n# |" },
    { label: "prose before arrow a => # b", input: "a => # b|", key: "Enter", expected: "a => # b\n|" },
    { label: "=== underline", input: "Title\n=====|", key: "Enter", expected: "Title\n=====\n|" },
    { label: "--- underline", input: "Sub\n---|", key: "Enter", expected: "Sub\n---\n|" },
    {
      label: "continuation line under bullet (§23 smart-indent)",
      input: "- item\n  conti|nued",
      key: "Enter",
      expected: "- item\n  conti\n  |nued",
    },
    // Known Bug: Enter at end of title line above === or --- is a plain line break whatever it starts with
    { label: "plain title above ===", input: "Title|\n=====", key: "Enter", expected: "Title\n|\n=====" },
    {
      label: "action title above ===",
      input: "# Task title|\n============",
      key: "Enter",
      expected: "# Task title\n|\n============",
    },
    {
      label: "numbered title above ===",
      input: "1. Num title|\n============",
      key: "Enter",
      expected: "1. Num title\n|\n============",
    },
    {
      label: "bullet subtitle above ---",
      input: "- Bullet sub|\n------------",
      key: "Enter",
      expected: "- Bullet sub\n|\n------------",
    },
    {
      label: "topic subtitle above ---",
      input: "o Topic sub|\n-----------",
      key: "Enter",
      expected: "o Topic sub\n|\n-----------",
    },
  ]);

  // Rule: Enter and Shift-Enter with selection replace selection first, then act (Known Bug)
  runKeyTable([
    {
      label: "Enter with selection inside action",
      input: "# buy [milk]",
      key: "Enter",
      expected: "# buy \n# |",
    },
    {
      label: "Enter with selection across two bullets",
      input: "- [one\n- t]wo",
      key: "Enter",
      expected: "- \n- |wo",
    },
    {
      label: "Enter with selection inside action text",
      input: "# a[b]c",
      key: "Enter",
      expected: "# a\n# |c",
    },
    {
      label: "Enter deleting whole action line",
      input: "[# task]",
      key: "Enter",
      expected: "\n|",
    },
    {
      label: "Shift-Enter with selection inside action",
      input: "# buy [milk]",
      key: "Shift-Enter",
      expected: "# buy \n  |",
    },
    {
      label: "Shift-Enter with selection across two bullets",
      input: "- [one\n- t]wo",
      key: "Shift-Enter",
      expected: "- \n  |wo",
    },
    {
      label: "Shift-Enter deleting whole action line",
      input: "[# task]",
      key: "Shift-Enter",
      expected: "\n|",
    },
  ]);

  // Rule: Decision D3 — Shift-Enter starts continuation line at current line's text column on EVERY leading marker
  const shiftEnterCases: KeyCase[] = (() => {
    const markerCols: Array<[string, string, string]> = [
      ["bullet -", "- ", "  "],
      ["bullet *", "* ", "  "],
      ["indented bullet", "  - ", "    "],
      ["open action #", "# ", "  "],
      ["done action v", "v ", "  "],
      ["deferred action >", "> ", "  "],
      ["wont-do action x", "x ", "  "],
      ["indented action", "  # ", "    "],
      ["open topic o", "o ", "  "],
      ["discussed topic .", ". ", "  "],
      ["postponed topic ,", ", ", "  "],
      ["emphasis !", "! ", "  "],
      ["emphasis+bullet ! -", "! - ", "    "],
      ["action+bullet # -", "# - ", "    "],
      ["action+emphasis # !", "# ! ", "    "],
      ["action+emphasis+bullet # ! -", "# ! - ", "      "],
      ["topic+bullet o -", "o - ", "    "],
      ["follow-up =>", "=> ", "   "],
      ["consequence action => #", "=> # ", "     "],
      ["delegated follow-up => @dana", "=> @dana ", "   "],
      ["numbered 1.", "1. ", "   "],
      ["numbered 10.", "10. ", "    "],
      ["dotted sub-item 1.1.", "   1.1. ", "        "],
      ["action+numbered # 1.", "# 1. ", "     "],
      ["topic+numbered o 1.", "o 1. ", "     "],
    ];
    const rows: KeyCase[] = [];
    for (const [name, prefix, contIndent] of markerCols) {
      const sample = name.includes("=> @dana") ? "check" : "text";
      const realPrefix = name.includes("=> @dana") ? "=> " : prefix;
      const body = name.includes("=> @dana") ? "@dana check" : sample;
      rows.push(
        {
          label: `D3 Shift-Enter ${name} at end`,
          input: `${realPrefix}${body}|`,
          key: "Shift-Enter",
          expected: `${realPrefix}${body}\n${contIndent}|`,
        },
        {
          label: `D3 Shift-Enter ${name} at text start`,
          input: `${realPrefix}|${body}`,
          key: "Shift-Enter",
          expected: `${realPrefix}\n${contIndent}|${body}`,
        },
      );
      if (!name.includes("=> @dana")) {
        rows.push(
          {
            label: `D3 Shift-Enter ${name} mid-text`,
            input: `${realPrefix}te|xt`,
            key: "Shift-Enter",
            expected: `${realPrefix}te\n${contIndent}|xt`,
          },
          {
            label: `D3 Shift-Enter ${name} empty marker`,
            input: `${realPrefix}|`,
            key: "Shift-Enter",
            expected: `${realPrefix}\n${contIndent}|`,
          },
        );
      }
    }
    return rows;
  })();

  runKeyTable(shiftEnterCases);

  // Rule: Decision D3 & Known Bug — Shift-Enter at col 0, in indent, inside marker, or on non-marker lines is a plain line break
  runKeyTable([
    ...([
      "|- task",
      "|1. item",
      "|o topic",
      "|# task",
      "|=> follow",
      "|# - nested",
      "|  - indented",
      "|\t# tab",
    ].map((input) => ({
      label: "Shift-Enter at col 0 (D3 / bug)",
      input,
      key: "Shift-Enter" as const,
      expected: `\n${input}`,
    }))),
    { label: "Shift-Enter inside indent", input: " | - task", key: "Shift-Enter", expected: " \n| - task" },
    { label: "Shift-Enter inside #| task", input: "#| task", key: "Shift-Enter", expected: "#\n| task" },
    { label: "Shift-Enter inside 1.| item", input: "1.| item", key: "Shift-Enter", expected: "1.\n| item" },
    { label: "Shift-Enter on empty", input: "|", key: "Shift-Enter", expected: "\n|" },
    { label: "Shift-Enter on spaces", input: "  |", key: "Shift-Enter", expected: "  \n|" },
    { label: "Shift-Enter on prose", input: "plain |text", key: "Shift-Enter", expected: "plain \n|text" },
    { label: "Shift-Enter on indented prose", input: "  inde|nted", key: "Shift-Enter", expected: "  inde\n|nted" },
    { label: "Shift-Enter on a => # b", input: "a => # b|", key: "Shift-Enter", expected: "a => # b\n|" },
    { label: "Shift-Enter on === underline", input: "Title\n=====|", key: "Shift-Enter", expected: "Title\n=====\n|" },
    { label: "Shift-Enter on continuation line", input: "- item\n  cont|", key: "Shift-Enter", expected: "- item\n  cont\n|" },
    { label: "Shift-Enter on action title", input: "# Title|\n=======", key: "Shift-Enter", expected: "# Title\n|\n=======" },
  ]);

  // Rule: Enter & Shift-Enter rewrite due-date words when leaving the line (§419, Known Bug)
  for (const key of ["Enter", "Shift-Enter"] as const) {
    it(`${key} leaving '# send by:tomorrow' rewrites by:tomorrow to an ISO date`, () => {
      const input = "# send by:tomorrow|";
      const ed = openEditor(input);
      ed.press(key);
      const after = ed.text();
      expect(after).not.toContain("by:tomorrow");
      const expectedLine2Prefix = key === "Enter" ? "# " : "  ";
      expect(after).toMatch(new RegExp(`^# send by:\\d{4}-\\d{2}-\\d{2}\\n${expectedLine2Prefix}$`));
      const savedCaret = ed.caret();
      expect(ed.undo()).toBe(true);
      expect(ed.caret()).toBe(input);
      expect(ed.redo()).toBe(true);
      expect(ed.text()).toBe(after);
    });
  }
});
